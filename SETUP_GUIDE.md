# AR.IO Bundler Setup Guide

Complete guide for setting up your AR.IO Bundler using the comprehensive interactive setup wizard.

## Quick Start

```bash
# Interactive setup (recommended) - Covers 97 essential variables
./scripts/setup-bundler.sh

# Advanced setup - Covers ALL 137 variables
./scripts/setup-bundler.sh --advanced

# Quick setup for development (uses all defaults)
./scripts/setup-bundler.sh --quick

# Update existing configuration
./scripts/setup-bundler.sh --update
```

## What the Setup Script Does

The `setup-bundler.sh` script is a **comprehensive, idempotent** wizard that configures your entire AR.IO Bundler platform from scratch. It covers **all 137 environment variables** with complete AR.IO Gateway integration and full x402 payment protocol support.

### ✅ Prerequisites Verification
- Node.js 18+ installation
- Yarn package manager
- Docker & Docker Compose
- OpenSSL (for secrets)
- PM2 (optional, will install via yarn)

### ✅ Core Configuration (31 Steps)

1. **Prerequisites Check** - Verify all required tools installed
2. **Environment Selection** - Development vs Production mode
3. **Service Ports** - Configure payment (4001) and upload (3001) service ports with conflict detection
4. **Database Configuration** - PostgreSQL connection settings for both databases (payment_service, upload_service)
5. **Security Secrets** - Auto-generate PRIVATE_ROUTE_SECRET, JWT_SECRET with OpenSSL
6. **Arweave Wallet** - Configure bundle signing wallet with automatic address extraction
7. **Payment Addresses** - Setup blockchain addresses (Arweave, Ethereum, Solana, Polygon, Base, KYVE) with validation
8. **Arweave Gateway** - Gateway URLs for pricing, GraphQL, and chunk uploads with vertical integration tips
9. **AR.IO Gateway Integration** - Optical bridging with deployment topology detection and admin key configuration
10. **Storage Configuration** - MinIO (local) or AWS S3 with advanced retry and prefix settings
11. **Redis Configuration** - Dual Redis (cache + queues) with ElastiCache support, TLS, and clustering
12. **Service URLs** - Inter-service communication with protocol selection and public URL configuration
13. **x402 Payment Protocol** - Complete multi-network USDC payment setup:
    - Network selection (Base Mainnet/Sepolia, Ethereum, Polygon)
    - RPC URL configuration per network
    - Minimum confirmations per chain
    - Facilitator URLs with automatic fallback
    - CDP credentials (mainnet only)
    - Browser paywall integration (optional)
    - CoinGecko API for AR/USD conversion
14. **Stripe Integration** - Credit card payments with automatic tax calculation
15. **Cryptocurrency Monitoring** - Direct blockchain payment monitoring with RPC endpoints, confirmations, and polling
16. **ArNS (Arweave Name System)** - Name purchases with signing wallet and process configuration
17. **Optional Features** - Gifting, email notifications (SendGrid/Mandrill), allowlists, rate limiting
18. **Upload Service Advanced** (advanced mode):
    - Data item and bundle size limits
    - ArFS data support
    - Blocklisted addresses and signature types
    - Special address lists (Warp, AO, RedStone, KYVE, ARIO, ANT)
    - Data caches and fast finality indexes
    - Timing configuration (TTLs, thresholds)
    - Filesystem storage and EFS mount points
    - Database migration backfill blocks
19. **Payment Service Advanced** (advanced mode):
    - Chargeback limits
    - Fee-exempt tokens
20. **Worker Configuration** (advanced mode):
    - Worker concurrency settings
    - PM2 instance counts (API, workers)
21. **Monitoring & Observability**:
    - Logging configuration (level, format, stack traces, stream debug)
    - OpenTelemetry tracing with sample rate
    - Prometheus metrics
