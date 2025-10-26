#!/bin/bash
# Startup script for AR.IO Bundler services
# Loads .env file and starts PM2 ecosystem

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="$PROJECT_ROOT/.env"

# Check if .env exists
if [ ! -f "$ENV_FILE" ]; then
    echo "Error: .env file not found at $ENV_FILE"
    echo "Please create .env file from .env.sample"
    exit 1
fi

# Export environment variables from .env
# Skip commented lines and empty lines
# Handle multi-line values (like JSON)
set -a  # automatically export all variables
source "$ENV_FILE"
set +a

echo "✓ Environment variables loaded from $ENV_FILE"
echo "✓ Starting PM2 ecosystem..."

# Start PM2 with the ecosystem config
cd "$PROJECT_ROOT"
pm2 start "$SCRIPT_DIR/ecosystem.config.js"

echo "✓ Services started successfully"
pm2 status
