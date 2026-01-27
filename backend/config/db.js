const mysql = require('mysql2/promise');
require('dotenv').config();
const { decrypt } = require('../utils/encryption');

// Singleton internal pool (for users, settings, etc.)
let internalPool = null;

const getInternalPool = () => {
    if (!internalPool) {
        // console.log('Initializing Internal Pool...');
        internalPool = mysql.createPool({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            port: process.env.DB_PORT || 3306,
            database: process.env.DB_NAME, // dataflow_pro
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0,
            enableKeepAlive: true,
            keepAliveInitialDelay: 0
        });
    }
    return internalPool;
};

// Root pool (no database) - only for initial setup
const rootPool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 1,
    queueLimit: 0
});

// Cache for external connection pools
const connectionPools = new Map();

// Helper to get connection config by ID
const getConnectionConfig = async (connectionId) => {
    const [rows] = await getInternalPool().execute(
        'SELECT host, port, username, password FROM database_connections WHERE id = ? AND is_active = TRUE',
        [connectionId]
    );
    if (rows.length === 0) return null;
    return rows[0];
};

/**
 * Get pool for a specific connection ID and optional database
 */
const getConnectionPool = async (connectionId, database = null) => {
    // If no connectionId, use internal pool (localhost)
    if (!connectionId) {
        if (database) {
            // Localhost but specific DB
            return getDbConnection(database);
        }
        return getInternalPool();
    }

    const cacheKey = `${connectionId}:${database || 'root'}`;

    // Return cached pool if exists
    if (connectionPools.has(cacheKey)) {
        return connectionPools.get(cacheKey);
    }

    // Create new pool
    try {
        const config = await getConnectionConfig(connectionId);
        if (!config) throw new Error(`Connection ${connectionId} not found`);

        const poolConfig = {
            host: config.host,
            port: config.port,
            user: config.username,
            password: decrypt(config.password),
            waitForConnections: true,
            connectionLimit: 5,
            queueLimit: 0
        };

        if (database) {
            poolConfig.database = database;
        }

        const pool = mysql.createPool(poolConfig);
        connectionPools.set(cacheKey, pool);
        return pool;
    } catch (error) {
        console.error('Error creating pool:', error);
        throw error;
    }
};

/**
 * Get connection to a specific database on LOCALHOST (Legacy support)
 */
const getDbConnection = async (dbName) => {
    // Use internal pool stats if possible? No, internal has DB_NAME fixed.
    // Create specific pool for this DB on localhost
    return mysql.createPool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        port: process.env.DB_PORT || 3306,
        database: dbName,
        waitForConnections: true,
        connectionLimit: 5,
        queueLimit: 0
    });
};

const createRemoteConnection = async (config) => {
    return mysql.createPool({
        host: config.host,
        user: config.user,
        password: config.password,
        port: config.port || 3306,
        database: config.database,
        waitForConnections: true,
        connectionLimit: 5,
        queueLimit: 0
    });
};

const clearConnectionPool = async (connectionId = null) => {
    if (connectionId) {
        for (const [key, pool] of connectionPools.entries()) {
            if (key.startsWith(`${connectionId}:`)) {
                await pool.end();
                connectionPools.delete(key);
            }
        }
    } else {
        for (const pool of connectionPools.values()) {
            await pool.end();
        }
        connectionPools.clear();
    }
};

module.exports = {
    rootPool,
    getInternalPool,
    createRemoteConnection,
    getDbConnection,
    getConnectionPool,
    clearConnectionPool
};
