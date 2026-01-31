#!/bin/bash

# Deployment Script for Raw Data App

echo "Starting deployment..."

# Navigate to project root (adjust if running from elsewhere)
# cd /var/www/raw-data

# 1. Pull latest changes
echo "Pulling latest changes from git..."
git pull origin main

# 2. Backend Setup
echo "Updating backend dependencies..."
cd backend
npm install
# Optional: Run database migrations if you have them
# npm run migrate 

# 3. Frontend Setup
echo "Updating frontend dependencies..."
cd ../frontend
npm install

echo "Building frontend..."
npm run build

# 4. Restart Services
echo "Restarting backend service..."
# Assuming you use PM2. If not, replace this with your restart command.
if command -v pm2 &> /dev/null
then
    pm2 restart all
    echo "PM2 services restarted."
else
    echo "PM2 not found. Please restart your node server manually."
fi

echo "Deployment complete!"
