# Panduan Instalasi Raw Data di VPS

Panduan lengkap untuk deploy aplikasi **Raw Data** di VPS dengan spesifikasi:
- **IP VPS**: 31.97.106.147
- **Path Instalasi**: /var/www/raw-data
- **Domain**: raw.abkciraya.cloud
- **Database**: MySQL localhost (sudah terinstall)

---

## Prasyarat

Pastikan VPS Anda sudah terinstall:
- Node.js (v18 atau lebih tinggi)
- MySQL (sudah terinstall)
- Nginx
- PM2 (untuk menjalankan aplikasi)
- Git

---

## Step 1: Persiapan Server

### 1.1 Update System
```bash
sudo apt update && sudo apt upgrade -y
```

### 1.2 Install Node.js (jika belum ada)
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v  # Verifikasi instalasi
npm -v
```

### 1.3 Install Nginx (jika belum ada)
```bash
sudo apt install -y nginx
sudo systemctl enable nginx
sudo systemctl start nginx
```

### 1.4 Install PM2 (Process Manager untuk Node.js)
```bash
sudo npm install -g pm2
```

### 1.5 Verifikasi MySQL
```bash
sudo systemctl status mysql
mysql -V  # Verifikasi versi MySQL
```

---

## Step 2: Clone Repository

```bash
# Masuk ke direktori /var/www
cd /var/www

# Clone repository
sudo git clone https://github.com/akbargumelar-art/raw-database.git raw-data

# Set ownership ke user Anda
sudo chown -R $USER:$USER /var/www/raw-data

# Masuk ke direktori project
cd /var/www/raw-data
```

---

## Step 3: Setup Database MySQL

### 3.1 Login ke MySQL
```bash
sudo mysql -u root -p
```

### 3.2 Buat Database dan User untuk Aplikasi
```sql
-- Buat database untuk aplikasi
CREATE DATABASE IF NOT EXISTS dataflow_pro;

-- Buat user khusus untuk aplikasi (opsional, atau gunakan root)
CREATE USER IF NOT EXISTS 'rawdata_user'@'localhost' IDENTIFIED BY 'PasswordKuatAnda123!';

-- Berikan akses penuh ke database
GRANT ALL PRIVILEGES ON *.* TO 'rawdata_user'@'localhost' WITH GRANT OPTION;

-- Refresh privileges
FLUSH PRIVILEGES;

-- Keluar dari MySQL
EXIT;
```

> [!IMPORTANT]
> Ganti `PasswordKuatAnda123!` dengan password yang kuat. User ini memerlukan akses ke semua database karena aplikasi Raw Data mengelola multiple databases.

---

## Step 4: Setup Backend

### 4.1 Masuk ke Direktori Backend
```bash
cd /var/www/raw-data/Backend
```

### 4.2 Install Dependencies
```bash
npm install
```

### 4.3 Buat File Environment (.env)
```bash
nano .env
```

Isi dengan konfigurasi berikut:
```env
# Database Configuration
DB_HOST=localhost
DB_USER=rawdata_user
DB_PASSWORD=PasswordKuatAnda123!
DB_NAME=dataflow_pro
DB_PORT=3306

# JWT Secret (ganti dengan string random yang kuat)
JWT_SECRET=ganti_dengan_random_string_yang_sangat_kuat_123456789

# Server Port
PORT=5003

