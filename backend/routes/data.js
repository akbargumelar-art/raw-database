const express = require('express');
const router = express.Router();
const xlsx = require('xlsx');
const { getDbConnection, getConnectionPool } = require('../config/db');
const { auth, adminOnly } = require('../middleware/auth');
const { checkDbPermission } = require('../middleware/permissions');

// IMPORTANT: Specific routes MUST come before parameterized routes

// Raw SQL query (Admin only) - MUST be before /:database/:table
router.post('/:database/query', auth, adminOnly, async (req, res) => {
    try {
        const { database } = req.params;
        const { sql } = req.body;

        if (!sql) {
            return res.status(400).json({ error: 'SQL query is required.' });
        }

        // Basic safety check - block destructive queries without confirmation
        const upperSql = sql.toUpperCase().trim();
        const dangerous = ['DROP DATABASE', 'TRUNCATE', 'DELETE FROM'].some(cmd => upperSql.startsWith(cmd));

        if (dangerous && !req.body.confirmed) {
            return res.status(400).json({
                error: 'Destructive query detected. Send with confirmed: true to execute.',
                requiresConfirmation: true
            });
        }

        const { connectionId } = req.query;
        let pool;
        if (connectionId) {
            pool = await getConnectionPool(parseInt(connectionId), database);
        } else {
            pool = await getDbConnection(database);
        }
        const [result] = await pool.execute(sql);

        // Determine result type
        if (Array.isArray(result)) {
            res.json({ type: 'select', data: result, rowCount: result.length });
        } else {
            res.json({ type: 'modify', affectedRows: result.affectedRows, insertId: result.insertId });
        }
    } catch (error) {
        console.error('SQL query error:', error);
        res.status(400).json({ error: error.message });
    }
});

// Export to Excel - MUST be before /:database/:table
router.get('/:database/:table/export', auth, checkDbPermission, async (req, res) => {
    try {
        const { database, table } = req.params;
        const { search, searchColumn, dateColumn, dateFrom, dateTo } = req.query;

        const { connectionId } = req.query;
        let pool;
        if (connectionId) {
            pool = await getConnectionPool(parseInt(connectionId), database);
        } else {
            pool = await getDbConnection(database);
        }

        // Build WHERE clause
        let whereClause = '';
        const conditions = [];
        const params = [];

        if (search && searchColumn) {
            conditions.push(`\`${searchColumn}\` LIKE ?`);
            params.push(`%${search}%`);
        }

        if (dateColumn && dateFrom && dateTo) {
            conditions.push(`\`${dateColumn}\` BETWEEN ? AND ?`);
            params.push(dateFrom, dateTo);
        }

        if (conditions.length > 0) {
            whereClause = 'WHERE ' + conditions.join(' AND ');
        }

        const [rows] = await pool.execute(`SELECT * FROM \`${table}\` ${whereClause}`, params);

        // Create Excel workbook
        const workbook = xlsx.utils.book_new();
        const worksheet = xlsx.utils.json_to_sheet(rows);
        xlsx.utils.book_append_sheet(workbook, worksheet, table);

        const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Disposition', `attachment; filename="${table}_export.xlsx"`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buffer);
    } catch (error) {
        console.error('Export error:', error);
        res.status(500).json({ error: 'Failed to export data.' });
    }
});

