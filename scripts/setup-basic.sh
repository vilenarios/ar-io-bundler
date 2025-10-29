#!/bin/bash

#############################################################################
# AR.IO Bundler - Complete Setup Script
#############################################################################
# This script guides you through setting up the AR.IO Bundler from scratch.
# It will:
#   - Check prerequisites (Node.js, Yarn, Docker)
#   - Install dependencies
#   - Configure environment variables
#   - Set up Arweave wallet
#   - Initialize infrastructure (PostgreSQL, Redis, MinIO)
#   - Run database migrations
#   - Configure bundle planning cron job
#   - Start all services
#
# Run this script ONCE for initial setup.
#############################################################################

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  🚀 AR.IO Bundler - Complete Setup Script"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "This script will guide you through setting up the AR.IO Bundler."
echo ""

# ============================================================================
# 1. Check Prerequisites
# ============================================================================

echo -e "${BLUE}[1/9]${NC} Checking prerequisites..."
echo ""

# Check Node.js
if ! command -v node >/dev/null 2>&1; then
  echo -e "${RED}❌ Node.js is required but not installed.${NC}"
  echo "   Install Node.js 18+ from https://nodejs.org/ or use nvm"
  exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  echo -e "${RED}❌ Node.js version 18+ required (you have $(node -v))${NC}"
  exit 1
fi
echo -e "${GREEN}✓${NC} Node.js $(node -v) installed"

# Check Yarn
if ! command -v yarn >/dev/null 2>&1; then
  echo -e "${RED}❌ Yarn is required but not installed.${NC}"
  echo "   Install with: corepack enable"
  echo "   Or: npm install -g yarn"
  exit 1
fi
echo -e "${GREEN}✓${NC} Yarn $(yarn --version) installed"

# Check Docker
if ! command -v docker >/dev/null 2>&1; then
  echo -e "${RED}❌ Docker is required but not installed.${NC}"
  echo "   Install from https://docs.docker.com/get-docker/"
  exit 1
fi
echo -e "${GREEN}✓${NC} Docker installed"

# Check Docker Compose
if ! docker compose version >/dev/null 2>&1; then
  echo -e "${RED}❌ Docker Compose V2 is required but not installed.${NC}"
  echo "   Install from https://docs.docker.com/compose/install/"
  exit 1
fi
echo -e "${GREEN}✓${NC} Docker Compose installed"

# Check Docker is running
if ! docker ps >/dev/null 2>&1; then
  echo -e "${RED}❌ Docker is not running.${NC}"
  echo "   Start Docker and try again."
  exit 1
fi
echo -e "${GREEN}✓${NC} Docker is running"

echo -e "${GREEN}✅ All prerequisites met${NC}"
echo ""

# ============================================================================
# 2. Install Dependencies
# ============================================================================

echo -e "${BLUE}[2/9]${NC} Installing dependencies..."
echo ""

cd "$PROJECT_ROOT"
yarn install

if [ $? -ne 0 ]; then
  echo -e "${RED}❌ Failed to install dependencies${NC}"
  exit 1
fi

echo -e "${GREEN}✅ Dependencies installed${NC}"
echo ""

# ============================================================================
# 3. Configure Environment Variables
# ============================================================================

echo -e "${BLUE}[3/9]${NC} Configuring environment variables..."
echo ""

if [ -f "$PROJECT_ROOT/.env" ]; then
  echo -e "${YELLOW}⚠️  .env file already exists${NC}"
  read -p "   Overwrite with .env.sample? (y/N): " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "   Keeping existing .env file"
  else
    cp "$PROJECT_ROOT/.env.sample" "$PROJECT_ROOT/.env"
    echo -e "${GREEN}✓${NC} Created .env from .env.sample"
  fi
else
  cp "$PROJECT_ROOT/.env.sample" "$PROJECT_ROOT/.env"
  echo -e "${GREEN}✓${NC} Created .env from .env.sample"
fi

# Generate PRIVATE_ROUTE_SECRET if not set
if ! grep -q "^PRIVATE_ROUTE_SECRET=.\+" "$PROJECT_ROOT/.env"; then
  echo ""
  echo "Generating PRIVATE_ROUTE_SECRET..."
  if command -v openssl >/dev/null 2>&1; then
    PRIVATE_ROUTE_SECRET=$(openssl rand -hex 32)
    # Use platform-specific sed
    if [[ "$OSTYPE" == "darwin"* ]]; then
      sed -i '' "s|^PRIVATE_ROUTE_SECRET=.*|PRIVATE_ROUTE_SECRET=$PRIVATE_ROUTE_SECRET|" "$PROJECT_ROOT/.env"
    else
      sed -i "s|^PRIVATE_ROUTE_SECRET=.*|PRIVATE_ROUTE_SECRET=$PRIVATE_ROUTE_SECRET|" "$PROJECT_ROOT/.env"
    fi
    echo -e "${GREEN}✓${NC} Generated PRIVATE_ROUTE_SECRET"
  else
    echo -e "${YELLOW}⚠️  openssl not found, please manually set PRIVATE_ROUTE_SECRET in .env${NC}"
  fi
