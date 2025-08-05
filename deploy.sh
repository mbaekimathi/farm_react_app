#!/bin/bash

# Kwetu Farm Management System - Deployment Script
# This script helps with cPanel deployment

echo "🚀 Kwetu Farm Management System - Deployment Script"
echo "=================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if we're in the right directory
if [ ! -f "package.json" ] && [ ! -d "backend" ] && [ ! -d "frontend" ]; then
    print_error "Please run this script from the project root directory"
    exit 1
fi

print_status "Starting deployment preparation..."

# Build frontend for production
print_status "Building frontend for production..."
cd frontend
npm run build
if [ $? -eq 0 ]; then
    print_status "Frontend build completed successfully!"
else
    print_error "Frontend build failed!"
    exit 1
fi
cd ..

# Create deployment package
print_status "Creating deployment package..."
mkdir -p deployment
cp -r backend deployment/
cp -r frontend/build deployment/frontend-build
cp DEPLOYMENT_GUIDE.md deployment/

# Create a simple start script for the backend
cat > deployment/start-backend.sh << 'EOF'
#!/bin/bash
cd backend
npm install
npm start
EOF

chmod +x deployment/start-backend.sh

print_status "Deployment package created in 'deployment/' directory"
print_status "Contents:"
ls -la deployment/

echo ""
echo "📋 Next Steps:"
echo "1. Upload the 'deployment' folder to your cPanel"
echo "2. Follow the DEPLOYMENT_GUIDE.md instructions"
echo "3. Configure your domains and SSL certificates"
echo ""
echo "🎯 Deployment Paths:"
echo "   Backend: /api"
echo "   Frontend: /public_html/farm"
echo ""
echo "🌐 Domains:"
echo "   API: https://api.kwetufarm.com"
echo "   Frontend: https://farm.kwetufarm.com"
echo ""
print_status "Deployment preparation completed!" 