#!/bin/bash
#
# Repack Data Items Script
# Moves data items back to new_data_item table for rebundling
#
# Usage: ./repack-data-items.sh <data-item-id> [<data-item-id> ...]
# Example: ./repack-data-items.sh JUaoV4LQLCEvFUNOgJFOqlk1rzH71nTtg4laJu3tMeo sWLK5ZVYInNgMD7PLzyi00iwH7Kh32QWEoUoQ_VQa6w

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

if [ $# -eq 0 ]; then
    echo -e "${RED}Error: No data item IDs provided${NC}"
    echo "Usage: $0 <data-item-id> [<data-item-id> ...]"
    exit 1
fi

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  📦 Repack Data Items Script${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Function to execute SQL via docker
run_sql() {
    docker exec ar-io-bundler-postgres psql -U turbo_admin -d upload_service -t -c "$1"
}

# Function to trigger plan job
trigger_plan_job() {
    cd "$SCRIPT_DIR"
    NODE_ENV=production node -e "
    const { enqueue } = require('./lib/arch/queues');
    const { jobLabels } = require('./lib/constants');

    (async () => {
        try {
            const planId = 'repack-' + Date.now();
            await enqueue(jobLabels.planBundle, { planId });
            console.log('Triggered plan job: ' + planId);
        } catch (error) {
            console.error('Error triggering plan job:', error);
            process.exit(1);
        }
        process.exit(0);
    })();
    "
}

# Process each data item ID
REPACKED_COUNT=0
for DATA_ITEM_ID in "$@"; do
    echo -e "${YELLOW}Processing data item: ${DATA_ITEM_ID}${NC}"

    # Search all tables to find where the data item is
    LOCATION=$(run_sql "
        SELECT 'new_data_item' as location FROM new_data_item WHERE data_item_id = '$DATA_ITEM_ID'
        UNION ALL
        SELECT 'planned_data_item' FROM planned_data_item WHERE data_item_id = '$DATA_ITEM_ID'
        UNION ALL
        SELECT 'permanent_data_items' FROM permanent_data_items WHERE data_item_id = '$DATA_ITEM_ID'
        UNION ALL
        SELECT 'failed_data_item' FROM failed_data_item WHERE data_item_id = '$DATA_ITEM_ID'
        LIMIT 1;
    " | xargs)

    if [ -z "$LOCATION" ]; then
        echo -e "${RED}  ✗ Data item not found in database${NC}"
        echo ""
        continue
    fi

    echo -e "  📍 Found in: ${LOCATION}"

    # Handle based on location
    case "$LOCATION" in
        "new_data_item")
            echo -e "${GREEN}  ✓ Already in new_data_item (ready for bundling)${NC}"
            ;;

        "planned_data_item")
            echo -e "  🔄 Moving from planned_data_item → new_data_item..."

            # Get the data item details including current failed_bundles
            DATA_ITEM_INFO=$(run_sql "
                SELECT
                    owner_public_address,
                    byte_count,
                    assessed_winston_price,
                    data_start,
                    signature_type,
                    content_type,
                    premium_feature_type,
                    deadline_height,
                    COALESCE(failed_bundles, '') as failed_bundles,
                    plan_id
                FROM planned_data_item
                WHERE data_item_id = '$DATA_ITEM_ID';
            " | tr '\n' '|')

            if [ -z "$DATA_ITEM_INFO" ]; then
                echo -e "${RED}  ✗ Failed to read data item info${NC}"
                continue
            fi

            # Get bundle_id from plan
            BUNDLE_ID=$(run_sql "
                SELECT bundle_id FROM posted_bundle WHERE plan_id = (
                    SELECT plan_id FROM planned_data_item WHERE data_item_id = '$DATA_ITEM_ID'
                )
                UNION ALL
                SELECT bundle_id FROM permanent_bundle WHERE plan_id = (
                    SELECT plan_id FROM planned_data_item WHERE data_item_id = '$DATA_ITEM_ID'
                )
                LIMIT 1;
            " | xargs)

            # Extract fields (PostgreSQL output is pipe-delimited)
            IFS='|' read -r owner byte_count price data_start sig_type content_type feature deadline failed_bundles plan_id <<< "$DATA_ITEM_INFO"

            # Append failed bundle ID to failed_bundles list
            if [ -n "$BUNDLE_ID" ]; then
                if [ -z "$failed_bundles" ] || [ "$failed_bundles" = " " ]; then
                    NEW_FAILED_BUNDLES="$BUNDLE_ID"
                else
                    NEW_FAILED_BUNDLES="${failed_bundles},${BUNDLE_ID}"
                fi
            else
                NEW_FAILED_BUNDLES="$failed_bundles"
            fi

            # Move to new_data_item with failed bundle tracking
            run_sql "
                BEGIN;

                -- Insert into new_data_item
                INSERT INTO new_data_item (
                    data_item_id,
                    owner_public_address,
                    byte_count,
                    assessed_winston_price,
                    data_start,
                    signature_type,
                    content_type,
                    premium_feature_type,
                    deadline_height,
                    failed_bundles
                )
                SELECT
                    data_item_id,
                    owner_public_address,
                    byte_count,
                    assessed_winston_price,
                    data_start,
                    signature_type,
                    content_type,
                    premium_feature_type,
                    deadline_height,
                    '$NEW_FAILED_BUNDLES'
                FROM planned_data_item
                WHERE data_item_id = '$DATA_ITEM_ID'
                ON CONFLICT (data_item_id) DO UPDATE SET
                    failed_bundles = EXCLUDED.failed_bundles;

                -- Remove from planned_data_item
                DELETE FROM planned_data_item WHERE data_item_id = '$DATA_ITEM_ID';

                COMMIT;
            " > /dev/null

            echo -e "${GREEN}  ✓ Moved to new_data_item for repacking${NC}"
            if [ -n "$BUNDLE_ID" ]; then
                echo -e "  📝 Added failed bundle: ${BUNDLE_ID}"
            fi
            REPACKED_COUNT=$((REPACKED_COUNT + 1))
            ;;

        "permanent_data_items")
            echo -e "  ⚠️  Moving from permanent_data_items → new_data_item..."
            echo -e "  ${YELLOW}WARNING: This data item was marked permanent!${NC}"

            # Get bundle_id
            BUNDLE_ID=$(run_sql "
                SELECT bundle_id FROM permanent_data_items WHERE data_item_id = '$DATA_ITEM_ID';
            " | xargs)

            # Move from permanent partition back to new_data_item
            run_sql "
                BEGIN;

                -- Insert into new_data_item from permanent partition
                INSERT INTO new_data_item (
                    data_item_id,
                    owner_public_address,
                    byte_count,
                    assessed_winston_price,
                    data_start,
                    signature_type,
                    content_type,
                    premium_feature_type,
                    deadline_height,
                    failed_bundles
                )
                SELECT
                    data_item_id,
                    owner_public_address,
                    byte_count,
                    assessed_winston_price,
                    data_start,
                    signature_type,
                    content_type,
                    premium_feature_type,
                    deadline_height,
                    COALESCE(failed_bundles, '') || CASE
                        WHEN COALESCE(failed_bundles, '') = '' THEN '$BUNDLE_ID'
                        ELSE ',$BUNDLE_ID'
                    END
                FROM permanent_data_items
                WHERE data_item_id = '$DATA_ITEM_ID'
                ON CONFLICT (data_item_id) DO UPDATE SET
                    failed_bundles = EXCLUDED.failed_bundles;

                -- Remove from permanent_data_items (will remove from partition)
                DELETE FROM permanent_data_items WHERE data_item_id = '$DATA_ITEM_ID';

                COMMIT;
            " > /dev/null

            echo -e "${GREEN}  ✓ Moved to new_data_item for repacking${NC}"
            echo -e "  📝 Added failed bundle: ${BUNDLE_ID}"
            REPACKED_COUNT=$((REPACKED_COUNT + 1))
            ;;

        "failed_data_item")
            echo -e "  🔄 Moving from failed_data_item → new_data_item..."

            run_sql "
                BEGIN;

                -- Insert into new_data_item
                INSERT INTO new_data_item (
                    data_item_id,
                    owner_public_address,
                    byte_count,
                    assessed_winston_price,
                    data_start,
                    signature_type,
                    content_type,
                    premium_feature_type,
                    deadline_height,
                    failed_bundles
                )
                SELECT
                    data_item_id,
                    owner_public_address,
                    byte_count,
                    assessed_winston_price,
                    data_start,
                    signature_type,
                    content_type,
                    premium_feature_type,
                    deadline_height,
                    failed_bundles
                FROM failed_data_item
                WHERE data_item_id = '$DATA_ITEM_ID'
                ON CONFLICT (data_item_id) DO UPDATE SET
                    failed_bundles = EXCLUDED.failed_bundles;

                -- Remove from failed_data_item
                DELETE FROM failed_data_item WHERE data_item_id = '$DATA_ITEM_ID';

                COMMIT;
            " > /dev/null

            echo -e "${GREEN}  ✓ Moved to new_data_item for repacking${NC}"
            REPACKED_COUNT=$((REPACKED_COUNT + 1))
            ;;
    esac

    echo ""
done

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

if [ $REPACKED_COUNT -eq 0 ]; then
    echo -e "${YELLOW}⚠️  No data items were repacked${NC}"
else
    echo -e "${GREEN}✅ Repacked ${REPACKED_COUNT} data item(s)${NC}"
    echo ""
    echo -e "${BLUE}Triggering plan job to rebundle...${NC}"
    if trigger_plan_job; then
        echo -e "${GREEN}✓ Plan job triggered${NC}"
    else
        echo -e "${RED}✗ Failed to trigger plan job${NC}"
        echo -e "${YELLOW}Manually trigger with: yarn trigger:plan${NC}"
    fi
fi

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "Monitor progress:"
echo "  pm2 logs upload-workers | grep -i plan"
echo "  http://localhost:3002/admin/queues (Bull Board)"
echo ""
echo "Data items are now in new_data_item and will be:"
echo "  1. Picked up by next plan job (runs every 5 min via cron)"
echo "  2. Bundled with other pending data items"
echo "  3. Posted to Arweave with proper chunk uploads"
echo ""
