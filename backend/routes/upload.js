const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const xlsx = require('xlsx');
const csv = require('csv-parser');
const { getDbConnection } = require('../config/db');
const { auth } = require('../middleware/auth');
const { checkDbPermission } = require('../middleware/permissions');
const { formatToMysql, isDateColumn } = require('../utils/dateFormatter');

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

// Store upload progress in memory (use Redis in production)
const uploadProgress = new Map();

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
        const pool = await getDbConnection(database);
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

        if (ext === '.csv') {
            rows = await parseCsv(filePath);
        } else {
            const workbook = xlsx.readFile(filePath);
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            rows = xlsx.utils.sheet_to_json(sheet, { defval: null });
        }

        // Update total
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