# Node Environment
NODE_ENV=production
```

> [!TIP]
> Untuk generate JWT_SECRET yang kuat, gunakan:
> ```bash
> node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
> ```

Simpan dengan `Ctrl+X`, tekan `Y`, lalu `Enter`.

### 4.4 Test Backend
```bash
npm start
```

Jika berhasil, Anda akan melihat pesan seperti:
```
Raw Data server running on port 5003
Database dataflow_pro created/verified
Creating users table if not exists...
Default admin user created: admin / admin123
Database initialized successfully.
```

Tekan `Ctrl+C` untuk stop sementara.

---

## Step 5: Setup Frontend

### 5.1 Masuk ke Direktori Frontend
```bash
cd /var/www/raw-data/frontend
```

### 5.2 Install Dependencies
```bash
npm install
```

### 5.3 Build untuk Production
```bash
npm run build
```

Ini akan membuat folder `dist` yang berisi file static untuk production.

---

## Step 6: Setup PM2 untuk Backend

### 6.1 Buat PM2 Ecosystem File
```bash
cd /var/www/raw-data/Backend
nano ecosystem.config.js
```

Isi dengan:
```javascript
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
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
  }]
};
```

### 6.2 Buat Direktori Log
```bash
sudo mkdir -p /var/log/pm2
sudo chown -R $USER:$USER /var/log/pm2
```

### 6.3 Start Aplikasi dengan PM2
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

Jalankan perintah yang muncul setelah `pm2 startup` (biasanya perintah sudo).

### 6.4 Verifikasi PM2
```bash
pm2 list
pm2 logs raw-data-backend
```

---

## Step 7: Konfigurasi Nginx

### 7.1 Buat Konfigurasi Nginx
```bash
sudo nano /etc/nginx/sites-available/raw-data
```

Isi dengan:
```nginx
server {
    listen 80;
    server_name raw.abkciraya.cloud;

    # Redirect HTTP to HTTPS (akan aktif setelah SSL diinstall)
    # return 301 https://$server_name$request_uri;

    # Root directory untuk static files (frontend)
    root /var/www/raw-data/frontend/dist;
    index index.html;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 10240;
    gzip_proxied expired no-cache no-store private auth;
    gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml+rss application/json;

    # API requests ke backend
    location /api/ {
        proxy_pass http://localhost:5003;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeout settings untuk upload file besar
        proxy_connect_timeout 600;
        proxy_send_timeout 600;
        proxy_read_timeout 600;
        send_timeout 600;
    }

    # Serve static files
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets
    location ~* \.(jpg|jpeg|png|gif|ico|css|js|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;

    # Client max body size untuk upload
    client_max_body_size 100M;
}
```

### 7.2 Enable Site
```bash
sudo ln -s /etc/nginx/sites-available/raw-data /etc/nginx/sites-enabled/
```

### 7.3 Test Konfigurasi Nginx
```bash
sudo nginx -t
```

Jika OK, reload Nginx:
```bash
sudo systemctl reload nginx
```

---

## Step 8: Konfigurasi Domain

### 8.1 Setup DNS
Pastikan domain `raw.abkciraya.cloud` mengarah ke IP VPS `31.97.106.147`:

Buat A Record di DNS provider Anda:
```
Type: A
Name: raw.abkciraya.cloud
Value: 31.97.106.147
TTL: 3600 (atau default)
```

### 8.2 Verifikasi DNS
```bash
ping raw.abkciraya.cloud
```

Pastikan IP yang terlihat adalah `31.97.106.147`.

---

## Step 9: Install SSL Certificate (Let's Encrypt)

> [!IMPORTANT]
> Tunggu DNS propagasi selesai (biasanya 5-30 menit) sebelum menginstall SSL.

### 9.1 Install Certbot
```bash
sudo apt install -y certbot python3-certbot-nginx
```

### 9.2 Dapatkan SSL Certificate
```bash
sudo certbot --nginx -d raw.abkciraya.cloud
```

Ikuti instruksi:
1. Masukkan email Anda
2. Setuju dengan Terms of Service
3. Pilih option untuk redirect HTTP ke HTTPS (recommended: option 2)

### 9.3 Verifikasi Auto-Renewal
```bash
sudo certbot renew --dry-run
```

SSL certificate akan otomatis diperpanjang setiap 90 hari.

---

## Step 10: Konfigurasi Firewall (Opsional tapi Direkomendasikan)

```bash
# Allow SSH
sudo ufw allow 22/tcp

# Allow HTTP
sudo ufw allow 80/tcp

# Allow HTTPS
sudo ufw allow 443/tcp

# Enable firewall
sudo ufw enable
sudo ufw status
```

---

## Step 11: Verifikasi Instalasi

### 11.1 Cek Backend
```bash
pm2 status
pm2 logs raw-data-backend --lines 50
```

### 11.2 Cek Nginx
```bash
sudo systemctl status nginx
sudo nginx -t
```

### 11.3 Test API
```bash
curl http://localhost:5003/api/health
```

Harusnya return:
```json
{"status":"ok","timestamp":"..."}
```

### 11.4 Akses Aplikasi
Buka browser dan akses:
- **HTTP**: http://raw.abkciraya.cloud
- **HTTPS** (setelah SSL): https://raw.abkciraya.cloud

Login dengan:
- **Username**: admin
- **Password**: admin123

> [!WARNING]
> **SEGERA ganti password default setelah login pertama!**

---

## Step 12: Maintenance Commands

### PM2 Commands
```bash
# Lihat status
pm2 status

# Lihat logs
pm2 logs raw-data-backend

# Restart aplikasi
pm2 restart raw-data-backend

# Stop aplikasi
pm2 stop raw-data-backend

# Start aplikasi
pm2 start raw-data-backend

# Monitor
pm2 monit
```

### Update Aplikasi
```bash
cd /var/www/raw-data

# Pull update dari GitHub
git pull origin main

# Update backend
cd Backend
npm install
pm2 restart raw-data-backend

# Update frontend
cd ../frontend
npm install
npm run build

# Reload nginx
sudo systemctl reload nginx
```

### Database Backup
```bash
# Backup semua database
sudo mysqldump -u root -p --all-databases > /backup/all-databases-$(date +%Y%m%d).sql

# Backup database dataflow_pro saja
sudo mysqldump -u root -p dataflow_pro > /backup/dataflow_pro-$(date +%Y%m%d).sql
```

### Nginx Logs
```bash
# Error log
sudo tail -f /var/log/nginx/error.log

# Access log
sudo tail -f /var/log/nginx/access.log
```

---

## Troubleshooting

### Backend tidak bisa connect ke MySQL
```bash
# Cek MySQL status
sudo systemctl status mysql

# Cek credentials di .env
cat /var/www/raw-data/Backend/.env

# Test connection
mysql -u rawdata_user -p -h localhost
```

### Nginx 502 Bad Gateway
```bash
# Cek backend running
pm2 status

# Cek logs
pm2 logs raw-data-backend

# Restart backend
pm2 restart raw-data-backend
```

### Upload file gagal
```bash
# Cek permission direktori
ls -la /var/www/raw-data/Backend

# Set permission jika perlu
sudo chown -R $USER:$USER /var/www/raw-data
```

### Domain tidak bisa diakses
```bash
# Cek DNS
nslookup raw.abkciraya.cloud

# Cek Nginx config
sudo nginx -t

# Cek firewall
sudo ufw status
```

---

## Keamanan Tambahan (Recommended)

### 1. Setup Fail2Ban untuk SSH
```bash
sudo apt install -y fail2ban
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

### 2. Disable Root Login SSH
```bash
sudo nano /etc/ssh/sshd_config
```

Ubah:
```
PermitRootLogin no
```

Restart SSH:
```bash
sudo systemctl restart sshd
```

### 3. Regular System Updates
```bash
# Auto security updates
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

### 4. Database Security
```bash
sudo mysql_secure_installation
```

---

## Performa Optimization

### 1. Enable Nginx Caching
Tambahkan di `/etc/nginx/nginx.conf` dalam block `http`:
```nginx
proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=api_cache:10m max_size=100m inactive=60m use_temp_path=off;
```

### 2. Setup Log Rotation
File sudah otomatis di-rotate oleh PM2 dan Nginx.

### 3. Monitor Resource
```bash
# Install htop
sudo apt install -y htop

# Monitor
htop
```

---

## Support & Contact

Jika ada masalah, cek:
1. PM2 logs: `pm2 logs raw-data-backend`
2. Nginx error log: `sudo tail -f /var/log/nginx/error.log`
3. MySQL log: `sudo tail -f /var/log/mysql/error.log`

---

**Selamat! Aplikasi Raw Data Anda sudah berhasil di-deploy di VPS! 🎉**
