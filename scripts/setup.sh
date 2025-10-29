#!/bin/bash
set -e

#####################################################################
# AR.IO Bundler Interactive Setup Script
#####################################################################
#
# This script guides you through the initial configuration of the
# AR.IO Bundler platform. It will:
#   - Collect all required configuration values
#   - Validate inputs with appropriate guardrails
#   - Generate secure random secrets
#   - Create a complete .env file
#   - Optionally test infrastructure connectivity
#   - Optionally run database migrations
#   - Optionally start services
#
# Requirements:
#   - Bash 4.0+
#   - OpenSSL (for generating secrets)
#   - curl (for validation)
#   - jq (optional, for enhanced validation)
#
#####################################################################

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${PROJECT_ROOT}/.env"

# Temporary file for building .env content
TEMP_ENV=$(mktemp)
trap "rm -f ${TEMP_ENV}" EXIT

# Configuration variables
declare -A CONFIG

#####################################################################
# Utility Functions
#####################################################################

print_header() {
    echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}${CYAN}$1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
}

print_section() {
    echo -e "\n${MAGENTA}▸ $1${NC}\n"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_info() {
    echo -e "${CYAN}ℹ${NC} $1"
}

# Prompt with default value
prompt() {
    local var_name="$1"
    local prompt_text="$2"
    local default_value="$3"
    local is_secret="${4:-false}"

    if [ -n "$default_value" ]; then
        echo -e "${CYAN}${prompt_text}${NC}"
        if [ "$is_secret" = "true" ]; then
            read -s -p "  [default: <hidden>]: " input
            echo
        else
            read -p "  [default: ${default_value}]: " input
        fi
        CONFIG["$var_name"]="${input:-$default_value}"
    else
        echo -e "${CYAN}${prompt_text}${NC}"
        if [ "$is_secret" = "true" ]; then
            read -s -p "  (required): " input
            echo
        else
            read -p "  (required): " input
        fi
        while [ -z "$input" ]; do
            print_error "This field is required."
            if [ "$is_secret" = "true" ]; then
                read -s -p "  (required): " input
                echo
            else
                read -p "  (required): " input
            fi
        done
        CONFIG["$var_name"]="$input"
    fi
}

# Yes/No prompt
confirm() {
    local prompt_text="$1"
    local default="${2:-n}"

    if [ "$default" = "y" ]; then
        read -p "$(echo -e ${CYAN}${prompt_text}${NC}) [Y/n]: " response
        response=${response:-y}
    else
        read -p "$(echo -e ${CYAN}${prompt_text}${NC}) [y/N]: " response
        response=${response:-n}
    fi

    [[ "$response" =~ ^[Yy]$ ]]
}

# Generate random secret
generate_secret() {
    openssl rand -hex 32
}

# Validate URL format
validate_url() {
    local url="$1"
    if [[ "$url" =~ ^https?:// ]]; then
        return 0
    else
        return 1
    fi
}

# Validate port number
validate_port() {
    local port="$1"
    if [[ "$port" =~ ^[0-9]+$ ]] && [ "$port" -ge 1 ] && [ "$port" -le 65535 ]; then
        return 0
    else
        return 1
    fi
}

# Validate file exists
validate_file() {
    local file="$1"
    if [ -f "$file" ]; then
        return 0
    else
        return 1
    fi
}

# Validate Arweave address (base64url, 43 chars)
validate_arweave_address() {
    local addr="$1"
    if [[ "$addr" =~ ^[A-Za-z0-9_-]{43}$ ]]; then
        return 0
    else
        return 1
    fi
}

# Validate Ethereum address (0x + 40 hex chars)
validate_ethereum_address() {
    local addr="$1"
    if [[ "$addr" =~ ^0x[a-fA-F0-9]{40}$ ]]; then
        return 0
    else
        return 1
    fi
}

# Validate Solana address (base58, 32-44 chars)
validate_solana_address() {
    local addr="$1"
    if [[ "$addr" =~ ^[1-9A-HJ-NP-Za-km-z]{32,44}$ ]]; then
        return 0
    else
        return 1
    fi
}

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

#####################################################################
# Main Setup Flow
#####################################################################

print_header "🚀 AR.IO Bundler Setup Wizard"

echo -e "Welcome to the AR.IO Bundler setup wizard!"
echo -e "This script will guide you through configuring your bundler.\n"
echo -e "You'll be prompted for:"
echo -e "  • Environment settings (development/production)"
echo -e "  • Database credentials"
echo -e "  • Arweave wallet configuration"
echo -e "  • Payment addresses for supported blockchains"
echo -e "  • Gateway URLs"
echo -e "  • Service ports and URLs"
echo -e "  • Storage configuration (MinIO/S3)"
echo -e "  • Optional integrations (Stripe, AR.IO Gateway, x402)\n"

if [ -f "$ENV_FILE" ]; then
    print_warning "Existing .env file found at: $ENV_FILE"
    if confirm "Do you want to back it up before continuing?" "y"; then
        BACKUP_FILE="${ENV_FILE}.backup.$(date +%Y%m%d_%H%M%S)"
        cp "$ENV_FILE" "$BACKUP_FILE"
        print_success "Backup created: $BACKUP_FILE"
    fi
    echo
fi

if ! confirm "Ready to begin setup?" "y"; then
    echo "Setup cancelled."
    exit 0
fi

#####################################################################
# 1. Environment Configuration
#####################################################################

print_header "1. Environment Configuration"

echo -e "Select your environment type:"
echo -e "  ${GREEN}development${NC} - For local development and testing"
echo -e "  ${GREEN}production${NC}  - For production deployment"
echo

select env_choice in "development" "production"; do
    case $env_choice in
        development|production)
            CONFIG["NODE_ENV"]="$env_choice"
            break
            ;;
        *)
            print_error "Invalid selection. Please choose 1 or 2."
            ;;
    esac
done

print_success "Environment set to: ${CONFIG[NODE_ENV]}"

#####################################################################
# 2. Database Configuration
#####################################################################

print_header "2. Database Configuration"

echo -e "The bundler uses PostgreSQL with two separate databases:"
echo -e "  • ${CYAN}payment_service${NC} - Payment processing and balances"
echo -e "  • ${CYAN}upload_service${NC}  - Data uploads and bundling\n"

print_section "Database Connection"

prompt "DB_HOST" "Database host" "localhost"
prompt "DB_PORT" "Database port" "5432"

while ! validate_port "${CONFIG[DB_PORT]}"; do
    print_error "Invalid port number. Must be between 1 and 65535."
    prompt "DB_PORT" "Database port" "5432"
done

prompt "DB_USER" "Database username" "turbo_admin"
prompt "DB_PASSWORD" "Database password" "postgres" true

print_info "Note: Both services will use these credentials with different database names."

#####################################################################
# 3. Arweave Wallet Configuration
#####################################################################

print_header "3. Arweave Wallet Configuration"

echo -e "Bundles are signed with an Arweave wallet (JWK file)."
echo -e "This wallet will be used to post bundles to the Arweave network.\n"

print_warning "IMPORTANT: Use ABSOLUTE paths, not relative paths!"
echo

while true; do
    prompt "TURBO_JWK_FILE" "Path to your Arweave wallet JWK file" "${PROJECT_ROOT}/wallet.json"

    if validate_file "${CONFIG[TURBO_JWK_FILE]}"; then
        print_success "Wallet file found: ${CONFIG[TURBO_JWK_FILE]}"
        break
    else
        print_error "File not found: ${CONFIG[TURBO_JWK_FILE]}"
        print_info "Please ensure the wallet file exists at the specified path."
        if ! confirm "Try a different path?" "y"; then
            print_error "Wallet file is required. Setup cannot continue."
            exit 1
        fi
    fi
done

echo
if confirm "Do you want to enable raw data item uploads (requires separate wallet)?" "n"; then
    while true; do
        prompt "RAW_DATA_ITEM_JWK_FILE" "Path to raw data item wallet JWK file" "${PROJECT_ROOT}/rawWallet.json"

        if validate_file "${CONFIG[RAW_DATA_ITEM_JWK_FILE]}"; then
            print_success "Raw wallet file found: ${CONFIG[RAW_DATA_ITEM_JWK_FILE]}"
            CONFIG["RAW_DATA_UPLOADS_ENABLED"]="true"
            break
        else
            print_error "File not found: ${CONFIG[RAW_DATA_ITEM_JWK_FILE]}"
            if ! confirm "Try a different path?" "y"; then
                CONFIG["RAW_DATA_UPLOADS_ENABLED"]="false"
                unset CONFIG["RAW_DATA_ITEM_JWK_FILE"]
                break
            fi
        fi
    done
else
    CONFIG["RAW_DATA_UPLOADS_ENABLED"]="false"
fi

#####################################################################
# 4. Payment Addresses (Blockchain Wallets)
#####################################################################

print_header "4. Payment Addresses"

echo -e "Configure blockchain addresses where you'll receive payments."
echo -e "Users can pay for storage using these cryptocurrencies.\n"

print_section "Arweave Address (Required)"

while true; do
    prompt "ARWEAVE_ADDRESS" "Your Arweave wallet address" ""

    if validate_arweave_address "${CONFIG[ARWEAVE_ADDRESS]}"; then
        print_success "Valid Arweave address"
        break
    else
        print_error "Invalid Arweave address format (should be 43 characters, base64url)"
    fi
done

echo
if confirm "Configure Ethereum address?" "y"; then
    while true; do
        prompt "ETHEREUM_ADDRESS" "Your Ethereum wallet address" ""

        if validate_ethereum_address "${CONFIG[ETHEREUM_ADDRESS]}"; then
            print_success "Valid Ethereum address"
            break
        else
            print_error "Invalid Ethereum address format (should start with 0x)"
            if ! confirm "Try again?" "y"; then
                unset CONFIG["ETHEREUM_ADDRESS"]
                break
            fi
        fi
    done
fi

echo
if confirm "Configure Solana address?" "y"; then
    while true; do
        prompt "SOLANA_ADDRESS" "Your Solana wallet address" ""

        if validate_solana_address "${CONFIG[SOLANA_ADDRESS]}"; then
            print_success "Valid Solana address"
            break
        else
            print_error "Invalid Solana address format"
            if ! confirm "Try again?" "y"; then
                unset CONFIG["SOLANA_ADDRESS"]
                break
            fi
        fi
    done
fi

echo
if confirm "Configure Polygon (MATIC) address?" "n"; then
    while true; do
        prompt "MATIC_ADDRESS" "Your Polygon wallet address" ""

        if validate_ethereum_address "${CONFIG[MATIC_ADDRESS]}"; then
            print_success "Valid Polygon address"
            break
        else
            print_error "Invalid address format (should start with 0x)"
            if ! confirm "Try again?" "y"; then
                unset CONFIG["MATIC_ADDRESS"]
                break
            fi
        fi
    done
fi

echo
if confirm "Configure Base (Base-ETH) address?" "n"; then
    while true; do
        prompt "BASE_ETH_ADDRESS" "Your Base wallet address" ""

        if validate_ethereum_address "${CONFIG[BASE_ETH_ADDRESS]}"; then
            print_success "Valid Base address"
            break
        else
            print_error "Invalid address format (should start with 0x)"
            if ! confirm "Try again?" "y"; then
                unset CONFIG["BASE_ETH_ADDRESS"]
                break
            fi
        fi
    done
fi

echo
if confirm "Configure KYVE address?" "n"; then
    prompt "KYVE_ADDRESS" "Your KYVE wallet address (kyve1...)" ""
fi

#####################################################################
# 5. Gateway Configuration
#####################################################################

print_header "5. Gateway Configuration"

echo -e "Configure Arweave gateway endpoints for pricing and data retrieval.\n"

prompt "ARWEAVE_GATEWAY" "Primary Arweave gateway URL" "https://arweave.net"

while ! validate_url "${CONFIG[ARWEAVE_GATEWAY]}"; do
    print_error "Invalid URL format. Must start with http:// or https://"
    prompt "ARWEAVE_GATEWAY" "Primary Arweave gateway URL" "https://arweave.net"
done

echo
echo -e "Public-facing gateway URLs (comma-separated, no spaces):"
echo -e "These are returned in the /v1/info endpoint for clients."
prompt "PUBLIC_GATEWAY_FQDNS" "Public gateway URLs" "${CONFIG[ARWEAVE_GATEWAY]}"

prompt "PUBLIC_ACCESS_GATEWAY" "Public access gateway (for uploads)" "${CONFIG[ARWEAVE_GATEWAY]}"

# Extract hostnames from gateway URLs for caching
if [[ "${CONFIG[PUBLIC_GATEWAY_FQDNS]}" =~ https?://([^,]+)(,https?://([^,]+))* ]]; then
    # Extract just the hostnames without protocol
    GATEWAYS="${CONFIG[PUBLIC_GATEWAY_FQDNS]}"
    GATEWAYS="${GATEWAYS//https:\/\//}"
    GATEWAYS="${GATEWAYS//http:\/\//}"
    CONFIG["DATA_CACHES"]="$GATEWAYS"
    CONFIG["FAST_FINALITY_INDEXES"]="$GATEWAYS"
fi

#####################################################################
# 6. Service Ports and URLs
#####################################################################

print_header "6. Service Ports and URLs"

print_section "Payment Service"
prompt "PAYMENT_SERVICE_PORT" "Payment service port" "4001"
while ! validate_port "${CONFIG[PAYMENT_SERVICE_PORT]}"; do
    print_error "Invalid port number"
    prompt "PAYMENT_SERVICE_PORT" "Payment service port" "4001"
done

print_section "Upload Service"
prompt "UPLOAD_SERVICE_PORT" "Upload service port" "3001"
while ! validate_port "${CONFIG[UPLOAD_SERVICE_PORT]}"; do
    print_error "Invalid port number"
    prompt "UPLOAD_SERVICE_PORT" "Upload service port" "3001"
done

# Check for port conflicts
if [ "${CONFIG[PAYMENT_SERVICE_PORT]}" = "${CONFIG[UPLOAD_SERVICE_PORT]}" ]; then
    print_error "Payment and upload services cannot use the same port!"
    exit 1
fi

print_section "Inter-Service Communication"
echo -e "How should the upload service connect to the payment service?"
echo -e "${YELLOW}Note: Do NOT include http:// prefix here${NC}\n"

if [ "${CONFIG[NODE_ENV]}" = "production" ]; then
    prompt "PAYMENT_SERVICE_BASE_URL" "Payment service base URL" "localhost:${CONFIG[PAYMENT_SERVICE_PORT]}"
else
    CONFIG["PAYMENT_SERVICE_BASE_URL"]="localhost:${CONFIG[PAYMENT_SERVICE_PORT]}"
    print_info "Using: localhost:${CONFIG[PAYMENT_SERVICE_PORT]}"
fi

CONFIG["PAYMENT_SERVICE_PROTOCOL"]="http"

echo
print_section "Public Upload Service URL"
echo -e "What is the public URL where clients will access your upload service?"
if [ "${CONFIG[NODE_ENV]}" = "production" ]; then
    prompt "UPLOAD_SERVICE_PUBLIC_URL" "Public upload service URL" "https://upload.yourdomain.com"
else
    CONFIG["UPLOAD_SERVICE_PUBLIC_URL"]="http://localhost:${CONFIG[UPLOAD_SERVICE_PORT]}"
    print_info "Using: http://localhost:${CONFIG[UPLOAD_SERVICE_PORT]}"
fi

#####################################################################
# 7. Storage Configuration (MinIO/S3)
#####################################################################

print_header "7. Storage Configuration"

echo -e "The bundler uses S3-compatible object storage for data items.\n"

if confirm "Are you using MinIO (local development)?" "y"; then
    CONFIG["S3_ENDPOINT"]="http://localhost:9000"
    CONFIG["AWS_REGION"]="us-east-1"
    CONFIG["AWS_ACCESS_KEY_ID"]="minioadmin"
    CONFIG["AWS_SECRET_ACCESS_KEY"]="minioadmin"
    print_success "MinIO configuration applied"
else
    prompt "S3_ENDPOINT" "S3 endpoint URL (leave empty for AWS S3)" ""
    prompt "AWS_REGION" "AWS region" "us-east-1"
    prompt "AWS_ACCESS_KEY_ID" "AWS access key ID" ""
    prompt "AWS_SECRET_ACCESS_KEY" "AWS secret access key" "" true
fi

prompt "S3_BUCKET_NAME_RAW_DATA" "S3 bucket for raw data items" "raw-data-items"
prompt "S3_BUCKET_NAME_BACKUP_DATA" "S3 bucket for backup data" "backup-data-items"

#####################################################################
# 8. Redis Configuration
#####################################################################

print_header "8. Redis Configuration"

echo -e "The bundler uses Redis for caching and job queues.\n"

prompt "REDIS_HOST" "Redis host" "localhost"
prompt "REDIS_PORT_CACHE" "Redis cache port" "6379"
prompt "REDIS_PORT_QUEUES" "Redis queue port" "6381"

while ! validate_port "${CONFIG[REDIS_PORT_CACHE]}" || ! validate_port "${CONFIG[REDIS_PORT_QUEUES]}"; do
    print_error "Invalid port numbers"
    prompt "REDIS_PORT_CACHE" "Redis cache port" "6379"
    prompt "REDIS_PORT_QUEUES" "Redis queue port" "6381"
done

#####################################################################
# 9. Security Configuration
#####################################################################

print_header "9. Security Configuration"

echo -e "Generating secure random secrets...\n"

CONFIG["PRIVATE_ROUTE_SECRET"]=$(generate_secret)
print_success "Generated PRIVATE_ROUTE_SECRET (inter-service authentication)"

if [ "${CONFIG[NODE_ENV]}" = "production" ]; then
    echo
    if confirm "Do you want to set a custom secret?" "n"; then
        prompt "PRIVATE_ROUTE_SECRET" "Custom private route secret (64 hex chars)" "${CONFIG[PRIVATE_ROUTE_SECRET]}" true
    fi
fi

#####################################################################
# 10. Optional: Stripe Integration
#####################################################################

print_header "10. Stripe Integration (Optional)"

echo -e "Enable credit card payments via Stripe.\n"

if confirm "Configure Stripe integration?" "n"; then
    echo
    echo -e "Get your Stripe keys from: ${CYAN}https://dashboard.stripe.com/apikeys${NC}\n"

    prompt "STRIPE_SECRET_KEY" "Stripe secret key (sk_...)" ""
    prompt "STRIPE_WEBHOOK_SECRET" "Stripe webhook secret (whsec_...)" ""

    print_success "Stripe configuration added"
else
    CONFIG["STRIPE_SECRET_KEY"]="sk_test_placeholder_key_for_development_only"
    CONFIG["STRIPE_WEBHOOK_SECRET"]=""
    print_info "Stripe disabled (placeholder key set)"
fi

#####################################################################
# 11. Optional: AR.IO Gateway Integration
#####################################################################

print_header "11. AR.IO Gateway Integration (Optional)"

echo -e "Integrate with a local AR.IO Gateway for optical bridging."
echo -e "This allows data items to be posted directly to your gateway.\n"

if confirm "Enable AR.IO Gateway optical bridging?" "n"; then
    echo
    prompt "OPTICAL_BRIDGE_URL" "AR.IO Gateway optical bridge URL" "http://localhost:4000/ar-io/admin/queue-data-item"
    prompt "AR_IO_ADMIN_KEY" "AR.IO Gateway admin key" "" true

    CONFIG["OPTICAL_BRIDGING_ENABLED"]="true"
    print_success "Optical bridging enabled"
else
    CONFIG["OPTICAL_BRIDGING_ENABLED"]="false"
    print_info "Optical bridging disabled"
fi

#####################################################################
# 12. Optional: x402 Payment Protocol
#####################################################################

print_header "12. x402 Payment Protocol (Optional)"

echo -e "Enable x402 USDC payments (Coinbase HTTP 402 standard).\n"

if confirm "Enable x402 USDC payments?" "n"; then
    echo
    echo -e "Select network:"
    select network in "base-mainnet" "base-sepolia" "ethereum-mainnet" "ethereum-sepolia"; do
        CONFIG["X402_NETWORK"]="$network"
        break
    done

    case "${CONFIG[X402_NETWORK]}" in
        base-mainnet)
            CONFIG["USDC_CONTRACT_ADDRESS"]="0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
            ;;
        base-sepolia)
            CONFIG["USDC_CONTRACT_ADDRESS"]="0x036CbD53842c5426634e7929541eC2318f3dCF7e"
            ;;
        ethereum-mainnet)
            CONFIG["USDC_CONTRACT_ADDRESS"]="0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"
            ;;
        ethereum-sepolia)
            CONFIG["USDC_CONTRACT_ADDRESS"]="0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238"
            ;;
    esac

    print_success "x402 enabled on ${CONFIG[X402_NETWORK]}"
    print_info "USDC contract: ${CONFIG[USDC_CONTRACT_ADDRESS]}"
