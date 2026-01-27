module.exports = {
    apps: [{
        name: 'raw-data-backend',
        script: './server.js',
        instances: 1,
        exec_mode: 'cluster',
        env: {
            NODE_ENV: 'production',
            PORT: 5003
        },
        error_file: '/var/log/pm2/raw-data-error.log',
        out_file: '/var/log/pm2/raw-data-out.log',
        log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
        max_memory_restart: '500M',
        autorestart: true,
        watch: false
    }]
};
