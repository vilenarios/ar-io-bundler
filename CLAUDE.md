# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This is the **AR.IO Bundler** - a complete ANS-104 data bundling platform for Arweave with AR.IO Gateway integration. It consists of two primary microservices (Payment Service and Upload Service) that work together to accept data uploads, manage payments, bundle data items, and post them to the Arweave network.

**Monorepo Structure**: This is a Yarn 3 workspace monorepo with:
- `packages/payment-service/` - Payment processing and credit management
- `packages/upload-service/` - Data upload handling and bundling
- `packages/shared/` - Shared types and utilities (minimal)

**IMPORTANT**: Each service has its own detailed `CLAUDE.md` file. Consult those for service-specific implementation details:
- `packages/payment-service/CLAUDE.md` - Payment service architecture and commands
- `packages/upload-service/CLAUDE.md` - Upload service architecture and commands

## Common Commands

### Development Setup
```bash
# Initial setup
yarn install
cp packages/upload-service/.env.sample packages/upload-service/.env
# Edit .env with your configuration (TURBO_JWK_FILE, PRIVATE_ROUTE_SECRET, etc.)

# Start infrastructure
docker compose up -d

# Run database migrations for both services
yarn db:migrate

# Build all packages
yarn build
```

### Running Services

**Development Mode** (separate terminals):
```bash
yarn dev:payment    # Terminal 1: Payment service with hot reload
yarn dev:upload     # Terminal 2: Upload service with hot reload
```

**Production Mode** (PM2):
```bash
pm2 start infrastructure/pm2/ecosystem.config.js
pm2 logs            # View logs
pm2 monit           # Monitor processes
pm2 stop all        # Stop all services
```

### Testing
```bash
# Run all unit tests across both services
yarn test:unit

# Service-specific tests
yarn test:payment
yarn test:upload

# Integration tests (requires running infrastructure)
yarn workspace @ar-io-bundler/payment-service test:integration:local
yarn workspace @ar-io-bundler/upload-service test:integration:local
```

### Database Operations
```bash
# Run migrations for both services
yarn db:migrate

# Service-specific migrations
yarn db:migrate:payment
yarn db:migrate:upload

# Create new migration
yarn workspace @ar-io-bundler/payment-service db:migrate:new MIGRATION_NAME
yarn workspace @ar-io-bundler/upload-service db:migrate:new MIGRATION_NAME
```

### Infrastructure
```bash
docker compose up -d        # Start all infrastructure
docker compose down         # Stop all infrastructure
docker compose logs -f      # View infrastructure logs
docker compose restart      # Restart infrastructure

# Access services
curl http://localhost:3001/v1/info  # Upload service
curl http://localhost:4001/v1/info  # Payment service
open http://localhost:3002/admin/queues  # Bull Board (queue dashboard)
```

### Code Quality
```bash
yarn lint           # Lint all packages
yarn lint:fix       # Fix linting issues
yarn format         # Format all code
yarn typecheck      # TypeScript type checking
```

