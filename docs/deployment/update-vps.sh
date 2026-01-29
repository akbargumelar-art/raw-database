#!/bin/bash

# ============================================
# VPS Update Script - Raw Data
# Performance Optimization Deployment
# ============================================

set -e  # Exit on error

echo "🚀 Starting VPS update process..."
echo "=================================="

# Navigate to application directory
cd /var/www/raw-data

# 1. Backup current state
echo ""
echo "📦 Step 1: Creating backup..."
BACKUP_DIR="/backup/raw-data-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"
cp -r backend/routes "$BACKUP_DIR/"
cp -r frontend/dist "$BACKUP_DIR/" 2>/dev/null || echo "No dist folder to backup"
echo "✅ Backup saved to: $BACKUP_DIR"

# 2. Pull latest code from GitHub
echo ""
echo "⬇️  Step 2: Pulling latest code from GitHub..."
git fetch origin main
git pull origin main
echo "✅ Code updated from GitHub"

# 3. Update Backend
echo ""
echo "🔧 Step 3: Updating Backend..."
cd backend
npm install --production
echo "✅ Backend dependencies updated"

# 4. Update Frontend
echo ""
echo "🎨 Step 4: Building Frontend..."
cd ../frontend
npm install
npm run build
echo "✅ Frontend built successfully"

# 5. Restart PM2
echo ""
echo "🔄 Step 5: Restarting Backend service..."
cd ../backend
pm2 restart raw-data-backend
echo "✅ Backend service restarted"

# 6. Reload Nginx
echo ""
echo "🌐 Step 6: Reloading Nginx..."
sudo nginx -t && sudo systemctl reload nginx
echo "✅ Nginx reloaded"

# 7. Verify deployment
echo ""
echo "✅ Step 7: Verifying deployment..."
sleep 3
echo ""
echo "PM2 Status:"
pm2 status raw-data-backend

echo ""
echo "Backend Health Check:"
curl -s http://localhost:5003/api/health | jq . || curl -s http://localhost:5003/api/health

echo ""
echo "=================================="
echo "✅ VPS Update Complete!"
echo ""
echo "📝 What was deployed:"
echo "   - Performance optimizations"
echo "   - Search debouncing (500ms)"
echo "   - Approximate count for large tables"
echo "   - Smart column search (5 columns)"
echo "   - Query performance metrics"
echo "   - Server dropdown UI fix"
echo ""
echo "🔍 Verification URLs:"
echo "   - Application: https://raw.abkciraya.cloud"
echo "   - API Health: https://raw.abkciraya.cloud/api/health"
echo ""
echo "📊 Monitor logs with:"
echo "   pm2 logs raw-data-backend"
echo ""
echo "=================================="
