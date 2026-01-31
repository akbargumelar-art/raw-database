const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const xlsx = require('xlsx');
const csv = require('csv-parser');
const { Worker } = require('worker_threads');
const { getDbConnection, getConnectionPool } = require('../config/db');
const { auth } = require('../middleware/auth');
const { checkDbPermission } = require('../middleware/permissions');
const { formatToMysql, isDateColumn } = require('../utils/dateFormatter');

/**
 * Parse file using Worker Thread to avoid blocking main event loop
 * For large files, parsing happens in a separate thread
 */
function parseFileWithWorker(filePath, ext, taskId) {
    return new Promise((resolve, reject) => {
        // For smaller files (< 5MB), use main thread for speed
        const stats = fs.statSync(filePath);
        const fileSizeMB = stats.size / (1024 * 1024);

        if (fileSizeMB < 5) {
            // Small file - parse directly
            try {
                if (ext === '.csv') {
                    const rows = [];
                    fs.createReadStream(filePath)
                        .pipe(csv())
                        .on('data', (row) => rows.push(row))
                        .on('end', () => resolve(rows))
                        .on('error', reject);
                } else {
                    const workbook = xlsx.readFile(filePath, {
                        type: 'file',
                        dense: false,
                        cellDates: true,
                        cellNF: false,
                        cellText: false
                    });
                    const sheetName = workbook.SheetNames[0];
                    const sheet = workbook.Sheets[sheetName];
                    if (!sheet) throw new Error(`Sheet "${sheetName}" is empty`);
                    const rows = xlsx.utils.sheet_to_json(sheet, { defval: null });
                    resolve(rows);
                }
            } catch (err) {
                reject(err);
            }
            return;
        }

        // Large file - use worker thread
        console.log(`[Worker] Starting worker thread for ${fileSizeMB.toFixed(2)}MB file`);

        const workerPath = path.join(__dirname, '../workers/fileParser.js');

        // Check if worker file exists
        if (!fs.existsSync(workerPath)) {
            console.log('[Worker] Worker file not found, falling back to main thread');
            // Fallback: parse with yielding to event loop
            parseWithYield(filePath, ext, taskId)
                .then(resolve)
                .catch(reject);
            return;
        }

        const worker = new Worker(workerPath, {
            workerData: { filePath, ext, taskId }
        });

        worker.on('message', (msg) => {
            if (msg.type === 'log') {
                console.log(`[Worker ${taskId}] ${msg.message}`);
            } else if (msg.type === 'status') {
                console.log(`[Worker ${taskId}] Status: ${msg.message}`);
            } else if (msg.type === 'result') {
                if (msg.success) {
                    resolve(msg.rows);
                } else {
                    reject(new Error(msg.error));
                }
            }
        });

        worker.on('error', (err) => {
            console.error(`[Worker ${taskId}] Error:`, err);
            reject(err);
        });

        worker.on('exit', (code) => {
            if (code !== 0) {
                reject(new Error(`Worker stopped with exit code ${code}`));
            }
        });
    });
}

/**
 * Fallback: Parse file with periodic yields to event loop
 * This allows other requests to be processed between chunks
 */
async function parseWithYield(filePath, ext, taskId) {
    return new Promise((resolve, reject) => {
        // Use setImmediate to yield to event loop
        setImmediate(() => {
            try {
                if (ext === '.csv') {
                    const rows = [];
                    fs.createReadStream(filePath)
                        .pipe(csv())
                        .on('data', (row) => rows.push(row))
                        .on('end', () => resolve(rows))
                        .on('error', reject);
                } else {
                    console.log(`[Phase 2 ${taskId}] Reading Excel file (yielded)...`);
                    const workbook = xlsx.readFile(filePath, {
                        type: 'file',
                        dense: false,
                        cellDates: true,
                        cellNF: false,
                        cellText: false
                    });
                    const sheetName = workbook.SheetNames[0];
                    const sheet = workbook.Sheets[sheetName];
                    if (!sheet) throw new Error(`Sheet "${sheetName}" is empty`);
                    const rows = xlsx.utils.sheet_to_json(sheet, { defval: null });
                    resolve(rows);
                }
            } catch (err) {
                reject(err);
            }
        });
    });
}

// Configure multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});

const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (['.csv', '.xlsx', '.xls'].includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error('Only CSV and Excel files are allowed.'));
        }
    },
    limits: { fileSize: 200 * 1024 * 1024 } // 200MB limit
});

// Store upload progress in memory AND persist to disk
const uploadProgress = new Map();

