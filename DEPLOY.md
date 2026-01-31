# Deployment Guide

This guide describes how to update the application on your VPS located at `/var/www/raw-data`.

## Prerequisites

- SSH access to your VPS.
- Git is installed and configured.
- Node.js and NPM are installed.
- PM2 (Process Manager) is recommended for managing the backend process.

## Automated Deployment (Recommended)

1.  SSH into your server.
2.  Navigate to the project directory:
    ```bash
    cd /var/www/raw-data
    ```
3.  Run the deployment script:
    ```bash
    bash deploy.sh
    ```

## Manual Deployment Steps

If you prefer to update manually, follow these steps:

1.  **Pull the latest code:**
    ```bash
    cd /var/www/raw-data
    git pull origin main
    ```

2.  **Update Backend Dependencies:**
    ```bash
    cd backend
    npm install
    ```

3.  **Update Frontend Dependencies & Build:**
    ```bash
    cd ../frontend
    npm install
    npm run build
    ```

4.  **Restart Backend Service:**
    If you are using PM2:
    ```bash
    pm2 restart all
    # OR if you have a specific process name
    # pm2 restart dataflow-backend
    ```

    If you are running manually (not recommended for production):
    ```bash
    # Kill existing process and restart
    npm start
    ```