else
    CONFIG["X402_NETWORK"]="base-mainnet"
    CONFIG["USDC_CONTRACT_ADDRESS"]="0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
    print_info "x402 disabled (default values set)"
fi

#####################################################################
# 13. Additional Configuration
#####################################################################

print_header "13. Additional Settings"

print_section "Bundle Metadata"
prompt "APP_NAME" "Application name (shown in bundle tags)" "AR.IO Bundler"

print_section "Upload Limits"
prompt "FREE_UPLOAD_LIMIT" "Free upload limit in bytes (0 = disabled)" "0"

print_section "Allow List"
echo -e "Comma-separated Arweave addresses for free uploads (leave empty to disable):"
prompt "ALLOW_LISTED_ADDRESSES" "Allow listed addresses" ""

#####################################################################
# 14. Generate .env File
#####################################################################

print_header "14. Generating Configuration"

echo -e "Building .env file...\n"

cat > "$TEMP_ENV" << EOF
#############################
# AR.IO BUNDLER CONFIGURATION
#############################
# Generated by setup.sh on $(date)
# Environment: ${CONFIG[NODE_ENV]}

# Environment
NODE_ENV=${CONFIG[NODE_ENV]}

#############################
# PAYMENT SERVICE
#############################
PAYMENT_SERVICE_PORT=${CONFIG[PAYMENT_SERVICE_PORT]}
PAYMENT_DB_NAME=payment_service

