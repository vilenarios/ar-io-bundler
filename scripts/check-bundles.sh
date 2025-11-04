#!/bin/bash

# Check Bundle Status
# This script displays the current status of bundles in the system

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
UPLOAD_SERVICE_DIR="$ROOT_DIR/packages/upload-service"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}  Bundle Status Report${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo

# Check if upload service directory exists
if [ ! -d "$UPLOAD_SERVICE_DIR" ]; then
  echo -e "${RED}✗ Upload service directory not found: $UPLOAD_SERVICE_DIR${NC}"
  exit 1
fi

cd "$UPLOAD_SERVICE_DIR"

# Generate comprehensive bundle status report
DB_HOST=localhost DB_USER=turbo_admin DB_PASSWORD=postgres DB_DATABASE=upload_service node -e "
const knex = require('knex')(require('./lib/arch/db/knexConfig').getReaderConfig());

const formatDate = (dateStr) => {
  if (!dateStr) return 'N/A';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 60) return \`\${diffMins}m ago\`;
  if (diffHours < 24) return \`\${diffHours}h ago\`;
  return \`\${diffDays}d ago\`;
};

(async () => {
  try {
    // Count bundles in each state
    const [newBundleCount, postedCount, seededCount, permanentCount] = await Promise.all([
      knex('new_bundle').count('* as count').first(),
      knex('posted_bundle').count('* as count').first(),
      knex('seeded_bundle').count('* as count').first(),
      knex('permanent_bundle').count('* as count').first(),
    ]);

    console.log('Bundle Pipeline Status:');
    console.log('─────────────────────────────────────────────────────────');
    console.log('  New (prepared bundles):  ', newBundleCount.count.toString().padStart(6));
    console.log('  Posted (to Arweave):     ', postedCount.count.toString().padStart(6));
    console.log('  Seeded (awaiting verify):', seededCount.count.toString().padStart(6));
    console.log('  Permanent (finalized):   ', permanentCount.count.toString().padStart(6));
    console.log('─────────────────────────────────────────────────────────');
    console.log();

    // Show seeded bundles (need verification)
    if (seededCount.count > 0) {
      console.log('\x1b[33m⚠ Seeded Bundles Awaiting Verification:\x1b[0m');
      const seeded = await knex('seeded_bundle')
        .orderBy('seeded_date', 'desc')
        .limit(10)
        .select('bundle_id', 'plan_id', 'seeded_date');

      seeded.forEach((b, i) => {
        console.log(\`  \${i + 1}. \${b.bundle_id}\`);
        console.log(\`     Plan: \${b.plan_id.substring(0, 8)}... | Seeded: \${formatDate(b.seeded_date)}\`);
      });
      console.log();
      console.log('Run \x1b[36m./scripts/trigger-verify.sh\x1b[0m to verify these bundles.');
      console.log();
    } else {
      console.log('\x1b[32m✓ No bundles awaiting verification\x1b[0m');
      console.log();
    }

    // Show recent permanent bundles
    if (permanentCount.count > 0) {
      console.log('Recent Permanent Bundles:');
      const permanent = await knex('permanent_bundle')
        .orderBy('permanent_date', 'desc')
        .limit(5)
        .select('bundle_id', 'block_height', 'permanent_date');

      permanent.forEach((b, i) => {
        console.log(\`  \${i + 1}. \${b.bundle_id}\`);
        console.log(\`     Block: \${b.block_height} | Finalized: \${formatDate(b.permanent_date)}\`);
      });
      console.log();
    }

    // Data item counts
    const [newDataItems, plannedDataItems, permanentDataItems] = await Promise.all([
      knex('new_data_item').count('* as count').first(),
      knex('planned_data_item').count('* as count').first(),
      knex.raw('SELECT COUNT(*) as count FROM permanent_data_items'),
    ]);

    console.log('Data Item Status:');
    console.log('─────────────────────────────────────────────────────────');
    console.log('  New (uploaded):          ', newDataItems.count.toString().padStart(6));
    console.log('  Planned (in bundles):    ', plannedDataItems.count.toString().padStart(6));
    console.log('  Permanent (finalized):   ', permanentDataItems.rows[0].count.padStart(6));
    console.log('─────────────────────────────────────────────────────────');

  } catch (error) {
    console.error('\x1b[31m✗ Error:\x1b[0m', error.message);
    process.exit(1);
  } finally {
    await knex.destroy();
  }
})();
"

echo
echo -e "${BLUE}Tip:${NC} Check specific data item status with:"
echo -e "  ${YELLOW}curl http://localhost:3001/v1/tx/status/YOUR_DATA_ITEM_ID${NC}"
echo
