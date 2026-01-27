const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getInternalPool } = require('../config/db');
const { auth, adminOnly } = require('../middleware/auth');
require('dotenv').config();

// Register (Admin only can create users)
router.post('/register', auth, adminOnly, async (req, res) => {
    try {
        const { username, password, role, allowed_databases } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const allowedDbJson = JSON.stringify(allowed_databases || []);

        await getInternalPool().execute(
            'INSERT INTO users (username, password, role, allowed_databases) VALUES (?, ?, ?, ?)',
            [username, hashedPassword, role || 'operator', allowedDbJson]
        );

        res.status(201).json({ message: 'User created successfully.' });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: 'Username already exists.' });
        }
        console.error('Register error:', error);
        res.status(500).json({ error: 'Failed to create user.' });
    }
});

// Login
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        console.log('Login attempt for username:', username);

        if (!username || !password) {
            console.log('Missing username or password');
            return res.status(400).json({ error: 'Username and password are required.' });
        }

        const [users] = await getInternalPool().execute(
            'SELECT * FROM users WHERE username = ?',
            [username]
        );
        console.log('Users found:', users.length);

        if (users.length === 0) {
            console.log('No user found with username:', username);
            return res.status(401).json({ error: 'Invalid credentials.' });
        }

        const user = users[0];
        console.log('User found, comparing password...');
        const isMatch = await bcrypt.compare(password, user.password);
        console.log('Password match:', isMatch);

        if (!isMatch) {
            console.log('Password does not match');
            return res.status(401).json({ error: 'Invalid credentials.' });
        }

        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
        );

        console.log('Login successful for user:', username);
        res.json({
            token,
            user: {
                id: user.id,
                username: user.username,
                role: user.role,
                allowed_databases: JSON.parse(user.allowed_databases || '[]')
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        console.error('Error stack:', error.stack);
        res.status(500).json({ error: 'Login failed.' });
    }
});

// Get current user
router.get('/me', auth, async (req, res) => {
    try {
        const [users] = await getInternalPool().execute(
            'SELECT id, username, role, allowed_databases, created_at FROM users WHERE id = ?',
            [req.user.id]
        );

        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found.' });
        }

        const user = users[0];
        res.json({
            ...user,
            allowed_databases: JSON.parse(user.allowed_databases || '[]')
        });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ error: 'Failed to get user.' });
    }
});

// Get all users (Admin only)
router.get('/users', auth, adminOnly, async (req, res) => {
    try {
        const [users] = await getInternalPool().execute(
            'SELECT id, username, role, allowed_databases, created_at FROM users'
        );

        res.json(users.map(u => ({
            ...u,
            allowed_databases: JSON.parse(u.allowed_databases || '[]')
        })));
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ error: 'Failed to get users.' });
    }
});

// Update user (Admin only)
router.put('/users/:id', auth, adminOnly, async (req, res) => {
    try {
        const { id } = req.params;
        const { password, role, allowed_databases } = req.body;

        let query = 'UPDATE users SET ';
        const params = [];
        const updates = [];

        if (password) {
            const hashedPassword = await bcrypt.hash(password, 10);
            updates.push('password = ?');
            params.push(hashedPassword);
        }

        if (role) {
            updates.push('role = ?');
            params.push(role);
        }

        if (allowed_databases !== undefined) {
            updates.push('allowed_databases = ?');
            params.push(JSON.stringify(allowed_databases));
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields to update.' });
        }

        query += updates.join(', ') + ' WHERE id = ?';
        params.push(id);

        await getInternalPool().execute(query, params);
        res.json({ message: 'User updated successfully.' });
    } catch (error) {
        console.error('Update user error:', error);
        res.status(500).json({ error: 'Failed to update user.' });
    }
});

// Delete user (Admin only)
router.delete('/users/:id', auth, adminOnly, async (req, res) => {
    try {
        const { id } = req.params;

        // Prevent deleting self
        if (parseInt(id) === req.user.id) {
            return res.status(400).json({ error: 'Cannot delete yourself.' });
        }

        await getInternalPool().execute('DELETE FROM users WHERE id = ?', [id]);
        res.json({ message: 'User deleted successfully.' });
    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({ error: 'Failed to delete user.' });
    }
});

module.exports = router;
