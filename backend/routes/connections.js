const express = require('express');
const router = express.Router();
const { getInternalPool, createRemoteConnection } = require('../config/db');
const { auth, adminOnly } = require('../middleware/auth');
const { encrypt, decrypt } = require('../utils/encryption');

// Get all database connections
router.get('/', auth, async (req, res) => {
    try {
        const [connections] = await getInternalPool().execute(
            'SELECT id, name, host, port, username, is_default, is_active, created_at FROM database_connections WHERE is_active = TRUE ORDER BY is_default DESC, name ASC'
        );
        res.json(connections);
    } catch (error) {
        console.error('Get connections error:', error);
        res.status(500).json({ error: 'Failed to get database connections.' });
    }
});

// Get connection by ID
router.get('/:id', auth, async (req, res) => {
    try {
        const { id } = req.params;
        const [connections] = await getInternalPool().execute(
            'SELECT id, name, host, port, username, is_default, is_active, created_at FROM database_connections WHERE id = ? AND is_active = TRUE',
            [id]
        );

        if (connections.length === 0) {
            return res.status(404).json({ error: 'Connection not found.' });
        }

        res.json(connections[0]);
    } catch (error) {
        console.error('Get connection error:', error);
        res.status(500).json({ error: 'Failed to get connection.' });
    }
});

// Test database connection
router.post('/test', auth, async (req, res) => {
    try {
        const { host, port, username, password } = req.body;

        if (!host || !username || !password) {
            return res.status(400).json({ error: 'Host, username, and password are required.' });
        }

        // Try to create a connection
        const testPool = await createRemoteConnection({
            host,
            port: port || 3306,
            user: username,
            password
        });

        // Try to get databases list to verify connection
        const [databases] = await testPool.execute('SHOW DATABASES');

        // Close test connection
        await testPool.end();

        res.json({
            success: true,
            message: 'Connection successful!',
            databases: databases.map(db => Object.values(db)[0])
        });
    } catch (error) {
        console.error('Test connection error:', error);
        res.status(400).json({
            success: false,
            message: error.code === 'ENOTFOUND'
                ? 'Host not found. Please check the hostname.'
                : error.code === 'ER_ACCESS_DENIED_ERROR'
                    ? 'Access denied. Please check username and password.'
                    : 'Connection failed: ' + error.message
        });
    }
});

// Create new database connection (Admin only)
router.post('/', auth, adminOnly, async (req, res) => {
    try {
        const { name, host, port, username, password, is_default } = req.body;

        if (!name || !host || !username || !password) {
            return res.status(400).json({ error: 'Name, host, username, and password are required.' });
        }

        // Encrypt password
        const encryptedPassword = encrypt(password);

        // If this is set as default, unset other defaults
        if (is_default) {
            await getInternalPool().execute(
                'UPDATE database_connections SET is_default = FALSE WHERE is_default = TRUE'
            );
        }

        const [result] = await getInternalPool().execute(
            'INSERT INTO database_connections (name, host, port, username, password, is_default, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [name, host, port || 3306, username, encryptedPassword, is_default || false, req.user.id]
        );

        res.status(201).json({
            message: 'Database connection created successfully.',
            id: result.insertId
        });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: 'A connection with this name already exists.' });
        }
        console.error('Create connection error:', error);
        res.status(500).json({ error: 'Failed to create connection.' });
    }
});

// Update database connection (Admin only)
router.put('/:id', auth, adminOnly, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, host, port, username, password, is_default } = req.body;

        const updates = [];
        const params = [];

        if (name) {
            updates.push('name = ?');
            params.push(name);
        }
        if (host) {
            updates.push('host = ?');
            params.push(host);
        }
        if (port) {
            updates.push('port = ?');
            params.push(port);
        }
        if (username) {
            updates.push('username = ?');
            params.push(username);
        }
        if (password) {
            updates.push('password = ?');
            params.push(encrypt(password));
        }

        if (updates.length === 0 && is_default === undefined) {
            return res.status(400).json({ error: 'No fields to update.' });
        }

        // If setting as default, unset other defaults first
        if (is_default) {
            await getInternalPool().execute(
                'UPDATE database_connections SET is_default = FALSE WHERE is_default = TRUE'
            );
            updates.push('is_default = ?');
            params.push(true);
        }

        if (updates.length > 0) {
            params.push(id);
            await getInternalPool().execute(
                `UPDATE database_connections SET ${updates.join(', ')} WHERE id = ?`,
                params
            );
        }

        res.json({ message: 'Connection updated successfully.' });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: 'A connection with this name already exists.' });
        }
        console.error('Update connection error:', error);
        res.status(500).json({ error: 'Failed to update connection.' });
    }
});

// Set connection as default (Admin only)
router.put('/:id/set-default', auth, adminOnly, async (req, res) => {
    try {
        const { id } = req.params;

        // Unset all defaults
        await getInternalPool().execute(
            'UPDATE database_connections SET is_default = FALSE WHERE is_default = TRUE'
        );

        // Set this one as default
        await getInternalPool().execute(
            'UPDATE database_connections SET is_default = TRUE WHERE id = ?',
            [id]
        );

        res.json({ message: 'Default connection updated successfully.' });
    } catch (error) {
        console.error('Set default error:', error);
        res.status(500).json({ error: 'Failed to set default connection.' });
    }
});

// Delete database connection (Admin only) - Soft delete
router.delete('/:id', auth, adminOnly, async (req, res) => {
    try {
        const { id } = req.params;

        // Check if it's the default connection
        const [connections] = await getInternalPool().execute(
            'SELECT is_default FROM database_connections WHERE id = ?',
            [id]
        );

        if (connections.length === 0) {
            return res.status(404).json({ error: 'Connection not found.' });
        }

        if (connections[0].is_default) {
            return res.status(400).json({ error: 'Cannot delete the default connection. Please set another connection as default first.' });
        }

        // Soft delete
        await getInternalPool().execute(
            'UPDATE database_connections SET is_active = FALSE WHERE id = ?',
            [id]
        );

        res.json({ message: 'Connection deleted successfully.' });
    } catch (error) {
        console.error('Delete connection error:', error);
        res.status(500).json({ error: 'Failed to delete connection.' });
    }
});

// Get connection credentials (for internal use by other routes)
router.getConnectionCredentials = async (connectionId) => {
    try {
        const [connections] = await getInternalPool().execute(
            'SELECT host, port, username, password FROM database_connections WHERE id = ? AND is_active = TRUE',
            [connectionId]
        );

        if (connections.length === 0) {
            throw new Error('Connection not found');
        }

        const conn = connections[0];
        return {
            host: conn.host,
            port: conn.port,
            user: conn.username,
            password: decrypt(conn.password)
        };
    } catch (error) {
        console.error('Get connection credentials error:', error);
        throw error;
    }
};

// Get default connection ID
router.getDefaultConnectionId = async () => {
    try {
        const [connections] = await getInternalPool().execute(
            'SELECT id FROM database_connections WHERE is_default = TRUE AND is_active = TRUE LIMIT 1'
        );

        if (connections.length === 0) {
            throw new Error('No default connection found');
        }

        return connections[0].id;
    } catch (error) {
        console.error('Get default connection error:', error);
        throw error;
    }
};

module.exports = router;
