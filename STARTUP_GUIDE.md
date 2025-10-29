# AR.IO Bundler - Complete Startup Guide

This guide covers everything from initial setup to running uploads with the AR.IO Bundler.

---

## Table of Contents

1. [First-Time Setup (Automated)](#first-time-setup-automated)
2. [First-Time Setup (Manual)](#first-time-setup-manual)
3. [Configuration Guide](#configuration-guide)
4. [Starting the Bundler](#starting-the-bundler)
5. [Verifying the System](#verifying-the-system)
6. [Daily Operations](#daily-operations)
7. [AR.IO Gateway Integration](#ario-gateway-integration)
8. [x402 Payment Configuration](#x402-payment-configuration)
9. [Troubleshooting](#troubleshooting)
10. [Port Reference](#port-reference)

---

## First-Time Setup (Automated)

**Recommended for new users** - The automated setup script guides you through the entire process:

```bash
# Clone the repository
git clone https://github.com/vilenarios/ar-io-bundler.git
cd ar-io-bundler

# Run the automated setup script
./scripts/setup-basic.sh
```

The script will:
1. ✅ Check prerequisites (Node.js 18+, Yarn, Docker)
2. ✅ Install dependencies
3. ✅ Create and configure `.env` file
4. ✅ Set up Arweave wallet
5. ✅ Build all packages
6. ✅ Start infrastructure (PostgreSQL, Redis, MinIO)
7. ✅ Run database migrations
8. ✅ Configure bundle planning cron job
9. ✅ Start all services

**After setup completes**, skip to [Verifying the System](#verifying-the-system).

---

## First-Time Setup (Manual)

If you prefer manual setup or need to understand each step:

### 1. Prerequisites

- **Node.js 18+** ([nodejs.org](https://nodejs.org/) or use [nvm](https://github.com/nvm-sh/nvm))
- **Yarn 3.6+** (install with `corepack enable` or `npm install -g yarn`)
- **Docker & Docker Compose V2** ([docs.docker.com](https://docs.docker.com/get-docker/))
- **Arweave Wallet (JWK)** with sufficient AR for bundle fees

Verify prerequisites:
```bash
node --version    # Should be 18+
yarn --version    # Should be 3+
docker --version
docker compose version
```

### 2. Clone and Install

```bash
git clone https://github.com/vilenarios/ar-io-bundler.git
cd ar-io-bundler
yarn install
```

### 3. Configure Environment

```bash
# Create .env from template
cp .env.sample .env

# Generate PRIVATE_ROUTE_SECRET (required for inter-service auth)
openssl rand -hex 32

# Edit .env with your configuration
nano .env  # or use your preferred editor
```

See [Configuration Guide](#configuration-guide) for detailed configuration options.

### 4. Add Arweave Wallet

```bash
# Copy your Arweave wallet to the project root
cp /path/to/your/arweave-wallet.json ./wallet.json

# The wallet must:
# - Be in JWK format (JSON)
# - Have sufficient AR for bundle transaction fees
# - Be referenced in .env as TURBO_JWK_FILE=./wallet.json
```

### 5. Build All Packages

```bash
yarn build
```

### 6. Start Infrastructure

```bash
# Start Docker infrastructure
docker compose up -d postgres redis-cache redis-queues minio

# Wait for services to be ready
sleep 10

# Initialize MinIO buckets
docker compose up minio-init
```

### 7. Run Database Migrations

```bash
./scripts/migrate-all.sh
# Or manually:
# yarn db:migrate:payment
# yarn db:migrate:upload
```

### 8. Configure Bundle Planning Cron Job

The bundler requires a cron job to trigger bundle planning every 5 minutes:

```bash
# Add cron job (replace /path/to with your actual path)
(crontab -l 2>/dev/null | grep -v "trigger-plan" ; \
 echo "*/5 * * * * /path/to/ar-io-bundler/packages/upload-service/cron-trigger-plan.sh >> /tmp/bundle-plan-cron.log 2>&1") | crontab -

# Verify
crontab -l | grep trigger-plan
```

**Without this cron job, uploaded data items will NOT be bundled and posted to Arweave!**

### 9. Start All Services

```bash
./scripts/start.sh
```

---

## Configuration Guide

The bundler uses a **single root `.env` file** that configures both services. The PM2 ecosystem automatically loads this file and applies service-specific overrides.

### Required Configuration

#### 1. Inter-Service Authentication

Generate a secure secret for communication between upload and payment services:

```bash
openssl rand -hex 32
```

Add to `.env`:
```bash
PRIVATE_ROUTE_SECRET=<generated-secret>
```

#### 2. Arweave Wallet

The bundler signs and posts bundles to Arweave using your wallet:

```bash
TURBO_JWK_FILE=./wallet.json
```

Your `wallet.json` must be in the project root and contain a valid Arweave JWK.

#### 3. Database Configuration

```bash
# PostgreSQL (default values work with docker-compose.yml)
DB_HOST=localhost
DB_PORT=5432
DB_USER=turbo_admin
DB_PASSWORD=postgres
```

The services automatically use separate databases:
- `payment_service` - User accounts, payments, balances
- `upload_service` - Data items, bundles, uploads

#### 4. x402 Payment Configuration (IMPORTANT)

For USDC payments via x402 protocol, configure:

```bash
# Enable x402
X402_ENABLED=true

# Network (use base-mainnet for production)
X402_NETWORK=base-mainnet  # or base-sepolia for testing

# Facilitator private key (Ethereum wallet for settling payments)
X402_FACILITATOR_PRIVATE_KEY=0x...  # DO NOT commit to git!

# Base Mainnet RPC (QuickNode recommended for reliability)
BASE_ETH_GATEWAY=https://xxx.base-mainnet.quiknode.pro/yyy/

# USDC Contract Addresses (set automatically based on X402_NETWORK)
# Base Mainnet: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
# Base Sepolia: 0x036CbD53842c5426634e7929541eC2318f3dCF7e
```

**Getting a QuickNode Endpoint:**
1. Sign up at [quicknode.com](https://www.quicknode.com/)
2. Create a Base Mainnet endpoint
3. Copy the HTTP URL to `BASE_ETH_GATEWAY`

See [x402 Payment Configuration](#x402-payment-configuration) for details.

#### 5. Blockchain RPC Endpoints (for crypto deposits)

```bash
# For verifying crypto payments
ARWEAVE_GATEWAY=https://arweave.net
ETHEREUM_GATEWAY=https://your-eth-rpc-endpoint
SOLANA_GATEWAY=https://api.mainnet-beta.solana.com
MATIC_GATEWAY=https://polygon-rpc.com
KYVE_GATEWAY=https://rpc.kyve.network
```

### Optional Configuration

#### Stripe Payments (Credit Cards)

```bash
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

#### AR.IO Gateway Integration (Optical Bridging)

```bash
OPTICAL_BRIDGING_ENABLED=true
OPTICAL_BRIDGE_URL=http://localhost:4000/ar-io/admin/queue-data-item
AR_IO_ADMIN_KEY=your-gateway-admin-key
```

See [AR.IO Gateway Integration](#ario-gateway-integration) for setup.

#### Upload Limits and Features

```bash
# Allow specific addresses to upload for free
ALLOW_LISTED_ADDRESSES=address1,address2,address3

# Skip balance checks (WARNING: allows free uploads for everyone!)
SKIP_BALANCE_CHECKS=false

# Maximum data item size (default: 10 GiB)
MAX_DATA_ITEM_SIZE=10737418240
```

---

## Starting the Bundler

### Quick Start (Two Commands)

```bash
./scripts/start.sh    # Start everything
./scripts/verify.sh   # Verify all systems are healthy
```

### What Happens When You Start

The `start.sh` script:
1. ✅ Checks Docker infrastructure (starts if needed)
2. ✅ Runs database migrations (if infrastructure was just started)
3. ✅ Verifies services are built (builds if needed)
4. ✅ Checks for `wallet.json` and `.env` files
5. ✅ Stops any existing PM2 processes
6. ✅ Starts all services via `ecosystem.config.js`:
   - `payment-service` (2 instances, cluster mode, port 4001)
   - `upload-api` (2 instances, cluster mode, port 3001)
   - `payment-workers` (1 instance, fork mode)
   - `upload-workers` (1 instance, fork mode)
   - `bull-board` (1 instance, fork mode, port 3002)
7. ✅ Saves PM2 configuration
8. ✅ Displays service URLs and helpful commands

---

## Verifying the System

After starting, verify everything is working:

```bash
./scripts/verify.sh
```

The verification script checks:
- ✅ All Docker containers are running and healthy
- ✅ All PM2 processes are online
- ✅ HTTP endpoints are responding
- ✅ Services can communicate (Redis, inter-service)
- ✅ Cron job is configured
- ✅ No critical errors in logs

**Exit codes:**
- `0` = All checks passed
- `1` = One or more checks failed

### Manual Verification

```bash
# Check PM2 services
pm2 list

# Check Docker infrastructure
docker compose ps

# Test endpoints
curl http://localhost:3001/health  # Upload service
curl http://localhost:4001/health  # Payment service
curl http://localhost:4001/v1/price/bytes/1000000  # Pricing

# View logs
pm2 logs
pm2 logs upload-api
pm2 logs upload-workers
```

---

## Daily Operations

### Stop Everything

```bash
./scripts/stop.sh
```

Stops PM2 processes and Docker infrastructure.

**To keep Docker running** (faster restarts):
```bash
./scripts/stop.sh --services-only
```

### Restart After Code Changes

```bash
# Rebuild services
yarn build

# Restart services
./scripts/restart.sh
```

### Restart Everything (Including Docker)

```bash
./scripts/restart.sh --with-docker
```

### Monitor Services

```bash
# View all logs
pm2 logs

# View specific service logs
pm2 logs payment-service
pm2 logs upload-api
pm2 logs upload-workers

# Monitor resources
pm2 monit

# View cron job logs
tail -f /tmp/bundle-plan-cron.log
```

### Access Web Interfaces

- **Bull Board** (Queue Monitoring): http://localhost:3002/admin/queues
- **MinIO Console** (Object Storage): http://localhost:9001 (login: minioadmin / minioadmin123)

---

## AR.IO Gateway Integration

The bundler can integrate with an [AR.IO Gateway](https://github.com/ar-io/ar-io-node) for optimistic caching ("optical bridging"). This allows uploaded data items to be cached by the gateway immediately, before they're permanently posted to Arweave.

### Prerequisites

- AR.IO Gateway running on the same machine
- Gateway admin API key

### Configuration

1. **Set gateway URL in `.env`:**

```bash
OPTICAL_BRIDGING_ENABLED=true
OPTICAL_BRIDGE_URL=http://localhost:4000/ar-io/admin/queue-data-item
AR_IO_ADMIN_KEY=your-gateway-admin-key-here
```

2. **Port Allocation:**

If running the gateway on the same machine, it uses these ports:
- **3000** - Gateway data serving
- **4000** - Gateway core API
- **5050** - Gateway admin API

The bundler uses:
- **3001** - Upload Service
- **4001** - Payment Service
- **3002** - Bull Board

### Getting the Admin Key

The AR.IO Gateway admin key is typically set in the gateway's `.env` file as `ADMIN_API_KEY`.

### How It Works

When optical bridging is enabled:
1. User uploads data item → Upload service
2. Upload service queues item for optical posting
3. Optical post job sends item to AR.IO Gateway admin API
4. Gateway caches the item and serves it immediately
5. Bundler later posts the bundle to Arweave for permanence

This provides:
- ✅ Instant data availability
- ✅ Fast retrieval from gateway cache
- ✅ Permanent storage on Arweave

---

## x402 Payment Configuration

The bundler implements the [x402 payment protocol](https://github.com/coinbase/x402) for HTTP 402 Payment Required workflows with gasless USDC payments.

### Why x402?

- **AI Agent Payments**: Designed for autonomous agents to pay for services
- **Gasless Transfers**: Uses EIP-3009 (TransferWithAuthorization) - users don't pay gas
- **Instant Settlement**: Payments settled on-chain immediately
- **USDC Payments**: Stablecoin pricing, no volatility

### Required Configuration

#### 1. Enable x402

```bash
X402_ENABLED=true
```

#### 2. Choose Network

**Production (Base Mainnet):**
```bash
X402_NETWORK=base-mainnet
BASE_ETH_GATEWAY=https://xxx.base-mainnet.quiknode.pro/yyy/
```

**Testing (Base Sepolia):**
```bash
X402_NETWORK=base-sepolia
BASE_ETH_GATEWAY=https://xxx.base-sepolia.quiknode.pro/yyy/
```

#### 3. Facilitator Private Key

The facilitator is an Ethereum wallet that settles x402 payments by calling `receiveWithAuthorization()` on the USDC contract:

```bash
# Generate new wallet or use existing
X402_FACILITATOR_PRIVATE_KEY=0x...  # NEVER commit to git!
```

**Security:**
- Store in `.env` file (git ignored)
- Consider using environment variables or secret management in production
- The facilitator wallet doesn't need ETH (gasless settlement)
- Only the bundler operator controls this key

#### 4. RPC Endpoint

x402 requires a reliable RPC endpoint for Base network:

**QuickNode (Recommended):**
```bash
BASE_ETH_GATEWAY=https://xxx.base-mainnet.quiknode.pro/yyy/
```

**Alternative:**
```bash
BASE_ETH_GATEWAY=https://mainnet.base.org  # Public endpoint (may be rate-limited)
```

### USDC Contract Addresses

Set automatically based on `X402_NETWORK`:
- **Base Mainnet**: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- **Base Sepolia**: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`

### Testing x402 Payments

1. **Get a Price Quote:**
```bash
# Returns 402 with payment requirements
curl "http://localhost:4001/v1/x402/price/3/0xYourEthereumAddress?byteCount=1024"
```

2. **Upload with x402 Payment:**

See `docs/X402_INTEGRATION_GUIDE.md` for complete examples in JavaScript, Python, and cURL.

### x402 Environment Variables Reference

```bash
# Core x402 Configuration
X402_ENABLED=true                                    # Enable x402 protocol
X402_NETWORK=base-mainnet                           # Network: base-mainnet or base-sepolia
X402_FACILITATOR_PRIVATE_KEY=0x...                 # Ethereum private key for settlement

# RPC Endpoints
BASE_ETH_GATEWAY=https://xxx.base-mainnet.quiknode.pro/yyy/  # Base network RPC
ETHEREUM_GATEWAY=https://xxx.ethereum-mainnet.quiknode.pro/yyy/  # Optional: Ethereum support
POLYGON_GATEWAY=https://polygon-rpc.com             # Optional: Polygon support

# Advanced x402 Options (optional)
X402_FRAUD_TOLERANCE_PERCENT=5                     # Fraud detection tolerance (default: 5%)
X402_PAYMENT_TIMEOUT=300                            # Payment authorization timeout (seconds)
```

---

## Troubleshooting

### "Port already in use"

**Problem:** Service fails to start with EADDRINUSE error.

**Solution:**
```bash
# Check what's using the ports
ss -tlnp | grep :3001
ss -tlnp | grep :4001

# Stop existing services
pm2 stop all
./scripts/stop.sh

# Restart
./scripts/start.sh
```

### "Docker not running"

**Problem:** Infrastructure check fails.

**Solution:**
```bash
# Start Docker service
sudo systemctl start docker

# Start infrastructure
docker compose up -d

# Restart bundler
./scripts/start.sh
```

### "wallet.json not found"

**Problem:** Upload service won't start without Arweave wallet.

**Solution:**
```bash
# Copy your wallet to project root
cp /path/to/your/wallet.json ./wallet.json

# Verify
ls -la wallet.json

# Restart
./scripts/restart.sh
```

### "Database migrations failed"

**Problem:** Migrations fail during startup.

**Solution:**
```bash
# Check PostgreSQL is running
docker ps | grep postgres

# Check database credentials in .env
grep DB_ .env

# Try manual migration
./scripts/migrate-all.sh

# View migration logs
docker compose logs postgres
```

### "Workers not processing uploads"

**Problem:** Uploads succeed but never get bundled.

**Root Causes:**
1. Cron job not configured
2. Workers not running
3. Queue errors

**Solution:**
```bash
# 1. Check cron job
crontab -l | grep trigger-plan
# If missing, add it:
(crontab -l 2>/dev/null | grep -v "trigger-plan" ; \
 echo "*/5 * * * * $(pwd)/packages/upload-service/cron-trigger-plan.sh >> /tmp/bundle-plan-cron.log 2>&1") | crontab -

# 2. Check workers are running
pm2 list | grep workers

# 3. Manual trigger
cd packages/upload-service
./cron-trigger-plan.sh

# 4. Check worker logs
pm2 logs upload-workers

# 5. Check Bull Board
# Open http://localhost:3002/admin/queues
# Look for jobs in "waiting", "active", or "failed" states
```

### "x402 payments failing"

**Problem:** x402 uploads return 422 or payment verification fails.

**Causes:**
1. Missing RPC endpoint
2. Invalid facilitator private key
3. Wrong network configuration
4. Insufficient USDC allowance

**Solution:**
```bash
# 1. Check x402 configuration
grep X402 .env

# 2. Verify RPC endpoint is accessible
curl $BASE_ETH_GATEWAY

# 3. Check payment service logs
pm2 logs payment-service | grep x402

# 4. Test price quote endpoint
curl "http://localhost:4001/v1/x402/price/3/0xYourAddress?byteCount=1000"
```

### "Insufficient balance for bundles"

**Problem:** Bundles fail to post due to insufficient AR.

**Solution:**
```bash
# 1. Check wallet balance
# View your wallet address
cat wallet.json | grep -o '"n":"[^"]*"' | head -1

# 2. Check bundle logs
pm2 logs upload-workers | grep -i "insufficient\|balance"

# 3. Add AR to your wallet
# Send AR to the wallet address

# 4. Retry failed bundles
# Failed bundles will retry automatically on next plan cycle
```

### "MinIO buckets not initialized"

**Problem:** Upload service can't write to MinIO.

**Solution:**
```bash
# Reinitialize buckets
docker compose up minio-init

# Verify buckets exist
docker exec ar-io-bundler-minio mc ls local/

# Should show:
# raw-data-items/
# backup-data-items/

# Restart upload service
pm2 restart upload-api upload-workers
```

### Full System Reset

If all else fails, perform a complete reset:

```bash
# 1. Stop everything
./scripts/stop.sh

# 2. Remove all Docker volumes (WARNING: deletes all data)
docker compose down -v

# 3. Clear PM2
pm2 kill

# 4. Remove build artifacts
rm -rf packages/*/lib

# 5. Start fresh
yarn build
./scripts/start.sh

# 6. Verify
./scripts/verify.sh
```

---

## Port Reference

| Service | Port | Purpose |
|---------|------|---------|
| **AR.IO Bundler** |
| Upload Service | 3001 | Upload API endpoints |
| Bull Board | 3002 | Queue monitoring dashboard |
| Payment Service | 4001 | Payment & balance API |
| | |
| **Infrastructure** |
| PostgreSQL | 5432 | Database server |
| Redis Cache | 6379 | ElastiCache/Redis cache |
| Redis Queues | 6381 | BullMQ job queues |
| MinIO API | 9000 | S3-compatible object storage |
| MinIO Console | 9001 | MinIO web interface |
| | |
| **AR.IO Gateway** (if co-located) |
| Gateway Data | 3000 | Data serving (ar:// protocol) |
| Gateway Core | 4000 | Core API and admin endpoints |
| Gateway Admin | 5050 | Admin API |

**Note:** If running the AR.IO Gateway on the same machine, ensure the bundler ports don't conflict.

---

## Additional Resources

- **[Main README](README.md)** - Project overview and quick start
- **[Architecture Guide](docs/architecture/ARCHITECTURE.md)** - Deep dive into system design
- **[X402 Integration Guide](docs/X402_INTEGRATION_GUIDE.md)** - Complete x402 payment documentation
- **[API Reference](docs/api/README.md)** - REST API endpoints
- **[Payment Service Guide](packages/payment-service/CLAUDE.md)** - Payment service details
- **[Upload Service Guide](packages/upload-service/CLAUDE.md)** - Upload service details

---

## Summary of Scripts

| Script | Purpose | When to Use |
|--------|---------|-------------|
| `./scripts/setup-basic.sh` | Complete first-time setup | Once, when setting up the bundler |
| `./scripts/start.sh` | Start all services | Every time you want to start the bundler |
| `./scripts/stop.sh` | Stop all services | When done working or before system shutdown |
| `./scripts/restart.sh` | Restart services | After code changes or configuration updates |
| `./scripts/verify.sh` | Verify system health | After starting, to ensure everything works |

---

**Built with ❤️ for the Arweave ecosystem**