22. **Application Configuration** - App name and metadata
23. **.env File Generation** - Creates complete configuration file with all 137 variables
24. **Dependency Installation** - yarn install with confirmation
25. **Package Building** - yarn build for all workspace packages
26. **Infrastructure Startup** - Docker Compose (PostgreSQL, Redis, MinIO) with initialization
27. **Database Migrations** - Both payment_service and upload_service databases with full environment passing
28. **Cron Job Setup** - Bundle planning trigger (every 5 minutes) with automatic crontab configuration
29. **Service Startup** - PM2 process management using convenience scripts
30. **Health Verification** - Test all service endpoints with curl health checks
31. **Configuration Summary** - Complete overview with all enabled features and next steps

## Setup Modes

### Interactive Mode (Default) - 97 Variables
```bash
./scripts/setup-bundler.sh
```
- Covers all essential variables (97 out of 137)
- Step-by-step prompts with explanations
- Smart defaults based on environment
- Input validation for every field
- Skips advanced/rarely-changed variables
- **Best for**: First-time setup, production deployments
- **Coverage**: Core features, x402, gateway integration, monitoring basics

### Advanced Mode - ALL 137 Variables
```bash
./scripts/setup-bundler.sh --advanced
```
- **100% coverage** of all environment variables
- Includes advanced configuration sections:
  - S3 retry configuration and key prefixes
  - Redis ElastiCache TLS and password settings
  - Crypto payment confirmations and polling
  - ArNS dust amounts
  - Upload service special address lists (10+ lists)
  - Worker concurrency and PM2 instances
  - Logging configuration (level, format, debug flags)
  - OpenTelemetry sample rate
  - Data caches, indexes, and TTL settings
  - Database backfill blocks
  - Chargeback limits and fee exemptions
- **Best for**: Advanced users, production tuning, comprehensive deployments

### Quick Mode
```bash
./scripts/setup-bundler.sh --quick
```
- Uses all default values
- Minimal prompts (only required fields)
- Fast setup for development
- Assumes MinIO, localhost, development environment
- **Best for**: Local testing, rapid prototyping, CI/CD

### Update Mode
```bash
./scripts/setup-bundler.sh --update
```
- Preserves existing configuration
- Only prompts for missing/changed values
- Backs up existing .env
- **Best for**: Adding new features, reconfiguration, version updates

## 100% Configuration Coverage (137 Variables)

The script now covers **every single variable** in `.env.sample`:

### Core Settings (4 variables)
- `NODE_ENV` - Environment mode
- `MIGRATE_ON_STARTUP` - Auto-migration flag
- `PAYMENT_SERVICE_PORT` - Payment API port
- `UPLOAD_SERVICE_PORT` - Upload API port

