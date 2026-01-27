const mysql = require('mysql2/promise');
require('dotenv').config();
const { decrypt } = require('../utils/encryption');

// Root pool (no database selected) - used for creating database
const rootPool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 2, // Reduced to avoid too many connections
    queueLimit: 0
});

// Internal database pool (for users table) - created after database exists
let internalPool = null;

const getInternalPool = () => {
    if (!internalPool) {
        internalPool = mysql.createPool({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            port: process.env.DB_PORT || 3306,
            database: process.env.DB_NAME,
            waitForConnections: true,
            connectionLimit: 2,
            queueLimit: 0
        });
    }
    return internalPool;
};

// Get connection for specific database
const getDbConnection = async (dbName) => {
    return mysql.createPool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        port: process.env.DB_PORT || 3306,
        database: dbName,
        waitForConnections: true,
        connectionLimit: 2,
        queueLimit: 0
    });
};

// Create connection to any remote database
const createRemoteConnection = async (config) => {
    return mysql.createPool({
        host: config.host,
        user: config.user,
        password: config.password,
        port: config.port || 3306,
        database: config.database,
        waitForConnections: true,
        connectionLimit: 2,
        queueLimit: 0
    });
};

// Cache for connection pools to avoid creating new pools repeatedly
const connectionPools = new Map();

/**
 * Get or create a connection pool for a specific connection ID
 * @param {number} connectionId - Database connection ID
 * @param {string} database - Optional specific database name
 * @returns {Promise<Pool>} MySQL pool
 */
const getConnectionPool = async (connectionId, database = null) => {
    const cacheKey = `${connectionId}:${database || 'root'}`;

    if (connectionPools.has(cacheKey)) {
        return connectionPools.get(cacheKey);
    }

    try {
        // Get connection credentials from database_connections table
        const [connections] = await getInternalPool().execute(
            'SELECT host, port, username, password FROM database_connections WHERE id = ? AND is_active = TRUE',
            [connectionId]
        );

        if (connections.length === 0) {
            throw new Error(`Connection with ID ${connectionId} not found`);
        }

        const conn = connections[0];
        const decryptedPassword = decrypt(conn.password);

        const poolConfig = {
            host: conn.host,
            user: conn.username,
            password: decryptedPassword,
            port: conn.port,
            waitForConnections: true,
            connectionLimit: 2,
            queueLimit: 0
        };

        if (database) {
            poolConfig.database = database;
        }

        const pool = mysql.createPool(poolConfig);
        connectionPools.set(cacheKey, pool);

        return pool;
    } catch (error) {
        console.error('Error creating connection pool:', error);
        throw error;
    }
};

/**
 * Clear cached connection pool
 * @param {number} connectionId - Optional connection ID, if not provided clears all
 */
const clearConnectionPool = async (connectionId = null) => {
    if (connectionId) {
        // Clear pools for specific connection
        for (const [key, pool] of connectionPools.entries()) {
            if (key.startsWith(`${connectionId}:`)) {
                await pool.end();
                connectionPools.delete(key);
            }
        }
    } else {
        // Clear all cached pools
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
