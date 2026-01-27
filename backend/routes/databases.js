const express = require('express');
const router = express.Router();
const { getInternalPool, getDbConnection } = require('../config/db');
const { auth, adminOnly } = require('../middleware/auth');

// Get dashboard stats (last update info for each database)
router.get('/stats', auth, async (req, res) => {
    try {
        const { connectionId } = req.query;
        const { getConnectionPool } = require('../config/db');

        // Get the appropriate connection pool
        let pool;
        if (connectionId) {
            pool = await getConnectionPool(parseInt(connectionId));
        } else {
            pool = getInternalPool();
        }

        const [databases] = await pool.execute('SHOW DATABASES');
        const dbNames = databases
            .map(db => db.Database)
            .filter(name => !['information_schema', 'mysql', 'performance_schema', 'sys'].includes(name));

        // For operators, filter by allowed databases (only for internal connection)
        let allowedDbs = dbNames;
        if (req.user.role !== 'admin' && !connectionId) {
            const [users] = await getInternalPool().execute(
                'SELECT allowed_databases FROM users WHERE id = ?',
                [req.user.id]
            );
            allowedDbs = JSON.parse(users[0]?.allowed_databases || '[]');
        }

        // Get last update time for each database
        const dbStats = await Promise.all(
            allowedDbs.map(async (dbName) => {
                try {
                    // Use the selected connection's pool
                    const dbPool = connectionId ? pool : await getDbConnection(dbName);

                    // Get all tables in the database
                    const [tables] = await dbPool.execute('SHOW TABLES');
                    if (tables.length === 0) {
                        return {
                            database: dbName,
                            tableCount: 0,
                            lastUpdate: null,
                            lastUpdateTable: null
                        };
                    }

                    // Query information_schema for the most recent update time
                    const [updateInfo] = await dbPool.execute(`
                        SELECT 
                            TABLE_NAME,
                            UPDATE_TIME,
                            CREATE_TIME
                        FROM information_schema.TABLES
                        WHERE TABLE_SCHEMA = ?
                        ORDER BY 
                            COALESCE(UPDATE_TIME, CREATE_TIME) DESC
                        LIMIT 1
                    `, [dbName]);

                    const latestTable = updateInfo[0];
                    const lastUpdate = latestTable?.UPDATE_TIME || latestTable?.CREATE_TIME;

                    return {
                        database: dbName,
                        tableCount: tables.length,
                        lastUpdate: lastUpdate,
                        lastUpdateTable: latestTable?.TABLE_NAME
                    };
                } catch (error) {
                    console.error(`Error getting stats for ${dbName}:`, error);
                    return {
                        database: dbName,
                        tableCount: 0,
                        lastUpdate: null,
                        lastUpdateTable: null,
                        error: error.message
                    };
                }
            })
        );

        res.json(dbStats);
    } catch (error) {
        console.error('Get dashboard stats error:', error);
        res.status(500).json({ error: 'Failed to fetch dashboard stats.' });
    }
});

// Get all databases
router.get('/', auth, async (req, res) => {
    try {
        const { connectionId } = req.query;
        const { getConnectionPool } = require('../config/db');

        // Get the appropriate connection pool
        let pool;
        if (connectionId) {
            pool = await getConnectionPool(parseInt(connectionId));
        } else {
            pool = getInternalPool();
        }

        const [databases] = await pool.execute('SHOW DATABASES');
        const dbNames = databases
            .map(db => db.Database)
            .filter(name => !['information_schema', 'mysql', 'performance_schema', 'sys'].includes(name));

        // For operators, filter by allowed databases (only for internal connection)
        if (req.user.role !== 'admin' && !connectionId) {
            const [users] = await getInternalPool().execute(
                'SELECT allowed_databases FROM users WHERE id = ?',
                [req.user.id]
            );
            const allowedDbs = JSON.parse(users[0]?.allowed_databases || '[]');
            const filtered = dbNames.filter(db => allowedDbs.includes(db));
            return res.json(filtered);
        }

        res.json(dbNames);
    } catch (error) {
        console.error('Get databases error:', error);
        res.status(500).json({ error: 'Failed to fetch databases.' });
    }
});

