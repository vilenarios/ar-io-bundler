# AR.IO Bundler Architecture

**Version:** 1.0.0
**Last Updated:** 2025-10-24

## Table of Contents

1. [System Overview](#system-overview)
2. [Architecture Principles](#architecture-principles)
3. [Infrastructure Components](#infrastructure-components)
4. [Service Architecture](#service-architecture)
5. [Database Schema](#database-schema)
6. [Queue System](#queue-system)
7. [Storage Layer](#storage-layer)
8. [Data Flows](#data-flows)
9. [API Reference](#api-reference)
10. [Security](#security)
11. [Observability](#observability)
12. [Configuration](#configuration)
13. [Development](#development)
14. [Deployment](#deployment)
15. [Migration from AWS](#migration-from-aws)

---

## System Overview

The AR.IO Bundler is a complete ANS-104 data bundling platform for Arweave with AR.IO Gateway integration. It provides a comprehensive solution for accepting, bundling, and posting data items to the Arweave network while managing payments via cryptocurrency and credit card transactions.

### Core Functionality

- **Data Upload**: Accept single and multipart data item uploads (up to 10GB per item)
- **Payment Processing**: Handle crypto payments (Arweave, Ethereum, Solana, MATIC, KYVE, Base-ETH) and Stripe payments
- **Bundle Management**: Automatically bundle data items using ANS-104 standard
- **Arweave Posting**: Post bundles to Arweave network with verification
- **AR.IO Integration**: Optimistic caching via optical bridging to AR.IO Gateway
- **ArNS Purchases**: Enable Arweave Name System name purchases

### Technology Stack

- **Language**: TypeScript/Node.js (v18+)
- **Package Manager**: Yarn 3.6.0 (workspaces)
- **Database**: PostgreSQL 16.1
- **Cache**: Redis 7.2 (2 instances - cache + queues)
- **Object Storage**: MinIO (S3-compatible)
- **Job Queue**: BullMQ (Redis-based)
- **Process Manager**: PM2
- **Web Framework**: Koa 3.0
- **Migration Tool**: Knex.js
- **Observability**: Winston (logging), OpenTelemetry (optional), Prometheus (metrics)
- **Containerization**: Docker Compose

---

## Architecture Principles

### Dependency Injection

Both services use a centralized `Architecture` interface that injects dependencies throughout the application:

**Payment Service** (`packages/payment-service/src/architecture.ts:24`):
```typescript
interface Architecture {
  paymentDatabase: Database;
  pricingService: PricingService;
  stripe: Stripe;
  emailProvider?: EmailProvider;
  gatewayMap: GatewayMap;
}
```

**Upload Service** (`packages/upload-service/src/arch/architecture.ts`):
```typescript
interface Architecture {
  database: Database;
  objectStore: ObjectStore;
  cacheService: CacheService;
  paymentService: PaymentService;
  arweaveGateway: ArweaveGateway;
  logger: winston.Logger;
  getArweaveWallet: () => JWKInterface;
  tracer?: Tracer;
}
```

This pattern enables:
- Easy testing with mocked dependencies
- Environment-specific configurations
- Clear dependency boundaries
- Improved maintainability

### Separation of Concerns

- **Payment Service**: Isolated credit/payment management
- **Upload Service**: Focused on data handling and bundling
- **Workers**: Background job processing separated from API
- **Database**: Separate databases for each service
- **Redis**: Dedicated instances for caching vs queuing

### Asynchronous Processing

- **Koa Middleware**: Handles HTTP requests/responses quickly
- **BullMQ Queues**: Defers heavy processing to background workers
- **Job Pipeline**: Multi-stage bundle fulfillment (plan → prepare → post → verify)
- **Optical Posting**: Asynchronous AR.IO Gateway integration

### Resilience

- **Circuit Breakers**: Opossum library for fault tolerance (payment service, remote config, cache)
- **Retry Logic**: Exponential backoff for failed operations
- **Health Checks**: Docker Compose health checks for all infrastructure
- **PM2 Auto-Restart**: Automatic service recovery on crashes
- **Graceful Shutdown**: Workers finish current jobs before termination

---

## Infrastructure Components

### Docker Compose Services

Located in `docker-compose.yml`:

#### PostgreSQL
```yaml
Service: postgres
Image: postgres:16.1
Port: 5432
Databases: payment_service, upload_service
User: turbo_admin
Healthcheck: pg_isready
```

Creates both databases on initialization via `infrastructure/postgres/init-databases.sql`.

#### Redis Cache
```yaml
Service: redis-cache
Image: redis:7.2-alpine
Port: 6379
Purpose: Data item caching, API response caching
Healthcheck: redis-cli ping
```

Used by upload service for caching data item metadata, offset information, and reducing database load.

#### Redis Queues
```yaml
Service: redis-queues
Image: redis:7.2-alpine
Port: 6381
Purpose: BullMQ job queues
Healthcheck: redis-cli -p 6381 ping
```

Dedicated Redis instance for all BullMQ queues (11 queues total).

#### MinIO
```yaml
Service: minio
Image: minio/minio:latest
Ports: 9000 (S3 API), 9001 (Console UI)
Buckets: raw-data-items, backup-data-items
Healthcheck: mc ready local
```

S3-compatible object storage for all uploaded data items and bundles.

**MinIO Initialization**:
- Service: `minio-init` automatically creates required buckets
- Sets public read access for data retrieval
- Runs once on stack startup

### PM2 Process Management

Located in `infrastructure/pm2/ecosystem.config.js`:

```javascript
{
  apps: [
    {
      name: "payment-service",
      instances: API_INSTANCES || 2,
      exec_mode: "cluster",
      port: 4001
    },
    {
      name: "upload-api",
      instances: API_INSTANCES || 2,
      exec_mode: "cluster",
      port: 3001
    },
    {
      name: "upload-workers",
      instances: WORKER_INSTANCES || 1,
      exec_mode: "fork",
      script: "./lib/workers/allWorkers.js"
    },
    {
      name: "bull-board",
      instances: 1,
      exec_mode: "fork",
      port: 3002
    }
  ]
}
```

**Execution Modes**:
- **Cluster**: APIs leverage multiple CPU cores, load balancing across instances
- **Fork**: Workers run single instance to avoid duplicate job processing

**Management Commands**:
```bash
pm2 start infrastructure/pm2/ecosystem.config.js
pm2 stop all
pm2 restart all
pm2 logs
pm2 monit
```

### Port Allocation

| Service | Port | Description |
|---------|------|-------------|
| Upload API | 3001 | Data upload REST API |
| Bull Board | 3002 | Queue monitoring dashboard |
| Payment API | 4001 | Payment processing REST API |
| AR.IO Gateway | 4000 | Separate AR.IO Gateway (external) |
| PostgreSQL | 5432 | Database server |
| Redis Cache | 6379 | ElastiCache/Redis cache |
| Redis Queues | 6381 | BullMQ job queues |
| MinIO S3 API | 9000 | Object storage API |
| MinIO Console | 9001 | Web UI for MinIO |

---

## Service Architecture

### Payment Service

**Location**: `packages/payment-service/`
**Port**: 4001
**Database**: `payment_service`

#### Purpose

Manages all financial operations including:
- User balance tracking (Winston credits)
- Cryptocurrency payment verification
- Stripe payment processing
- ArNS (Arweave Name System) purchases
- Promotional codes and discounts
- Payment receipts and audit logging
- Delegated payment approvals

#### Architecture Components

**Entry Point** (`src/index.ts`):
- Starts HTTP server via `createServer()`
- Loads secrets from environment

**HTTP Server** (`src/server.ts`):
- Koa-based REST API on port 4001
- JWT authentication middleware (passthrough mode)
- Architecture dependencies injected via middleware
- Routes defined in `src/router.ts`

**Database Layer** (`src/database/postgres.ts`):
- `PostgresDatabase` implements `Database` interface
- Knex.js for SQL query building
- Separate reader/writer connections supported
- Schema migrations in `src/migrations/`

**Gateway Layer** (`src/gateway/`):
- Abstract `Gateway` class for blockchain interactions
- Implementations:
  - `ArweaveGateway`: Arweave transaction verification
  - `EthereumGateway`: Ethereum transaction verification
  - `SolanaGateway`: Solana transaction verification
  - `MaticGateway`: Polygon (MATIC) transaction verification
  - `KyveGateway`: KYVE transaction verification
  - `BaseEthGateway`: Base (Ethereum L2) transaction verification
  - `ARIOGateway`: AR.IO Network interactions for ArNS

**Pricing Service** (`src/pricing/`):
- `TurboPricingService` implementation
- Oracles for rate conversions:
  - `BytesToWinstonOracle`: Storage bytes → Arweave Winston
  - `TokenToFiatOracle`: Cryptocurrency → Fiat currency
- Handles promotional codes, discounts, adjustments

#### Key Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/v1/balance` | GET | Get user balance |
| `/v1/balance/:token` | POST | Add pending payment transaction |
| `/v1/reserve-balance` | POST | Reserve balance for operation |
| `/v1/refund-balance` | POST | Refund reserved balance |
| `/v1/top-up/:currency` | POST | Create Stripe checkout session |
| `/v1/stripe-webhook` | POST | Handle Stripe webhook events |
| `/v1/redeem` | POST | Redeem promotional code |
| `/v1/price/:currency/:amount` | GET | Calculate price for bytes |
| `/v1/arns/price/:intent/:name` | GET | Get ArNS name price quote |
| `/v1/arns/purchase/:intent/:name` | POST | Initiate ArNS purchase |
| `/v1/arns/purchase/:nonce` | GET | Check ArNS purchase status |
| `/v1/account/approvals` | POST | Create payment approval |
| `/v1/account/approvals` | GET | List approvals |
| `/v1/account/approvals/:approvalId` | DELETE | Revoke approval |
| `/v1/rates` | GET | Get conversion rates |
| `/v1/currencies` | GET | List supported currencies |
| `/v1/countries` | GET | List supported countries |

#### Database Schema (Payment Service)

**Core Tables**:

- **`user`**: User accounts with Winston balance
  - `user_address` (PK): Arweave address
  - `winston_credit_balance`: Available credits
  - `reserved_balance`: Reserved credits

- **`payment_receipt`**: Successful payments
  - `payment_receipt_id` (PK): UUID
  - `top_up_quote_id`: Associated quote
  - `destination_address`: Recipient
  - `winston_credit_amount`: Credits purchased
  - `payment_amount`, `currency_type`: Paid amount
  - `payment_provider`: 'stripe' or crypto type

- **`payment_adjustment`**: Manual balance adjustments
  - `payment_adjustment_id` (PK): UUID
  - `catalog_id`: Adjustment type
  - `user_address`: Affected user
  - `winston_credit_amount`: Adjustment amount (+ or -)

- **`pending_payment_transaction`**: Pending crypto payments
  - `transaction_id` (PK): Blockchain TX ID
  - `destination_address`, `token_type`
  - `transaction_quantity`: Amount sent
  - `winston_credit_amount`: Expected credits

- **`credited_payment_transaction`**: Confirmed payments
  - Moved from `pending_payment_transaction` after verification

- **`failed_payment_transaction`**: Failed payments
  - `failure_reason`: Why payment failed

- **`arns_purchase`**: ArNS name purchases
  - `arns_purchase_nonce` (PK): UUID
  - `arns_name`: Purchased name
  - `arns_purchase_intent`: 'buy' or 'lease'
  - `arns_purchase_status`: 'pending', 'confirmed', 'failed'
  - `winston_credit_cost`: Cost in credits

- **`delegated_payment_approval`**: Payment authorizations
  - `payment_approval_id` (PK): UUID
  - `approved_address`: Delegated payer
  - `total_approved_winston`: Maximum amount
  - `single_use_approved_winston`: Per-use limit
  - `approval_expires_at`: Expiration timestamp

- **`balance_reservation`**: Temporary balance holds
  - `reservation_id` (PK): UUID
  - `user_address`: Account holder
  - `reserved_winston`: Amount reserved
  - `expires_at`: Reservation expiration

- **`audit_log`**: All balance changes
  - `audit_id` (PK): Incremental
  - `user_address`: Affected user
  - `winston_credit_amount`: Change amount
  - `balance_change_reason`: Why changed
  - `data_item_id`, `payment_receipt_id`: Associated entities

**Indexes**:
- `user_address` on all user-related tables
- `transaction_id` on payment transaction tables
- `arns_purchase_nonce` for status lookups
- `approved_address` for delegation queries

### Upload Service

**Location**: `packages/upload-service/`
**Port**: 3001
**Database**: `upload_service`

#### Purpose

Handles all data upload operations including:
- Single data item uploads (POST endpoint)
- Multipart uploads for large files
- ANS-104 bundle creation and posting
- Data item verification on Arweave
- Nested bundle (BDI) unbundling
- Optical posting to AR.IO Gateway
- Offset tracking for data retrieval

#### Architecture Components

**Entry Point** (`src/index.ts`):
- Starts HTTP server
- Runs database migrations if `MIGRATE_ON_STARTUP=true`

**HTTP Server** (`src/server.ts`):
- Koa-based REST API on port 3001
- Architecture dependencies injected
- Routes defined in `src/router.ts`

**Database Layer** (`src/arch/db/postgres.ts`):
- `PostgresDatabase` implements `Database` interface
- Separate reader/writer Knex connections
- Complex queries for bundle planning
- Migrations in `src/migrations/`

**Object Store** (`src/arch/`):
- `S3ObjectStore`: MinIO/S3 integration for production
- `FileSystemObjectStore`: Local development fallback
- Stores uploaded data items and bundles

**Cache Service** (`src/arch/elasticacheService.ts`):
- Redis-based caching for data item metadata
- Reduces database load for frequently accessed data
- Circuit breaker for fault tolerance

**Payment Service Integration** (`src/arch/payment.ts`):
- `PaymentService` interface
- Balance checks and reservations
- Credit adjustments on upload
- JWT authentication for inter-service calls
- Circuit breaker pattern

**Arweave Gateway** (`src/arch/arweaveGateway.ts`):
- `ArweaveGateway` class for network interaction
- Bundle posting to Arweave
- Transaction verification
- Block height tracking

**Workers** (`src/workers/allWorkers.ts`):
- 11 BullMQ workers processing async jobs
- Each worker handles specific job type
- Graceful shutdown support

#### Key Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/v1/tx` | POST | Upload single data item |
| `/v1/tx/:id` | POST | Upload signed data item |
| `/v1/tx/:id/status` | GET | Get data item status |
| `/v1/tx/:id/offset` | GET | Get data item offset information |
| `/v1/upload` | POST | Create multipart upload |
| `/v1/upload/:id/:chunkIndex` | PUT | Upload chunk |
| `/v1/upload/:id` | POST | Finalize multipart upload |
| `/v1/upload/:id` | DELETE | Abort multipart upload |
| `/v1/upload/:id` | GET | Get multipart upload status |
| `/v1/account/balance` | POST | Private: Adjust user balance |
| `/v1/info` | GET | Service health/version info |
| `/swagger` | GET | Swagger API documentation |

#### Database Schema (Upload Service)

**Core Tables**:

- **`new_data_item`**: Uploaded data items awaiting bundling
  - `data_item_id` (PK): Base64URL ID
  - `owner_address`: Uploader
  - `byte_count`: Size in bytes
  - `assessed_winston_price`: Storage cost
  - `uploaded_date`: Timestamp
  - `premium_feature_type`: Bundle type (default, warp, ao, etc.)
  - `signature_type`: Signature algorithm
  - `content_type`: MIME type
  - `uploaded_by_address`: Paying address
  - `deadline_height`: Arweave block deadline

- **`planned_data_item`**: Data items assigned to bundle plans
  - `data_item_id` (PK)
  - `plan_id`: Associated bundle plan
  - `byte_count`, `premium_feature_type`, etc.

- **`bundle_plan`**: Bundle assembly plans
  - `plan_id` (PK): UUID
  - `planned_date`: When planned
  - `premium_feature_type`: Bundle type

- **`new_bundle`**: Bundles being prepared
  - `plan_id` (PK): UUID
  - `bundle_id`: Transaction ID
  - `reward`: Arweave fee
  - `header_byte_count`, `payload_byte_count`: Sizes

- **`posted_bundle`**: Bundles posted to Arweave
  - `plan_id` (PK)
  - `bundle_id`, `reward`

- **`seeded_bundle`**: Bundles seeded to additional gateways
  - `plan_id` (PK)
  - `bundle_id`

- **`permanent_bundle`**: Verified permanent bundles
  - `plan_id` (PK)
  - `bundle_id`
  - `block_height`: Arweave block included

- **`permanent_data_item`**: Verified permanent data items
  - `data_item_id` (PK)
  - `bundle_id`: Parent bundle
  - `block_height`: Confirmation block

- **`failed_bundle`**: Failed bundle posts
  - `plan_id` (PK)
  - `bundle_id`
  - `failed_bundles`: CSV of previously failed bundle IDs
  - `failed_date`: When failed

- **`failed_data_item`**: Failed data items
  - `data_item_id` (PK)
  - `failed_reason`: 'failed_to_post' or 'not_found'
  - `failed_date`

- **`in_flight_multipart_upload`**: Active multipart uploads
  - `upload_id` (PK): UUID
  - `created_date`, `expires_at`
  - `uploaded_by_public_address`
  - `chunk_size`, `total_chunks`
  - `finalized`: Boolean

- **`finished_multipart_upload`**: Completed/aborted multipart uploads
  - `upload_id` (PK)
  - `finished_reason`: 'completed', 'aborted', 'failed'
  - `failed_reason`: Optional failure details

- **`data_item_offsets`**: Offset tracking for data retrieval
  - `data_item_id` (PK): Data item ID
  - `root_bundle_id`: Top-level bundle
  - `start_offset_in_root_bundle`: Byte offset
  - `raw_content_length`: Total size
  - `payload_data_start`: Payload offset
  - `payload_content_type`: MIME type
  - `parent_data_item_id`: If nested in BDI
  - `start_offset_in_parent_data_item_payload`: Nested offset
  - `expires_at`: TTL timestamp

**Indexes**:
- `owner_address` on data item tables for user queries
- `plan_id` for bundle tracking
- `bundle_id` for verification
- `uploaded_date` for time-based queries
- `premium_feature_type` for dedicated bundling

---

## Queue System

### BullMQ Architecture

BullMQ provides Redis-based job queues with the following features:
- Delayed jobs and repeatable jobs
- Job prioritization
- Automatic retries with exponential backoff
- Job progress tracking
- Event-driven architecture

### Queue Definitions

Located in `packages/upload-service/src/constants.ts:278-290`:

```typescript
export const jobLabels = {
  finalizeUpload: "finalize-upload",
  opticalPost: "optical-post",
  unbundleBdi: "unbundle-bdi",
  newDataItem: "new-data-item",
  planBundle: "plan-bundle",
  prepareBundle: "prepare-bundle",
  postBundle: "post-bundle",
  seedBundle: "seed-bundle",
  verifyBundle: "verify-bundle",
  cleanupFs: "cleanup-fs",
  putOffsets: "put-offsets",
} as const;
```

### Worker Configuration

Located in `packages/upload-service/src/workers/allWorkers.ts`:

| Worker | Queue | Concurrency | Purpose |
|--------|-------|-------------|---------|
| `planWorker` | `plan-bundle` | 1 | Plan data items into bundles |
| `prepareWorker` | `prepare-bundle` | 3 | Download items, assemble bundles |
| `postWorker` | `post-bundle` | 2 | Post bundles to Arweave |
| `seedWorker` | `seed-bundle` | 2 | Seed bundles to additional gateways |
| `verifyWorker` | `verify-bundle` | 3 | Verify bundle permanence |
| `putOffsetsWorker` | `put-offsets` | 5 | Write offsets to PostgreSQL |
| `newDataItemWorker` | `new-data-item` | 5 | Batch insert new data items |
| `opticalWorker` | `optical-post` | 5 | Post to AR.IO optical bridge |
| `unbundleWorker` | `unbundle-bdi` | 2 | Unbundle nested BDIs |
| `finalizeWorker` | `finalize-upload` | 3 | Finalize multipart uploads |
| `cleanupWorker` | `cleanup-fs` | 1 | Clean temporary files |

### Job Flow

**Upload Pipeline**:
```
POST /v1/tx
  ↓
newDataItem → planBundle → prepareBundle → postBundle → verifyBundle
                                              ↓
                                          opticalPost (parallel)
                                              ↓
                                          putOffsets (parallel)
                                              ↓
                                          cleanupFs
```

**Multipart Upload Pipeline**:
```
POST /v1/upload → PUT /v1/upload/:id/:chunk → POST /v1/upload/:id
                                                       ↓
                                                finalizeUpload
                                                       ↓
                                                (joins main pipeline)
```

**BDI Unbundling Pipeline**:
```
Detect BDI → unbundleBdi → putOffsets (for nested items)
                    ↓
              opticalPost (for each nested item)
```

### Queue Monitoring

**Bull Board** (port 3002):
- Web UI for monitoring all queues
- View job status, failed jobs, job details
- Retry failed jobs manually
- Clear completed jobs

Access at: `http://localhost:3002/admin/queues`

---

## Storage Layer

### MinIO Object Storage

**Configuration** (`.env`):
```bash
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin123
S3_REGION=us-east-1
S3_FORCE_PATH_STYLE=true
DATA_ITEM_BUCKET=raw-data-items
BACKUP_DATA_ITEM_BUCKET=backup-data-items
```

### Storage Keys

**Multipart Uploads**:
- Pattern: `${uploadId}/${chunkIndex}`
- Example: `a1b2c3d4-1234-5678-abcd-ef0123456789/0`

**Single Data Items**:
- Pattern: `${dataItemId}`
- Example: `abc123xyz...`

**Bundles**:
- Pattern: `${bundleId}`
- Example: `bundle_abc123...`

**Bundle Payloads**:
- Pattern: `${bundleId}/payload`
- Example: `bundle_abc123.../payload`

### Data Item Lifecycle

1. **Upload**: Stored in `raw-data-items` bucket
2. **Bundle Preparation**: Downloaded from MinIO, assembled into bundle
3. **Bundle Storage**: Complete bundle stored in MinIO
4. **Arweave Post**: Bundle transaction posted to Arweave
5. **Verification**: Confirmed on Arweave blockchain
6. **Cleanup**: Optional removal from MinIO after verification

### Backup Strategy

- **Primary**: `raw-data-items` bucket
- **Backup**: `backup-data-items` bucket (optional)
- **Redundancy**: MinIO can be configured with erasure coding

### PostgreSQL Offset Storage

**Purpose**: Enables data item retrieval without full bundle download

**Storage** (`data_item_offsets` table):
- Data item ID → Offset in bundle
- Bundle ID → Root bundle containing item
- Nested offsets for BDIs
- TTL: 365 days (configurable via `POSTGRES_OFFSETS_TTL_SECS`)

**Size Threshold**:
- Items ≤ 10 KiB: Stored in PostgreSQL offsets table
- Items > 10 KiB: Reference to MinIO object
- Configurable via `POSTGRES_DATA_ITEM_BYTES_THRESHOLD`

---

## Data Flows

### Single Data Item Upload

```
1. Client → POST /v1/tx
   ├─ Validate signature
   ├─ Check balance with Payment Service
   ├─ Reserve balance
   └─ Store in MinIO

2. Upload API → Enqueue newDataItem
   ├─ Insert into new_data_item table
   └─ Deduct balance

3. Worker → planBundle (every N seconds)
   ├─ Fetch new_data_item records
   ├─ Group by premium_feature_type
   ├─ Pack into bundles (max 2GB or 10k items)
   ├─ Insert into bundle_plan + planned_data_item
   └─ Enqueue prepareBundle

4. Worker → prepareBundle
   ├─ Download all data items from MinIO
   ├─ Assemble ANS-104 bundle
   ├─ Calculate offsets
   ├─ Store bundle in MinIO
   ├─ Update to new_bundle
   ├─ Enqueue putOffsets
   └─ Enqueue postBundle

5. Worker → putOffsets (parallel)
   ├─ Write offsets to data_item_offsets table
   └─ Set TTL

6. Worker → postBundle
   ├─ Load bundle from MinIO
   ├─ Post to Arweave network
   ├─ Update to posted_bundle
   ├─ Enqueue seedBundle (optional)
   ├─ Enqueue opticalPost
   └─ Enqueue verifyBundle

7. Worker → opticalPost (parallel)
   ├─ Send data item headers to AR.IO Gateway
   └─ Enable optimistic caching

8. Worker → verifyBundle (delayed)
   ├─ Check Arweave confirmation
   ├─ When confirmed (≥18 blocks):
   │  └─ Update to permanent_bundle + permanent_data_item
   └─ If failed: retry or mark as failed_bundle

9. Worker → cleanupFs (optional)
   └─ Remove temporary files
```

### Multipart Upload

```
1. Client → POST /v1/upload
   └─ Create in_flight_multipart_upload record

2. Client → PUT /v1/upload/:id/:chunkIndex (repeat for each chunk)
   ├─ Store chunk in MinIO (key: uploadId/chunkIndex)
   └─ Update chunk tracking

3. Client → POST /v1/upload/:id (finalize)
   ├─ Validate all chunks present
   ├─ Enqueue finalizeUpload
   └─ Return 202 Accepted

4. Worker → finalizeUpload
   ├─ Download all chunks from MinIO
   ├─ Assemble complete data item
   ├─ Validate signature
   ├─ Check balance with Payment Service
   ├─ Reserve and deduct balance
   ├─ Store assembled data item
   ├─ Update to finished_multipart_upload
   ├─ Insert into new_data_item
   └─ (Joins main pipeline at step 3)
```

### Crypto Payment Flow

```
1. Client → POST /v1/balance/:token
   ├─ Submit transaction ID
   └─ Store in pending_payment_transaction

2. Payment Service (polling)
   ├─ Query blockchain gateway
   ├─ Verify transaction confirmation
   ├─ Calculate Winston credits
   ├─ Move to credited_payment_transaction
   ├─ Create payment_receipt
   ├─ Update user balance
   └─ Create audit_log entry
```

### Stripe Payment Flow

```
1. Client → POST /v1/top-up/:currency
   ├─ Create top_up_quote
   └─ Return Stripe checkout session URL

2. User completes Stripe payment

3. Stripe → POST /v1/stripe-webhook
   ├─ Verify webhook signature
   ├─ Handle checkout.session.completed event
   ├─ Create payment_receipt
   ├─ Update user balance
   └─ Send email receipt (optional)
```

### ArNS Purchase Flow

```
1. Client → GET /v1/arns/price/:intent/:name
   └─ Return quote with pricing

2. Client → POST /v1/arns/purchase/:intent/:name
   ├─ Create arns_purchase_quote
   ├─ Return nonce + payment options

3. Client completes payment (Stripe or crypto)

4. Payment confirmed
   ├─ Update arns_purchase status → 'confirmed'
   ├─ Call AR.IO Gateway to register name
   └─ Deduct balance

5. Client → GET /v1/arns/purchase/:nonce
   └─ Check purchase status
```

### BDI Unbundling Flow

```
1. Detect Bundle Data Item (BDI) uploaded

2. Worker → unbundleBdi
   ├─ Download BDI payload from MinIO
   ├─ Parse nested data items (ANS-104)
   ├─ For each nested item:
   │  ├─ Extract raw data item
   │  ├─ Store in MinIO
   │  ├─ Calculate offsets
   │  ├─ Enqueue putOffsets
   │  └─ Enqueue opticalPost
   └─ Complete unbundling
```

---

## API Reference

### Upload Service API

**Base URL**: `http://localhost:3001`

#### POST /v1/tx
Upload a signed data item.

**Headers**:
- `Content-Type: application/octet-stream`

**Body**: Raw binary data item (ANS-104 format)

**Response**:
```json
{
  "id": "abc123...",
  "owner": "xyz789...",
  "dataCaches": ["arweave.net"],
  "fastFinalityIndexes": ["arweave.net"]
}
```

#### POST /v1/tx/:id
Upload an unsigned data item with signature.

**Headers**:
- `Content-Type: application/octet-stream`
- `x-signature: <base64url-signature>`
- `x-signature-type: <signature-type>` (1=arweave, 2=ed25519, 3=ethereum, etc.)

**Body**: Raw binary data

**Response**: Same as POST /v1/tx

#### GET /v1/tx/:id/status
Get data item status.

**Response**:
```json
{
  "id": "abc123...",
  "status": "pending" | "finalized" | "permanent" | "failed",
  "bundleId": "bundle_xyz...",
  "blockHeight": 1234567
}
```

#### GET /v1/tx/:id/offset
Get data item offset information for retrieval.

**Response**:
```json
{
  "dataItemId": "abc123...",
  "rootBundleId": "bundle_xyz...",
  "startOffset": 1024,
  "contentLength": 2048,
  "payloadDataStart": 512,
  "payloadContentType": "application/json"
}
```

#### POST /v1/upload
Create a multipart upload.

**Headers**:
- `x-data-item-size: <bytes>`
- `x-chunk-size: <bytes>` (optional, default: 25MB)
- `x-signature-type: <type>`

**Response**:
```json
{
  "uploadId": "uuid-1234-5678-abcd...",
  "chunkSize": 25000000,
  "totalChunks": 10,
  "expiresAt": "2025-10-25T12:00:00Z"
}
```

#### PUT /v1/upload/:uploadId/:chunkIndex
Upload a chunk.

**Headers**:
- `Content-Type: application/octet-stream`

**Body**: Raw chunk data

**Response**: `204 No Content`

#### POST /v1/upload/:uploadId
Finalize multipart upload.

**Headers**:
- `x-signature: <base64url-signature>`

**Response**:
```json
{
  "id": "abc123...",
  "status": "finalizing"
}
```

#### DELETE /v1/upload/:uploadId
Abort multipart upload.

**Response**: `204 No Content`

#### GET /v1/upload/:uploadId
Get multipart upload status.

**Response**:
```json
{
  "uploadId": "uuid-1234...",
  "status": "in_progress" | "finalizing" | "completed" | "aborted",
  "totalChunks": 10,
  "uploadedChunks": [0, 1, 2, 3],
  "expiresAt": "2025-10-25T12:00:00Z"
}
```

### Payment Service API

**Base URL**: `http://localhost:4001`

#### GET /v1/balance
Get user balance.

**Headers**:
- `Authorization: Bearer <jwt-token>` or signature-based auth

**Response**:
```json
{
  "winc": "1000000000",
  "reservedWinc": "100000"
}
```

#### POST /v1/balance/:token
Add a pending crypto payment.

**Parameters**:
- `token`: 'arweave' | 'ethereum' | 'solana' | 'matic' | 'kyve' | 'base-eth'

**Body**:
```json
{
  "tx_id": "blockchain-transaction-id"
}
```

**Response**:
```json
{
  "message": "Transaction pending confirmation",
  "transactionId": "blockchain-transaction-id",
  "estimatedCredits": "500000000"
}
```

#### POST /v1/top-up/:currency
Create Stripe checkout session.

**Parameters**:
- `currency`: 'usd' | 'eur' | 'gbp' | etc.

**Body**:
```json
{
  "amount": 1000,
  "destinationAddress": "arweave-address",
  "promoCode": "PROMO123" // optional
}
```

**Response**:
```json
{
  "paymentSession": {
    "url": "https://checkout.stripe.com/...",
    "id": "cs_..."
  },
  "topUpQuote": {
    "topUpQuoteId": "uuid",
    "wincAmount": "1000000000"
  }
}
```

#### GET /v1/price/:currency/:amount
Calculate price for storage.

**Parameters**:
- `currency`: 'arweave' | 'usd' | etc.
- `amount`: Number of bytes

**Response**:
```json
{
  "winc": "500000",
  "actualPaymentAmount": 100,
  "quotedPaymentAmount": 100,
  "adjustments": []
}
```

#### GET /v1/arns/price/:intent/:name
Get ArNS name price quote.

**Parameters**:
- `intent`: 'buy' | 'lease'
- `name`: ArNS name to purchase

**Query Parameters**:
- `years=1` (for lease)
- `type=permabuy` (for buy)

**Response**:
```json
{
  "namePrice": "1000000000",
  "networkFee": "100000000",
  "totalWinc": "1100000000"
}
```

#### POST /v1/arns/purchase/:intent/:name
Initiate ArNS purchase.

**Parameters**:
- `intent`: 'buy' | 'lease'
- `name`: ArNS name to purchase

**Headers**:
- Authorization with user signature

**Body**:
```json
{
  "years": 1, // for lease
  "type": "permabuy" // for buy
}
```

**Response**:
```json
{
  "nonce": "uuid",
  "winc": "1100000000",
  "status": "pending",
  "checkoutUrl": "https://checkout.stripe.com/..." // if Stripe
}
```

#### GET /v1/arns/purchase/:nonce
Check ArNS purchase status.

**Response**:
```json
{
  "status": "pending" | "confirmed" | "failed",
  "transactionId": "arweave-tx-id", // when confirmed
  "failureReason": "insufficient_balance" // when failed
}
```

#### POST /v1/account/approvals
Create a delegated payment approval.

**Headers**:
- User signature authentication

**Body**:
```json
{
  "approvedAddress": "delegate-address",
  "approvedWincAmount": "1000000000",
  "singleUseWincAmount": "100000000", // optional
  "expiresInSeconds": 86400 // optional, default: 30 days
}
```

**Response**:
```json
{
  "approvalId": "uuid",
  "approvedAddress": "delegate-address",
  "approvedWincAmount": "1000000000",
  "expiresAt": "2025-11-24T12:00:00Z"
}
```

#### GET /v1/account/approvals
List user's payment approvals.

**Response**:
```json
{
  "approvals": [
    {
      "approvalId": "uuid",
      "approvedAddress": "delegate-address",
      "totalApprovedWinc": "1000000000",
      "usedWinc": "200000000",
      "expiresAt": "2025-11-24T12:00:00Z"
    }
  ]
}
```

#### DELETE /v1/account/approvals/:approvalId
Revoke a payment approval.

**Response**: `204 No Content`

---

## Security

### Authentication Methods

**Upload Service**:
1. **Signature-based**: Data item signature validates uploader identity
2. **JWT Tokens**: For private routes (inter-service communication)
3. **Allow Lists**: Specific addresses get free uploads

**Payment Service**:
1. **JWT Tokens**: User authentication tokens
2. **Signature Verification**: Arweave/Ethereum/Solana signature validation
3. **Stripe Webhooks**: HMAC signature verification

### Authorization

**Balance Checks**:
- Upload service queries payment service before accepting uploads
- Reserved balance prevents double-spending
- Refund mechanism for failed operations

**Delegated Payments**:
- Approval system allows one address to pay for another
- Configurable limits (total + per-use)
- Expiration timestamps
- Revocable approvals

### Inter-Service Security

**Private Routes** (`PRIVATE_ROUTE_SECRET`):
```typescript
// Upload service calling payment service
headers: {
  'Authorization': `Bearer ${jwtToken}`,
  'x-service-secret': process.env.PRIVATE_ROUTE_SECRET
}
```

### Data Integrity

**Signature Validation**:
- All uploaded data items must have valid signatures
- Supported: Arweave (RSA), Ethereum (ECDSA), Solana (Ed25519), etc.
- Signature verified before storage

**Transaction Verification**:
- Cryptocurrency transactions verified on-chain
- Multiple confirmation blocks required
- Gateway polling for transaction status

### Environment Secrets

**Required Secrets** (`.env`):
```bash
# Inter-service
PRIVATE_ROUTE_SECRET=<openssl rand -hex 32>
JWT_SECRET=<openssl rand -hex 32>

# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Arweave Wallet
TURBO_JWK_FILE=./wallet.json

# AR.IO Gateway
AR_IO_ADMIN_KEY=<admin-key>

# Database
DB_PASSWORD=<strong-password>

# MinIO
S3_ACCESS_KEY_ID=<access-key>
S3_SECRET_ACCESS_KEY=<secret-key>
```

**Secret Management**:
- Never commit secrets to git
- `.env` is git-ignored
- Use environment variables in production
- Rotate secrets regularly

### Network Security

**Firewall Rules**:
- Public: 3001 (upload API), 4001 (payment API)
- Internal: 5432 (PostgreSQL), 6379 (Redis cache), 6381 (Redis queues), 9000 (MinIO)
- Admin: 9001 (MinIO console), 3002 (Bull Board)

**TLS/SSL**:
- Recommended for production deployments
- Reverse proxy (nginx/Caddy) handles SSL termination
- MinIO supports native TLS

---

## Observability

### Logging

**Winston** configuration:
- Log level: Configurable via `LOG_LEVEL` (default: 'info')
- Formats: JSON for production, colorized for development
- Outputs:
  - Console (stdout/stderr)
  - File logs (PM2 managed)

**PM2 Logs**:
```bash
/home/vilenarios/ar-io-bundler/logs/
├── payment-service-error.log
├── payment-service-out.log
├── upload-api-error.log
├── upload-api-out.log
├── upload-workers-error.log
├── upload-workers-out.log
├── bull-board-error.log
└── bull-board-out.log
```

**Log Rotation**: Configure via PM2 or logrotate

### Metrics

**Prometheus Metrics**:
- `prom-client` library integrated
- Metrics exposed on `/metrics` endpoint (if enabled)
- Custom metrics:
  - Circuit breaker states
  - Queue depths
  - Bundle sizes
  - Upload success/failure rates

### Tracing

**OpenTelemetry** (optional):
- Auto-instrumentation for HTTP, PostgreSQL, AWS SDK
- Configured via environment variables:
  - `OTEL_SAMPLE_RATE`: Sample percentage (default: 200 = 0.5%)
  - `HONEYCOMB_API_KEY`: Honeycomb integration
- Traces requests across services

**Instrumented Components**:
- HTTP requests (Koa)
- Database queries (Knex)
- S3 operations
- Redis operations

### Monitoring

**Bull Board** (port 3002):
- Real-time queue monitoring
- Job failure tracking
- Performance metrics per queue
- Manual job retry/removal

**Health Checks**:
- Docker Compose health checks for infrastructure
- `/v1/info` endpoints for service health
- PM2 process monitoring

**Alerts** (recommended external setup):
- Failed bundle posts
- Payment verification failures
- Database connection errors
- Disk space warnings

---

## Configuration

### Environment Variables

Comprehensive list in `packages/upload-service/.env`:

#### Service Ports
```bash
PAYMENT_SERVICE_PORT=4001
UPLOAD_SERVICE_PORT=3001
BULL_BOARD_PORT=3002
```

#### Database
```bash
DB_HOST=localhost
DB_PORT=5432
DB_USER=turbo_admin
DB_PASSWORD=postgres
DB_DATABASE=upload_service      # or payment_service
PAYMENT_DB_NAME=payment_service
UPLOAD_DB_NAME=upload_service
```

#### Redis
```bash
# Cache
REDIS_CACHE_HOST=localhost
REDIS_CACHE_PORT=6379
ELASTICACHE_HOST=localhost      # Legacy name
ELASTICACHE_PORT=6379
ELASTICACHE_NO_CLUSTERING=true

# Queues
REDIS_QUEUE_HOST=localhost
REDIS_QUEUE_PORT=6381
REDIS_HOST=localhost            # Legacy name
REDIS_PORT_QUEUES=6381
```

#### MinIO / S3
```bash
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin123
S3_REGION=us-east-1
S3_FORCE_PATH_STYLE=true
DATA_ITEM_BUCKET=raw-data-items
BACKUP_DATA_ITEM_BUCKET=backup-data-items
```

#### Arweave
```bash
ARWEAVE_GATEWAY=https://arweave.net
TURBO_JWK_FILE=./wallet.json
PUBLIC_ACCESS_GATEWAY=https://arweave.net
```

#### AR.IO Gateway Integration
```bash
OPTICAL_BRIDGING_ENABLED=true
OPTICAL_BRIDGE_URL=http://localhost:4000/ar-io/admin/queue-data-item
AR_IO_ADMIN_KEY=<admin-key>
```

#### Upload Service Features
```bash
ALLOW_LISTED_ADDRESSES=addr1,addr2,addr3
SKIP_BALANCE_CHECKS=false
MAX_DATA_ITEM_SIZE=10737418240  # 10GB
MAX_BUNDLE_SIZE=2147483648      # 2GB
MAX_DATA_ITEM_LIMIT=10000
FREE_UPLOAD_LIMIT=517120        # ~505 KiB
```

#### PostgreSQL Configuration
```bash
POSTGRES_OFFSETS_TTL_SECS=31536000        # 365 days
POSTGRES_DATA_ITEM_BYTES_THRESHOLD=10240  # 10 KiB
```

#### Blockchain RPCs
```bash
ETHEREUM_RPC_ENDPOINT=https://eth.llamarpc.com
SOLANA_RPC_ENDPOINT=https://api.mainnet-beta.solana.com
MATIC_RPC_ENDPOINT=https://polygon-rpc.com
KYVE_RPC_ENDPOINT=https://rpc.kyve.network
BASE_ETH_RPC_ENDPOINT=https://mainnet.base.org
```

#### Stripe
```bash
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

#### Email (optional)
```bash
MANDRILL_API_KEY=<api-key>
```

#### Security
```bash
PRIVATE_ROUTE_SECRET=<openssl rand -hex 32>
JWT_SECRET=<openssl rand -hex 32>
ARIO_SIGNING_JWK=<json-jwk>
```

#### Observability
```bash
LOG_LEVEL=info
DISABLE_LOGS=false
HONEYCOMB_API_KEY=<api-key>
OTEL_SAMPLE_RATE=200  # 0.5%
```

#### PM2
```bash
NODE_ENV=production
API_INSTANCES=2
WORKER_INSTANCES=1
```

---

## Development

### Prerequisites

- Node.js 18+
- Yarn 3.6.0+
- Docker & Docker Compose
- PostgreSQL client (optional, for migrations)

### Setup

```bash
# Clone repository
git clone https://github.com/vilenarios/ar-io-bundler.git
cd ar-io-bundler

# Install dependencies
yarn install

# Copy environment template
cp packages/upload-service/.env.sample packages/upload-service/.env

# Edit .env with your configuration
nano packages/upload-service/.env

# Start infrastructure
docker compose up -d

# Run database migrations
yarn db:migrate

# Build services
yarn build

# Start services with PM2
pm2 start infrastructure/pm2/ecosystem.config.js
```

### Development Workflow

**Watch Mode** (auto-recompile on changes):
```bash
# Terminal 1: Upload service
cd packages/upload-service
yarn start:watch

# Terminal 2: Payment service
cd packages/payment-service
yarn start:watch

# Terminal 3: Workers
cd packages/upload-service
yarn nodemon lib/workers/allWorkers.js
```

**Run Tests**:
```bash
# All unit tests
yarn test:unit

# Payment service tests
yarn workspace @ar-io-bundler/payment-service test:unit

# Upload service tests
yarn workspace @ar-io-bundler/upload-service test:unit

# Integration tests (requires running infrastructure)
yarn workspace @ar-io-bundler/upload-service test:integration:local
yarn workspace @ar-io-bundler/payment-service test:integration:local
```

**Code Quality**:
```bash
# Type checking
yarn typecheck

# Linting
yarn lint:check
yarn lint:fix

# Formatting
yarn format:check
yarn format:fix
```

**Database Operations**:
```bash
# Create new migration
yarn workspace @ar-io-bundler/upload-service db:migrate:new my_migration_name
yarn workspace @ar-io-bundler/payment-service db:migrate:new my_migration_name

# Run migrations
yarn db:migrate

# Rollback last migration
yarn workspace @ar-io-bundler/upload-service db:migrate:rollback
yarn workspace @ar-io-bundler/payment-service db:migrate:rollback

# List migrations
yarn workspace @ar-io-bundler/upload-service db:migrate:list
```

### Debugging

**VS Code Launch Config** (`.vscode/launch.json`):
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Upload Service",
      "runtimeArgs": ["-r", "ts-node/register"],
      "args": ["${workspaceFolder}/packages/upload-service/src/index.ts"],
      "env": {
        "NODE_ENV": "development"
      }
    },
    {
      "type": "node",
      "request": "launch",
      "name": "Payment Service",
      "runtimeArgs": ["-r", "ts-node/register"],
      "args": ["${workspaceFolder}/packages/payment-service/src/index.ts"],
      "env": {
        "NODE_ENV": "development"
      }
    }
  ]
}
```

**Inspect Database**:
```bash
# Connect to PostgreSQL
docker exec -it ar-io-bundler-postgres psql -U turbo_admin -d upload_service

# Common queries
SELECT COUNT(*) FROM new_data_item;
SELECT COUNT(*) FROM permanent_data_item;
SELECT * FROM bundle_plan ORDER BY planned_date DESC LIMIT 10;
```

**Inspect Redis**:
```bash
# Connect to Redis cache
docker exec -it ar-io-bundler-redis-cache redis-cli

# Connect to Redis queues
docker exec -it ar-io-bundler-redis-queues redis-cli -p 6381

# Common commands
KEYS *
GET key
HGETALL key
```

**Inspect MinIO**:
- Web UI: http://localhost:9001
- Username: minioadmin
- Password: minioadmin123

---

## Deployment

### Production Checklist

- [ ] Generate strong secrets (`openssl rand -hex 32`)
- [ ] Configure database credentials
- [ ] Set up Arweave wallet (fund with AR)
- [ ] Configure Stripe keys (if using)
- [ ] Set up email service (if using)
- [ ] Configure blockchain RPC endpoints
- [ ] Set up SSL/TLS certificates
- [ ] Configure reverse proxy (nginx/Caddy)
- [ ] Set up monitoring and alerts
- [ ] Configure log rotation
- [ ] Back up `.env` and `wallet.json` securely
- [ ] Configure firewall rules
- [ ] Set up database backups
- [ ] Configure MinIO backups/replication

### Docker Deployment

```bash
# Production docker-compose
docker compose -f docker-compose.prod.yml up -d

# Scale services
docker compose up --scale upload-api=4 --scale payment-service=2
```

### Manual Deployment

```bash
# Build
yarn build

# Start infrastructure
docker compose up -d postgres redis-cache redis-queues minio minio-init

# Run migrations
DB_HOST=localhost DB_PASSWORD=<password> yarn db:migrate

# Start with PM2
pm2 start infrastructure/pm2/ecosystem.config.js --env production

# Save PM2 process list
pm2 save

# Configure PM2 startup
pm2 startup

# Monitor
pm2 monit
```

### Reverse Proxy (nginx)

```nginx
# Upload Service
server {
    listen 80;
    server_name upload.yourdomain.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        client_max_body_size 10G;
    }
}

# Payment Service
server {
    listen 80;
    server_name payment.yourdomain.com;

    location / {
        proxy_pass http://localhost:4001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Database Backups

**Automated Backups**:
```bash
#!/bin/bash
# backup.sh
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups"

# Backup upload_service
pg_dump -h localhost -U turbo_admin -d upload_service > $BACKUP_DIR/upload_service_$DATE.sql

# Backup payment_service
pg_dump -h localhost -U turbo_admin -d payment_service > $BACKUP_DIR/payment_service_$DATE.sql

# Compress
gzip $BACKUP_DIR/*.sql

# Remove old backups (keep 30 days)
find $BACKUP_DIR -name "*.sql.gz" -mtime +30 -delete
```

**Cron Schedule**:
```cron
0 2 * * * /path/to/backup.sh
```

### MinIO Replication

Configure MinIO server-side replication for production:
```bash
mc admin replicate add minio1/bucket minio2/bucket
```

### Scaling

**Horizontal Scaling**:
- Run multiple upload-api instances behind load balancer
- Run multiple payment-service instances
- Workers: Single instance recommended (avoid duplicate processing)

**Vertical Scaling**:
- Increase PM2 `API_INSTANCES` for more cluster workers
- Increase worker concurrency in `allWorkers.ts`
- Upgrade PostgreSQL/Redis resources

**Database Scaling**:
- PostgreSQL: Read replicas (configure `DB_READER_ENDPOINT`)
- Redis: Cluster mode (set `ELASTICACHE_NO_CLUSTERING=false`)

---

## Migration from AWS

This system has been completely migrated from AWS to open-source infrastructure.

### Previous AWS Services

| AWS Service | Replacement | Migration Path |
|-------------|-------------|----------------|
| **AWS Secrets Manager** | `.env` files | Moved all secrets to environment variables |
| **AWS Systems Manager (SSM)** | `.env` files | Consolidated parameter storage |
| **Amazon S3** | MinIO | Direct S3 API compatibility, changed endpoint |
| **Amazon DynamoDB** | PostgreSQL | Complete schema redesign with migrations |
| **Amazon SQS** | BullMQ (Redis) | Replaced message queues with BullMQ workers |
| **AWS Lambda** | PM2 Workers | Converted Lambda handlers to Node.js workers |
| **Amazon ECS** | PM2 | Replaced container orchestration |
| **Amazon ElastiCache** | Redis | Direct Redis compatibility |

### Key Changes

**Configuration Management**:
- Removed `aws-sdk` dependency
- Removed `loadSecretsToEnv()` function
- All config in `.env` file
- Environment variables used directly via `process.env`

**Database Migration**:
- DynamoDB tables → PostgreSQL tables
- Removed AWS DynamoDB client code
- Added Knex.js for SQL
- Migrated offset storage from DynamoDB to PostgreSQL `data_item_offsets` table
- Batch size increased from 25 (DynamoDB limit) to 500 (PostgreSQL batch insert)

**Queue Migration**:
- SQS queues → BullMQ queues (11 queues)
- Lambda handlers → Worker functions in `src/workers/`
- Message format preserved for compatibility
- Job concurrency configurable per worker

**Object Storage**:
- S3 bucket → MinIO buckets
- S3 SDK unchanged (API compatible)
- Changed `S3_ENDPOINT` to point to MinIO
- Added `S3_FORCE_PATH_STYLE=true` for MinIO

**Process Management**:
- ECS tasks → PM2 processes
- Cluster mode for APIs (horizontal scaling)
- Fork mode for workers (avoid duplication)
- Graceful shutdown handling

**Removed AWS-Specific Code**:
- Files: `src/arch/awsConfig.ts`, `src/arch/dynamoDbUtils.ts`
- Functions: `loadSecretsToEnv()`, `getDynamoClient()`
- Config keys: DynamoDB-related configuration
- Metrics: Removed "dynamodb" from circuit breaker sources

**Updated Comments**:
- Changed "DynamoDB" → "PostgreSQL" throughout codebase
- Updated architecture documentation
- Removed AWS references in logs

### Migration Benefits

- **Cost**: No AWS charges, only infrastructure costs
- **Control**: Full control over infrastructure and data
- **Portability**: Can run anywhere (local, VPS, dedicated servers)
- **Simplicity**: Fewer external dependencies
- **Performance**: PostgreSQL batching 20x larger than DynamoDB
- **Debugging**: Direct access to logs, databases, queues

### Compatibility Notes

- Message formats preserved (BullMQ jobs use same payloads as SQS)
- API contracts unchanged (clients unaffected)
- Database schema redesigned but functionality equivalent
- All tests passing (326/326 unit tests)

---

## Appendix

### Glossary

- **ANS-104**: Arweave standard for bundled data items
- **BDI**: Bundle Data Item (nested bundle within bundle)
- **Winc**: Winc (Winston Credit) - smallest unit of Arweave storage credit (10^-12 AR)
- **JWK**: JSON Web Key (Arweave wallet format)
- **ArNS**: Arweave Name System (decentralized naming)
- **Optical Posting**: Optimistic caching to AR.IO Gateway before Arweave confirmation
- **Circuit Breaker**: Fault tolerance pattern that prevents cascading failures

### File Structure

```
ar-io-bundler/
├── packages/
│   ├── payment-service/
│   │   ├── src/
│   │   │   ├── architecture.ts       # DI container
│   │   │   ├── server.ts             # Koa HTTP server
│   │   │   ├── router.ts             # Route definitions
│   │   │   ├── database/             # PostgreSQL layer
│   │   │   ├── gateway/              # Blockchain gateways
│   │   │   ├── pricing/              # Pricing service
│   │   │   ├── routes/               # Route handlers
│   │   │   ├── middleware/           # Koa middleware
│   │   │   └── migrations/           # Database migrations
│   │   ├── tests/                    # Test files
│   │   └── lib/                      # Compiled output
│   │
│   └── upload-service/
│       ├── src/
│       │   ├── arch/                 # Architecture components
│       │   │   ├── architecture.ts   # DI container
│       │   │   ├── db/               # Database layer
│       │   │   ├── queues.ts         # BullMQ integration
│       │   │   ├── payment.ts        # Payment service client
│       │   │   ├── s3ObjectStore.ts  # MinIO/S3 client
│       │   │   └── elasticacheService.ts  # Redis cache
│       │   ├── server.ts             # Koa HTTP server
│       │   ├── router.ts             # Route definitions
│       │   ├── routes/               # Route handlers
│       │   ├── jobs/                 # Job handlers
│       │   │   ├── plan.ts           # Bundle planning
│       │   │   ├── prepare.ts        # Bundle preparation
│       │   │   ├── post.ts           # Arweave posting
│       │   │   ├── verify.ts         # Verification
│       │   │   ├── optical-post.ts   # AR.IO integration
│       │   │   ├── unbundle-bdi.ts   # BDI unbundling
│       │   │   └── putOffsets.ts     # Offset storage
│       │   ├── workers/              # BullMQ workers
│       │   │   └── allWorkers.ts     # All 11 workers
│       │   ├── bundles/              # ANS-104 bundling
│       │   ├── migrations/           # Database migrations
│       │   └── constants.ts          # Configuration
│       ├── tests/                    # Test files
│       └── lib/                      # Compiled output
│
├── infrastructure/
│   ├── postgres/
│   │   └── init-databases.sql        # Database initialization
│   └── pm2/
│       └── ecosystem.config.js       # PM2 configuration
│
├── docker-compose.yml                # Infrastructure definition
├── package.json                      # Monorepo config
├── .env                              # Environment variables
└── ARCHITECTURE.md                   # This file
```

### Key Constants

From `packages/upload-service/src/constants.ts`:

```typescript
// Limits
MAX_DATA_ITEM_SIZE = 4GB (default)
MAX_BUNDLE_SIZE = 2GB (default)
MAX_DATA_ITEM_LIMIT = 10,000 items per bundle

// Thresholds
txPermanentThreshold = 18 blocks
txConfirmationThreshold = 1 block
retryLimitForFailedDataItems = 10

// Timeouts
POSTGRES_OFFSETS_TTL_SECS = 31,536,000 (365 days)
POSTGRES_DATA_ITEM_BYTES_THRESHOLD = 10,240 (10 KiB)

// Multipart
multipartChunkMinSize = 5 MiB
multipartChunkMaxSize = 500 MiB
multipartDefaultChunkSize = 25 MB
```

### Support & Resources

- **GitHub**: https://github.com/vilenarios/ar-io-bundler
- **Arweave Docs**: https://docs.arweave.org
- **AR.IO Docs**: https://docs.ar.io
- **ANS-104 Spec**: https://github.com/ArweaveTeam/arweave-standards/blob/master/ans/ANS-104.md

---

**Document Version**: 1.0.0
**Generated**: 2025-10-24
**Author**: Claude Code (AI Assistant)
**Status**: Complete