// Get data with pagination, sorting, filtering
router.get('/:database/:table', auth, checkDbPermission, async (req, res) => {
    const startTime = Date.now();
    try {
        const { database, table } = req.params;
        const {
            page = 1,
            limit = 50,
            sortBy,
            sortOrder = 'ASC',
            search,
            searchColumn,
            dateColumn,
            dateFrom,
            dateTo
        } = req.query;

        const pool = await (async () => {
            const { connectionId } = req.query;
            if (connectionId) {
                return await getConnectionPool(parseInt(connectionId), database);
            }
            return await getDbConnection(database);
        })();
        const offset = (parseInt(page) - 1) * parseInt(limit);

        // Build WHERE clause
        let whereClause = '';
        const conditions = [];
        const params = [];

        if (search) {
            if (searchColumn) {
                conditions.push(`\`${searchColumn}\` LIKE ?`);
                params.push(`%${search}%`);
            } else {
                // OPTIMIZED: Search across limited columns with smart pattern matching
                const [columns] = await pool.execute(`DESCRIBE \`${table}\``);
                const textColumns = columns
                    .filter(c => ['varchar', 'text', 'char'].some(t => c.Type.toLowerCase().includes(t)));

                // Smart column selection: prioritize common search fields
                const priorityPatterns = ['name', 'title', 'description', 'email', 'username', 'address', 'city', 'phone'];
                const priorityCols = textColumns.filter(c =>
                    priorityPatterns.some(p => c.Field.toLowerCase().includes(p))
                );

                // Use priority columns if found, otherwise use first 5 text columns
                const searchCols = priorityCols.length > 0
                    ? priorityCols.slice(0, 5)
                    : textColumns.slice(0, 5);

                const searchConditions = searchCols.map(c => `\`${c.Field}\` LIKE ?`);
                if (searchConditions.length > 0) {
                    conditions.push(`(${searchConditions.join(' OR ')})`);
                    searchConditions.forEach(() => params.push(`%${search}%`));
                    console.log(`[Performance] Searching across ${searchCols.length} columns: ${searchCols.map(c => c.Field).join(', ')}`);
                }
            }
        }

        // Optimized date filtering with DATE() for better performance
        if (dateColumn && dateFrom && dateTo) {
            // Use DATE() to allow index usage on datetime columns
            conditions.push(`DATE(\`${dateColumn}\`) BETWEEN ? AND ?`);
            params.push(dateFrom, dateTo);
        }

        if (conditions.length > 0) {
            whereClause = 'WHERE ' + conditions.join(' AND ');
        }

        // Build ORDER BY
        let orderClause = '';
        if (sortBy) {
            orderClause = `ORDER BY \`${sortBy}\` ${sortOrder === 'DESC' ? 'DESC' : 'ASC'}`;
        }

        // OPTIMIZED: Get total count (use approximate for large tables)
        let total;
        let isApproximate = false;

        // First, check table size for optimization decision
        const [tableStats] = await pool.execute(
            `SELECT TABLE_ROWS FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
            [database, table]
        );
        const estimatedRows = tableStats[0]?.TABLE_ROWS || 0;

        if (estimatedRows > 100000 && conditions.length === 0) {
            // Use approximate count for large tables without filters
            total = estimatedRows;
            isApproximate = true;
            console.log(`[Performance] Using approximate count: ${total} rows (table has ~${estimatedRows} rows)`);
        } else {
            // Use exact count for smaller tables or when filters are applied
            const countStart = Date.now();
            const [countResult] = await pool.execute(
                `SELECT COUNT(*) as total FROM \`${table}\` ${whereClause}`,
                params
            );
            total = countResult[0].total;
            console.log(`[Performance] Exact count query took ${Date.now() - countStart}ms`);
        }

        // Get data - use direct values for LIMIT/OFFSET instead of parameters
        const limitValue = parseInt(limit);
        const offsetValue = offset;
        const [rows] = await pool.execute(
            `SELECT * FROM \`${table}\` ${whereClause} ${orderClause} LIMIT ${limitValue} OFFSET ${offsetValue}`,
            params
        );

        // Get columns
        const [columns] = await pool.execute(`DESCRIBE \`${table}\``);

        const queryTime = Date.now() - startTime;
        console.log(`[Performance] Total query time: ${queryTime}ms for table ${table}`);

        res.json({
            data: rows,
            columns: columns.map(c => ({
                name: c.Field,
                type: c.Type,
                key: c.Key
            })),
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                totalPages: Math.ceil(total / parseInt(limit)),
                isApproximate
            },
            performance: {
                queryTime,
                isApproximate
            }
        });
    } catch (error) {
        console.error('Get data error:', error);
        res.status(500).json({ error: 'Failed to fetch data.' });
    }
});

// Insert row
router.post('/:database/:table', auth, checkDbPermission, async (req, res) => {
    try {
        const { database, table } = req.params;
        const data = req.body;

        const { connectionId } = req.query;
        let pool;
        if (connectionId) {
            pool = await getConnectionPool(parseInt(connectionId), database);
        } else {
            pool = await getDbConnection(database);
        }
        const columns = Object.keys(data);
        const values = Object.values(data);
        const placeholders = columns.map(() => '?').join(', ');

        const sql = `INSERT INTO \`${table}\` (${columns.map(c => `\`${c}\``).join(', ')}) VALUES (${placeholders})`;
        const [result] = await pool.execute(sql, values);

        res.status(201).json({ message: 'Row inserted successfully.', insertId: result.insertId });
    } catch (error) {
        console.error('Insert error:', error);
        res.status(500).json({ error: error.message || 'Failed to insert row.' });
    }
});

// Update row
router.put('/:database/:table/:id', auth, checkDbPermission, async (req, res) => {
    try {
        const { database, table, id } = req.params;
        const { primaryKey = 'id', ...data } = req.body;

        const { connectionId } = req.query;
        let pool;
        if (connectionId) {
            pool = await getConnectionPool(parseInt(connectionId), database);
        } else {
            pool = await getDbConnection(database);
        }
        const updates = Object.keys(data).map(k => `\`${k}\` = ?`).join(', ');
        const values = [...Object.values(data), id];

        const sql = `UPDATE \`${table}\` SET ${updates} WHERE \`${primaryKey}\` = ?`;
        await pool.execute(sql, values);

        res.json({ message: 'Row updated successfully.' });
    } catch (error) {
        console.error('Update error:', error);
        res.status(500).json({ error: error.message || 'Failed to update row.' });
    }
});

// Delete row
router.delete('/:database/:table/:id', auth, checkDbPermission, async (req, res) => {
    try {
        const { database, table, id } = req.params;
        const { primaryKey = 'id' } = req.query;

        const { connectionId } = req.query;
        let pool;
        if (connectionId) {
            pool = await getConnectionPool(parseInt(connectionId), database);
        } else {
            pool = await getDbConnection(database);
        }
        await pool.execute(`DELETE FROM \`${table}\` WHERE \`${primaryKey}\` = ?`, [id]);

        res.json({ message: 'Row deleted successfully.' });
    } catch (error) {
        console.error('Delete error:', error);
        res.status(500).json({ error: 'Failed to delete row.' });
    }
});

module.exports = router;
