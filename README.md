# Raw Data - Database Management System

Aplikasi web untuk manajemen database MySQL dengan fitur upload data massal dari file Excel/CSV.

## 🚀 Features

- **Dashboard**: Statistik database yang diupdate (hari ini, 7 hari, 30 hari terakhir)
- **Database Management**: Kelola multiple databases dan tabel
- **Data Explorer**: Browse, edit, dan query data dengan SQL editor
- **Mass Upload**: Upload data dari file Excel/CSV dengan validasi duplikat
- **User Management**: Role-based access (Admin & Operator)
- **Authentication**: Login system dengan JWT

## 📋 Tech Stack

**Backend:**
- Node.js + Express
- MySQL2
- JWT Authentication
- Multer (file upload)
- XLSX & CSV Parser

**Frontend:**
- React 18
- React Router
- Axios
- Lucide Icons
- Vite

## 🛠️ Development Setup

### Prerequisites
- Node.js v18+
- MySQL 5.7+

### Backend Setup
```bash
cd Backend
npm install
# Copy .env.example to .env dan sesuaikan konfigurasi
cp .env.example .env
npm run dev
```

### Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

### Default Login
- Username: `admin`
- Password: `admin123`

**⚠️ SEGERA ganti password setelah login pertama!**

## 🌐 VPS Deployment

Untuk deployment ke VPS, silakan ikuti panduan lengkap di folder `docs/deployment`:

### 📚 Deployment Documentation

1. **[DEPLOYMENT_GUIDE.md](docs/deployment/DEPLOYMENT_GUIDE.md)** 
   - Panduan lengkap step-by-step dalam Bahasa Indonesia
   - Setup server, database, backend, frontend
   - Konfigurasi Nginx, SSL, PM2
   - Security & troubleshooting

2. **[QUICK_CHECKLIST.md](docs/deployment/QUICK_CHECKLIST.md)**
   - Checklist cepat dengan command copy-paste
   - Quick reference untuk maintenance

3. **[PORT_CONFIGURATION.md](docs/deployment/PORT_CONFIGURATION.md)**
   - Informasi port yang digunakan
   - Port alternatif jika diperlukan

### 📁 Configuration Files

- `Backend/.env.example` - Template environment variables
- `Backend/ecosystem.config.js` - PM2 configuration
- `docs/deployment/nginx-raw-data.conf` - Nginx configuration

### Quick Deploy Steps

```bash
# 1. Clone repository
git clone https://github.com/akbargumelar-art/raw-database.git
cd raw-database

# 2. Setup Backend
cd Backend
npm install
cp .env.example .env
# Edit .env dengan kredensial database Anda

# 3. Setup Frontend
cd ../frontend
npm install
npm run build

# 4. Setup PM2
cd ../Backend
pm2 start ecosystem.config.js

# 5. Setup Nginx
sudo cp ../docs/deployment/nginx-raw-data.conf /etc/nginx/sites-available/raw-data
sudo ln -s /etc/nginx/sites-available/raw-data /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

**Untuk panduan lengkap, lihat [DEPLOYMENT_GUIDE.md](docs/deployment/DEPLOYMENT_GUIDE.md)**

## 📦 Project Structure

```
raw-database/
├── Backend/              # Node.js backend
│   ├── config/          # Database configuration
│   ├── routes/          # API routes
│   ├── middleware/      # Auth middleware
│   ├── .env.example     # Environment template
│   ├── ecosystem.config.js  # PM2 config
│   └── server.js        # Main server file
├── frontend/            # React frontend
│   ├── src/
│   │   ├── components/  # React components
│   │   ├── pages/       # Page components
│   │   ├── services/    # API services
│   │   └── App.jsx      # Main app
│   └── dist/            # Production build
└── docs/
    └── deployment/      # Deployment documentation
        ├── DEPLOYMENT_GUIDE.md
        ├── QUICK_CHECKLIST.md
        ├── PORT_CONFIGURATION.md
        └── nginx-raw-data.conf
```

## 🔧 Configuration

### Backend (.env)
```env
DB_HOST=localhost
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_NAME=dataflow_pro
DB_PORT=3306
JWT_SECRET=your_jwt_secret
PORT=5003
NODE_ENV=production
```

### Production Port
- Backend menggunakan **port 5003** (konfigurabel)
- Frontend di-serve melalui Nginx (port 80/443)
- API endpoint: `/api/*`

## 📝 API Endpoints

- `POST /api/auth/login` - User login
- `GET /api/databases` - List all databases
- `GET /api/databases/stats` - Database statistics
- `GET /api/databases/:db/tables` - List tables in database
- `POST /api/schema/analyze` - Analyze Excel/CSV file
- `POST /api/upload/:db/:table` - Upload data to table
- `POST /api/data/:db/query` - Execute SQL query

## 🔒 Security Features

- JWT authentication
- Role-based access control
- SQL injection protection
- Password hashing (bcrypt)
- CORS configuration
- Nginx security headers

## 🤝 Contributing

Pull requests are welcome. For major changes, please open an issue first.

## 📄 License

Private repository - All rights reserved

## 👤 Author

**Akbar Gumelar**
- GitHub: [@akbargumelar-art](https://github.com/akbargumelar-art)

## 📞 Support

Jika ada pertanyaan atau masalah deployment:
1. Cek [DEPLOYMENT_GUIDE.md](docs/deployment/DEPLOYMENT_GUIDE.md)
2. Lihat troubleshooting section
3. Periksa logs: `pm2 logs` atau `/var/log/nginx/error.log`

---

**Made with ❤️ for efficient database management**
