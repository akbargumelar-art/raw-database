const { getInternalPool } = require('../config/db');

const verifyDatabaseAccess = (allowedDatabases, dbName, connectionId) => {
    return allowedDatabases.some(entry => {
        // Case 1: Entry is "connectionId:dbName"
        const parts = entry.split(':');
        if (parts.length === 2) {
            const [entryConnId, entryDbName] = parts;
            // Match if connectionId matches (string comparison) and dbName matches
            if (connectionId) {
                return String(entryConnId) === String(connectionId) && entryDbName === dbName;
            }
            // If no connectionId provided in request, match if entry is default (1)
            return entryConnId === '1' && entryDbName === dbName;
        }

        // Case 2: Entry is just "dbName" (Legacy/Localhost)
        if (entry === dbName) {
            // Only allow if connectionId is missing OR connectionId is 1 (Localhost)
            if (!connectionId || String(connectionId) === '1') {
                return true;
            }
        }

        return false;
    });
};

const checkDbPermission = async (req, res, next) => {
    try {
        const dbName = req.params.database || req.body.database || req.query.database;
        const connectionId = req.query.connectionId || req.body.connectionId;

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

        if (!verifyDatabaseAccess(allowedDatabases, dbName, connectionId)) {
            return res.status(403).json({ error: 'Access denied to this database.' });
        }

        next();
    } catch (error) {
        console.error('Permission check error:', error);
        res.status(500).json({ error: 'Permission verification failed.' });
    }
};

module.exports = { checkDbPermission, verifyDatabaseAccess };
