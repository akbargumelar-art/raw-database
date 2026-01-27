const mysql = require('mysql2/promise');
require('dotenv').config();

async function testConnection() {
    try {
        console.log('Testing database connection...');
        console.log('Host:', process.env.DB_HOST);
        console.log('Port:', process.env.DB_PORT);
        console.log('User:', process.env.DB_USER);
        console.log('Database:', process.env.DB_NAME);

        const pool = mysql.createPool({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            port: process.env.DB_PORT || 3306,
            database: process.env.DB_NAME,
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0
        });

        console.log('\n✓ Pool created successfully');

        // Test connection
        const connection = await pool.getConnection();
        console.log('✓ Connection established');
        connection.release();

        // Check if users table exists
        const [tables] = await pool.execute("SHOW TABLES LIKE 'users'");
        console.log('\nUsers table exists:', tables.length > 0);

        if (tables.length > 0) {
            // Check users
            const [users] = await pool.execute('SELECT id, username, role, created_at FROM users');
            console.log('\nUsers in database:');
            console.table(users);

            // Try to find admin
            const [admins] = await pool.execute("SELECT * FROM users WHERE username = 'admin'");
            if (admins.length > 0) {
                console.log('\n✓ Admin user found');
                console.log('Password hash:', admins[0].password);
            } else {
                console.log('\n✗ Admin user NOT found');
            }
        }

        await pool.end();
        console.log('\n✓ Test completed successfully');
    } catch (error) {
        console.error('\n✗ Error:', error.message);
        console.error('Full error:', error);
    }
}

testConnection();