# Stripe (for credit card payments)
STRIPE_SECRET_KEY=${CONFIG[STRIPE_SECRET_KEY]}
STRIPE_WEBHOOK_SECRET=${CONFIG[STRIPE_WEBHOOK_SECRET]}

# Blockchain RPC Endpoints
ARWEAVE_GATEWAY=${CONFIG[ARWEAVE_GATEWAY]}
PUBLIC_GATEWAY_FQDNS=${CONFIG[PUBLIC_GATEWAY_FQDNS]}
PUBLIC_ACCESS_GATEWAY=${CONFIG[PUBLIC_ACCESS_GATEWAY]}

# Data Caches & Fast Finality Indexes
DATA_CACHES=${CONFIG[DATA_CACHES]}
FAST_FINALITY_INDEXES=${CONFIG[FAST_FINALITY_INDEXES]}

ETHEREUM_RPC_ENDPOINT=
SOLANA_RPC_ENDPOINT=https://api.mainnet-beta.solana.com
MATIC_RPC_ENDPOINT=https://polygon-rpc.com
KYVE_RPC_ENDPOINT=https://rpc.kyve.network
BASE_ETH_RPC_ENDPOINT=https://mainnet.base.org

#############################
# UPLOAD SERVICE
#############################
UPLOAD_SERVICE_PORT=${CONFIG[UPLOAD_SERVICE_PORT]}
UPLOAD_DB_NAME=upload_service

