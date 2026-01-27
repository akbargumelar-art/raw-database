const { getInternalPool } = require('../config/db');

const checkDbPermission = async (req, res, next) => {
    try {
        const dbName = req.params.database || req.body.database || req.query.database;

        if (!dbName) {
            return res.status(400).json({ error: 'Database name is required.' });
        }

        // Admin has access to all databases
        if (req.user.role === 'admin') {
            return next();
        }

        // For operators, check allowed_databases
        const [users] = await getInternalPool().execute(
            'SELECT allowed_databases FROM users WHERE id = ?',
            [req.user.id]
        );

        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found.' });
        }

        const allowedDatabases = JSON.parse(users[0].allowed_databases || '[]');

        if (!allowedDatabases.includes(dbName)) {
            return res.status(403).json({ error: 'Access denied to this database.' });
        }

        next();
    } catch (error) {
        console.error('Permission check error:', error);
        res.status(500).json({ error: 'Permission verification failed.' });
    }
};

module.exports = { checkDbPermission };
