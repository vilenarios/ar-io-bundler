#!/bin/bash

#############################
# Restart AR.IO Bundler Services
#############################

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  🔄 Restarting AR.IO Bundler Services"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check if services are running
if ! pm2 list | grep -q "payment-service\|upload-api"; then
  echo -e "${YELLOW}⚠️  Services not running${NC}"
  echo "   Use ./scripts/start.sh to start services"
  exit 1
fi

# Restart services
echo "🔄 Restarting services..."
pm2 restart payment-service upload-api

echo ""
echo -e "${GREEN}✓${NC} Services restarted"
echo ""
pm2 list
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Commands:"
echo "  pm2 logs           - View logs"
echo "  pm2 monit          - Monitor processes"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
