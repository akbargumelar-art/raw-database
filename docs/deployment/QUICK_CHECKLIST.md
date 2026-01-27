# Quick Deployment Checklist - Raw Data VPS

## 📋 Quick Steps (Copy-Paste Commands)

### 1. Clone & Setup Directory
```bash
cd /var/www
sudo git clone https://github.com/akbargumelar-art/raw-database.git raw-data
sudo chown -R $USER:$USER /var/www/raw-data
cd /var/www/raw-data
```

### 2. Setup Database
```bash
sudo mysql -u root -p
```

Dalam MySQL:
```sql
CREATE DATABASE IF NOT EXISTS dataflow_pro;
CREATE USER IF NOT EXISTS 'rawdata_user'@'localhost' IDENTIFIED BY 'PasswordKuatAnda123!';
GRANT ALL PRIVILEGES ON *.* TO 'rawdata_user'@'localhost' WITH GRANT OPTION;
FLUSH PRIVILEGES;
EXIT;
```

### 3. Setup Backend
```bash
cd /var/www/raw-data/Backend
npm install
nano .env  # Copy dari .env.example dan isi credential
npm start  # Test, lalu Ctrl+C
```

### 4. Setup Frontend
```bash
cd /var/www/raw-data/frontend
npm install
npm run build
```

### 5. Setup PM2
```bash
cd /var/www/raw-data/Backend
# Copy ecosystem.config.js ke folder ini
pm2 start ecosystem.config.js
pm2 save
pm2 startup  # Jalankan command yang muncul
```

### 6. Setup Nginx
```bash
# Copy nginx-raw-data.conf ke sites-available
sudo cp nginx-raw-data.conf /etc/nginx/sites-available/raw-data
sudo ln -s /etc/nginx/sites-available/raw-data /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 7. Setup SSL (setelah DNS propagasi)
```bash
sudo certbot --nginx -d raw.abkciraya.cloud
```

### 8. Verifikasi
```bash
pm2 status
sudo systemctl status nginx
curl http://localhost:5003/api/health
```

---

## 🔍 Important URLs
- **Application**: https://raw.abkciraya.cloud
- **API Health**: https://raw.abkciraya.cloud/api/health
- **Default Login**: admin / admin123

---

## 🔧 Common Commands

### PM2
```bash
pm2 status
pm2 logs raw-data-backend
pm2 restart raw-data-backend
pm2 monit
```

### Nginx
```bash
sudo nginx -t
sudo systemctl reload nginx
sudo tail -f /var/log/nginx/error.log
```

### Update App
```bash
cd /var/www/raw-data
git pull origin main
cd Backend && npm install && pm2 restart raw-data-backend
cd ../frontend && npm install && npm run build
sudo systemctl reload nginx
```

### Database Backup
```bash
sudo mysqldump -u root -p dataflow_pro > /backup/dataflow_pro-$(date +%Y%m%d).sql
```

---

## ⚠️ Don't Forget
- [ ] Ganti password MySQL user
- [ ] Generate JWT_SECRET yang kuat
- [ ] Setup firewall (ufw)
- [ ] Ganti password admin default setelah login
- [ ] Setup backup otomatis
- [ ] Monitor disk space & memory