fi

echo ""
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}  IMPORTANT: Configure your .env file${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "The .env file has been created at: $PROJECT_ROOT/.env"
echo ""
echo "Required configuration:"
echo ""
echo "1. Blockchain RPC Endpoints (for x402 payments and crypto deposits):"
echo "   - BASE_ETH_GATEWAY - Base Mainnet RPC (QuickNode recommended)"
echo "   - ETHEREUM_GATEWAY - Ethereum Mainnet RPC"
echo "   - SOLANA_GATEWAY - Solana RPC"
echo ""
echo "2. x402 Payment Configuration (required for USDC payments):"
echo "   - X402_FACILITATOR_PRIVATE_KEY - Ethereum private key for settling x402 payments"
echo "   - X402_ENABLED=true - Enable x402 payment protocol"
echo "   - X402_NETWORK - Use 'base-mainnet' for production, 'base-sepolia' for testing"
echo ""
echo "3. Optional:"
echo "   - STRIPE_SECRET_KEY - For credit card payments"
echo "   - STRIPE_WEBHOOK_SECRET - For Stripe webhooks"
echo "   - AR_IO_ADMIN_KEY - For AR.IO Gateway optical bridging"
echo ""
echo "Example QuickNode endpoints:"
echo "   BASE_ETH_GATEWAY=https://xxx.base-mainnet.quiknode.pro/yyy/"
echo "   ETHEREUM_GATEWAY=https://xxx.ethereum-mainnet.quiknode.pro/yyy/"
echo ""
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

read -p "Press ENTER to open .env for editing (or Ctrl+C to exit and edit manually)..."

# Open .env with user's preferred editor
${EDITOR:-nano} "$PROJECT_ROOT/.env"

echo ""
echo -e "${GREEN}✅ Environment configured${NC}"
echo ""

# ============================================================================
# 4. Set Up Arweave Wallet
# ============================================================================

echo -e "${BLUE}[4/9]${NC} Checking Arweave wallet configuration..."
echo ""

if [ -f "$PROJECT_ROOT/wallet.json" ]; then
  echo -e "${GREEN}✓${NC} wallet.json found"
else
  echo -e "${YELLOW}⚠️  wallet.json not found${NC}"
  echo ""
  echo "The bundler requires an Arweave wallet (JWK) to sign bundles."
  echo "This wallet will be used to post bundles to the Arweave network."
  echo ""
  echo "You need to:"
  echo "  1. Have an Arweave wallet with sufficient AR for bundle fees"
  echo "  2. Export the wallet as a JWK file (JSON format)"
  echo "  3. Copy it to: $PROJECT_ROOT/wallet.json"
  echo ""
  echo "Example:"
  echo "  cp /path/to/your/arweave-wallet.json $PROJECT_ROOT/wallet.json"
  echo ""

  read -p "Do you have a wallet.json ready to copy? (y/N): " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    read -p "Enter the path to your wallet.json: " WALLET_PATH
    if [ -f "$WALLET_PATH" ]; then
      cp "$WALLET_PATH" "$PROJECT_ROOT/wallet.json"
      echo -e "${GREEN}✓${NC} Wallet copied successfully"
    else
      echo -e "${RED}❌ File not found: $WALLET_PATH${NC}"
      echo "   Please copy your wallet.json manually to: $PROJECT_ROOT/wallet.json"
      echo "   Then re-run this script."
      exit 1
    fi
  else
    echo -e "${RED}❌ wallet.json is required to continue${NC}"
    echo "   Please copy your wallet to: $PROJECT_ROOT/wallet.json"
    echo "   Then re-run this script."
    exit 1
  fi
fi

echo ""

# ============================================================================
# 5. Build All Packages
# ============================================================================

echo -e "${BLUE}[5/9]${NC} Building all packages..."
echo ""

cd "$PROJECT_ROOT"
yarn build

if [ $? -ne 0 ]; then
  echo -e "${RED}❌ Build failed${NC}"
  exit 1
fi

echo -e "${GREEN}✅ All packages built successfully${NC}"
echo ""

# ============================================================================
# 6. Start Infrastructure
# ============================================================================

echo -e "${BLUE}[6/9]${NC} Starting infrastructure (PostgreSQL, Redis, MinIO)..."
echo ""

cd "$PROJECT_ROOT"
docker compose up -d postgres redis-cache redis-queues minio

if [ $? -ne 0 ]; then
  echo -e "${RED}❌ Failed to start infrastructure${NC}"
  exit 1
fi

echo "Waiting for services to be ready..."
sleep 10

# Initialize MinIO buckets
echo "Initializing MinIO buckets..."
docker compose up minio-init

echo -e "${GREEN}✅ Infrastructure started${NC}"
echo ""

# ============================================================================
# 7. Run Database Migrations
# ============================================================================

echo -e "${BLUE}[7/9]${NC} Running database migrations..."
echo ""

# Run migrations using the migrate-all script
cd "$PROJECT_ROOT"
./scripts/migrate-all.sh

if [ $? -ne 0 ]; then
  echo -e "${RED}❌ Database migrations failed${NC}"
  echo "   This might be due to configuration issues in .env"
  exit 1
fi

echo -e "${GREEN}✅ Database migrations complete${NC}"
echo ""

# ============================================================================
# 8. Configure Bundle Planning Cron Job
# ============================================================================

echo -e "${BLUE}[8/9]${NC} Configuring bundle planning cron job..."
echo ""

CRON_SCRIPT="$PROJECT_ROOT/packages/upload-service/cron-trigger-plan.sh"
CRON_LOG="/tmp/bundle-plan-cron.log"

# Check if cron job already exists
if crontab -l 2>/dev/null | grep -q "$CRON_SCRIPT"; then
  echo -e "${GREEN}✓${NC} Cron job already configured"
else
  echo "Adding cron job to trigger bundle planning every 5 minutes..."

  # Add cron job
  (crontab -l 2>/dev/null | grep -v "trigger-plan" ; echo "*/5 * * * * $CRON_SCRIPT >> $CRON_LOG 2>&1") | crontab -

  if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓${NC} Cron job added successfully"
    echo "   The bundler will plan new bundles every 5 minutes"
    echo "   View logs at: $CRON_LOG"
  else
    echo -e "${YELLOW}⚠️  Failed to add cron job${NC}"
    echo "   You can add it manually with:"
    echo "   */5 * * * * $CRON_SCRIPT >> $CRON_LOG 2>&1"
  fi
fi

echo ""

# ============================================================================
# 9. Start All Services
# ============================================================================

echo -e "${BLUE}[9/9]${NC} Starting all services..."
echo ""

cd "$PROJECT_ROOT"
./scripts/start.sh

if [ $? -ne 0 ]; then
  echo -e "${RED}❌ Failed to start services${NC}"
  exit 1
fi

echo ""

# ============================================================================
# Setup Complete
# ============================================================================

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}✅ Setup Complete!${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "The AR.IO Bundler is now running!"
echo ""
echo "Service URLs:"
echo "  📤 Upload Service:     http://localhost:3001"
echo "  💳 Payment Service:    http://localhost:4001"
echo "  📊 Bull Board:         http://localhost:3002/admin/queues"
echo "  🪣 MinIO Console:      http://localhost:9001 (admin/minioadmin123)"
echo ""
echo "Health Checks:"
echo "  curl http://localhost:3001/health"
echo "  curl http://localhost:4001/health"
echo ""
echo "View Logs:"
echo "  pm2 logs                   # All services"
echo "  pm2 logs upload-api        # Upload API"
echo "  pm2 logs upload-workers    # Bundling workers"
echo "  pm2 logs payment-service   # Payment API"
echo "  tail -f $CRON_LOG  # Cron job logs"
echo ""
echo "Manage Services:"
echo "  ./scripts/stop.sh          # Stop everything"
echo "  ./scripts/restart.sh       # Restart services"
echo "  ./scripts/verify.sh        # Verify system health"
echo "  pm2 monit                  # Monitor resources"
echo ""
echo "Next Steps:"
echo "  1. Verify system health: ./scripts/verify.sh"
echo "  2. Test an upload (see README.md for examples)"
echo "  3. Review logs: pm2 logs"
echo ""
echo "Documentation:"
echo "  📖 Quick Start:     README.md"
echo "  📖 Startup Guide:   STARTUP_GUIDE.md"
echo "  📖 x402 Payments:   docs/X402_INTEGRATION_GUIDE.md"
echo "  📖 API Reference:   docs/api/README.md"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
