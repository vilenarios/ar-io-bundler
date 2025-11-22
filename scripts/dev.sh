#!/bin/bash

#############################
# Start all services in development mode
#############################

set -e

echo "🚀 Starting AR.IO Bundler in development mode..."
echo ""

# Check if infrastructure is running
if ! docker ps | grep -q ar-io-bundler-postgres; then
  echo "🐳 Starting infrastructure..."
  yarn infra:up
  sleep 5
  echo ""
fi

# Check for .env
if [ ! -f .env ]; then
  echo "⚠️  .env file not found"
  echo "   Creating from .env.sample..."
  cp .env.sample .env
  echo "   Please edit .env before continuing"
  exit 1
fi

# Check for wallet.json
if [ ! -f wallet.json ]; then
  echo "⚠️  wallet.json not found"
  echo "   Upload service requires an Arweave wallet for bundle signing"
  echo "   Place your wallet at: ./wallet.json"
  exit 1
fi

# Build if needed
if [ ! -d "packages/payment-service/lib" ] || [ ! -d "packages/upload-service/lib" ]; then
  echo "🔨 Building packages..."
  yarn build
  echo ""
fi

# Start in watch mode using PM2 dev ecosystem
echo "📦 Starting services with PM2..."
pm2 start infrastructure/pm2/ecosystem.config.js --env development

echo ""
echo "✅ Services started!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Service URLs:"
echo "  Payment Service:  http://localhost:4001"
echo "  Upload Service:   http://localhost:3001"
echo "  Bull Board:       http://localhost:3002/admin/queues"
echo "  MinIO Console:    http://localhost:9001"
echo ""
echo "Useful commands:"
echo "  pm2 logs         - View all logs"
echo "  pm2 monit        - Monitor processes"
echo "  pm2 restart all  - Restart all services"
echo "  pm2 stop all     - Stop all services"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
