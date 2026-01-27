# Port Configuration - Raw Data

## Port yang Digunakan: **5003**

### Alasan Pemilihan Port
Port **5003** dipilih karena:
- ✅ Tidak digunakan oleh aplikasi lain di VPS
- ✅ Masih dalam range standar aplikasi (5000-5999)
- ✅ Mudah diingat dan konsisten dengan aplikasi lain

### Port yang Sudah Digunakan di VPS

Berdasarkan analisis `ss -tulpn` pada VPS Anda (31.97.106.147), berikut port yang sudah terpakai:

| Port  | Service/Application                    | Status      |
|-------|---------------------------------------|-------------|
| 22    | SSH                                   | System      |
| 53    | DNS (systemd-resolve)                 | System      |
| 80    | Nginx (HTTP)                          | Active      |
| 443   | Nginx (HTTPS)                         | Active      |
| 3000  | Docker container                      | Active      |
| 3306  | MySQL                                 | Active      |
| 4001  | Node.js app (point?)                  | Active      |
| 5000  | Node.js app ⚠️ **CONFLICT**          | Active      |
| 5001  | Python app (MainThread)               | Active      |
| 5005  | Node.js app                           | Active      |
| 5432  | PostgreSQL                            | Active      |
| 5678  | Docker container                      | Active      |
| 6001  | Docker container                      | Active      |
| 6002  | Node.js app                           | Active      |
| 8000  | Docker container                      | Active      |
| 8080  | Docker container (localhost only)     | Active      |
| 8081  | Docker container                      | Active      |
| 9000  | Docker container                      | Active      |
| 11434 | Ollama                                | Active      |
| 33060 | MySQL X Protocol                      | Active      |
| 44441 | Ollama (localhost only)               | Active      |

### Port Alternatif (Jika Diperlukan)

Jika port 5003 ternyata tidak bisa digunakan, berikut port alternatif yang masih tersedia:

**Range 5000-5999:**
- 5002
- 5003 ✅ (Dipilih)
- 5004
- 5006
- 5007
- 5008
- 5009

**Range 6000-6999:**
- 6000
- 6003
- 6004
- 6005

**Range 7000-7999:**
- 7000
- 7001
- 7002
- 7003

### Cara Mengganti Port (Jika Diperlukan)

Jika Anda ingin menggunakan port yang berbeda, update di 3 tempat berikut:

#### 1. File `.env` (Backend)
```bash
PORT=5003  # Ganti dengan port yang diinginkan
```

#### 2. File `ecosystem.config.js` (PM2)
```javascript
env: {
  NODE_ENV: 'production',
  PORT: 5003  // Ganti dengan port yang diinginkan
}
```

#### 3. File Nginx Config (`/etc/nginx/sites-available/raw-data`)
```nginx
location /api/ {
    proxy_pass http://localhost:5003;  # Ganti dengan port yang diinginkan
    ...
}
```

### Verifikasi Port Tersedia

Sebelum menggunakan port, pastikan port tersedia dengan command:

```bash
# Cek apakah port sudah digunakan
sudo ss -tulpn | grep :5003

# Atau dengan netstat
sudo netstat -tulpn | grep :5003

# Jika tidak ada output, port tersedia untuk digunakan
```

### Firewall Configuration

Port ini hanya perlu diakses internal (localhost) karena Nginx sebagai reverse proxy. 
**Tidak perlu** membuka port 5003 di firewall untuk akses eksternal.

Hanya port 80 (HTTP) dan 443 (HTTPS) yang perlu dibuka:
```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
# Port 5003 TIDAK perlu dibuka karena hanya diakses oleh Nginx secara internal
```

---

## Summary

- **Port Raw Data Backend**: 5003
- **Akses Eksternal (Nginx)**: 80 (HTTP) & 443 (HTTPS)  
- **Domain**: raw.abkciraya.cloud
- **Backend URL Internal**: http://localhost:5003
- **API Endpoint**: https://raw.abkciraya.cloud/api/

✅ Semua file konfigurasi sudah diupdate untuk menggunakan port 5003.