// Store pending files metadata (files uploaded but not yet processed)
const pendingFiles = new Map();

// Helper: Paths for persistent storage
const PENDING_FILES_PATH = path.join(__dirname, '../uploads/.pending.json');
const PROGRESS_FILE_PATH = path.join(__dirname, '../uploads/.progress.json');

// =====================================================
// PROGRESS PERSISTENCE FUNCTIONS
// =====================================================

const saveProgress = () => {
    try {
        const data = Array.from(uploadProgress.entries());
        fs.writeFileSync(PROGRESS_FILE_PATH, JSON.stringify(data, null, 2));
    } catch (err) {
        console.error('Failed to save progress:', err);
    }
};

const loadProgress = () => {
    try {
        if (fs.existsSync(PROGRESS_FILE_PATH)) {
            const data = JSON.parse(fs.readFileSync(PROGRESS_FILE_PATH, 'utf8'));
            data.forEach(([key, value]) => {
                // Only load if not too old (max 24 hours)
                const age = Date.now() - parseInt(key);
                if (age < 24 * 60 * 60 * 1000) {
                    uploadProgress.set(key, value);
                }
            });
            console.log(`Loaded ${uploadProgress.size} progress entries`);
        }
    } catch (err) {
        console.error('Failed to load progress:', err);
    }
};

// =====================================================
// PENDING FILES PERSISTENCE FUNCTIONS  
// =====================================================

const savePendingFiles = () => {
    try {
        const data = Array.from(pendingFiles.entries());
        fs.writeFileSync(PENDING_FILES_PATH, JSON.stringify(data, null, 2));
    } catch (err) {
        console.error('Failed to save pending files:', err);
    }
};

const loadPendingFiles = () => {
    try {
        if (fs.existsSync(PENDING_FILES_PATH)) {
            const data = JSON.parse(fs.readFileSync(PENDING_FILES_PATH, 'utf8'));
            let resetCount = 0;
            data.forEach(([key, value]) => {
                // Only add if file still exists
                if (fs.existsSync(value.filePath)) {
                    // Reset "processing" to "pending" on server restart
                    // (process was interrupted by restart)
                    if (value.status === 'processing') {
                        value.status = 'pending';
                        value.taskId = null;
                        resetCount++;
                    }
                    pendingFiles.set(key, value);
                }
            });
            console.log(`Loaded ${pendingFiles.size} pending files`);
            if (resetCount > 0) {
                console.log(`Reset ${resetCount} stuck "processing" files to "pending"`);
                savePendingFiles();
            }
        }
    } catch (err) {
        console.error('Failed to load pending files:', err);
    }
};

// Load on startup
loadPendingFiles();
loadProgress();

// =====================================================
// AUTO-CLEANUP ORPHAN FILES
// =====================================================

const cleanupOrphanFiles = () => {
    try {
        const uploadDir = path.join(__dirname, '../uploads');
        if (!fs.existsSync(uploadDir)) return;

        const files = fs.readdirSync(uploadDir);
        let deletedCount = 0;
        let freedBytes = 0;

        // Get list of tracked file paths
        const trackedPaths = new Set();
        pendingFiles.forEach((file) => {
            trackedPaths.add(file.filePath);
        });

        files.forEach(file => {
            // Skip hidden files, temp folder, and json files
            if (file.startsWith('.') || file === 'temp') return;

            const filePath = path.join(uploadDir, file);
            const stat = fs.statSync(filePath);

            // Skip directories
            if (stat.isDirectory()) return;

            // If file is not tracked in pendingFiles, it's orphan
            if (!trackedPaths.has(filePath)) {
                freedBytes += stat.size;
                fs.unlinkSync(filePath);
                deletedCount++;
                console.log(`[Cleanup] Deleted orphan file: ${file}`);
            }
        });

        if (deletedCount > 0) {
            console.log(`[Cleanup] Deleted ${deletedCount} orphan files, freed ${(freedBytes / 1024 / 1024).toFixed(2)} MB`);
        }

        // Also cleanup old lookup results (older than 7 days)
        cleanupOldLookupResults();

    } catch (err) {
        console.error('Failed to cleanup orphan files:', err);
    }
};

