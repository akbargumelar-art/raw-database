const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getDbConnection, getConnectionPool } = require('../config/db');
const { auth, adminOnly } = require('../middleware/auth');
const { checkDbPermission } = require('../middleware/permissions');
const { analyzeFile } = require('../utils/fileAnalyzer');

// Configure multer for file uploads
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
    limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit
});

// Analyze uploaded file for schema suggestions
router.post('/analyze', auth, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded.' });
        }

        const ext = path.extname(req.file.originalname).toLowerCase().replace('.', '');
        const analysis = await analyzeFile(req.file.path, ext);

        // Cleanup uploaded file
        fs.unlinkSync(req.file.path);

        res.json(analysis);
    } catch (error) {
        console.error('Analyze error:', error);
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).json({ error: 'Failed to analyze file.' });
    }
});

// Create table
router.post('/:database/create-table', auth, checkDbPermission, async (req, res) => {
    try {
        const { database } = req.params;
        const { connectionId } = req.query;
        const { tableName, columns } = req.body;

        if (!tableName || !columns || columns.length === 0) {
            return res.status(400).json({ error: 'Table name and columns are required.' });
        }

        // Validate table name
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
            return res.status(400).json({ error: 'Invalid table name.' });
        }

        // Build CREATE TABLE statement
        const columnDefs = columns.map(col => {
            let def = `\`${col.name}\` ${col.type}`;
            if (!col.nullable) def += ' NOT NULL';
            if (col.default) def += ` DEFAULT ${col.default}`;
            if (col.autoIncrement) def += ' AUTO_INCREMENT';
            return def;
        });

        // Add primary key
        const primaryKeys = columns.filter(c => c.primaryKey).map(c => `\`${c.name}\``);
        if (primaryKeys.length > 0) {
            columnDefs.push(`PRIMARY KEY (${primaryKeys.join(', ')})`);
        }

        const sql = `CREATE TABLE \`${tableName}\` (\n  ${columnDefs.join(',\n  ')}\n)`;

        const pool = await getConnectionPool(connectionId, database);
        await pool.execute(sql);

        res.status(201).json({ message: `Table '${tableName}' created successfully.`, sql });
    } catch (error) {
        console.error('Create table error:', error);
        res.status(500).json({ error: error.message || 'Failed to create table.' });
    }
});

// Edit column
router.put('/:database/:table/column/:column', auth, checkDbPermission, async (req, res) => {
    try {
        const { database, table, column } = req.params;
        const { connectionId } = req.query;
        const { newName, type, nullable, defaultValue } = req.body;

        const pool = await getConnectionPool(connectionId, database);

        let sql = `ALTER TABLE \`${table}\` `;

        if (newName && newName !== column) {
            sql += `CHANGE COLUMN \`${column}\` \`${newName}\` ${type}`;
        } else {
            sql += `MODIFY COLUMN \`${column}\` ${type}`;
        }

        if (nullable === false) sql += ' NOT NULL';
        if (defaultValue) sql += ` DEFAULT ${defaultValue}`;

        await pool.execute(sql);
        res.json({ message: 'Column updated successfully.', sql });
    } catch (error) {
        console.error('Edit column error:', error);
        res.status(500).json({ error: error.message || 'Failed to update column.' });
    }
});

// Add column
router.post('/:database/:table/column', auth, checkDbPermission, async (req, res) => {
    try {
        const { database, table } = req.params;
        const { connectionId } = req.query;
        const { name, type, nullable, defaultValue, afterColumn } = req.body;

        const pool = await getConnectionPool(connectionId, database);

        let sql = `ALTER TABLE \`${table}\` ADD COLUMN \`${name}\` ${type}`;
        if (nullable === false) sql += ' NOT NULL';
        if (defaultValue) sql += ` DEFAULT ${defaultValue}`;
        if (afterColumn) {
            sql += ` AFTER \`${afterColumn}\``;
        }

        await pool.execute(sql);
        res.status(201).json({ message: 'Column added successfully.', sql });
    } catch (error) {
        console.error('Add column error:', error);
        res.status(500).json({ error: error.message || 'Failed to add column.' });
    }
});

// Delete column
router.delete('/:database/:table/column/:column', auth, checkDbPermission, async (req, res) => {
    try {
        const { database, table, column } = req.params;
        const { connectionId } = req.query;

        const pool = await getConnectionPool(connectionId, database);
        const sql = `ALTER TABLE \`${table}\` DROP COLUMN \`${column}\``;
        await pool.execute(sql);

        res.json({ message: 'Column deleted successfully.' });
    } catch (error) {
        console.error('Delete column error:', error);
        res.status(500).json({ error: error.message || 'Failed to delete column.' });
    }
});

// Reorder column (FIRST/AFTER)
router.put('/:database/:table/reorder', auth, checkDbPermission, async (req, res) => {
    try {
        const { database, table } = req.params;
        const { connectionId } = req.query;
        const { column, type, afterColumn } = req.body;

        const pool = await getConnectionPool(connectionId, database);

        let sql = `ALTER TABLE \`${table}\` MODIFY COLUMN \`${column}\` ${type}`;

        if (afterColumn === null || afterColumn === 'FIRST') {
            sql += ' FIRST';
        } else {
            sql += ` AFTER \`${afterColumn}\``;
        }

        await pool.execute(sql);
        res.json({ message: 'Column reordered successfully.', sql });
    } catch (error) {
        console.error('Reorder column error:', error);
        res.status(500).json({ error: error.message || 'Failed to reorder column.' });
    }
});

// Drop table
router.delete('/:database/:table', auth, adminOnly, async (req, res) => {
    try {
        const { database, table } = req.params;
        const { connectionId } = req.query;

        const pool = await getConnectionPool(connectionId, database);
        await pool.execute(`DROP TABLE \`${table}\``);

        res.json({ message: `Table '${table}' deleted successfully.` });
    } catch (error) {
        console.error('Drop table error:', error);
        res.status(500).json({ error: 'Failed to delete table.' });
    }
});

module.exports = router;