## High-Level Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────────┐
│                    AR.IO Bundler Platform                        │
│                                                                  │
│  ┌──────────────┐      ┌──────────────┐      ┌──────────────┐  │
│  │   Payment    │◄─────┤    Upload    │◄─────┤   AR.IO      │  │
│  │   Service    │ JWT  │   Service    │ Opt. │   Gateway    │  │
│  │  (Port 4001) │ Auth │  (Port 3001) │ Cache│ (Port 4000)  │  │
│  └──────────────┘      └──────────────┘      └──────────────┘  │
│                                                                  │
│  Infrastructure: PostgreSQL • Redis • MinIO • BullMQ • PM2      │
└─────────────────────────────────────────────────────────────────┘
```

### Service Responsibilities

**Payment Service** (`packages/payment-service/`):
- Manages user balances (Winston credits)
- Processes cryptocurrency payments (Arweave, Ethereum, Solana, Matic, KYVE, Base-ETH)
- Handles Stripe credit card payments
- Manages ArNS (Arweave Name System) purchases
- Provides balance reservation/refund for uploads
- Tracks payment receipts and audit logs

**Upload Service** (`packages/upload-service/`):
- Accepts single and multipart data item uploads (up to 10GB)
- Verifies balances with payment service before accepting uploads
- Manages asynchronous job processing via BullMQ (11 queues)
- Bundles data items using ANS-104 standard
- Posts bundles to Arweave network
- Integrates with AR.IO Gateway for optimistic caching (optical posting)
- Unbundles nested bundle data items (BDIs)
- Tracks data item offsets for retrieval

### Dependency Injection Pattern

Both services use a centralized `Architecture` interface pattern for dependency injection:

**Payment Service** (`src/architecture.ts:24`):
```typescript
interface Architecture {
  paymentDatabase: Database;
  pricingService: PricingService;
  stripe: Stripe;
  emailProvider?: EmailProvider;
  gatewayMap: GatewayMap;
}
```

**Upload Service** (`src/arch/architecture.ts`):
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

This architecture object is injected into Koa middleware context, making dependencies available to all route handlers.

### Inter-Service Communication

- Upload service calls payment service for balance checks and adjustments
- Authentication via JWT tokens with `PRIVATE_ROUTE_SECRET`
- Circuit breaker pattern (opossum) for resilience
- Payment service exposes balance operations at private routes

### Asynchronous Job Processing (Upload Service)

The upload service uses BullMQ with 11 queues for asynchronous fulfillment:

**Job Flow**: `upload → newDataItem → planBundle → prepareBundle → postBundle → verifyBundle`

Parallel jobs: `opticalPost`, `putOffsets`, `cleanupFs`

**Workers**: PM2-managed workers in `packages/upload-service/src/workers/allWorkers.ts`
- 11 worker types with configurable concurrency
- Fork mode execution (single instance to avoid duplicate processing)
- Graceful shutdown with job completion

**Monitoring**: Bull Board at `http://localhost:3002/admin/queues`

### Database Architecture

**Two Separate PostgreSQL Databases**:
- `payment_service` - User accounts, payments, balances, receipts, ArNS purchases
- `upload_service` - Data items, bundles, multipart uploads, offsets

**Migrations**: Knex.js migrations in `src/migrations/` for each service

**Important Migration Pattern**:
1. Add migration logic to service's migrator file (e.g., `src/arch/db/migrator.ts` for upload service)
2. Generate migration file: `yarn db:migrate:new MIGRATION_NAME`
3. Update generated migration to call migrator function
4. Run: `yarn db:migrate:latest`

### Object Storage (MinIO)

- S3-compatible storage for data items and bundles
- Two buckets: `raw-data-items`, `backup-data-items`
- Development: MinIO at `localhost:9000`
- Production: Can use MinIO or AWS S3 (S3 SDK compatible)

### Caching (Redis)

**Two Redis Instances**:
- Port 6379: ElastiCache (data item metadata, API caching)
- Port 6381: BullMQ queues (11 job queues)

## Important Development Patterns

### Testing Strategy

- **Unit tests**: Co-located with source files (`*.test.ts` in `src/`)
- **Integration tests**: Separate `tests/` directory in each package
- Use `yarn test:unit` for fast feedback during development
- Use `yarn test:integration:local` for full integration testing with Docker infrastructure
- Use `-g "pattern"` to target specific test suites

### Migration Workflow

**IMPORTANT**: Do NOT write migration logic directly in generated migration files.

**Correct Workflow**:
1. Add static migration function to `src/database/schema.ts` (payment service) or `src/arch/db/migrator.ts` (upload service)
2. Generate migration: `yarn db:migrate:new MIGRATION_NAME`
3. Update generated file in `src/migrations/` to call your function
4. Apply: `yarn db:migrate:latest`

### Environment Configuration