# Bundle Metadata Tags
APP_NAME=${CONFIG[APP_NAME]}

# Arweave Wallet (for bundle signing)
TURBO_JWK_FILE=${CONFIG[TURBO_JWK_FILE]}
EOF

if [ -n "${CONFIG[RAW_DATA_ITEM_JWK_FILE]}" ]; then
    cat >> "$TEMP_ENV" << EOF
RAW_DATA_ITEM_JWK_FILE=${CONFIG[RAW_DATA_ITEM_JWK_FILE]}
EOF
fi

cat >> "$TEMP_ENV" << EOF

# Upload Features
RAW_DATA_UPLOADS_ENABLED=${CONFIG[RAW_DATA_UPLOADS_ENABLED]}
FREE_UPLOAD_LIMIT=${CONFIG[FREE_UPLOAD_LIMIT]}
ALLOW_LISTED_ADDRESSES=${CONFIG[ALLOW_LISTED_ADDRESSES]}

#############################
# PAYMENT ADDRESSES
#############################
# Blockchain addresses where you receive payments
ARWEAVE_ADDRESS=${CONFIG[ARWEAVE_ADDRESS]}
EOF

[ -n "${CONFIG[ETHEREUM_ADDRESS]}" ] && echo "ETHEREUM_ADDRESS=${CONFIG[ETHEREUM_ADDRESS]}" >> "$TEMP_ENV"
[ -n "${CONFIG[SOLANA_ADDRESS]}" ] && echo "SOLANA_ADDRESS=${CONFIG[SOLANA_ADDRESS]}" >> "$TEMP_ENV"
[ -n "${CONFIG[MATIC_ADDRESS]}" ] && echo "MATIC_ADDRESS=${CONFIG[MATIC_ADDRESS]}" >> "$TEMP_ENV"
[ -n "${CONFIG[BASE_ETH_ADDRESS]}" ] && echo "BASE_ETH_ADDRESS=${CONFIG[BASE_ETH_ADDRESS]}" >> "$TEMP_ENV"
[ -n "${CONFIG[KYVE_ADDRESS]}" ] && echo "KYVE_ADDRESS=${CONFIG[KYVE_ADDRESS]}" >> "$TEMP_ENV"