### Database (10 variables)
- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`
- `DB_WRITER_ENDPOINT`, `DB_READER_ENDPOINT`
- `PAYMENT_DB_DATABASE`, `UPLOAD_DB_DATABASE`
- `POSTGRES_VERSION`
- `PAYMENT_DB_DATABASE` - payment_service
- `UPLOAD_DB_DATABASE` - upload_service

### Security (2 variables)
- `PRIVATE_ROUTE_SECRET` - Inter-service authentication (auto-generated with OpenSSL)
- `JWT_SECRET` - JWT token signing (auto-generated with OpenSSL)

### Arweave Wallet (4 variables)
- `TURBO_JWK_FILE` - Bundle signing wallet (absolute path validated)
- `RAW_DATA_ITEM_JWK_FILE` - Optional raw data wallet
- `ARWEAVE_ADDRESS` - Extracted from wallet or manually entered
- `ARIO_ADDRESS` - AR.IO token address (same as ARWEAVE_ADDRESS)

### Payment Addresses (7 variables, all optional)
- `ETHEREUM_ADDRESS` - ETH payments with 0x validation
- `SOLANA_ADDRESS` - SOL payments with base58 validation
- `ED25519_ADDRESS` - Ed25519 address (same as SOLANA_ADDRESS)
- `MATIC_ADDRESS` - Polygon payments
- `POL_ADDRESS` - POL address (same as MATIC_ADDRESS)
- `BASE_ETH_ADDRESS` - Base chain payments
- `KYVE_ADDRESS` - KYVE payments (kyve1... format)

### Arweave Gateways (5 variables)
- `ARWEAVE_GATEWAY` - Primary gateway for GraphQL/reads
- `ARWEAVE_UPLOAD_NODE` - Bundle posting endpoint (chunk uploads)
- `PUBLIC_GATEWAY_FQDNS` - Public-facing gateways (comma-separated)
- `PUBLIC_ACCESS_GATEWAY` - Access gateway URL
- `ARWEAVE_NETWORK_REQUEST_TIMEOUT_MS` - Network timeout (advanced mode)

### Storage S3/MinIO (17 variables)
**Core (7):**
- `S3_ENDPOINT` - Storage endpoint
- `S3_REGION` - AWS region
- `S3_ACCESS_KEY_ID` - Access key
- `S3_SECRET_ACCESS_KEY` - Secret key
- `S3_SESSION_TOKEN` - STS session token (optional)
- `S3_FORCE_PATH_STYLE` - Path-style access
- `DATA_ITEM_BUCKET`, `BACKUP_DATA_ITEM_BUCKET` - Bucket names

**Advanced mode (10):**
- `DATA_ITEM_BUCKET_REGION`, `BACKUP_BUCKET_REGION` - Regional configuration
- `S3_RETRY_MAX_ATTEMPTS`, `S3_RETRY_BASE_DELAY_MS` - Retry logic
- `DATA_ITEM_S3_PREFIX`, `MULTIPART_S3_PREFIX`, `BUNDLE_PAYLOAD_S3_PREFIX`, `BUNDLE_TX_S3_PREFIX` - Key prefixes

### Redis (12 variables)
**Core (4):**
- `REDIS_CACHE_HOST`, `REDIS_CACHE_PORT` - Cache Redis
- `REDIS_QUEUE_HOST`, `REDIS_QUEUE_PORT` - Queue Redis

**Aliases (4):**
- `ELASTICACHE_HOST`, `ELASTICACHE_PORT` - ElastiCache aliases
- `REDIS_HOST`, `REDIS_PORT_QUEUES` - Queue aliases

**Advanced mode (4):**
- `ELASTICACHE_NO_CLUSTERING` - Disable clustering
- `ELASTICACHE_PASSWORD` - Redis password
- `ELASTICACHE_USE_TLS` - Enable TLS

### Service URLs (3 variables)
- `PAYMENT_SERVICE_BASE_URL` - Payment service endpoint (NO http:// prefix)
- `PAYMENT_SERVICE_PROTOCOL` - Protocol override (http/https)
- `UPLOAD_SERVICE_PUBLIC_URL` - Public upload URL (for x402)

### x402 Payment Protocol (24+ variables)
**Core (11):**
- `X402_ENABLED` - Enable x402
- `X402_PAYMENT_ADDRESS` - Your USDC receiving address
- `X402_BASE_ENABLED`, `X402_BASE_TESTNET_ENABLED`, `X402_ETH_ENABLED`, `X402_POLYGON_ENABLED` - Network enables
- `X402_FEE_PERCENT` - Your profit margin (default: 15%)
- `X402_PAYMENT_TIMEOUT_MS` - Payment timeout (5 min)
- `X402_FRAUD_TOLERANCE_PERCENT` - Fraud detection tolerance
- `X402_PRICING_BUFFER_PERCENT` - Price volatility buffer
- `X402_DEFAULT_MODE` - hybrid, payg, or topup
- `X402_MINIMUM_PAYMENT_USDC` - Minimum payment amount

**RPC URLs (4):**
- `BASE_MAINNET_RPC_URL` - Base Mainnet RPC
- `BASE_SEPOLIA_RPC_URL` - Base Sepolia RPC
- `ETHEREUM_MAINNET_RPC_URL` - Ethereum RPC
- `POLYGON_MAINNET_RPC_URL` - Polygon RPC

**Confirmations (3):**
- `X402_BASE_MIN_CONFIRMATIONS` - Base confirmations (1)
- `X402_ETH_MIN_CONFIRMATIONS` - Ethereum confirmations (3)
- `X402_POLYGON_MIN_CONFIRMATIONS` - Polygon confirmations (10)

**Facilitators (4):**
- `X402_FACILITATOR_URLS_BASE` - Base Mainnet facilitators
- `X402_FACILITATOR_URLS_BASE_TESTNET` - Base Sepolia facilitators
- `X402_FACILITATOR_URLS_ETH` - Ethereum facilitators
- `X402_FACILITATOR_URLS_POLYGON` - Polygon facilitators

**CDP Credentials (3):**
- `CDP_API_KEY_ID`, `CDP_API_KEY_SECRET` - Coinbase CDP (mainnet only)
- `X_402_CDP_CLIENT_KEY` - Browser paywall integration (optional)

**CoinGecko (2):**
- `COINGECKO_API_KEY` - CoinGecko API key (optional)
- `COINGECKO_API_URL` - CoinGecko API endpoint

### Stripe Payments (4 variables)
- `STRIPE_ENABLED` - Enable Stripe
- `STRIPE_SECRET_KEY` - API key
- `STRIPE_WEBHOOK_SECRET` - Webhook secret
- `TOP_UP_QUOTE_EXPIRATION_MS` - Quote timeout (30 min)
- `ENABLE_AUTO_STRIPE_TAX` - Auto tax calculation (advanced mode)

### Cryptocurrency Monitoring (13 variables)
**Core (1):**
- `CRYPTO_MONITORING_ENABLED` - Enable direct blockchain monitoring

**RPC Endpoints (5):**
- `ETHEREUM_GATEWAY` - Ethereum RPC
- `MATIC_GATEWAY` - Polygon RPC
- `SOLANA_GATEWAY` - Solana RPC
- `KYVE_GATEWAY` - KYVE RPC
- `BASE_ETH_GATEWAY` - Base RPC

**Advanced mode (7):**
- `ARWEAVE_MIN_CONFIRMATIONS`, `ETHEREUM_MIN_CONFIRMATIONS`, `MATIC_MIN_CONFIRMATIONS`, `BASE_ETH_MIN_CONFIRMATIONS`, `DEFAULT_MIN_CONFIRMATIONS` - Confirmation thresholds
- `PAYMENT_TX_POLLING_WAIT_TIME_MS`, `MAX_PAYMENT_TX_POLLING_ATTEMPTS` - Polling config
- `CRYPTO_FUND_EXCLUDED_ADDRESSES` - Excluded addresses

### AR.IO Gateway Integration (4 variables)
- `OPTICAL_BRIDGING_ENABLED` - Enable optical bridging
- `OPTICAL_BRIDGE_URL` - Gateway bridge endpoint (with topology detection)
- `AR_IO_ADMIN_KEY` - Gateway admin key (required)
- `OPTIONAL_OPTICAL_BRIDGE_URLS` - Additional bridges (comma-separated)

### ArNS (6 variables)
- `ARNS_ENABLED` - ArNS name purchases
- `ARIO_SIGNING_JWK` - ARIO signing wallet (JSON string)
- `ARIO_PROCESS_ID` - ARIO process ID
- `CU_URL` - Compute unit URL
- `ARIO_LEASE_NAME_DUST_AMOUNT` - Lease dust (advanced mode)
- `ARIO_PERMA_BUY_NAME_DUST_AMOUNT` - Perma buy dust (advanced mode)

### Gifting & Email (6 variables)
- `GIFTING_ENABLED` - Email gifting
- `GIFTING_EMAIL_ADDRESS` - Gift sender email
- `MAX_GIFT_MESSAGE_LENGTH` - Gift message limit (250)
- `MANDRILL_API_KEY` - Mandrill email provider
- `SENDGRID_API_KEY` - SendGrid email provider

### Upload Service (20+ variables)
**Core (6):**
- `ALLOW_LISTED_ADDRESSES` - Free upload addresses (comma-separated)
- `SKIP_BALANCE_CHECKS` - Skip balance validation (testing)
- `MAX_DATA_ITEM_SIZE` - Max upload size (10 GB default)
- `FREE_UPLOAD_LIMIT` - Free upload limit (517120 bytes)
- `APP_NAME` - Bundle metadata tag

**Advanced mode (14+):**
- `MAX_DATA_ITEM_LIMIT` - Max items per bundle (10000)
- `MAX_BUNDLE_SIZE` - Max bundle size (2 GB)
- `ALLOW_ARFS_DATA` - Allow ArFS data
- `BLOCKLISTED_ADDRESSES` - Blocklisted addresses
- `ALLOW_LISTED_SIGNATURE_TYPES` - Allowed signature types
- `WARP_ADDRESSES`, `AO_ADDRESSES`, `REDSTONE_ORACLE_ADDRESSES`, `KYVE_ADDRESSES` - Special address lists
- `ARIO_MAINNET_PROCESSES`, `ARIO_TESTNET_PROCESSES`, `ANT_REGISTRY_MAINNET_PROCESSES`, `ANT_REGISTRY_TESTNET_PROCESSES` - AR.IO processes
- `FIRST_BATCH_ADDRESSES`, `SKIP_OPTICAL_POST_ADDRESSES` - Priority lists
- `DATA_CACHES`, `FAST_FINALITY_INDEXES` - Cache configuration
- `OVERDUE_DATA_ITEM_THRESHOLD_MS`, `IN_FLIGHT_DATA_ITEM_TTL_SECS`, `QUARANTINED_SMALL_DATAITEM_TTL_SECS` - Timing
- `FS_DATA_PATH`, `TEMP_DIR`, `EFS_MOUNT_POINT` - Filesystem
- `PERMANENT_DATA_ITEM_BACKFILL_START_BLOCK`, `PERMANENT_DATA_ITEM_BACKFILL_END_BLOCK` - Migration

### Payment Service (2 variables, advanced mode)
- `MAX_ALLOWED_CHARGE_BACKS` - Chargeback limit (1)
- `TOKENS_WITHOUT_FEES` - Fee-exempt tokens

### Worker Configuration (4 variables, advanced mode)
- `WORKER_CONCURRENCY_ADMIN_CREDIT` - Admin credit concurrency (2)
- `WORKER_CONCURRENCY_PENDING_TX` - Pending TX concurrency (1)
- `API_INSTANCES` - API PM2 instances (2)
- `WORKER_INSTANCES` - Worker PM2 instances (1)

### Rate Limiting (3 variables)
- `RATE_LIMIT_ENABLED` - Enable rate limiting
- `RATE_LIMIT_MAX_REQUESTS` - Max requests per window (100)
- `RATE_LIMIT_WINDOW_MS` - Time window (60000ms)

### Logging & Monitoring (9 variables)
**Advanced mode logging (5):**
- `LOG_LEVEL` - Log level (info/debug/warn/error)
- `LOG_FORMAT` - Log format (simple/json)
- `LOG_ALL_STACKTRACES` - Log all stack traces
- `DISABLE_LOGS` - Disable logs entirely
- `STREAM_DEBUG` - Stream debugging

**OpenTelemetry (3):**
- `OTEL_ENABLED` - OpenTelemetry tracing
- `OTEL_COLLECTOR_URL` - OTEL collector endpoint
- `OTEL_SAMPLE_RATE` - Sample rate (1 in 200, advanced mode)

**Prometheus (1):**
- `PROMETHEUS_PORT` - Prometheus metrics port (9090)

### Total: 137 Variables ✅

**Interactive mode**: 97 essential variables
**Advanced mode**: All 137 variables

## Input Validation

The script validates all inputs:

✅ **Port Numbers** - Valid range (1-65535), conflict detection
✅ **URLs** - Proper format with http:// or https://
✅ **Ethereum Addresses** - 0x + 40 hex characters
✅ **Arweave Addresses** - 43 character base64url
✅ **Solana Addresses** - 32-44 character base58
✅ **File Paths** - Wallet file existence and absolute paths
✅ **Network Selection** - Valid x402 network choices

## Smart Features

### 🧠 State Detection
- Detects existing `.env` file
- Offers to backup before overwriting
- Loads existing values as defaults
- Skips already-configured sections in update mode

### 🔒 Security
- Auto-generates cryptographically secure secrets
- Sets restrictive file permissions (600) on `.env`
- Warns about production-specific security concerns
- Validates sensitive file paths

### 🎯 Context-Aware Defaults
**Development Mode:**
- Uses `localhost` for all services
- Configures MinIO instead of S3
- Enables Base Sepolia testnet (no CDP needed)
- Relaxed validation

**Production Mode:**
- Prompts for public URLs
- Requires production-grade secrets
- Enables Base Mainnet with CDP credentials
- Strict validation

### 🔄 Idempotent Operations
- Safe to run multiple times
- Won't duplicate cron jobs
- Won't overwrite without confirmation
- Preserves existing PM2 processes

## Prerequisites

Before running the script, ensure you have:

1. **Node.js 18+** - `node --version`
2. **Yarn** - `yarn --version` or install with `corepack enable`
3. **Docker Desktop** - Running and accessible
4. **Docker Compose V2** - `docker compose version`
5. **Arweave Wallet** - JWK file ready to copy

## Step-by-Step Walkthrough

### 1. Preparation

```bash
# Clone repository (if not already)
git clone <repo-url>
cd ar-io-bundler