Key variables (see `.env.sample`):
- `PRIVATE_ROUTE_SECRET` - Inter-service authentication (generate with `openssl rand -hex 32`)
- `TURBO_JWK_FILE` - Arweave wallet for bundle signing (required)
- `DB_PASSWORD` - PostgreSQL password
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` - Stripe integration
- `OPTICAL_BRIDGING_ENABLED`, `OPTICAL_BRIDGE_URL`, `AR_IO_ADMIN_KEY` - AR.IO Gateway integration
- `ALLOW_LISTED_ADDRESSES` - Comma-separated addresses for free uploads

### PM2 Process Management

**Process Configuration** (`infrastructure/pm2/ecosystem.config.js`):
- `payment-service`: 2 instances (cluster mode)
- `upload-api`: 2 instances (cluster mode)
- `upload-workers`: 1 instance (fork mode - IMPORTANT: avoid duplicate job processing)
- `bull-board`: 1 instance (fork mode)

**Cluster vs Fork**:
- Cluster mode for APIs: Horizontal scaling across CPU cores
- Fork mode for workers: Single instance to prevent duplicate job execution

## Migration from AWS

This codebase was completely migrated from AWS to open-source infrastructure:

**Replaced Services**:
- AWS Secrets Manager → `.env` files
- AWS Systems Manager → `.env` files
- Amazon S3 → MinIO
- Amazon DynamoDB → PostgreSQL
- Amazon SQS → BullMQ (Redis)
- AWS Lambda → PM2 Workers
- Amazon ECS → PM2
- Amazon ElastiCache → Redis

**Key Changes**:
- Removed all AWS SDK dependencies
- DynamoDB batch size (25) → PostgreSQL batch insert (500)
- Lambda handlers → Worker functions in `src/workers/`
- All secrets in `.env` (never commit to git)

## Port Allocation

| Service | Port | Description |
|---------|------|-------------|
| Upload API | 3001 | Data upload REST API |
| Bull Board | 3002 | Queue monitoring dashboard |
| Payment API | 4001 | Payment processing REST API |
| AR.IO Gateway | 4000 | AR.IO Gateway (external, optional) |
| PostgreSQL | 5432 | Database server |
| Redis Cache | 6379 | ElastiCache/Redis cache |
| Redis Queues | 6381 | BullMQ job queues |
| MinIO S3 API | 9000 | Object storage API |
| MinIO Console | 9001 | Web UI for MinIO |

## Known Issues

**X402 Integration** (October 2025):
- The x402 payment integration code is present but has compilation issues
- See `X402_BUILD_ISSUES.md` for details
- Missing method implementations: `adjustUserWinstonBalance()`, Winston type methods
- Do not attempt to use x402 routes until these issues are resolved

## Technology Stack

- **Language**: TypeScript/Node.js 18+
- **Package Manager**: Yarn 3.6.0 (workspaces)
- **Web Framework**: Koa 3.0
- **Database**: PostgreSQL 16.1 with Knex.js
- **Cache**: Redis 7.2
- **Object Storage**: MinIO (S3-compatible)
- **Job Queue**: BullMQ
- **Process Manager**: PM2
- **Testing**: Mocha, Chai
- **Observability**: Winston (logging), OpenTelemetry (optional), Prometheus (metrics)
- **Containerization**: Docker Compose

## Documentation

- **Root README.md**: Quick start and feature overview
- **docs/architecture/ARCHITECTURE.md**: Comprehensive architecture documentation (1979 lines)
- **packages/payment-service/CLAUDE.md**: Payment service implementation details
- **packages/upload-service/CLAUDE.md**: Upload service implementation details
- **docs/setup/**: Installation guides
- **docs/operations/**: Production deployment and monitoring
- **docs/api/**: API reference documentation
- **docs/migration/**: AWS to open-source migration history

## Tips for Working in This Codebase

1. **Start with service-specific CLAUDE.md files** - Each service has detailed guidance
2. **Use the TodoWrite tool** for complex multi-step tasks
3. **Run unit tests frequently** during development (`yarn test:unit`)
4. **Check both databases** when debugging - payment_service and upload_service are separate
5. **Monitor Bull Board** for job queue status during development
6. **Use PM2 logs** for debugging: `pm2 logs [service-name]`
7. **Test with local infrastructure** - Docker Compose provides all dependencies
8. **Follow migration patterns** - Never write raw SQL in generated migration files
9. **Respect the architecture pattern** - Dependencies injected via Architecture object
10. **Workers run in fork mode** - Do not cluster workers to avoid duplicate processing