cat >> "$TEMP_ENV" << EOF

#############################
# DATABASE
#############################
DB_HOST=${CONFIG[DB_HOST]}
DB_PORT=${CONFIG[DB_PORT]}
DB_USER=${CONFIG[DB_USER]}
DB_PASSWORD=${CONFIG[DB_PASSWORD]}
DB_DATABASE=payment_service

# Database connection settings
DB_WRITER_ENDPOINT=${CONFIG[DB_HOST]}:${CONFIG[DB_PORT]}
DB_READER_ENDPOINT=${CONFIG[DB_HOST]}:${CONFIG[DB_PORT]}
MIGRATE_ON_STARTUP=false

#############################
# REDIS
#############################
REDIS_HOST=${CONFIG[REDIS_HOST]}
REDIS_PORT_CACHE=${CONFIG[REDIS_PORT_CACHE]}
REDIS_PORT_QUEUES=${CONFIG[REDIS_PORT_QUEUES]}

#############################
# OBJECT STORAGE (S3/MinIO)
#############################
S3_ENDPOINT=${CONFIG[S3_ENDPOINT]}
AWS_REGION=${CONFIG[AWS_REGION]}
AWS_ACCESS_KEY_ID=${CONFIG[AWS_ACCESS_KEY_ID]}
AWS_SECRET_ACCESS_KEY=${CONFIG[AWS_SECRET_ACCESS_KEY]}
S3_BUCKET_NAME_RAW_DATA=${CONFIG[S3_BUCKET_NAME_RAW_DATA]}
S3_BUCKET_NAME_BACKUP_DATA=${CONFIG[S3_BUCKET_NAME_BACKUP_DATA]}
S3_FORCE_PATH_STYLE=true