const cleanupOldLookupResults = () => {
    try {
        const tempDir = path.join(__dirname, '../uploads/temp');
        if (!fs.existsSync(tempDir)) return;

        const files = fs.readdirSync(tempDir);
        const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
        let deletedCount = 0;
        let freedBytes = 0;

        files.forEach(file => {
            if (!file.startsWith('lookup_result_')) return;

            const filePath = path.join(tempDir, file);
            const stat = fs.statSync(filePath);

            // Delete if older than 7 days
            if (stat.mtimeMs < sevenDaysAgo) {
                freedBytes += stat.size;
                fs.unlinkSync(filePath);
                deletedCount++;
            }
        });

        if (deletedCount > 0) {
            console.log(`[Cleanup] Deleted ${deletedCount} old lookup results, freed ${(freedBytes / 1024 / 1024).toFixed(2)} MB`);
        }
    } catch (err) {
        console.error('Failed to cleanup lookup results:', err);
    }
};

// Run cleanup on startup
cleanupOrphanFiles();

// =====================================================
// TWO-PHASE UPLOAD ENDPOINTS
// =====================================================

// Phase 1: Upload file only (store to VPS)
router.post('/file', auth, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded.' });
        }

        const fileId = `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const fileInfo = {
            fileId,
            originalName: req.file.originalname,
            filePath: req.file.path,
            size: req.file.size,
            mimetype: req.file.mimetype,
            uploadedAt: new Date().toISOString(),
            uploadedBy: req.user.id,
            status: 'pending' // pending | processing | completed | error
        };

        pendingFiles.set(fileId, fileInfo);
        savePendingFiles();

        console.log(`[Phase 1] File uploaded: ${fileInfo.originalName} (${(fileInfo.size / 1024 / 1024).toFixed(2)} MB) -> ${fileId}`);

        res.json({
            success: true,
            fileId,
            message: 'File uploaded successfully. Ready for processing.',
            file: {
                id: fileId,
                name: fileInfo.originalName,
                size: fileInfo.size,
                uploadedAt: fileInfo.uploadedAt
            }
        });

    } catch (error) {
        console.error('File upload error:', error);
        res.status(500).json({ error: 'Failed to upload file.' });
    }
});

// Get list of pending files
router.get('/pending', auth, (req, res) => {
    try {
        const userFiles = [];
        pendingFiles.forEach((file, fileId) => {
            // Only show files for this user (or all for admin)
            if (file.uploadedBy === req.user.id || req.user.role === 'admin') {
                userFiles.push({
                    fileId,
                    name: file.originalName,
                    size: file.size,
                    uploadedAt: file.uploadedAt,
                    status: file.status,
                    taskId: file.taskId || null
                });
            }
        });

        // Sort by uploadedAt descending
        userFiles.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));

        res.json(userFiles);
    } catch (error) {
        console.error('Get pending files error:', error);
        res.status(500).json({ error: 'Failed to get pending files.' });
    }
});

// Get list of active processing tasks (for reconnection after browser refresh)
router.get('/active-tasks', auth, (req, res) => {
    try {
        const activeTasks = [];
        uploadProgress.forEach((progress, taskId) => {
            // Only show processing tasks (not completed/error)
            if (progress.status === 'processing') {
                activeTasks.push({
                    taskId,
                    fileId: progress.fileId,
                    fileName: progress.fileName,
                    database: progress.database,
                    table: progress.table,
                    totalRows: progress.totalRows,
                    processedRows: progress.processedRows,
                    insertedRows: progress.insertedRows,
                    skippedRows: progress.skippedRows,
                    updatedRows: progress.updatedRows,
                    startedAt: progress.startedAt,
                    status: progress.status
                });
            }
        });

        // Sort by startedAt descending (newest first)
        activeTasks.sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));

        res.json(activeTasks);
    } catch (error) {
        console.error('Get active tasks error:', error);
        res.status(500).json({ error: 'Failed to get active tasks.' });
    }
});

// Phase 2: Process pending file to database
router.post('/process/:fileId', auth, async (req, res) => {
    const { fileId } = req.params;
    const taskId = Date.now().toString();

    try {
        const fileInfo = pendingFiles.get(fileId);
        if (!fileInfo) {
            return res.status(404).json({ error: 'File not found.' });
        }

        if (!fs.existsSync(fileInfo.filePath)) {
            pendingFiles.delete(fileId);
            savePendingFiles();
            return res.status(404).json({ error: 'File no longer exists on server.' });
        }

        if (fileInfo.status === 'processing') {
            return res.status(400).json({ error: 'File is already being processed.', taskId: fileInfo.taskId });
        }

        const { database, table, batchSize = 5000, duplicateMode = 'skip', duplicateCheckFields = [], connectionId } = req.body;

        if (!database || !table) {
            return res.status(400).json({ error: 'Database and table are required.' });
        }

        // Update file status
        fileInfo.status = 'processing';
        fileInfo.taskId = taskId;
        fileInfo.database = database;
        fileInfo.table = table;
        pendingFiles.set(fileId, fileInfo);
        savePendingFiles();

        // Initialize progress
        uploadProgress.set(taskId, {
            status: 'processing',
            fileId,
            fileName: fileInfo.originalName,
            database,
            table,
            totalRows: 0,
            processedRows: 0,
            insertedRows: 0,
            skippedRows: 0,
            updatedRows: 0,
            errors: [],
            startedAt: new Date().toISOString()
        });
        saveProgress();

        // Send immediate response
        res.json({
            success: true,
            taskId,
            message: 'Processing started. Browser can be closed safely.',
            file: {
                id: fileId,
                name: fileInfo.originalName
            }
        });

        // Process in background
        processFileToDatabase(fileId, taskId, database, table, batchSize, duplicateMode, duplicateCheckFields, connectionId);

    } catch (error) {
        console.error('Process file error:', error);
        res.status(500).json({ error: 'Failed to start processing.' });
    }
});

// Delete pending file
router.delete('/file/:fileId', auth, (req, res) => {
    try {
        const { fileId } = req.params;
        const fileInfo = pendingFiles.get(fileId);

        if (!fileInfo) {
            return res.status(404).json({ error: 'File not found.' });
        }

        // Check ownership
        if (fileInfo.uploadedBy !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Not authorized to delete this file.' });
        }

        if (fileInfo.status === 'processing') {
            return res.status(400).json({ error: 'Cannot delete file while processing.' });
        }

        // Delete physical file
        if (fs.existsSync(fileInfo.filePath)) {
            fs.unlinkSync(fileInfo.filePath);
        }

        pendingFiles.delete(fileId);
        savePendingFiles();

        console.log(`[Delete] Pending file removed: ${fileInfo.originalName}`);

        res.json({ success: true, message: 'File deleted.' });

    } catch (error) {
        console.error('Delete file error:', error);
        res.status(500).json({ error: 'Failed to delete file.' });
    }
});

// Background processing function
async function processFileToDatabase(fileId, taskId, database, table, batchSize, duplicateMode, duplicateCheckFieldsInput, connectionId) {
    const fileInfo = pendingFiles.get(fileId);
    if (!fileInfo) return;

    const filePath = fileInfo.filePath;
    const ext = path.extname(fileInfo.originalName).toLowerCase();

    try {
        // Get database connection
        let pool;
        if (connectionId) {
            pool = await getConnectionPool(parseInt(connectionId), database);
        } else {
            pool = await getDbConnection(database);
        }

        // Parse duplicate check fields
        let duplicateCheckFields = [];
        if (typeof duplicateCheckFieldsInput === 'string') {
            try {
                duplicateCheckFields = JSON.parse(duplicateCheckFieldsInput);
            } catch (e) {
                duplicateCheckFields = [];
            }
        } else if (Array.isArray(duplicateCheckFieldsInput)) {
            duplicateCheckFields = duplicateCheckFieldsInput;
        }

        // Get table structure for date columns
        const [columns] = await pool.execute(`DESCRIBE \`${table}\``);
        const dateColumns = columns
            .filter(c => ['date', 'datetime', 'timestamp'].some(t => c.Type.toLowerCase().includes(t)))
            .map(c => c.Field);

        columns.forEach(c => {
            if (isDateColumn(c.Field) && !dateColumns.includes(c.Field)) {
                dateColumns.push(c.Field);
            }
        });

        let rows = [];

        // Parse file using Worker Thread (non-blocking)
        console.log(`[Phase 2 ${taskId}] Parsing file with Worker: ${fileInfo.originalName}`);
        rows = await parseFileWithWorker(filePath, ext, taskId);

        if (!rows || rows.length === 0) {
            throw new Error('No data found in file');
        }

        console.log(`[Phase 2 ${taskId}] Parsed ${rows.length} rows`);

        // Update progress
        uploadProgress.get(taskId).totalRows = rows.length;

        // Process in batches
        const columnNames = Object.keys(rows[0] || {});
        let processed = 0, inserted = 0, skipped = 0, updated = 0;

        for (let i = 0; i < rows.length; i += batchSize) {
            const batch = rows.slice(i, i + batchSize);

            // Format dates
            const formattedBatch = batch.map(row => {
                const formattedRow = {};
                columnNames.forEach(col => {
                    let val = row[col];
                    if (dateColumns.includes(col) && val !== null && val !== '') {
                        val = formatToMysql(val);
                    }
                    formattedRow[col] = val;
                });
                return formattedRow;
            });

            let rowsToInsert = formattedBatch;

            // Duplicate check logic
            if (duplicateCheckFields.length > 0) {
                const checkFieldsStr = duplicateCheckFields.map(f => `\`${f}\``).join(', ');
                const checkValues = [];
                duplicateCheckFields.forEach(field => {
                    const values = formattedBatch.map(r => r[field]).filter(v => v !== null && v !== undefined);
                    if (values.length > 0) {
                        checkValues.push({ field, values: [...new Set(values)] });
                    }
                });

                if (checkValues.length > 0) {
                    const whereConditions = checkValues.map(cv =>
                        `\`${cv.field}\` IN (${cv.values.map(() => '?').join(',')})`
                    ).join(' OR ');
                    const queryParams = checkValues.flatMap(cv => cv.values);

                    const [existingRows] = await pool.execute(
                        `SELECT ${checkFieldsStr} FROM \`${table}\` WHERE ${whereConditions}`,
                        queryParams
                    );

                    const existingSet = new Set(
                        existingRows.map(row =>
                            duplicateCheckFields.map(f => String(row[f])).join('||')
                        )
                    );

                    if (duplicateMode === 'error' && existingSet.size > 0) {
                        throw new Error(`Duplicate rows detected: ${existingSet.size} existing records`);
                    }

                    if (duplicateMode === 'skip') {
                        rowsToInsert = formattedBatch.filter(row => {
                            const key = duplicateCheckFields.map(f => String(row[f])).join('||');
                            return !existingSet.has(key);
                        });
                        skipped += (formattedBatch.length - rowsToInsert.length);
                    }
                }
            }

            if (rowsToInsert.length > 0) {
                const values = rowsToInsert.map(row => columnNames.map(col => row[col]));
                const placeholders = values.map(() => `(${columnNames.map(() => '?').join(', ')})`).join(', ');
                const flatValues = values.flat();

                let sql;
                if (duplicateMode === 'update' && duplicateCheckFields.length > 0) {
                    const updateClause = columnNames
                        .filter(c => !duplicateCheckFields.includes(c))
                        .map(c => `\`${c}\` = VALUES(\`${c}\`)`)
                        .join(', ');
                    sql = `INSERT INTO \`${table}\` (${columnNames.map(c => `\`${c}\``).join(', ')}) VALUES ${placeholders}`;
                    if (updateClause) sql += ` ON DUPLICATE KEY UPDATE ${updateClause}`;
                } else {
                    sql = `INSERT IGNORE INTO \`${table}\` (${columnNames.map(c => `\`${c}\``).join(', ')}) VALUES ${placeholders}`;
                }

                try {
                    const [result] = await pool.execute(sql, flatValues);
                    if (duplicateMode === 'update') {
                        const affected = result.affectedRows;
                        const changed = result.changedRows || 0;
                        inserted += (affected - changed) / 2;
                        updated += changed;
                    } else {
                        inserted += result.affectedRows;
                        skipped += (rowsToInsert.length - result.affectedRows);
                    }
                } catch (err) {
                    console.error('Batch insert error:', err);
                    uploadProgress.get(taskId).errors.push({
                        batch: Math.floor(i / batchSize) + 1,
                        error: err.message
                    });
                }
            }

            processed += batch.length;

            // Update progress and save to disk
            const progress = uploadProgress.get(taskId);
            progress.processedRows = processed;
            progress.insertedRows = inserted;
            progress.skippedRows = skipped;
            progress.updatedRows = updated;
            saveProgress();
        }

        // Mark complete
        const progress = uploadProgress.get(taskId);
        progress.status = 'completed';
        progress.completedAt = new Date().toISOString();
        saveProgress();

        // Update file status
        fileInfo.status = 'completed';
        pendingFiles.set(fileId, fileInfo);
        savePendingFiles();

        // Cleanup file after successful processing
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
        pendingFiles.delete(fileId);
        savePendingFiles();

        console.log(`[Phase 2 ${taskId}] Completed: ${inserted} inserted, ${updated} updated, ${skipped} skipped`);

        // Keep progress for 30 minutes then delete (longer for reconnection)
        setTimeout(() => {
            uploadProgress.delete(taskId);
            saveProgress();
        }, 30 * 60 * 1000);

    } catch (error) {
        console.error(`[Phase 2 ${taskId}] Error:`, error);
        const progress = uploadProgress.get(taskId);
        if (progress) {
            progress.status = 'error';
            progress.errors.push({ error: error.message });
            saveProgress();
        }

        // Update file status
        fileInfo.status = 'error';
        fileInfo.lastError = error.message;
        pendingFiles.set(fileId, fileInfo);
        savePendingFiles();
    }
}

// =====================================================
// END TWO-PHASE UPLOAD ENDPOINTS
// =====================================================


// Download Excel template for a table
router.get('/template/:database/:table', auth, checkDbPermission, async (req, res) => {
    try {
        const { database, table } = req.params;
        const { connectionId } = req.query;

        let pool;
        if (connectionId) {
            pool = await getConnectionPool(parseInt(connectionId), database);
        } else {
            pool = await getDbConnection(database);
        }

        // Get table structure
        const [columns] = await pool.execute(`DESCRIBE \`${table}\``);

        // Create sample data row with column descriptions
        const sampleRow = {};
        const exampleRow = {};

        columns.forEach(col => {
            const columnName = col.Field;
            const columnType = col.Type.toLowerCase();

            // Add column description based on type
            if (columnType.includes('int')) {
                sampleRow[columnName] = 'number (e.g., 123)';
                exampleRow[columnName] = 123;
            } else if (columnType.includes('varchar') || columnType.includes('text')) {
                sampleRow[columnName] = 'text (e.g., "Sample Text")';
                exampleRow[columnName] = 'Sample';
            } else if (columnType.includes('date')) {
                sampleRow[columnName] = 'date (e.g., 2024-01-15)';
                exampleRow[columnName] = '2024-01-15';
            } else if (columnType.includes('datetime') || columnType.includes('timestamp')) {
                sampleRow[columnName] = 'datetime (e.g., 2024-01-15 10:30:00)';
                exampleRow[columnName] = '2024-01-15 10:30:00';
            } else if (columnType.includes('decimal') || columnType.includes('float') || columnType.includes('double')) {
                sampleRow[columnName] = 'decimal (e.g., 123.45)';
                exampleRow[columnName] = 123.45;
            } else if (columnType.includes('enum')) {
                // Extract enum values
                const enumMatch = columnType.match(/enum\((.*)\)/);
                if (enumMatch) {
                    const enumValues = enumMatch[1].replace(/'/g, '').split(',');
                    sampleRow[columnName] = `enum: ${enumValues.join(' | ')}`;
                    exampleRow[columnName] = enumValues[0];
                }
            } else {
                sampleRow[columnName] = `${columnType}`;
                exampleRow[columnName] = '';
            }
        });

        // Create workbook with two sheets: Documentation and Example
        const workbook = xlsx.utils.book_new();

        // Sheet 1: Instructions
        const instructions = [
            ['Excel Upload Template - ' + table],
            [''],
            ['Instructions:'],
            ['1. Fill in your data starting from row 2 (keep the header row)'],
            ['2. Match the column names exactly as shown in the header'],
            ['3. Follow the data format examples provided in the "Example" sheet'],
            ['4. Remove these instruction rows before uploading'],
            [''],
            ['Column Definitions:']
        ];

        columns.forEach(col => {
            instructions.push([
                col.Field,
                col.Type,
                col.Null === 'YES' ? 'Optional' : 'Required',
                col.Key === 'PRI' ? 'PRIMARY KEY' : col.Key || ''
            ]);
        });

        const wsInstructions = xlsx.utils.aoa_to_sheet(instructions);
        xlsx.utils.book_append_sheet(workbook, wsInstructions, 'Instructions');

        // Sheet 2: Example data with actual column headers
        const wsData = xlsx.utils.json_to_sheet([exampleRow], { header: Object.keys(exampleRow) });
        xlsx.utils.book_append_sheet(workbook, wsData, 'Example');

        // Generate buffer
        const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        // Send file
        res.setHeader('Content-Disposition', `attachment; filename="${table}_template.xlsx"`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buffer);

    } catch (error) {
        console.error('Template generation error:', error);
        res.status(500).json({ error: 'Failed to generate template.' });
    }
});