# Ensure you have an Arweave wallet
ls wallet.json  # Should exist or copy from elsewhere
```

### 2. Run Setup Script

```bash
./scripts/setup-bundler.sh
```

### 3. Follow the Wizard

The script will guide you through **27 steps**. Key decisions:

**Environment** (Step 2)
- Choose `development` for local testing
- Choose `production` for real deployments

**Service Ports** (Step 3)
- Default: Payment=4001, Upload=3001
- Change only if ports are in use

**Database** (Step 4)
- Default: localhost:5432 with turbo_admin
- Uses two databases: payment_service and upload_service

**Wallet** (Step 6)
- ⚠️ **CRITICAL**: Must be absolute path
- Example: `/home/user/ar-io-bundler/wallet.json`
- Validates file exists and extracts address

**Payment Addresses** (Step 7)
- Arweave: Required (extracted from wallet)
- Ethereum: Recommended for x402
- Others: Optional based on payment methods

**x402 Configuration** (Step 12)
- **Recommended for production**
- Network options:
  - Base Sepolia (testnet) - Free, no CDP
  - Base Mainnet - Real USDC, needs CDP
  - Ethereum Mainnet - Real USDC, needs CDP
- Enter your Ethereum address for receiving USDC
- For mainnet: Provide Coinbase CDP credentials

**Stripe** (Step 13)
- Optional credit card processing
- Requires Stripe account and API keys

**Optional Features** (Steps 14-16)
- Enable based on your needs
- All can be skipped for basic functionality

### 4. Automatic Setup

After configuration, the script automatically:

1. ✅ Generates `.env` file
2. ✅ Installs dependencies (`yarn install`)
3. ✅ Builds all packages (`yarn build`)
4. ✅ Starts Docker infrastructure
5. ✅ Runs database migrations
6. ✅ Configures cron job
7. ✅ Starts PM2 services
8. ✅ Verifies health endpoints

### 5. Verification

Check that everything is working:

```bash
# Verify system health
./scripts/verify.sh

