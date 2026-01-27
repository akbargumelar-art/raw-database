const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const xlsx = require('xlsx');
const { getConnectionPool } = require('../config/db'); // Use shared connection pool logic
const { auth } = require('../middleware/auth');
const { verifyDatabaseAccess, getInternalPool } = require('../middleware/permissions'); // Need getInternalPool for permission check manually if not using middleware

// Configure multer
const upload = multer({
    dest: 'uploads/',
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

// Helper: Verify permission (Duplicate of middleware logic but for usage inside route with custom params)
const checkAccess = async (userId, userRole, dbName, connectionId) => {
    if (userRole === 'admin') return true;

    const [users] = await getInternalPool().execute(
        'SELECT allowed_databases FROM users WHERE id = ?',
        [userId]
    );
    const userPermissions = JSON.parse(users[0]?.allowed_databases || '[]');
    return verifyDatabaseAccess(userPermissions, dbName, connectionId);
};

// POST /process
router.post('/process', auth, upload.single('file'), async (req, res) => {
    let filePath = null;
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
        filePath = req.file.path;

        const {
            connectionId,
            database,
            table,
            sourceColumn, // Excel Header Name
            targetColumn, // DB Column Name
            returnColumns // JSON string of array of col names
        } = req.body;

        const returnCols = JSON.parse(returnColumns || '[]');

        if (!connectionId || !database || !table || !sourceColumn || !targetColumn || returnCols.length === 0) {
            fs.unlinkSync(filePath);
            return res.status(400).json({ error: 'Missing required parameters' });
        }

        // 1. Permission Check
        if (!(await checkAccess(req.user.id, req.user.role, database, connectionId))) {
            fs.unlinkSync(filePath);
            return res.status(403).json({ error: 'Access denied to this database' });
        }

        // 2. Read Excel
        const workbook = xlsx.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        let data = xlsx.utils.sheet_to_json(worksheet, { defval: '' });

        if (data.length === 0) {
            fs.unlinkSync(filePath);
            return res.status(400).json({ error: 'File is empty' });
        }

        // 3. Prepare Batching
        const BATCH_SIZE = 1000;
        const pool = await getConnectionPool(parseInt(connectionId), database);

        // Collect all lookup values
        // Filter out empty values to avoid useless queries
        const lookupValues = data
            .map(row => row[sourceColumn])
            .filter(val => val !== undefined && val !== null && val !== '');

        // Use a Map for results: LookupValue -> ResultRow
        const resultMap = new Map();

        // 4. Batch Query
        for (let i = 0; i < lookupValues.length; i += BATCH_SIZE) {
            const batch = lookupValues.slice(i, i + BATCH_SIZE);
            if (batch.length === 0) continue;

            // Secure IN clause
            const placeholders = batch.map(() => '?').join(',');
            // Query: SELECT targetColumn, returnCols... FROM table WHERE targetColumn IN (...)
            // Note: We select targetColumn to match back
            const colsToSelect = [...new Set([targetColumn, ...returnCols])]; // Ensure unique
            // Escape column names
            const safeCols = colsToSelect.map(c => `\`${c}\``).join(',');

            const sql = `SELECT ${safeCols} FROM \`${table}\` WHERE \`${targetColumn}\` IN (${placeholders})`;

            try {
                const [rows] = await pool.execute(sql, batch);

                rows.forEach(row => {
                    // key is the value of targetColumn
                    const key = String(row[targetColumn]);
                    resultMap.set(key, row);
                });
            } catch (err) {
                console.error('Batch query error:', err);
                // Continue processing other batches? Or fail? 
                // Let's fail for safety
                throw new Error(`Database query failed: ${err.message}`);
            }
        }

        // 5. Merge Data
        const enrichedData = data.map(row => {
            const lookupVal = String(row[sourceColumn] || '');
            const match = resultMap.get(lookupVal);

            if (match) {
                returnCols.forEach(col => {
                    row[col] = match[col]; // Append new column to row
                });
            } else {
                returnCols.forEach(col => {
                    row[col] = ''; // Or null? Empty string is better for Excel
                });
            }
            return row;
        });

        // 6. Generate New Excel
        const newWs = xlsx.utils.json_to_sheet(enrichedData);
        const newWb = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(newWb, newWs, "Results");

        // Write to buffer
        const buffer = xlsx.write(newWb, { type: 'buffer', bookType: 'xlsx' });

        // 7. Send Response
        res.setHeader('Content-Disposition', `attachment; filename=lookup_result_${Date.now()}.xlsx`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buffer);

        // Cleanup
        fs.unlinkSync(filePath);

    } catch (error) {
        console.error('Lookup process error:', error);
        if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
        res.status(500).json({ error: error.message || 'Processing failed' });
    }
});

module.exports = router;
