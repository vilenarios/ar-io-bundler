#!/bin/bash

# Trigger Bundle Verification Job
# This script manually triggers the verify-bundle worker to check all seeded bundles
# and mark them as permanent if they have sufficient confirmations on Arweave.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
UPLOAD_SERVICE_DIR="$ROOT_DIR/packages/upload-service"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}  Trigger Bundle Verification${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo

# Check if upload service directory exists
if [ ! -d "$UPLOAD_SERVICE_DIR" ]; then
  echo -e "${RED}✗ Upload service directory not found: $UPLOAD_SERVICE_DIR${NC}"
  exit 1
fi

cd "$UPLOAD_SERVICE_DIR"

# Check if workers are running
WORKERS_RUNNING=$(pm2 list | grep -c "upload-workers.*online" || echo "0")
if [ "$WORKERS_RUNNING" -eq "0" ]; then
  echo -e "${RED}✗ Upload workers are not running!${NC}"
  echo "  Start workers with: pm2 start upload-workers"
  exit 1
fi

echo -e "${GREEN}✓ Upload workers are running${NC}"
echo

# Check for seeded bundles before triggering
echo "Checking for seeded bundles..."
SEEDED_COUNT=$(DB_HOST=localhost DB_USER=turbo_admin DB_PASSWORD=postgres DB_DATABASE=upload_service node -e "
const knex = require('knex')(require('./lib/arch/db/knexConfig').getReaderConfig());
(async () => {
  try {
    const result = await knex('seeded_bundle').count('* as count').first();
    console.log(result.count);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await knex.destroy();
  }
})();
" 2>/dev/null || echo "0")

if [ "$SEEDED_COUNT" -eq "0" ]; then
  echo -e "${YELLOW}⚠ No seeded bundles found to verify${NC}"
  echo "  All bundles may already be verified as permanent."
  exit 0
fi

echo -e "${GREEN}✓ Found $SEEDED_COUNT seeded bundle(s) to verify${NC}"
echo

# Trigger verify job
echo "Enqueueing verify job..."
NODE_ENV=production node -e "
(async () => {
  try {
    const { enqueue } = await import('./lib/arch/queues.js');
    const { jobLabels } = await import('./lib/constants.js');

    const planId = 'manual-trigger-' + Date.now();
    await enqueue(jobLabels.verifyBundle, { planId });

    console.log('✓ Verify job enqueued successfully');
    console.log('  Plan ID:', planId);

    process.exit(0);
  } catch (error) {
    console.error('✗ Failed to enqueue verify job:', error.message);
    process.exit(1);
  }
})();
" || {
  echo -e "${RED}✗ Failed to enqueue verify job${NC}"
  exit 1
}

echo
echo -e "${GREEN}✓ Verify job triggered successfully!${NC}"
echo
echo "Monitor the job with:"
echo -e "  ${YELLOW}pm2 logs upload-workers --lines 100${NC}"
echo
echo "Check bundle status with:"
echo -e "  ${YELLOW}curl http://localhost:3001/v1/tx/STATUS/YOUR_DATA_ITEM_ID${NC}"
echo

# Wait a moment and show recent logs
echo "Recent worker logs:"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
sleep 3
pm2 logs upload-workers --nostream --lines 10 | grep -E "verify|permanent" | tail -5 || echo "No verify activity yet. Check logs with: pm2 logs upload-workers"
echo