// Get tables in a database
router.get('/:database/tables', auth, async (req, res) => {
    try {
        const { database } = req.params;
        const { connectionId } = req.query;
        const { getConnectionPool } = require('../config/db');

        // Check permission for operators (only for internal connection)
        if (req.user.role !== 'admin' && !connectionId) {
            const [users] = await getInternalPool().execute(
                'SELECT allowed_databases FROM users WHERE id = ?',
                [req.user.id]
            );
            const allowedDbs = JSON.parse(users[0]?.allowed_databases || '[]');
            if (!allowedDbs.includes(database)) {
                return res.status(403).json({ error: 'Access denied to this database.' });
            }
        }

        // Get the appropriate connection pool
        let pool;
        if (connectionId) {
            pool = await getConnectionPool(parseInt(connectionId));
        } else {
            pool = await getDbConnection(database);
        }

        const [tables] = await pool.execute('SHOW TABLES');
        const tableNames = tables.map(t => Object.values(t)[0]);

        res.json(tableNames);
    } catch (error) {
        console.error('Get tables error:', error);
        res.status(500).json({ error: 'Failed to fetch tables.' });
    }
});

// Get table info (columns for duplicate detection)
router.get('/:database/:table', auth, async (req, res) => {
    try {
        const { database, table } = req.params;

        const pool = await getDbConnection(database);
        const [columns] = await pool.execute(`DESCRIBE \`${table}\``);

        res.json({
            columns: columns.map(col => ({
                name: col.Field,
                type: col.Type,
                key: col.Key
            }))
        });
    } catch (error) {
        console.error('Get table info error:', error);
        res.status(500).json({ error: 'Failed to fetch table info.' });
    }
});

// Get table structure
router.get('/:database/:table/structure', auth, async (req, res) => {
    try {
        const { database, table } = req.params;

        const pool = await getDbConnection(database);
        const [columns] = await pool.execute(`DESCRIBE \`${table}\``);
        const [createTable] = await pool.execute(`SHOW CREATE TABLE \`${table}\``);

        res.json({
            columns: columns.map(col => ({
                name: col.Field,
                type: col.Type,
                nullable: col.Null === 'YES',
                key: col.Key,
                default: col.Default,
                extra: col.Extra
            })),
            createStatement: createTable[0]['Create Table']
        });
    } catch (error) {
        console.error('Get structure error:', error);
        res.status(500).json({ error: 'Failed to fetch table structure.' });
    }
});

// Create database (Admin only)
router.post('/', auth, adminOnly, async (req, res) => {
    try {
        const { name } = req.body;

        if (!name || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
            return res.status(400).json({ error: 'Invalid database name.' });
        }

        await getInternalPool().execute(`CREATE DATABASE \`${name}\``);
        res.status(201).json({ message: `Database '${name}' created successfully.` });
    } catch (error) {
        console.error('Create database error:', error);
        res.status(500).json({ error: 'Failed to create database.' });
    }
});

// Drop database (Admin only)
router.delete('/:database', auth, adminOnly, async (req, res) => {
    try {
        const { database } = req.params;

        // Safety check
        if (['information_schema', 'mysql', 'performance_schema', 'sys', 'dataflow_pro'].includes(database)) {
            return res.status(400).json({ error: 'Cannot delete system database.' });
        }

        await getInternalPool().execute(`DROP DATABASE \`${database}\``);
        res.json({ message: `Database '${database}' deleted successfully.` });
    } catch (error) {
        console.error('Drop database error:', error);
        res.status(500).json({ error: 'Failed to delete database.' });
    }
});

module.exports = router;
