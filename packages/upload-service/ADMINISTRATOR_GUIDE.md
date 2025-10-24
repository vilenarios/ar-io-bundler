# Turbo Platform - Complete Administrator Setup Guide

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Prerequisites](#prerequisites)
4. [Infrastructure Setup](#infrastructure-setup)
5. [Payment Service Setup](#payment-service-setup)
6. [Upload Service Setup](#upload-service-setup)
7. [AR.IO Gateway Integration](#ario-gateway-integration)
8. [Service Communication](#service-communication)
9. [Testing and Validation](#testing-and-validation)
10. [Production Deployment](#production-deployment)
11. [Monitoring and Maintenance](#monitoring-and-maintenance)
12. [Troubleshooting](#troubleshooting)

---

## Overview

Turbo is a robust, data bundling platform that packages [ANS-104](https://github.com/ArweaveTeam/arweave-standards/blob/master/ans/ANS-104.md) data items for reliable delivery to Arweave. The platform consists of two primary microservices that work together to provide a complete upload and payment solution.

### The Two Services

#### Turbo Payment Service
**Purpose:** Handles payment processing, credit management, and blockchain payment gateway integrations.

**Key Features:**
- Cryptocurrency payment processing (Arweave, Ethereum, Solana, Matic, KYVE, Base-ETH, ARIO)
- Stripe payment integration
- User balance and credit management
- ArNS (Arweave Name System) purchase handling
- Promotional code support
- Payment receipt generation

**Port:** 4000 (default)

#### Turbo Upload Service
**Purpose:** Accepts data item uploads and manages asynchronous fulfillment of data delivery to Arweave.

**Key Features:**
- Single and multipart data item uploads
- Asynchronous job processing via BullMQ
- MinIO object storage integration
- PostgreSQL offset storage
- PM2-managed workers
- AR.IO Gateway optimistic caching
- Vertical architecture integration

**Port:** 3001 (default)

### How They Work Together

```
┌──────────────────────────────────────────────────────────────────┐
│                        User Request Flow                         │
└──────────────────────────────────────────────────────────────────┘

1. User → Payment Service → Credit Account
2. User → Upload Service → Check Balance → Upload Data
3. Upload Service → Payment Service → Deduct Credits
4. Upload Service → MinIO → Store Data Item
5. Upload Service → BullMQ → Enqueue Job
6. Workers → Process → Post to Arweave
7. (Optional) Upload Service → AR.IO Gateway → Optimistic Cache
```

---

## Architecture

### Complete System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Turbo Platform Server                            │
│                                                                         │
│  ┌──────────────┐         ┌──────────────┐         ┌──────────────┐   │
│  │   Payment    │◄────────┤    Upload    │◄────────┤   AR.IO      │   │
│  │   Service    │  JWT    │   Service    │ Optical │   Gateway    │   │
│  │  (Port 4000) │  Auth   │  (Port 3001) │ Bridge  │  (Port 3000) │   │
│  └──────┬───────┘         └──────┬───────┘         └──────▲───────┘   │
│         │                        │                         │           │
│         │                        ▼                         │           │
│         │                 ┌──────────────┐                 │           │
│         │                 │   Workers    │                 │           │
│         │                 │    (PM2)     │                 │           │
│         │                 └──────┬───────┘                 │           │
│         │                        │                         │           │
│         ▼                        ▼                         │           │
│  ┌──────────────────────────────────────────┐              │           │
│  │         PostgreSQL (5432)                │◄─────────────┘           │
│  │  - payment_service DB                    │  Offset                  │
│  │  - upload_service DB                     │  Queries                 │
│  │    • new_data_item                       │                          │
│  │    • data_item_offsets                   │                          │
│  │    • config                              │                          │
│  └──────────────────────────────────────────┘                          │
│         │                        │                         │           │
│         │                        ▼                         │           │
│         │                 ┌──────────────┐         ┌───────────────┐  │
│         │                 │Redis Queues  │         │     MinIO     │  │
│         │                 │ (Port 6381)  │         │  (9000-9001)  │◄─┤
│         │                 │  BullMQ (11  │         │               │  │
│         │                 │   queues)    │         │ • raw-data    │  │
│         │                 └──────────────┘         │ • backups     │  │
│         │                                          └───────────────┘  │
│         ▼                                                             │
│  ┌──────────────┐                                                    │
│  │Redis Cache   │                                                    │
│  │ (Port 6379)  │                                                    │
│  └──────────────┘                                                    │
│                                                                       │
└─────────────────────────────────────────────────────────────────────────┘
```

### Technology Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Runtime** | Node.js 18+ | JavaScript runtime |
| **Framework** | Koa | HTTP server framework |
| **Database** | PostgreSQL 16+ | Relational data storage |
| **Queue System** | BullMQ + Redis | Asynchronous job processing |
| **Object Storage** | MinIO | S3-compatible file storage |
| **Process Manager** | PM2 | Worker process management |
| **Cache** | Redis | Application caching |
| **Payments** | Stripe | Credit card processing |

---

## Prerequisites

### System Requirements

**Minimum Requirements:**
- **CPU:** 4 cores
- **RAM:** 8 GB
- **Storage:** 100 GB SSD
- **OS:** Linux (Ubuntu 20.04+ or similar)

**Recommended for Production:**
- **CPU:** 8+ cores
- **RAM:** 16+ GB
- **Storage:** 500 GB SSD
- **OS:** Ubuntu 22.04 LTS

### Required Software

Install the following on your system:

```bash
# Node.js (via nvm recommended)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 18
nvm use 18

# Yarn
npm install -g yarn

# PM2 (for production)
npm install -g pm2

# Docker & Docker Compose
# Follow official Docker installation for your OS
# https://docs.docker.com/engine/install/

# PostgreSQL Client (for management)
sudo apt-get install postgresql-client

# Git
sudo apt-get install git
```

### Optional Software

```bash
# For monitoring
npm install -g pm2-logrotate

# For SSL/TLS
sudo apt-get install certbot python3-certbot-nginx
```

---

## Infrastructure Setup

### 1. PostgreSQL Setup

**Option A: Docker (Development)**

```bash
# Upload service includes PostgreSQL in docker-compose
cd turbo-upload-service
yarn db:up
```

**Option B: System Installation (Production)**

```bash
# Install PostgreSQL
sudo apt-get update
sudo apt-get install postgresql-16

# Start service
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Create databases and users
sudo -u postgres psql << EOF
CREATE DATABASE payment_service;
CREATE DATABASE upload_service;
CREATE USER turbo_admin WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE payment_service TO turbo_admin;
GRANT ALL PRIVILEGES ON DATABASE upload_service TO turbo_admin;
EOF
```

**Verify Installation:**

```bash
psql -h localhost -U turbo_admin -d payment_service -c "SELECT version();"
psql -h localhost -U turbo_admin -d upload_service -c "SELECT version();"
```

### 2. Redis Setup

You need **two Redis instances**:
1. **Port 6379** - Cache for upload service
2. **Port 6381** - BullMQ queues for upload service

**Option A: Docker (Development)**

```bash
# Included in upload-service docker-compose
cd turbo-upload-service
docker compose up redis redis-queues -d
```

**Option B: System Installation (Production)**

```bash
# Install Redis
sudo apt-get install redis-server

# Configure cache instance (6379)
sudo systemctl start redis-server
sudo systemctl enable redis-server

# Configure queue instance (6381)
# Create second instance config
sudo cp /etc/redis/redis.conf /etc/redis/redis-queues.conf

# Edit /etc/redis/redis-queues.conf
sudo nano /etc/redis/redis-queues.conf
# Change: port 6381

# Create systemd service
sudo nano /etc/systemd/system/redis-queues.service
```

**redis-queues.service:**
```ini
[Unit]
Description=Redis Queue Server
After=network.target

[Service]
Type=forking
ExecStart=/usr/bin/redis-server /etc/redis/redis-queues.conf
ExecStop=/bin/kill -s TERM $MAINPID
PIDFile=/var/run/redis/redis-queues.pid
User=redis
Group=redis

[Install]
WantedBy=multi-user.target
```

```bash
# Start queue instance
sudo systemctl daemon-reload
sudo systemctl start redis-queues
sudo systemctl enable redis-queues
```

**Verify Installation:**

```bash
# Test cache instance
redis-cli -p 6379 ping  # Should return PONG

# Test queue instance
redis-cli -p 6381 ping  # Should return PONG
```

### 3. MinIO Setup

MinIO provides S3-compatible object storage for data items.

**Option A: Docker (Development)**

```bash
# Included in upload-service docker-compose
cd turbo-upload-service
docker compose up minio minio-init -d
```

**Option B: System Installation (Production)**

```bash
# Download MinIO
wget https://dl.min.io/server/minio/release/linux-amd64/minio
chmod +x minio
sudo mv minio /usr/local/bin/

# Create data directory
sudo mkdir -p /mnt/minio/data
sudo chown -R $USER:$USER /mnt/minio

# Create systemd service
sudo nano /etc/systemd/system/minio.service
```

**minio.service:**
```ini
[Unit]
Description=MinIO Object Storage
After=network.target

[Service]
Type=simple
User=minio
Group=minio
Environment="MINIO_ROOT_USER=minioadmin"
Environment="MINIO_ROOT_PASSWORD=minioadmin123"
ExecStart=/usr/local/bin/minio server /mnt/minio/data --console-address ":9001"
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
# Create minio user
sudo useradd -r -s /bin/false minio
sudo chown -R minio:minio /mnt/minio

# Start service
sudo systemctl daemon-reload
sudo systemctl start minio
sudo systemctl enable minio
```

**Create Buckets:**

```bash
# Install MinIO client
wget https://dl.min.io/client/mc/release/linux-amd64/mc
chmod +x mc
sudo mv mc /usr/local/bin/

# Configure alias
mc alias set local http://localhost:9000 minioadmin minioadmin123

# Create buckets
mc mb local/raw-data-items
mc mb local/backup-data-items

# Set public read access (optional)
mc anonymous set download local/raw-data-items
mc anonymous set download local/backup-data-items
```

**Verify Installation:**

```bash
# List buckets
mc ls local/

# Access console
open http://localhost:9001
# Login: minioadmin / minioadmin123
```

### 4. AR.IO Gateway Setup (Optional)

**Purpose:** Enables optimistic caching - users can access uploaded data immediately before it's posted to Arweave.

**Installation:**

Follow the official AR.IO Gateway installation guide:
https://ar.io/docs/

**Quick Setup:**

```bash
# Clone AR.IO Gateway
git clone https://github.com/ar-io/ar-io-node.git
cd ar-io-node

# Configure
cp .env.sample .env
# Edit .env with your configuration

# Start with Docker
docker compose up -d
```

**Verify Installation:**

```bash
# Check Envoy (gateway)
curl http://localhost:3000/ar-io/info

# Check Core API
curl http://localhost:4000/ar-io/healthcheck
```

**Configure for Turbo Integration:**

Edit AR.IO Gateway `.env`:

```bash
# PostgreSQL access (for offset lookups)
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=upload_service
POSTGRES_USER=turbo_admin
POSTGRES_PASSWORD=your_secure_password

# MinIO access (for data item storage)
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin123
S3_BUCKET=raw-data-items

# Enable data item caching
ENABLE_DATA_ITEM_CACHE=true
DATA_ITEM_SOURCE=s3
```

---

## Payment Service Setup

### 1. Clone and Install

```bash
cd /opt
sudo git clone https://github.com/ardriveapp/turbo-payment-service.git
cd turbo-payment-service
sudo chown -R $USER:$USER .

# Install dependencies
nvm use
yarn install
```

### 2. Configure Environment

```bash
cp .env.sample .env
nano .env
```

**Critical Environment Variables:**

```bash
# Application
NODE_ENV=production
PORT=4000
MIGRATE_ON_STARTUP=true

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=payment_service
DB_USER=turbo_admin
DB_PASSWORD=your_secure_password

# Stripe (for credit card payments)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Inter-service Authentication
PRIVATE_ROUTE_SECRET=generate_random_secure_string_here

# Blockchain RPC Endpoints
ARWEAVE_GATEWAY=https://arweave.net
ETHEREUM_RPC_ENDPOINT=https://mainnet.infura.io/v3/YOUR_KEY
SOLANA_RPC_ENDPOINT=https://api.mainnet-beta.solana.com
MATIC_RPC_ENDPOINT=https://polygon-rpc.com
```

**Generate Secrets:**

```bash
# Generate PRIVATE_ROUTE_SECRET
openssl rand -hex 32
```

### 3. Database Migration

```bash
# Build TypeScript
yarn build

# Run migrations
yarn db:migrate:latest
```

**Verify Migration:**

```bash
psql -h localhost -U turbo_admin -d payment_service -c "\dt"
# Should show tables: user_address, payment_receipt, etc.
```

### 4. Start Service

**Development:**

```bash
yarn start:watch
```

**Production with PM2:**

Create `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [{
    name: 'payment-service',
    script: './lib/server.js',
    instances: 2,
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 4000
    },
    error_file: './logs/payment-service-error.log',
    out_file: './logs/payment-service-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s'
  }]
};
```

```bash
# Create logs directory
mkdir logs

# Start with PM2
pm2 start ecosystem.config.js
pm2 save
pm2 startup  # Follow instructions
```

### 5. Verify Service

```bash
# Health check
curl http://localhost:4000/v1/health

# Check logs
pm2 logs payment-service
```

---

## Upload Service Setup

### 1. Clone and Install

```bash
cd /opt
sudo git clone https://github.com/ardriveapp/turbo-upload-service.git
cd turbo-upload-service
sudo chown -R $USER:$USER .

# Install dependencies
nvm use
yarn install
```

### 2. Configure Environment

```bash
cp .env.sample .env
nano .env
```

**Critical Environment Variables:**

```bash
# ================================
# APPLICATION CONFIGURATION
# ================================
NODE_ENV=production
PORT=3001
MIGRATE_ON_STARTUP=true

# ================================
# PAYMENT SERVICE INTEGRATION
# ================================
PAYMENT_SERVICE_BASE_URL=http://localhost:4000
PRIVATE_ROUTE_SECRET=same_as_payment_service_secret

# ================================
# DATABASE
# ================================
DB_WRITER_ENDPOINT=localhost
DB_READER_ENDPOINT=localhost
DB_PORT=5432
DB_NAME=upload_service
DB_USER=turbo_admin
DB_PASSWORD=your_secure_password

# ================================
# REDIS CONFIGURATION
# ================================
# Cache (port 6379)
ELASTICACHE_HOST=localhost
ELASTICACHE_PORT=6379
ELASTICACHE_NO_CLUSTERING=true

# BullMQ Queues (port 6381)
REDIS_HOST=localhost
REDIS_PORT_QUEUES=6381

# ================================
# MINIO (S3-COMPATIBLE STORAGE)
# ================================
S3_ENDPOINT=http://localhost:9000
S3_FORCE_PATH_STYLE=true
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin123
S3_REGION=us-east-1
DATA_ITEM_BUCKET=raw-data-items
BACKUP_DATA_ITEM_BUCKET=backup-data-items

# ================================
# ARWEAVE WALLET
# ================================
# Path to JWK file for bundle signing
TURBO_JWK_FILE=/opt/turbo-upload-service/wallet.json

# ================================
# AR.IO GATEWAY INTEGRATION
# ================================
# Enable optimistic caching
OPTICAL_BRIDGING_ENABLED=true
OPTICAL_BRIDGE_URL=http://localhost:4000/ar-io/admin/queue-data-item
AR_IO_ADMIN_KEY=your_ario_admin_key

# ================================
# OPTIONAL SETTINGS
# ================================
# Allow free uploads for specific addresses
ALLOW_LISTED_ADDRESSES=address1,address2

# Skip balance checks (use with caution)
SKIP_BALANCE_CHECKS=false

# Max data item size (10GB default)
MAX_DATA_ITEM_SIZE=10737418240

# Logging
LOG_LEVEL=info
```

### 3. Setup Arweave Wallet

**Generate or Import Wallet:**

```bash
# Option A: Generate new wallet (use arweave-js)
node -e "const Arweave = require('arweave'); \
  const arweave = Arweave.init({}); \
  arweave.wallets.generate().then(key => \
    console.log(JSON.stringify(key)))" > wallet.json

# Option B: Copy existing wallet
cp /path/to/your/wallet.json /opt/turbo-upload-service/wallet.json

# Secure the wallet file
chmod 600 wallet.json
```

**Verify Wallet:**

```bash
# Check wallet is valid JSON
cat wallet.json | jq .
```

### 4. Database Migration

```bash
# Build TypeScript
yarn build

# Run migrations
yarn db:migrate:latest
```

**Verify Migration:**

```bash
psql -h localhost -U turbo_admin -d upload_service -c "\dt"
# Should show: new_data_item, data_item_offsets, config, etc.
```

### 5. Start Service with PM2

The upload service runs **3 PM2 processes**:
1. **API Server** (HTTP server, port 3001)
2. **Workers** (BullMQ job processors)
3. **Bull Board** (Queue monitoring dashboard, port 3002)

**The service includes ecosystem.config.js:**

```bash
cat ecosystem.config.js
```

It should configure 3 processes:

```javascript
module.exports = {
  apps: [
    {
      name: "upload-api",
      script: "./lib/server.js",
      instances: process.env.API_INSTANCES || 1,
      exec_mode: "cluster",
      env: {
        NODE_ENV: "production",
        PORT: process.env.PORT || 3001
      },
      error_file: "./logs/api-error.log",
      out_file: "./logs/api-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s"
    },
    {
      name: "upload-workers",
      script: "./lib/workers/allWorkers.js",
      instances: process.env.WORKER_INSTANCES || 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production"
      },
      error_file: "./logs/workers-error.log",
      out_file: "./logs/workers-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      kill_timeout: 30000
    },
    {
      name: "bull-board",
      script: "./bull-board-server.ts",
      interpreter: "ts-node",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        BULL_BOARD_PORT: 3002
      },
      error_file: "./logs/bull-board-error.log",
      out_file: "./logs/bull-board-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      autorestart: true
    }
  ]
};
```

**Start all processes:**

```bash
# Create logs directory
mkdir -p logs

# Start all services
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup
# Follow the instructions output by the command

# Monitor processes
pm2 monit
```

### 6. Verify Service

```bash
# Check all processes running
pm2 list
# Should show: upload-api (cluster x4), upload-workers, bull-board

# Check API health
curl http://localhost:3001/v1/health

# Check Bull Board dashboard
open http://localhost:3002/admin/queues
# Should show 11 queues

# Check logs
pm2 logs upload-api
pm2 logs upload-workers
pm2 logs bull-board
```

---

## AR.IO Gateway Integration

The AR.IO Gateway integration enables **optimistic caching** - users can fetch uploaded data items immediately, before they're posted to Arweave.

### Architecture

```
User Upload → Upload Service → MinIO
                    ↓
            Notify AR.IO Gateway
                    ↓
            User Fetches from AR.IO Gateway (<100ms)
                    ↓
            (Meanwhile) Bundle posted to Arweave (hours later)
```

### Configuration Steps

### 1. Upload Service Configuration

Already configured in `.env`:

```bash
OPTICAL_BRIDGING_ENABLED=true
OPTICAL_BRIDGE_URL=http://localhost:4000/ar-io/admin/queue-data-item
AR_IO_ADMIN_KEY=your_ario_admin_key
```

**Get AR.IO Admin Key:**

```bash
# Check AR.IO Gateway .env
cd /path/to/ar-io-node
cat .env | grep ADMIN_KEY
```

### 2. AR.IO Gateway Database Access

AR.IO Gateway needs read access to upload service PostgreSQL for offset lookups.

**Grant Access:**

```bash
psql -h localhost -U turbo_admin -d upload_service << EOF
-- Grant read access to AR.IO user (if separate)
GRANT SELECT ON ALL TABLES IN SCHEMA public TO ario_user;

-- Or use same turbo_admin user with read-only connection
EOF
```

**Configure AR.IO:**

Edit AR.IO Gateway `.env`:

```bash
# PostgreSQL Configuration
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=upload_service
POSTGRES_USER=turbo_admin
POSTGRES_PASSWORD=your_secure_password

# Table for offset lookups
POSTGRES_OFFSETS_TABLE=data_item_offsets
```

### 3. AR.IO Gateway MinIO Access

AR.IO Gateway needs read access to MinIO for data item retrieval.

**Configure AR.IO:**

Edit AR.IO Gateway `.env`:

```bash
# S3/MinIO Configuration
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin123
S3_REGION=us-east-1
S3_BUCKET=raw-data-items
S3_FORCE_PATH_STYLE=true

# Enable data item caching
ENABLE_DATA_ITEM_CACHE=true
DATA_ITEM_SOURCE=s3
```

**Restart AR.IO Gateway:**

```bash
cd /path/to/ar-io-node
docker compose restart
```

### 4. Verify Integration

**Test Optical Bridge Notification:**

```bash
# Upload a test data item
curl -X POST http://localhost:3001/v1/tx \
  -H "Content-Type: application/octet-stream" \
  -d "Hello AR.IO Gateway!" \
  | jq

# Response should include data item ID
# Example: {"id": "abc123...", "owner": "..."}

# Immediately fetch from AR.IO Gateway
DATA_ITEM_ID="abc123..."
curl http://localhost:3000/$DATA_ITEM_ID

# Should return "Hello AR.IO Gateway!" with <100ms latency
```

**Check Logs:**

```bash
# Upload service logs - should show optical bridge POST
pm2 logs upload-workers | grep "optical"

# AR.IO Gateway logs - should show data item queued
docker compose -f /path/to/ar-io-node/docker-compose.yml logs | grep "queue-data-item"
```

**Monitor Queue:**

```bash
# Check optical-post queue in Bull Board
open http://localhost:3002/admin/queues/upload-optical-post

# Should show jobs: completed, waiting, or active
```

---

## Service Communication

The payment and upload services communicate via JWT-authenticated HTTP requests.

### Authentication Flow

```
Upload Service → Payment Service
  ↓
Check Balance / Reserve / Deduct Credits
  ↓
JWT Token (signed with PRIVATE_ROUTE_SECRET)
  ↓
Payment Service validates signature
```

### Configuration

**Both services must use the SAME secret:**

```bash
# turbo-payment-service/.env
PRIVATE_ROUTE_SECRET=your_shared_secret_here

# turbo-upload-service/.env
PRIVATE_ROUTE_SECRET=your_shared_secret_here
```

**Generate Secret:**

```bash
openssl rand -hex 32
```

### Verify Communication

**Test Upload Service → Payment Service:**

```bash
# From upload service server
curl http://localhost:4000/v1/health

# Should return: {"status": "ok"}
```

**Test Balance Check:**

Create test script `test-balance.js`:

```javascript
const jwt = require('jsonwebtoken');
const axios = require('axios');

const secret = process.env.PRIVATE_ROUTE_SECRET;
const paymentUrl = 'http://localhost:4000';

// Create test address
const testAddress = 'test-arweave-address-43-chars-long-here';

// Create JWT token
const token = jwt.sign(
  { address: testAddress },
  secret,
  { expiresIn: '1h' }
);

// Check balance
axios.get(`${paymentUrl}/v1/balance/${testAddress}`, {
  headers: { 'Authorization': `Bearer ${token}` }
})
.then(res => console.log('Balance:', res.data))
.catch(err => console.error('Error:', err.response?.data || err.message));
```

```bash
node test-balance.js
```

---

## Testing and Validation

### 1. Infrastructure Health Checks

**PostgreSQL:**

```bash
# Payment service DB
psql -h localhost -U turbo_admin -d payment_service -c "SELECT COUNT(*) FROM user_address;"

# Upload service DB
psql -h localhost -U turbo_admin -d upload_service -c "SELECT COUNT(*) FROM new_data_item;"
```

**Redis:**

```bash
# Cache instance
redis-cli -p 6379 ping

# Queue instance
redis-cli -p 6381 ping
redis-cli -p 6381 KEYS "bull:*" | head
```

**MinIO:**

```bash
mc ls local/
mc ls local/raw-data-items/
```

### 2. Service Health Checks

**Payment Service:**

```bash
curl http://localhost:4000/v1/health
# Expected: {"status":"ok"}

curl http://localhost:4000/v1/countries
# Expected: List of supported countries
```

**Upload Service:**

```bash
curl http://localhost:3001/v1/health
# Expected: {"status":"ok"}

curl http://localhost:3001/v1/info
# Expected: Service information
```

**AR.IO Gateway:**

```bash
curl http://localhost:3000/ar-io/info
# Expected: Gateway information

curl http://localhost:4000/ar-io/healthcheck
# Expected: {"status":"healthy"}
```

### 3. End-to-End Upload Test

**Manual Upload Test:**

```bash
# Create test data
echo "Test upload $(date)" > test-data.txt

# Upload to Turbo
RESPONSE=$(curl -s -X POST http://localhost:3001/v1/tx \
  -H "Content-Type: application/octet-stream" \
  --data-binary @test-data.txt)

echo $RESPONSE | jq

# Extract data item ID
DATA_ITEM_ID=$(echo $RESPONSE | jq -r '.id')
echo "Data Item ID: $DATA_ITEM_ID"

# Verify in MinIO
mc ls local/raw-data-items/ | grep $DATA_ITEM_ID

# Check PostgreSQL
psql -h localhost -U turbo_admin -d upload_service \
  -c "SELECT * FROM new_data_item WHERE id = '$DATA_ITEM_ID';"

# Check queue
redis-cli -p 6381 LLEN "bull:upload-new-data-item:wait"

# Fetch from AR.IO Gateway (if configured)
curl http://localhost:3000/$DATA_ITEM_ID
```

### 4. Automated E2E Tests

**Upload Service E2E Tests:**

```bash
cd /opt/turbo-upload-service

# Run all E2E tests (automatic infrastructure setup)
yarn test:e2e:local

# Expected output:
#   ✓ should accept a valid data item upload
#   ✓ should store the data item in MinIO
#   ✓ should enqueue job to BullMQ new-data-item queue
#   ✓ should insert the data item into PostgreSQL
#   ... 30+ passing tests
```

**Payment Service Tests:**

```bash
cd /opt/turbo-payment-service

# Unit tests
yarn test:unit

# Integration tests
yarn test:integration:local
```

### 5. Load Testing

**Upload Performance Test:**

```bash
# Install Apache Bench
sudo apt-get install apache2-utils

# Create test file (1KB)
dd if=/dev/urandom of=test-1kb.bin bs=1024 count=1

# Run load test (100 requests, 10 concurrent)
ab -n 100 -c 10 -T "application/octet-stream" -p test-1kb.bin \
  http://localhost:3001/v1/tx

# Check results:
# - Requests per second
# - Time per request
# - Success rate (should be 100%)
```

**Monitor During Load:**

```bash
# Watch PM2 metrics
pm2 monit

# Watch queue depth
watch -n 1 'redis-cli -p 6381 LLEN "bull:upload-new-data-item:wait"'

# Watch PostgreSQL connections
watch -n 1 'psql -h localhost -U turbo_admin -d upload_service \
  -c "SELECT count(*) FROM pg_stat_activity;"'
```

---

## Production Deployment

### 1. Security Hardening

**Firewall Configuration:**

```bash
# Allow only necessary ports
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 443/tcp   # HTTPS
sudo ufw allow 80/tcp    # HTTP (for certbot)
sudo ufw enable

# Internal services should NOT be exposed
# PostgreSQL (5432), Redis (6379, 6381), MinIO (9000-9001)
# should only be accessible on localhost
```

**Reverse Proxy with Nginx:**

Install Nginx:

```bash
sudo apt-get install nginx
```

Configure `/etc/nginx/sites-available/turbo`:

```nginx
# Payment Service
server {
    listen 443 ssl http2;
    server_name payment.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/payment.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/payment.yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# Upload Service
server {
    listen 443 ssl http2;
    server_name upload.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/upload.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/upload.yourdomain.com/privkey.pem;

    # Increase max body size for large uploads
    client_max_body_size 10G;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Timeouts for large uploads
        proxy_connect_timeout 600s;
        proxy_send_timeout 600s;
        proxy_read_timeout 600s;
    }
}
```

Enable site:

```bash
sudo ln -s /etc/nginx/sites-available/turbo /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

**SSL Certificates:**

```bash
# Install certbot
sudo apt-get install certbot python3-certbot-nginx

# Get certificates
sudo certbot --nginx -d payment.yourdomain.com
sudo certbot --nginx -d upload.yourdomain.com

# Auto-renewal
sudo certbot renew --dry-run
```

**Database Security:**

```bash
# Edit PostgreSQL config
sudo nano /etc/postgresql/16/main/postgresql.conf

# Set listen_addresses to localhost only
listen_addresses = 'localhost'

# Restart PostgreSQL
sudo systemctl restart postgresql

# Set strong password
sudo -u postgres psql
ALTER USER turbo_admin WITH PASSWORD 'very_strong_password_here';
```

**Redis Security:**

```bash
# Edit Redis configs
sudo nano /etc/redis/redis.conf
sudo nano /etc/redis/redis-queues.conf

# Add to both:
requirepass your_redis_password_here
bind 127.0.0.1

# Restart
sudo systemctl restart redis-server
sudo systemctl restart redis-queues

# Update .env files
REDIS_PASSWORD=your_redis_password_here
```

**MinIO Security:**

```bash
# Change default credentials in .env
MINIO_ROOT_USER=admin_user_not_minioadmin
MINIO_ROOT_PASSWORD=very_strong_password_not_minioadmin123

# Restart MinIO
sudo systemctl restart minio

# Update upload service .env
S3_ACCESS_KEY_ID=admin_user_not_minioadmin
S3_SECRET_ACCESS_KEY=very_strong_password_not_minioadmin123
```

### 2. Environment Variables

**Production .env Checklist:**

```bash
# ✅ Change NODE_ENV to production
NODE_ENV=production

# ✅ Use strong database passwords
DB_PASSWORD=strong_password_here

# ✅ Use strong Redis passwords
REDIS_PASSWORD=strong_password_here

# ✅ Use strong MinIO credentials
S3_ACCESS_KEY_ID=secure_access_key
S3_SECRET_ACCESS_KEY=secure_secret_key

# ✅ Secure inter-service secret
PRIVATE_ROUTE_SECRET=secure_random_string_64_chars

# ✅ Production Stripe keys
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# ✅ Production blockchain RPC endpoints
ARWEAVE_GATEWAY=https://arweave.net
ETHEREUM_RPC_ENDPOINT=https://mainnet.infura.io/v3/YOUR_PROJECT_ID

# ✅ Secure wallet file
TURBO_JWK_FILE=/secure/path/wallet.json
# Ensure wallet.json is chmod 600

# ✅ Disable test-only features
SKIP_BALANCE_CHECKS=false
ALLOW_LISTED_ADDRESSES=  # Only if needed

# ✅ Enable migrations on startup
MIGRATE_ON_STARTUP=true

# ✅ Set appropriate log level
LOG_LEVEL=warn  # or info
```

### 3. Monitoring

**PM2 Monitoring:**

```bash
# Install PM2 plugins
pm2 install pm2-logrotate

# Configure log rotation
pm2 set pm2-logrotate:max_size 100M
pm2 set pm2-logrotate:retain 30
pm2 set pm2-logrotate:compress true

# Save PM2 configuration
pm2 save

# Check PM2 status
pm2 list
pm2 monit
```

**System Monitoring:**

Install monitoring tools:

```bash
# htop for process monitoring
sudo apt-get install htop

# iotop for disk I/O monitoring
sudo apt-get install iotop

# nethogs for network monitoring
sudo apt-get install nethogs
```

**Database Monitoring:**

Create monitoring script `monitor-db.sh`:

```bash
#!/bin/bash

echo "=== PostgreSQL Status ==="
psql -h localhost -U turbo_admin -d upload_service -c "
SELECT
  count(*) as connections,
  max(now() - query_start) as longest_query,
  count(*) FILTER (WHERE state = 'active') as active_queries
FROM pg_stat_activity;
"

echo ""
echo "=== Table Sizes ==="
psql -h localhost -U turbo_admin -d upload_service -c "
SELECT
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
"
```

```bash
chmod +x monitor-db.sh
./monitor-db.sh
```

**Queue Monitoring:**

Access Bull Board dashboard:

```bash
# Secure Bull Board with password
# Edit bull-board-server.ts to add basic auth

# Access at:
https://upload.yourdomain.com:3002/admin/queues
```

### 4. Backup Procedures

**Database Backups:**

Create backup script `/opt/backups/backup-databases.sh`:

```bash
#!/bin/bash

BACKUP_DIR="/opt/backups"
DATE=$(date +%Y%m%d_%H%M%S)

# Payment service backup
pg_dump -h localhost -U turbo_admin payment_service > \
  $BACKUP_DIR/payment_service_$DATE.sql

# Upload service backup
pg_dump -h localhost -U turbo_admin upload_service > \
  $BACKUP_DIR/upload_service_$DATE.sql

# Compress backups
gzip $BACKUP_DIR/payment_service_$DATE.sql
gzip $BACKUP_DIR/upload_service_$DATE.sql

# Remove backups older than 30 days
find $BACKUP_DIR -name "*.sql.gz" -mtime +30 -delete

echo "Backup completed: $DATE"
```

```bash
chmod +x /opt/backups/backup-databases.sh

# Add to crontab (daily at 2 AM)
crontab -e
# Add line:
0 2 * * * /opt/backups/backup-databases.sh >> /var/log/db-backup.log 2>&1
```

**MinIO Backups:**

```bash
# Mirror to backup location
mc mirror local/raw-data-items /backup/minio/raw-data-items

# Or setup MinIO replication to another server
mc replicate add local/raw-data-items \
  --remote-bucket backup-server/raw-data-items
```

**Configuration Backups:**

```bash
# Backup .env files and configs
tar -czf /opt/backups/config_$(date +%Y%m%d).tar.gz \
  /opt/turbo-payment-service/.env \
  /opt/turbo-upload-service/.env \
  /opt/turbo-upload-service/ecosystem.config.js \
  /etc/nginx/sites-available/turbo

# Backup wallet.json (encrypted)
gpg -c /opt/turbo-upload-service/wallet.json
mv /opt/turbo-upload-service/wallet.json.gpg /secure/backup/location/
```

---

## Monitoring and Maintenance

### Daily Monitoring Tasks

**Check Service Health:**

```bash
# PM2 processes
pm2 list

# Service health endpoints
curl http://localhost:4000/v1/health
curl http://localhost:3001/v1/health

# Queue status
open http://localhost:3002/admin/queues
```

**Check Logs:**

```bash
# PM2 logs
pm2 logs --lines 100

# System logs
sudo journalctl -u postgresql -n 50
sudo journalctl -u redis-server -n 50
sudo journalctl -u minio -n 50

# Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

**Check Resource Usage:**

```bash
# CPU, RAM, Disk
htop

# Disk space
df -h

# Database size
psql -h localhost -U turbo_admin -d upload_service -c "
SELECT pg_database.datname,
       pg_size_pretty(pg_database_size(pg_database.datname)) AS size
FROM pg_database;
"

# MinIO usage
mc du local/raw-data-items
```

### Weekly Maintenance

**Database Maintenance:**

```bash
# Vacuum and analyze
psql -h localhost -U turbo_admin -d payment_service -c "VACUUM ANALYZE;"
psql -h localhost -U turbo_admin -d upload_service -c "VACUUM ANALYZE;"

# Check for bloat
psql -h localhost -U turbo_admin -d upload_service -c "
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
LIMIT 10;
"
```

**Update Dependencies:**

```bash
# Check for security updates
cd /opt/turbo-payment-service
yarn outdated
yarn audit

cd /opt/turbo-upload-service
yarn outdated
yarn audit

# Update if needed (test in staging first!)
```

**Restart Services:**

```bash
# Graceful restart
pm2 reload all

# Check health after restart
sleep 5
curl http://localhost:4000/v1/health
curl http://localhost:3001/v1/health
```

### Monthly Maintenance

**Review and Archive Logs:**

```bash
# Archive old PM2 logs
pm2 flush

# Rotate logs manually if needed
pm2 reloadLogs
```

**Check for Updates:**

```bash
# System updates
sudo apt-get update
sudo apt-get upgrade

# PostgreSQL updates
sudo apt-get upgrade postgresql

# Node.js updates (if needed)
nvm install 18  # or latest LTS
```

---

## Troubleshooting

### Common Issues

#### 1. Upload Service Won't Start

**Symptoms:**
- PM2 shows upload-api as "errored"
- Error: "ECONNREFUSED" to PostgreSQL or Redis

**Solutions:**

```bash
# Check PostgreSQL is running
sudo systemctl status postgresql

# Check Redis instances
redis-cli -p 6379 ping
redis-cli -p 6381 ping

# Check .env configuration
cat /opt/turbo-upload-service/.env | grep DB_
cat /opt/turbo-upload-service/.env | grep REDIS_

# Check PostgreSQL connection
psql -h localhost -U turbo_admin -d upload_service -c "SELECT 1;"

# Check logs
pm2 logs upload-api --err --lines 50
```

#### 2. Workers Not Processing Jobs

**Symptoms:**
- Queue depth increasing in Bull Board
- Jobs stuck in "waiting" state
- No job processing logs

**Solutions:**

```bash
# Check workers are running
pm2 list | grep upload-workers

# Check worker logs
pm2 logs upload-workers --lines 100

# Check Redis connection
redis-cli -p 6381 ping

# Check queue configuration
redis-cli -p 6381 KEYS "bull:*"

# Restart workers
pm2 restart upload-workers

# Check job processing
redis-cli -p 6381 LLEN "bull:upload-new-data-item:wait"
redis-cli -p 6381 LLEN "bull:upload-new-data-item:active"
```

#### 3. MinIO Connection Failures

**Symptoms:**
- Upload fails with S3 error
- "NoSuchBucket" errors
- Connection timeout to MinIO

**Solutions:**

```bash
# Check MinIO is running
sudo systemctl status minio

# Check buckets exist
mc ls local/

# Recreate buckets if missing
mc mb local/raw-data-items
mc mb local/backup-data-items

# Test MinIO access
mc ls local/raw-data-items/

# Check .env configuration
cat /opt/turbo-upload-service/.env | grep S3_

# Check MinIO logs
sudo journalctl -u minio -n 50
```

#### 4. Payment Service Communication Failure

**Symptoms:**
- Upload rejected with "Insufficient balance"
- Error: "Failed to verify balance"
- JWT verification errors

**Solutions:**

```bash
# Check payment service is running
pm2 list | grep payment
curl http://localhost:4000/v1/health

# Verify PRIVATE_ROUTE_SECRET matches
echo "Payment secret:"
grep PRIVATE_ROUTE_SECRET /opt/turbo-payment-service/.env
echo "Upload secret:"
grep PRIVATE_ROUTE_SECRET /opt/turbo-upload-service/.env

# Check payment service logs
pm2 logs payment-service --lines 50

# Test direct payment service call
curl http://localhost:4000/v1/countries
```

#### 5. AR.IO Gateway Not Caching

**Symptoms:**
- Upload succeeds but data not accessible via AR.IO
- AR.IO returns 404 for data item ID
- No optical bridge logs

**Solutions:**

```bash
# Check OPTICAL_BRIDGING_ENABLED
grep OPTICAL_BRIDGING_ENABLED /opt/turbo-upload-service/.env

# Check AR.IO Gateway is running
curl http://localhost:3000/ar-io/info
curl http://localhost:4000/ar-io/healthcheck

# Check optical-post queue
redis-cli -p 6381 LLEN "bull:upload-optical-post:wait"
redis-cli -p 6381 LLEN "bull:upload-optical-post:failed"

# Check worker logs for optical bridge
pm2 logs upload-workers | grep optical

# Test optical bridge endpoint
curl -X POST http://localhost:4000/ar-io/admin/queue-data-item \
  -H "Authorization: Bearer $AR_IO_ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"dataItemId":"test123"}'
```

### Debug Mode

**Enable Debug Logging:**

```bash
# Upload service
nano /opt/turbo-upload-service/.env
# Set: LOG_LEVEL=debug

# Restart
pm2 restart all

# Watch logs
pm2 logs --lines 0
```

### Performance Issues

**High CPU Usage:**

```bash
# Check which process
htop

# If workers are high:
# Check queue depth
open http://localhost:3002/admin/queues

# Reduce concurrency in ecosystem.config.js
# instances: 4 → instances: 2

pm2 reload all
```

**High Memory Usage:**

```bash
# Check memory by process
pm2 list

# Check PostgreSQL connections
psql -h localhost -U turbo_admin -d upload_service -c "
SELECT count(*) FROM pg_stat_activity;
"

# Reduce PostgreSQL max_connections if needed
sudo nano /etc/postgresql/16/main/postgresql.conf
# max_connections = 100

sudo systemctl restart postgresql
```

**Slow Uploads:**

```bash
# Check MinIO performance
mc admin info local/

# Check disk I/O
iotop

# Check network
nethogs

# Increase Nginx timeouts
sudo nano /etc/nginx/sites-available/turbo
# proxy_connect_timeout 600s;
# proxy_send_timeout 600s;
# proxy_read_timeout 600s;

sudo systemctl reload nginx
```

---

## Appendix

### Useful Commands Reference

**PM2:**
```bash
pm2 list                    # List all processes
pm2 monit                   # Real-time monitoring
pm2 logs                    # View logs
pm2 logs upload-api         # View specific process logs
pm2 restart all             # Restart all processes
pm2 reload all              # Graceful reload
pm2 stop all                # Stop all processes
pm2 delete all              # Remove all processes
pm2 save                    # Save current process list
pm2 resurrect               # Restore saved processes
pm2 startup                 # Configure startup script
```

**PostgreSQL:**
```bash
psql -h localhost -U turbo_admin -d upload_service    # Connect
\dt                                                    # List tables
\d table_name                                          # Describe table
\q                                                     # Quit
```

**Redis:**
```bash
redis-cli -p 6381           # Connect to queue instance
KEYS *                      # List all keys
LLEN queue_name             # Get queue length
FLUSHDB                     # Clear database (careful!)
INFO                        # Server info
```

**MinIO:**
```bash
mc ls local/                # List buckets
mc du local/bucket          # Bucket usage
mc rm --recursive local/bucket/path  # Delete objects
mc cp file.txt local/bucket/         # Upload file
```

**Docker:**
```bash
docker compose up -d        # Start services
docker compose down         # Stop services
docker compose logs -f      # Follow logs
docker compose ps           # List containers
docker compose restart      # Restart services
```

### Port Reference

| Service | Port | Purpose |
|---------|------|---------|
| Payment Service | 4000 | HTTP API |
| Upload Service API | 3001 | HTTP API |
| Bull Board | 3002 | Queue monitoring dashboard |
| AR.IO Gateway | 3000 | Gateway Envoy proxy |
| AR.IO Core | 4000 | Gateway admin API |
| PostgreSQL | 5432 | Database |
| Redis (cache) | 6379 | Application cache |
| Redis (queues) | 6381 | BullMQ queues |
| MinIO S3 API | 9000 | Object storage API |
| MinIO Console | 9001 | Web UI |

### Environment Variable Reference

**Payment Service:**
- `NODE_ENV` - Environment (test/development/production)
- `PORT` - HTTP port (default: 4000)
- `DB_HOST` - PostgreSQL host
- `DB_PASSWORD` - PostgreSQL password
- `STRIPE_SECRET_KEY` - Stripe API key
- `STRIPE_WEBHOOK_SECRET` - Stripe webhook secret
- `PRIVATE_ROUTE_SECRET` - Inter-service auth secret

**Upload Service:**
- `NODE_ENV` - Environment
- `PORT` - HTTP port (default: 3001)
- `DB_WRITER_ENDPOINT` - PostgreSQL writer endpoint
- `PAYMENT_SERVICE_BASE_URL` - Payment service URL
- `PRIVATE_ROUTE_SECRET` - Inter-service auth secret
- `S3_ENDPOINT` - MinIO endpoint
- `S3_ACCESS_KEY_ID` - MinIO access key
- `S3_SECRET_ACCESS_KEY` - MinIO secret key
- `REDIS_HOST` - Redis host
- `REDIS_PORT_QUEUES` - BullMQ Redis port
- `TURBO_JWK_FILE` - Arweave wallet path
- `OPTICAL_BRIDGING_ENABLED` - Enable AR.IO integration
- `OPTICAL_BRIDGE_URL` - AR.IO webhook URL
- `AR_IO_ADMIN_KEY` - AR.IO admin key

### Additional Resources

**Documentation:**
- [E2E Testing Guide](./E2E_TESTING_GUIDE.md)
- [Testing Quick Start](./TESTING_QUICK_START.md)
- [Migration Completion Report](./MIGRATION_COMPLETION_REPORT.md)
- [AR.IO Gateway Integration](./ARIO_GATEWAY_INTEGRATION_DECISION.md)

**External Links:**
- [Arweave Documentation](https://docs.arweave.org/)
- [AR.IO Gateway Docs](https://ar.io/docs/)
- [BullMQ Documentation](https://docs.bullmq.io/)
- [PM2 Documentation](https://pm2.keymetrics.io/docs/)
- [MinIO Documentation](https://min.io/docs/)

---

**Last Updated:** 2025-10-22

**Document Version:** 1.0

**Questions or Issues?** Check the [Troubleshooting](#troubleshooting) section or review service logs for detailed error messages.
