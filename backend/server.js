const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const { rootPool, getInternalPool } = require('./config/db');

// Import routes
const authRoutes = require('./routes/auth');
const databaseRoutes = require('./routes/databases');
const schemaRoutes = require('./routes/schema');
const dataRoutes = require('./routes/data');
const uploadRoutes = require('./routes/upload');
const connectionsRoutes = require('./routes/connections');

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static files in production
app.use(express.static(path.join(__dirname, '../frontend/dist')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/databases', databaseRoutes);
app.use('/api/schema', schemaRoutes);
app.use('/api/data', dataRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/connections', connectionsRoutes);

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Initialize database tables
const initDatabase = async () => {
    try {
        // Step 1: Create database using root pool (no database selected)
        console.log('Creating database if not exists...');
        await rootPool.execute(`CREATE DATABASE IF NOT EXISTS dataflow_pro`);
        console.log('Database dataflow_pro created/verified');

        // Step 2: Now get internal pool (with database)
        const internalPool = getInternalPool();

        // Step 3: Create users table
        console.log('Creating users table if not exists...');
        await internalPool.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role ENUM('admin', 'operator') DEFAULT 'operator',
        allowed_databases TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

        // Step 4: Create default admin if not exists
        const [admins] = await internalPool.execute(
            "SELECT * FROM users WHERE role = 'admin' LIMIT 1"
        );

        if (admins.length === 0) {
            const bcrypt = require('bcryptjs');
            const hashedPassword = await bcrypt.hash('admin123', 10);
            await internalPool.execute(
                "INSERT INTO users (username, password, role, allowed_databases) VALUES (?, ?, 'admin', '[]')",
                ['admin', hashedPassword]
            );
            console.log('Default admin user created: admin / admin123');
        }

        // Step 5: Create database_connections table
        console.log('Creating database_connections table if not exists...');
        await internalPool.execute(`
      CREATE TABLE IF NOT EXISTS database_connections (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        host VARCHAR(255) NOT NULL,
        port INT DEFAULT 3306,
        username VARCHAR(255) NOT NULL,
        password TEXT NOT NULL,
        is_default BOOLEAN DEFAULT FALSE,
        is_active BOOLEAN DEFAULT TRUE,
        created_by INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_is_default (is_default),
        INDEX idx_is_active (is_active)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

        // Step 6: Create localhost connection if not exists
        const [connections] = await internalPool.execute(
            "SELECT * FROM database_connections WHERE name = 'Localhost' LIMIT 1"
        );

        if (connections.length === 0) {
            const { encrypt } = require('./utils/encryption');
            const encryptedPassword = encrypt(process.env.DB_PASSWORD);
            await internalPool.execute(
                "INSERT INTO database_connections (name, host, port, username, password, is_default, created_by) VALUES (?, ?, ?, ?, ?, TRUE, 1)",
                ['Localhost', process.env.DB_HOST, process.env.DB_PORT || 3306, process.env.DB_USER, encryptedPassword]
            );
            console.log('Default localhost connection created');
        }

        console.log('Database initialized successfully.');
    } catch (error) {
        console.error('Database initialization error:', error);
    }
};

// SPA fallback - serve index.html for all non-API routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({ error: err.message || 'Internal server error.' });
});

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, async () => {
    console.log(`Raw Data server running on port ${PORT}`);
    await initDatabase();
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('SIGTERM received, closing server gracefully...');
    server.close(async () => {
        await rootPool.end();
        const internal = getInternalPool();
        if (internal) await internal.end();
        console.log('All connections closed');
        process.exit(0);
    });
});

process.on('SIGINT', async () => {
    console.log('\nSIGINT received, closing server gracefully...');
    server.close(async () => {
        await rootPool.end();
        const internal = getInternalPool();
        if (internal) await internal.end();
        console.log('All connections closed');
        process.exit(0);
    });
});

module.exports = app;
