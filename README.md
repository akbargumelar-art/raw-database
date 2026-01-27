# DataFlow Pro - Mass Data Management System

Production-ready web application for managing massive MySQL data, remote database architecting, and high-performance batch uploading.

## Features

- 🔐 **JWT Authentication** - Admin and Operator roles with database-level permissions
- 🗄️ **Database Designer** - Create and edit table schemas with file analysis
- 📊 **Data Explorer** - Advanced filtering, pagination, sorting, and SQL mode
- 🚀 **High-Performance Uploader** - Batch processing with progress tracking
- 🎨 **Modern UI** - Dark theme with Rose Red accent (#f43f5e)

## Quick Start

### Backend

```bash
cd backend
npm install
npm run dev
```

Server runs on http://localhost:5000

### Frontend

```bash
cd frontend
npm install
npm run dev
```

App runs on http://localhost:3000

## Default Login

- **Username:** admin
- **Password:** admin123

## Deployment

Push to GitHub and pull on VPS:

```bash
# On VPS
cd /var/www/raw-database
git pull origin main
cd backend && npm install
cd ../frontend && npm install && npm run build
pm2 restart all
```

## Tech Stack

- **Frontend:** React, Vite, Tailwind CSS, Lucide Icons
- **Backend:** Node.js, Express, MySQL2
- **Auth:** JWT, bcryptjs
- **File Processing:** xlsx, csv-parser, multer