# Check service status
pm2 list

# Test endpoints
curl http://localhost:3001/v1/info
curl http://localhost:4001/v1/info

# View logs
pm2 logs
```

## Post-Setup

### Configuration File

Your configuration is saved in `.env`:

```bash
# View configuration
cat .env

# Edit if needed
nano .env

# Restart after changes
./scripts/restart.sh
```

### Service Management

```bash
# View all logs
pm2 logs

# View specific service
pm2 logs upload-api
pm2 logs payment-service

# Monitor resources
pm2 monit

# Restart services
./scripts/restart.sh

# Stop everything
./scripts/stop.sh

# Start again
./scripts/start.sh
```

### Testing the Bundler

```bash
# Check service info
curl http://localhost:3001/v1/info

# Get pricing (1 MB)
curl http://localhost:4001/v1/price/bytes/1000000

# Test x402 payment quote
curl http://localhost:3001/v1/price/x402/data-item/usdc-base/1024

# Upload test file (requires payment)
echo "Hello AR.IO" | curl -X POST http://localhost:3001/v1/tx \
  --data-binary @- \
  -H "Content-Type: application/octet-stream"
```

## Troubleshooting

### Script Fails at Prerequisites

**Problem:** Missing Node.js, Yarn, or Docker

**Solution:**
```bash
# Install Node.js 18+ (use nvm)
nvm install 18
nvm use 18

