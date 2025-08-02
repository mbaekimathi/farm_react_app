# Kwetu Farm App - Production Deployment Guide

## 🚀 Production Deployment Checklist

### ✅ **Pre-Deployment Requirements**

1. **Domain Configuration**
   - Frontend: `https://farm.kwetufarm.com`
   - Backend API: `https://api.kwetufarm.com`
   - Database: MySQL on production server

2. **SSL Certificates**
   - SSL certificates installed for both domains
   - HTTPS redirects configured

3. **Database Setup**
   - MySQL server running on production
   - Database created: `kwetufar_farm`
   - User created: `kwetufar_farm` with password `Itskimathi007`

### 🔧 **Backend Deployment**

#### 1. **Server Setup**
```bash
# Connect to your production server
ssh user@your-server.com

# Navigate to backend directory
cd /home2/kwetufar/api

# Install dependencies
npm install --production

# Copy production environment file
cp production.env .env

# Initialize database
npm run setup

# Start production server
npm run prod
```

#### 2. **Environment Variables** (`.env`)
```env
NODE_ENV=production
PORT=5000
DB_HOST=localhost
DB_USER=kwetufar_farm
DB_PASSWORD=Itskimathi007
DB_NAME=kwetufar_farm
DB_PORT=3306
DB_SSL=false
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=24h
CORS_ORIGIN=https://farm.kwetufarm.com
BCRYPT_ROUNDS=12
LOG_LEVEL=info
```

#### 3. **Process Management (PM2)**
```bash
# Install PM2 globally
npm install -g pm2

# Start with PM2
pm2 start server.js --name "kwetu-farm-api"

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup
```

### 🌐 **Frontend Deployment**

#### 1. **Build Process**
```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
npm install

# Copy production environment
cp production.env .env

# Build for production
npm run build
```

#### 2. **Environment Variables** (`.env`)
```env
REACT_APP_API_URL=https://api.kwetufarm.com/api
REACT_APP_ENVIRONMENT=production
REACT_APP_VERSION=1.0.0
```

#### 3. **Web Server Configuration**

**For Apache:**
```apache
# /etc/apache2/sites-available/farm.kwetufarm.com.conf
<VirtualHost *:80>
    ServerName farm.kwetufarm.com
    DocumentRoot /var/www/farm.kwetufarm.com/build
    
    <Directory /var/www/farm.kwetufarm.com/build>
        Options -Indexes +FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>
    
    # Handle React Router
    RewriteEngine On
    RewriteCond %{REQUEST_FILENAME} !-f
    RewriteCond %{REQUEST_FILENAME} !-d
    RewriteRule ^(.*)$ /index.html [QSA,L]
</VirtualHost>
```

**For Nginx:**
```nginx
# /etc/nginx/sites-available/farm.kwetufarm.com
server {
    listen 80;
    server_name farm.kwetufarm.com;
    root /var/www/farm.kwetufarm.com/build;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /static/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

### 🔒 **Security Checklist**

#### 1. **Environment Security**
- [ ] Change default JWT secret
- [ ] Use strong database passwords
- [ ] Enable SSL/TLS
- [ ] Configure firewall rules
- [ ] Set up rate limiting

#### 2. **Database Security**
- [ ] Create dedicated database user
- [ ] Grant minimal required permissions
- [ ] Enable database logging
- [ ] Regular backups configured

#### 3. **Application Security**
- [ ] CORS properly configured
- [ ] Input validation enabled
- [ ] SQL injection protection
- [ ] XSS protection headers

### 📊 **Monitoring & Logging**

#### 1. **Application Monitoring**
```bash
# PM2 monitoring
pm2 monit

# Log monitoring
pm2 logs kwetu-farm-api
```

#### 2. **Database Monitoring**
```sql
-- Check database connections
SHOW PROCESSLIST;

-- Check database size
SELECT 
    table_schema AS 'Database',
    ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) AS 'Size (MB)'
FROM information_schema.tables 
WHERE table_schema = 'kwetufar_farm'
GROUP BY table_schema;
```

### 🔄 **Deployment Commands**

#### **Quick Deployment Script**
```bash
#!/bin/bash
# deploy.sh

echo "🚀 Starting Kwetu Farm deployment..."

# Backend deployment
echo "📦 Deploying backend..."
cd /home2/kwetufar/api
git pull origin main
npm install --production
cp production.env .env
npm run setup
pm2 restart kwetu-farm-api

# Frontend deployment
echo "🌐 Deploying frontend..."
cd /var/www/farm.kwetufarm.com
git pull origin main
npm install
cp production.env .env
npm run build

echo "✅ Deployment completed!"
```

### 🚨 **Troubleshooting**

#### **Common Issues:**

1. **CORS Errors**
   - Check CORS_ORIGIN in backend .env
   - Verify frontend API URL configuration

2. **Database Connection Issues**
   - Verify MySQL service is running
   - Check database credentials
   - Ensure database exists

3. **Build Errors**
   - Clear node_modules and reinstall
   - Check for missing dependencies
   - Verify environment variables

4. **PM2 Issues**
   - Check PM2 logs: `pm2 logs`
   - Restart PM2: `pm2 restart all`
   - Check PM2 status: `pm2 status`

### 📞 **Support**

For deployment issues:
1. Check application logs
2. Verify environment configuration
3. Test database connectivity
4. Review server error logs

---

**Last Updated:** $(date)
**Version:** 1.0.0 