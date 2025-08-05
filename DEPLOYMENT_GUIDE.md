# 🚀 Kwetu Farm Management System - cPanel Deployment Guide

## 📋 Prerequisites
- cPanel access with Node.js support
- MySQL database access
- Git access in cPanel
- SSL certificates for both domains

## 🎯 Deployment Overview
- **Backend API**: `api.kwetufarm.com` → `/api`
- **Frontend**: `farm.kwetufarm.com` → `/public_html/farm`

---

## 🔧 Backend Deployment (api.kwetufarm.com)

### Step 1: Clone Repository
1. **Login to cPanel**
2. **Navigate to "Git Version Control"**
3. **Click "Create"**
4. **Repository URL**: `https://github.com/mbaekimathi/farm_react_app.git`
5. **Deployment Path**: `/api`
6. **Branch**: `main`
7. **Click "Create"**

### Step 2: Configure Backend
1. **Navigate to File Manager**
2. **Go to `/api/backend/`**
3. **Copy `production.env` to `.env`**
4. **Edit `.env` with your production settings:**

```env
# Production Environment Configuration
NODE_ENV=production
PORT=5000

# Database Configuration
DB_HOST=localhost
DB_USER=kwetufar_farm
DB_PASSWORD=Itskimathi007
DB_NAME=kwetufar_farm
DB_PORT=3306
DB_SSL=false

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=24h

# CORS Configuration
CORS_ORIGIN=https://farm.kwetufarm.com

# Security
BCRYPT_ROUNDS=12

# Logging
LOG_LEVEL=info
```

### Step 3: Install Dependencies
1. **Navigate to "Terminal" in cPanel**
2. **Run these commands:**
```bash
cd /api/backend
npm install
```

### Step 4: Start Backend Server
1. **In Terminal:**
```bash
cd /api/backend
npm start
```

---

## 🌐 Frontend Deployment (farm.kwetufarm.com)

### Step 1: Clone Repository (if separate)
1. **Navigate to "Git Version Control"**
2. **Create new repository**
3. **Repository URL**: `https://github.com/mbaekimathi/farm_react_app.git`
4. **Deployment Path**: `/public_html/farm`
5. **Branch**: `main`

### Step 2: Build Frontend
1. **Navigate to Terminal**
2. **Run these commands:**
```bash
cd /public_html/farm/frontend
npm install
npm run build
```

### Step 3: Configure Frontend
1. **Copy build contents:**
```bash
cp -r /public_html/farm/frontend/build/* /public_html/farm/
```

### Step 4: Update API Endpoints
1. **Edit `/public_html/farm/static/js/main.*.js`**
2. **Replace all instances of `http://localhost:5000` with `https://api.kwetufarm.com`**

---

## 🔗 Domain Configuration

### Step 1: Subdomain Setup
1. **In cPanel, go to "Subdomains"**
2. **Create subdomain:**
   - **Subdomain**: `api`
   - **Domain**: `kwetufarm.com`
   - **Document Root**: `/api`

### Step 2: SSL Certificates
1. **Go to "SSL/TLS"**
2. **Install SSL for both:**
   - `api.kwetufarm.com`
   - `farm.kwetufarm.com`

---

## 🗄️ Database Setup

### Step 1: MySQL Database
1. **Go to "MySQL Databases"**
2. **Create database**: `kwetufar_farm`
3. **Create user**: `kwetufar_farm`
4. **Assign privileges**

### Step 2: Import Database
1. **Go to "phpMyAdmin"**
2. **Select your database**
3. **Import your SQL files**

---

## ✅ Testing Deployment

### Backend Test
```bash
curl https://api.kwetufarm.com/api/health
```

### Frontend Test
1. **Visit**: `https://farm.kwetufarm.com`
2. **Test login functionality**
3. **Verify API connections**

---

## 🚨 Troubleshooting

### Common Issues:
1. **CORS Errors**: Check CORS configuration in backend
2. **Database Connection**: Verify MySQL credentials
3. **Port Issues**: Ensure Node.js port is configured correctly
4. **SSL Issues**: Check SSL certificate installation

### Logs:
- **Backend logs**: Check terminal output
- **Frontend errors**: Check browser console
- **Server errors**: Check cPanel error logs

---

## 📞 Support
If you encounter issues:
1. Check cPanel error logs
2. Verify all environment variables
3. Test API endpoints individually
4. Ensure all dependencies are installed

---

## 🎉 Success!
Once deployed, your Kwetu Farm Management System will be accessible at:
- **Frontend**: https://farm.kwetufarm.com
- **Backend API**: https://api.kwetufarm.com 