# Enable Yarn
corepack enable

# Install Docker Desktop
# https://docs.docker.com/get-docker/
```

### Wallet File Not Found

**Problem:** `wallet.json` not found or invalid path

**Solution:**
```bash
# Use ABSOLUTE path
/home/username/ar-io-bundler/wallet.json  # ✅ Correct
./wallet.json                              # ❌ Wrong
```

### Port Already in Use

**Problem:** Port 3001 or 4001 in use

**Solution:**
```bash
# Find what's using the port
lsof -i :3001

# Kill the process or choose different port during setup
```

### Database Migration Fails

**Problem:** Migration errors during Step 23

**Solution:**
```bash
# Check PostgreSQL is running
docker ps | grep postgres

# Check database exists
docker exec -it ar-io-bundler-postgres psql -U turbo_admin -l

# Run migrations manually
cd packages/payment-service
yarn db:migrate:latest

cd ../upload-service
yarn db:migrate:latest
```

### Services Won't Start

**Problem:** PM2 services fail to start

**Solution:**
```bash
# Check logs for errors
pm2 logs --err

# Verify .env file
cat .env | grep -E "PORT|DB_"

# Try starting manually
cd packages/payment-service
NODE_ENV=production PORT=4001 node lib/index.js
```

### x402 Payments Not Working

**Problem:** x402 endpoints return errors

**Solution:**
1. Verify `X402_PAYMENT_ADDRESS` is set correctly
2. For mainnet: Ensure `CDP_API_KEY_ID` and `CDP_API_KEY_SECRET` are valid
3. Check `UPLOAD_SERVICE_PUBLIC_URL` is accessible
4. Test facilitator connectivity

## Re-running Setup

### Update Existing Configuration

```bash
# Update specific sections
./scripts/setup-bundler.sh --update
```

This will:
- Preserve existing values
- Prompt only for missing/new configuration
- Not overwrite working settings

### Complete Reconfiguration

```bash
# Backup current .env
cp .env .env.backup.$(date +%s)

