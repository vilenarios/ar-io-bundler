#!/bin/bash
#
# Reseed Bundle Script
# Re-uploads TX headers and chunks to Arweave network for bundles with incomplete uploads
#
# Usage: ./reseed-bundle.sh <bundle-id> [<bundle-id> ...]
# Example: ./reseed-bundle.sh ebOw0zvzUl33naxknDT4vrdeyjDAqEMmQXTQjfrqB7I

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

if [ $# -eq 0 ]; then
    echo -e "${RED}Error: No bundle IDs provided${NC}"
    echo "Usage: $0 <bundle-id> [<bundle-id> ...]"
    exit 1
fi

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  🔄 Reseed Bundle Script${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Function to execute SQL via docker
run_sql() {
    docker exec ar-io-bundler-postgres psql -U turbo_admin -d upload_service -t -c "$1"
}

# Function to enqueue seed job
enqueue_seed_job() {
    local plan_id=$1
    cd "$SCRIPT_DIR"
    NODE_ENV=production node -e "
    const { enqueue } = require('./lib/arch/queues');
    const { jobLabels } = require('./lib/constants');

    (async () => {
        try {
            await enqueue(jobLabels.seedBundle, { planId: '$plan_id' });
            console.log('Enqueued seed job for plan: $plan_id');
        } catch (error) {
            console.error('Error enqueuing seed job:', error);
            process.exit(1);
        }
        process.exit(0);
    })();
    "
}

# Process each bundle ID
for BUNDLE_ID in "$@"; do
    echo -e "${YELLOW}Processing bundle: ${BUNDLE_ID}${NC}"

    # Get plan ID from database (check all tables)
    PLAN_ID=$(run_sql "
        SELECT plan_id FROM seeded_bundle WHERE bundle_id = '$BUNDLE_ID'
        UNION
        SELECT plan_id FROM posted_bundle WHERE bundle_id = '$BUNDLE_ID'
        UNION
        SELECT plan_id FROM permanent_bundle WHERE bundle_id = '$BUNDLE_ID'
        LIMIT 1;
    " | xargs)

    if [ -z "$PLAN_ID" ]; then
        echo -e "${RED}  ✗ Bundle not found in database${NC}"
        continue
    fi

    echo -e "  📋 Plan ID: ${PLAN_ID}"

    # Remove from seeded/permanent (NOT posted_bundle - seed job needs that!)
    echo -e "  🗑️  Removing from seeded/permanent tables..."
    run_sql "DELETE FROM seeded_bundle WHERE bundle_id = '$BUNDLE_ID';" > /dev/null
    run_sql "DELETE FROM permanent_bundle WHERE bundle_id = '$BUNDLE_ID';" > /dev/null

    # Ensure bundle is in posted_bundle for seed job
    echo -e "  ✅ Ensuring bundle is in posted_bundle..."
    run_sql "
    INSERT INTO posted_bundle (bundle_id, plan_id, reward, transaction_byte_count, header_byte_count, payload_byte_count)
    SELECT '$BUNDLE_ID', '$PLAN_ID', '0', 52428800, 1024, 52427776
    WHERE NOT EXISTS (SELECT 1 FROM posted_bundle WHERE bundle_id = '$BUNDLE_ID');
    " > /dev/null

    # Enqueue seed job
    echo -e "  📤 Enqueueing seed job..."
    if enqueue_seed_job "$PLAN_ID"; then
        echo -e "${GREEN}  ✓ Bundle queued for reseeding${NC}"
    else
        echo -e "${RED}  ✗ Failed to enqueue seed job${NC}"
    fi

    echo ""
done

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ Reseed jobs enqueued${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "Monitor progress:"
echo "  pm2 logs upload-workers | grep -i seed"
echo "  http://localhost:3002/admin/queues (Bull Board)"
echo ""