#############################
# SERVICE URLS
#############################
# Used by upload service to communicate with payment service
# NOTE: Do NOT include protocol prefix (http://) - it's added via PAYMENT_SERVICE_PROTOCOL
PAYMENT_SERVICE_BASE_URL=${CONFIG[PAYMENT_SERVICE_BASE_URL]}
PAYMENT_SERVICE_PROTOCOL=${CONFIG[PAYMENT_SERVICE_PROTOCOL]}

# Upload service public URL (used in x402 payment requirements)
UPLOAD_SERVICE_PUBLIC_URL=${CONFIG[UPLOAD_SERVICE_PUBLIC_URL]}

#############################
# SECURITY
#############################
# Inter-service authentication secret
PRIVATE_ROUTE_SECRET=${CONFIG[PRIVATE_ROUTE_SECRET]}

#############################
# AR.IO GATEWAY INTEGRATION
#############################
OPTICAL_BRIDGING_ENABLED=${CONFIG[OPTICAL_BRIDGING_ENABLED]}
EOF

if [ "${CONFIG[OPTICAL_BRIDGING_ENABLED]}" = "true" ]; then
    cat >> "$TEMP_ENV" << EOF
OPTICAL_BRIDGE_URL=${CONFIG[OPTICAL_BRIDGE_URL]}
AR_IO_ADMIN_KEY=${CONFIG[AR_IO_ADMIN_KEY]}
EOF
fi

