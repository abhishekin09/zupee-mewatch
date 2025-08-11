#!/bin/bash

# Zupee MemWatch Setup Script
# This script sets up the complete memory leak monitoring system

set -e

echo "🚀 Setting up Zupee MemWatch Memory Leak Detection Tool..."
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_step() {
    echo -e "${BLUE}📦 $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed. Please install Node.js 14+ and try again."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 14 ]; then
    print_error "Node.js version 14+ is required. Current version: $(node -v)"
    exit 1
fi

print_success "Node.js $(node -v) detected"
echo ""

# Install main package dependencies
print_step "Installing Zupee MemWatch dependencies..."
npm install
print_success "Main package dependencies installed"
echo ""

# Build TypeScript
print_step "Building TypeScript source..."
npm run build
print_success "TypeScript build complete"
echo ""

# Setup Dashboard UI
print_step "Setting up Dashboard UI..."
cd dashboard-ui
npm install
print_success "Dashboard UI setup complete"
cd ..
echo ""

# Create snapshots directory
print_step "Creating snapshots directory..."
mkdir -p snapshots
print_success "Snapshots directory created"
echo ""

# Create start scripts
print_step "Creating start scripts..."

# Create start-dashboard.sh
cat > scripts/start-dashboard.sh << 'EOF'
#!/bin/bash
echo "🖥️  Starting Zupee MemWatch Dashboard Server..."
npm run start:dashboard
EOF

# Create start-frontend.sh  
cat > scripts/start-frontend.sh << 'EOF'
#!/bin/bash
echo "🌐 Starting Zupee MemWatch Frontend..."
npm run start:frontend
EOF

# Create start-test.sh
cat > scripts/start-test.sh << 'EOF'
#!/bin/bash
echo "🧪 Starting Test Service..."

if [ "$1" = "leak" ]; then
    echo "🕳️  Simulating memory leaks..."
    npm run test:leak
else
    echo "📊 Running normal operation..."
    npm test
fi
EOF

# Make scripts executable
chmod +x scripts/start-dashboard.sh
chmod +x scripts/start-frontend.sh
chmod +x scripts/start-test.sh

print_success "Start scripts created"
echo ""

# Print completion message
echo ""
echo "🎉 Zupee MemWatch setup complete!"
echo ""
echo "📋 Next steps:"
echo ""
echo "1. Start the dashboard server:"
echo "   ${BLUE}./scripts/start-dashboard.sh${NC}"
echo ""
echo "2. Start the frontend (in a new terminal):"
echo "   ${BLUE}./scripts/start-frontend.sh${NC}"
echo ""
echo "3. Start a test service (in a new terminal):"
echo "   ${BLUE}./scripts/start-test.sh${NC}          # Normal operation"
echo "   ${BLUE}./scripts/start-test.sh leak${NC}     # Simulate memory leaks"
echo ""
echo "4. Open the dashboard:"
echo "   ${BLUE}http://localhost:3000${NC}"
echo ""
echo "📖 Integration guide:"
echo ""
echo "To add monitoring to your own service:"
echo ""
echo "1. Install the package:"
echo "   ${BLUE}npm install @zupee/memwatch${NC}"
echo ""
echo "2. Add to your code:"
echo "   ${BLUE}import MemWatch from '@zupee/memwatch';${NC}"
echo "   ${BLUE}MemWatch.start({${NC}"
echo "   ${BLUE}  serviceName: 'your-service',${NC}"
echo "   ${BLUE}  dashboardUrl: 'ws://localhost:4000'${NC}"
echo "   ${BLUE}});${NC}"
echo ""
echo "🔍 For more details, see README.md"
echo ""
