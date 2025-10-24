#!/bin/bash

#############################
# AR.IO Bundler Setup Script
#############################

set -e

echo "🚀 Setting up AR.IO Bundler..."
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check prerequisites
echo "📋 Checking prerequisites..."

command -v node >/dev/null 2>&1 || {
  echo -e "${RED}❌ Node.js is required but not installed.${NC}"
  echo "   Install Node.js 18+ from https://nodejs.org/ or use nvm"
  exit 1
}

command -v yarn >/dev/null 2>&1 || {
  echo -e "${RED}❌ Yarn is required but not installed.${NC}"
  echo "   Install with: npm install -g yarn"
  exit 1
}

command -v docker >/dev/null 2>&1 || {
  echo -e "${RED}❌ Docker is required but not installed.${NC}"
  echo "   Install from https://docs.docker.com/get-docker/"
  exit 1
}

command -v docker compose >/dev/null 2>&1 || {
  echo -e "${RED}❌ Docker Compose is required but not installed.${NC}"
  echo "   Install from https://docs.docker.com/compose/install/"
  exit 1
}

echo -e "${GREEN}✅ All prerequisites met${NC}"
echo ""

# Check Node version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  echo -e "${YELLOW}⚠️  Node.js version 18+ recommended (you have $(node -v))${NC}"
fi

# Setup environment
if [ ! -f .env ]; then
  echo "📝 Creating .env from template..."
  cp .env.sample .env
  echo -e "${YELLOW}⚠️  Please edit .env with your configuration before proceeding${NC}"
  echo ""
else
  echo -e "${GREEN}✅ .env file already exists${NC}"
fi

# Check for wallet.json
if [ ! -f wallet.json ]; then
  echo -e "${YELLOW}⚠️  wallet.json not found${NC}"
  echo "   You'll need to add an Arweave wallet for bundle signing"
  echo "   Place it at: ./wallet.json"
  echo ""
fi

# Install dependencies
echo "📦 Installing dependencies..."
yarn install

if [ $? -ne 0 ]; then
  echo -e "${RED}❌ Failed to install dependencies${NC}"
  exit 1
fi

echo -e "${GREEN}✅ Dependencies installed${NC}"
echo ""

# Build all packages
echo "🔨 Building all packages..."
yarn build

if [ $? -ne 0 ]; then
  echo -e "${RED}❌ Build failed${NC}"
  exit 1
fi

echo -e "${GREEN}✅ All packages built successfully${NC}"
echo ""

# Create logs directory
mkdir -p logs
echo -e "${GREEN}✅ Logs directory created${NC}"
echo ""

# Start infrastructure
echo "🐳 Starting infrastructure (PostgreSQL, Redis, MinIO)..."
yarn infra:up

if [ $? -ne 0 ]; then
  echo -e "${RED}❌ Failed to start infrastructure${NC}"
  exit 1
fi

echo -e "${GREEN}✅ Infrastructure started${NC}"
echo ""

# Wait for services to be ready
echo "⏳ Waiting for services to be ready..."
sleep 10

# Run migrations
echo "🗄️  Running database migrations..."
yarn db:migrate

if [ $? -ne 0 ]; then
  echo -e "${YELLOW}⚠️  Database migrations encountered issues${NC}"
  echo "   This might be normal if databases don't exist yet"
  echo "   Try running: yarn db:migrate again after checking .env"
else
  echo -e "${GREEN}✅ Database migrations complete${NC}"
fi

echo ""
echo -e "${GREEN}✅ Setup complete!${NC}"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Next steps:"
echo ""
echo "1. Edit .env with your configuration:"
echo "   nano .env"
echo ""
echo "2. Add your Arweave wallet (if not done):"
echo "   cp /path/to/wallet.json ./wallet.json"
echo ""
echo "3. Start services:"
echo "   Development: yarn dev"
echo "   Production:  yarn pm2:start"
echo ""
echo "4. View logs:"
echo "   yarn pm2:logs"
echo ""
echo "5. Access services:"
echo "   Payment Service:  http://localhost:4000"
echo "   Upload Service:   http://localhost:3001"
echo "   Bull Board:       http://localhost:3002/admin/queues"
echo "   MinIO Console:    http://localhost:9001"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