// Get upload progress
router.get('/progress/:taskId', auth, (req, res) => {
    const { taskId } = req.params;
    const progress = uploadProgress.get(taskId);

    if (!progress) {
        return res.status(404).json({ error: 'Task not found.' });
    }

    res.json(progress);
});

// Batch upload with duplicate prevention
router.post('/:database/:table', auth, checkDbPermission, upload.single('file'), async (req, res) => {
    const taskId = Date.now().toString();

    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded.' });
        }

        const { database, table } = req.params;
        const batchSize = parseInt(req.body.batchSize) || 5000;

        // Duplicate handling options
        const duplicateMode = req.body.duplicateMode || 'skip'; // 'skip' | 'update' | 'error'
        const duplicateCheckFields = req.body.duplicateCheckFields
            ? JSON.parse(req.body.duplicateCheckFields)
            : []; // Array of field names to check for duplicates

        // Initialize progress
        uploadProgress.set(taskId, {
            status: 'processing',
            totalRows: 0,
            processedRows: 0,
            insertedRows: 0,
            skippedRows: 0,
            updatedRows: 0,
            errors: []
        });

        // Send immediate response with task ID
        res.json({ taskId, message: 'Upload started. Use /progress/:taskId to check status.' });

        // Process file in background
        const filePath = req.file.path;
        const ext = path.extname(req.file.originalname).toLowerCase();

        // Get table structure for date columns
        const { connectionId } = req.body;
        let pool;
        if (connectionId) {
            pool = await getConnectionPool(parseInt(connectionId), database);
        } else {
            pool = await getDbConnection(database);
        }
        const [columns] = await pool.execute(`DESCRIBE \`${table}\``);
        const dateColumns = columns
            .filter(c => ['date', 'datetime', 'timestamp'].some(t => c.Type.toLowerCase().includes(t)))
            .map(c => c.Field);

        // Also check column names for date patterns
        columns.forEach(c => {
            if (isDateColumn(c.Field) && !dateColumns.includes(c.Field)) {
                dateColumns.push(c.Field);
            }
        });

        let rows = [];

        try {
            console.log(`[Upload ${taskId}] Parsing file: ${req.file.originalname} (${(req.file.size / 1024 / 1024).toFixed(2)} MB)`);

            if (ext === '.csv') {
                rows = await parseCsv(filePath);
            } else {
                // For large Excel files, use stream option to reduce memory
                console.log(`[Upload ${taskId}] Reading Excel file...`);
                const workbook = xlsx.readFile(filePath, {
                    type: 'file',
                    dense: false,  // Use sparse format for large files
                    cellDates: true,
                    cellNF: false,
                    cellText: false
                });

                console.log(`[Upload ${taskId}] Excel loaded, sheets: ${workbook.SheetNames.join(', ')}`);

                const sheetName = workbook.SheetNames[0];
                const sheet = workbook.Sheets[sheetName];

                if (!sheet) {
                    throw new Error(`Sheet "${sheetName}" is empty or could not be read`);
                }

                rows = xlsx.utils.sheet_to_json(sheet, { defval: null });
                console.log(`[Upload ${taskId}] Parsed ${rows.length} rows from Excel`);
            }

            if (!rows || rows.length === 0) {
                throw new Error('No data found in the file. Please check file format and content.');
            }

        } catch (parseError) {
            console.error(`[Upload ${taskId}] Parse error:`, parseError);
            const progress = uploadProgress.get(taskId);
            progress.status = 'error';
            progress.errors.push({
                error: `Failed to parse file: ${parseError.message}`,
                phase: 'parsing'
            });

            // Cleanup file
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
            return; // Exit background processing
        }

        // Update total
        console.log(`[Upload ${taskId}] Total rows to process: ${rows.length}`);
        uploadProgress.get(taskId).totalRows = rows.length;

        // Process in batches
        const columnNames = Object.keys(rows[0] || {});
        let processed = 0;
        let inserted = 0;
        let skipped = 0;
        let updated = 0;

        for (let i = 0; i < rows.length; i += batchSize) {
            const batch = rows.slice(i, i + batchSize);

            // Format dates for batch
            const formattedBatch = batch.map(row => {
                const formattedRow = {};
                columnNames.forEach(col => {
                    let val = row[col];
                    if (dateColumns.includes(col) && val !== null && val !== '') {
                        val = formatToMysql(val);
                    }
                    formattedRow[col] = val;
                });
                return formattedRow;
            });

            // Duplicate detection logic
            let rowsToInsert = formattedBatch;

            if (duplicateCheckFields.length > 0) {
                // Pre-check for duplicates based on specified fields
                const checkFieldsStr = duplicateCheckFields.map(f => `\`${f}\``).join(', ');

                // Build WHERE clause for checking
                const checkValues = [];
                duplicateCheckFields.forEach(field => {
                    const values = formattedBatch.map(r => r[field]).filter(v => v !== null && v !== undefined);
                    if (values.length > 0) {
                        checkValues.push({ field, values: [...new Set(values)] });
                    }
                });

                if (checkValues.length > 0) {
                    // Query existing records
                    const whereConditions = checkValues.map(cv =>
                        `\`${cv.field}\` IN (${cv.values.map(() => '?').join(',')})`
                    ).join(' OR ');

                    const queryParams = checkValues.flatMap(cv => cv.values);

                    const [existingRows] = await pool.execute(
                        `SELECT ${checkFieldsStr} FROM \`${table}\` WHERE ${whereConditions}`,
                        queryParams
                    );

                    // Create lookup set for duplicates
                    const existingSet = new Set(
                        existingRows.map(row =>
                            duplicateCheckFields.map(f => String(row[f])).join('||')
                        )
                    );

                    // Filter based on duplicate mode
                    if (duplicateMode === 'error' && existingSet.size > 0) {
                        throw new Error(`Duplicate rows detected. Found ${existingSet.size} existing records that match your data.`);
                    }

                    if (duplicateMode === 'skip') {
                        // Filter out duplicates
                        rowsToInsert = formattedBatch.filter(row => {
                            const key = duplicateCheckFields.map(f => String(row[f])).join('||');
                            return !existingSet.has(key);
                        });
                        skipped += (formattedBatch.length - rowsToInsert.length);
                    }
                    // 'update' mode will use ON DUPLICATE KEY UPDATE below
                }
            }

            if (rowsToInsert.length > 0) {
                // Build values array
                const values = rowsToInsert.map(row =>
                    columnNames.map(col => row[col])
                );

                const placeholders = values.map(() =>
                    `(${columnNames.map(() => '?').join(', ')})`
                ).join(', ');

                const flatValues = values.flat();

                // Build SQL based on mode
                let sql;
                if (duplicateMode === 'update' && duplicateCheckFields.length > 0) {
                    // Use ON DUPLICATE KEY UPDATE
                    const updateClause = columnNames
                        .filter(c => !duplicateCheckFields.includes(c)) // Don't update check fields
                        .map(c => `\`${c}\` = VALUES(\`${c}\`)`)
                        .join(', ');

                    sql = `INSERT INTO \`${table}\` (${columnNames.map(c => `\`${c}\``).join(', ')}) VALUES ${placeholders}`;
                    if (updateClause) {
                        sql += ` ON DUPLICATE KEY UPDATE ${updateClause}`;
                    }
                } else {
                    // Use INSERT IGNORE for skip mode or when no check fields
                    sql = `INSERT IGNORE INTO \`${table}\` (${columnNames.map(c => `\`${c}\``).join(', ')}) VALUES ${placeholders}`;
                }

                try {
                    const [result] = await pool.execute(sql, flatValues);

                    if (duplicateMode === 'update') {
                        // affectedRows = inserted + (updated * 2) in MySQL
                        const affectedRows = result.affectedRows;
                        const changedRows = result.changedRows || 0;
                        inserted += (affectedRows - changedRows) / 2;
                        updated += changedRows;
                    } else {
                        inserted += result.affectedRows;
                        skipped += (rowsToInsert.length - result.affectedRows);
                    }
                } catch (error) {
                    console.error('Batch insert error:', error);
                    uploadProgress.get(taskId).errors.push({
                        batch: i / batchSize + 1,
                        error: error.message
                    });
                }
            }

            processed += batch.length;

            // Update progress
            const progress = uploadProgress.get(taskId);
            progress.processedRows = processed;
            progress.insertedRows = inserted;
            progress.skippedRows = skipped;
            progress.updatedRows = updated;
        }

        // Mark complete
        const finalProgress = uploadProgress.get(taskId);
        finalProgress.status = 'completed';

        // Cleanup file
        fs.unlinkSync(filePath);

        // Keep progress for 5 minutes then delete
        setTimeout(() => uploadProgress.delete(taskId), 5 * 60 * 1000);

    } catch (error) {
        console.error('Upload error:', error);
        const progress = uploadProgress.get(taskId);
        if (progress) {
            progress.status = 'error';
            progress.errors.push({ error: error.message });
        }

        // Cleanup file on error
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
    }
});

// Helper to parse CSV
const parseCsv = (filePath) => {
    return new Promise((resolve, reject) => {
        const rows = [];
        fs.createReadStream(filePath)
            .pipe(csv())
            .on('data', (row) => rows.push(row))
            .on('end', () => resolve(rows))
            .on('error', reject);
    });
};

module.exports = router;