cat >> "$TEMP_ENV" << EOF

#############################
# X402 PAYMENT PROTOCOL
#############################
X402_NETWORK=${CONFIG[X402_NETWORK]}
USDC_CONTRACT_ADDRESS=${CONFIG[USDC_CONTRACT_ADDRESS]}

#############################
# OBSERVABILITY (Optional)
#############################
# OTEL_EXPORTER_OTLP_ENDPOINT=
# OTEL_EXPORTER_OTLP_API_KEY=

# Logging
LOG_LEVEL=info
LOGGER_PROVIDER=winston
EOF

# Copy temp file to actual .env
cp "$TEMP_ENV" "$ENV_FILE"
chmod 600 "$ENV_FILE"

print_success ".env file created: $ENV_FILE"

#####################################################################
# 15. Summary
#####################################################################

print_header "15. Configuration Summary"

echo -e "${BOLD}Environment:${NC} ${CONFIG[NODE_ENV]}"
echo -e "${BOLD}Database:${NC} ${CONFIG[DB_USER]}@${CONFIG[DB_HOST]}:${CONFIG[DB_PORT]}"
echo -e "${BOLD}Payment Service:${NC} Port ${CONFIG[PAYMENT_SERVICE_PORT]}"
echo -e "${BOLD}Upload Service:${NC} Port ${CONFIG[UPLOAD_SERVICE_PORT]}"
echo -e "${BOLD}Arweave Wallet:${NC} ${CONFIG[TURBO_JWK_FILE]}"
echo -e "${BOLD}Primary Gateway:${NC} ${CONFIG[ARWEAVE_GATEWAY]}"
echo -e "${BOLD}Storage:${NC} ${CONFIG[S3_ENDPOINT]}"
echo -e "${BOLD}Redis:${NC} ${CONFIG[REDIS_HOST]}:${CONFIG[REDIS_PORT_CACHE]} (cache), ${CONFIG[REDIS_HOST]}:${CONFIG[REDIS_PORT_QUEUES]} (queues)"

echo
echo -e "${BOLD}Payment Addresses:${NC}"
echo -e "  • Arweave: ${CONFIG[ARWEAVE_ADDRESS]}"
[ -n "${CONFIG[ETHEREUM_ADDRESS]}" ] && echo -e "  • Ethereum: ${CONFIG[ETHEREUM_ADDRESS]}"
[ -n "${CONFIG[SOLANA_ADDRESS]}" ] && echo -e "  • Solana: ${CONFIG[SOLANA_ADDRESS]}"
[ -n "${CONFIG[MATIC_ADDRESS]}" ] && echo -e "  • Polygon: ${CONFIG[MATIC_ADDRESS]}"
[ -n "${CONFIG[BASE_ETH_ADDRESS]}" ] && echo -e "  • Base: ${CONFIG[BASE_ETH_ADDRESS]}"
[ -n "${CONFIG[KYVE_ADDRESS]}" ] && echo -e "  • KYVE: ${CONFIG[KYVE_ADDRESS]}"

