#!/bin/bash

#############################
# Stop AR.IO Bundler Services
#############################

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  🛑 Stopping AR.IO Bundler Services"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check if services are running
if ! pm2 list | grep -q "payment-service\|upload-api"; then
  echo -e "${YELLOW}⚠️  No services running${NC}"
  pm2 list
  exit 0
fi

# Stop services
echo "🛑 Stopping services..."
pm2 stop payment-service upload-api

echo ""
echo -e "${GREEN}✓${NC} Services stopped"
echo ""
pm2 list
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Commands:"
echo "  pm2 start all           - Restart services"
echo "  pm2 delete all          - Remove from PM2"
echo "  docker compose down     - Stop infrastructure"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