# Run full setup
./scripts/setup-bundler.sh
```

## Additional Resources

- **CLAUDE.md** - Repository overview and architecture
- **packages/payment-service/CLAUDE.md** - Payment service details
- **packages/upload-service/CLAUDE.md** - Upload service details
- **scripts/start.sh** - Service startup script
- **scripts/verify.sh** - Health verification script
- **.env.sample** - Complete configuration reference

## Quick Reference

| Command | Purpose |
|---------|---------|
| `./scripts/setup-bundler.sh` | Interactive setup wizard |
| `./scripts/setup-bundler.sh --quick` | Fast dev setup |
| `./scripts/setup-bundler.sh --update` | Update configuration |
| `./scripts/start.sh` | Start all services |
| `./scripts/stop.sh` | Stop all services |
| `./scripts/restart.sh` | Restart services |
| `./scripts/verify.sh` | Verify system health |
| `pm2 logs` | View all logs |
| `pm2 monit` | Monitor processes |
| `docker compose up -d` | Start infrastructure |
| `docker compose down` | Stop infrastructure |

## Need Help?

If you encounter issues not covered in this guide:

1. Check service logs: `pm2 logs`
2. Check infrastructure: `docker compose ps`
3. Verify configuration: `cat .env`
4. Review error messages carefully
5. Ensure all prerequisites are met
6. Try running setup again with `--update` flag

## Next Steps After Setup

1. ✅ Verify system health: `./scripts/verify.sh`
2. ✅ Test health endpoints
3. ✅ Review generated `.env` file
4. ✅ Set up nginx reverse proxy (for production)
5. ✅ Configure SSL certificates (for production)
6. ✅ Test x402 payment flow
7. ✅ Test data uploads
8. ✅ Monitor logs for errors
9. ✅ Set up PM2 auto-startup: `sudo ./scripts/setup-pm2-startup.sh`
10. ✅ Review security settings

Your AR.IO Bundler is now ready to accept data uploads and process payments! 🚀