echo
echo -e "${BOLD}Optional Features:${NC}"
echo -e "  • Stripe: $([ "${CONFIG[STRIPE_SECRET_KEY]}" != "sk_test_placeholder_key_for_development_only" ] && echo "${GREEN}Enabled${NC}" || echo "${YELLOW}Disabled${NC}")"
echo -e "  • AR.IO Gateway: $([ "${CONFIG[OPTICAL_BRIDGING_ENABLED]}" = "true" ] && echo "${GREEN}Enabled${NC}" || echo "${YELLOW}Disabled${NC}")"
echo -e "  • x402 Payments: ${CONFIG[X402_NETWORK]}"
echo -e "  • Raw Uploads: $([ "${CONFIG[RAW_DATA_UPLOADS_ENABLED]}" = "true" ] && echo "${GREEN}Enabled${NC}" || echo "${YELLOW}Disabled${NC}")"

#####################################################################
# 16. Post-Setup Actions
#####################################################################

print_header "16. Next Steps"

echo
if confirm "Would you like to test database connectivity?" "y"; then
    echo
    print_info "Testing PostgreSQL connection..."

    if command_exists psql; then
        if PGPASSWORD="${CONFIG[DB_PASSWORD]}" psql -h "${CONFIG[DB_HOST]}" -p "${CONFIG[DB_PORT]}" -U "${CONFIG[DB_USER]}" -d postgres -c "SELECT version();" >/dev/null 2>&1; then
            print_success "Database connection successful!"
        else
            print_error "Database connection failed. Please check your credentials."
            print_info "You can test manually with: psql -h ${CONFIG[DB_HOST]} -p ${CONFIG[DB_PORT]} -U ${CONFIG[DB_USER]} -d postgres"
        fi
    else
        print_warning "psql not found. Skipping database connectivity test."
    fi
fi

echo
if confirm "Would you like to run database migrations now?" "y"; then
    echo
    print_info "Running database migrations..."

    cd "$PROJECT_ROOT"

    if command_exists yarn; then
        yarn db:migrate:latest
        print_success "Migrations completed!"
    else
        print_error "yarn not found. Please run migrations manually:"
        echo "  cd $PROJECT_ROOT"
        echo "  yarn db:migrate:latest"
    fi
fi

echo
if confirm "Would you like to start the services now?" "n"; then
    echo
    print_info "Starting services..."

    cd "$PROJECT_ROOT"

    if [ -f "${PROJECT_ROOT}/scripts/start.sh" ]; then
        "${PROJECT_ROOT}/scripts/start.sh"
    else
        print_error "start.sh not found. Please start services manually:"
        echo "  pm2 start ecosystem.config.js"
    fi
fi

#####################################################################
# Completion
#####################################################################

print_header "🎉 Setup Complete!"

echo -e "Your AR.IO Bundler is configured and ready to use!\n"
echo -e "${BOLD}Configuration file:${NC} $ENV_FILE\n"

echo -e "${BOLD}Quick start commands:${NC}"
echo -e "  ${CYAN}yarn install${NC}              # Install dependencies"
echo -e "  ${CYAN}yarn build${NC}                # Build services"
echo -e "  ${CYAN}docker compose up -d${NC}      # Start infrastructure"
echo -e "  ${CYAN}yarn db:migrate:latest${NC}    # Run migrations"
echo -e "  ${CYAN}./scripts/start.sh${NC}        # Start all services"
echo -e "  ${CYAN}./scripts/verify.sh${NC}       # Verify system health\n"

echo -e "${BOLD}Service URLs:${NC}"
echo -e "  Payment Service: ${CYAN}http://localhost:${CONFIG[PAYMENT_SERVICE_PORT]}${NC}"
echo -e "  Upload Service:  ${CYAN}http://localhost:${CONFIG[UPLOAD_SERVICE_PORT]}${NC}"
echo -e "  Bull Board:      ${CYAN}http://localhost:3002/admin/queues${NC}"
echo -e "  MinIO Console:   ${CYAN}http://localhost:9001${NC}\n"

echo -e "${BOLD}Documentation:${NC}"
echo -e "  CLAUDE.md - Project overview and architecture"
echo -e "  packages/payment-service/CLAUDE.md - Payment service details"
echo -e "  packages/upload-service/CLAUDE.md - Upload service details"
echo -e "  docs/ - Additional documentation\n"

print_success "Happy bundling! 🚀"
