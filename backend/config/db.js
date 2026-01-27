const mysql = require('mysql2/promise');
require('dotenv').config();

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

module.exports = { rootPool, getInternalPool, createRemoteConnection, getDbConnection };
