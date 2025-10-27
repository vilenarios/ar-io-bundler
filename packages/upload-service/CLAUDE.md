# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This is the Turbo Upload Service, a microservice that accepts incoming data uploads in single request or multipart fashion for bundling [ANS-104](https://github.com/ArweaveTeam/arweave-standards/blob/master/ans/ANS-104.md) data items for reliable delivery to Arweave. It integrates with the separate `turbo-payment-service` for credit management and blockchain payments.

Data items can be signed with Arweave, Ethereum, or Solana private keys.

## Common Commands

```bash
# Setup
cp .env.sample .env
yarn
yarn build

# Database
yarn db:up                      # Start PostgreSQL in Docker and run migrations
yarn db:down                    # Stop and remove database container
yarn db:migrate:latest          # Run all migrations
yarn db:migrate:rollback        # Rollback last migration
yarn db:migrate:new MIGRATION_NAME  # Generate new migration file
yarn db:migrate:list            # List applied migrations

# Development
yarn start:watch                # Development mode with hot reload via nodemon
yarn start                      # Production mode

# Testing
yarn test:unit                  # Unit tests only
yarn test:integration:local     # Integration tests with Docker DB and ArLocal
yarn test:integration:local -g "Router"  # Targeted integration tests
yarn test:docker                # Full test suite in isolated container (recommended)

# Additional Services
yarn arlocal:up / yarn arlocal:down      # Local Arweave gateway for testing
yarn localstack:up / yarn localstack:down  # Local AWS services emulation

# Docker
docker compose up upload-service --build
docker compose --env-file ./.env.localstack up upload-service

# Build Lambda Functions
yarn build:lambda               # Bundles Lambda functions for deployment using esbuild

# Code Quality
yarn lint:check / yarn lint:fix
yarn format:check / yarn format:fix
yarn typecheck

# Multi-Environment
yarn dotenv -e .env.dev yarn db:migrate:latest  # Run commands against specific environments
```

## Architecture Patterns

### Dependency Injection via Architecture Object

The service uses a centralized `Architecture` interface (src/arch/architecture.ts) to inject dependencies throughout the application:

- `database`: PostgreSQL database interface (read/write knex connections)
- `objectStore`: S3-compatible object storage
- `cacheService`: ElastiCache/Redis caching layer
- `paymentService`: Integration with turbo-payment-service
- `arweaveGateway`: Arweave network gateway for posting bundles
- `logger`: Winston logger instance
- `getArweaveWallet`: JWK wallet provider for bundle signing
- `tracer`: OpenTelemetry tracer (optional)

This pattern enables testability and environment-specific configurations. The `defaultArchitecture` object is instantiated in src/arch/architecture.ts.

### Database Management with Knex

Knex.js is used for migrations and queries with separate reader/writer connections.

**Migration workflow:**
1. Add migration function to `src/arch/db/migrator.ts` (NOT in generated files)
2. Generate migration file: `yarn db:migrate:new MIGRATION_NAME`
3. Update the generated migration file in `src/migrations/` to call the migrator function
4. Run: `yarn db:migrate:latest`

**Important**: Construct migration queries in `src/arch/db/migrator.ts`, not directly in the generated migration files.

### Router and Routes Pattern

Uses Koa with a router (src/router.ts) that delegates to route handlers in src/routes/:
- `dataItemPost.ts`: Single data item uploads
- `multiPartUploads.ts`: Multi-part upload flow (create, chunk, finalize)
- `status.ts`: Data item status checks
- `offsets.ts`: Data item offset information
- `info.ts`: Service info
- `swagger.ts`: API documentation

Routes are served at both root and `/v1` prefix for versioning.

### Asynchronous Job Pipeline

The fulfillment pipeline processes uploaded data items asynchronously via SQS queues consumed by Lambda/ECS tasks. Jobs are defined in src/jobs/:

- `plan.ts`: Groups new data items into bundle plans based on size and feature type
- `prepare.ts`: Prepares data items for bundling (downloads from S3, assembles bundles)
- `post.ts`: Posts bundles to Arweave
- `verify.ts`: Verifies successful bundle posting
- `optical-post.ts`: Alternative optical posting workflow
- `unbundle-bdi.ts`: Unbundles nested bundle data items (BDIs)
- `cleanup-fs.ts`: Cleans up temporary filesystem artifacts
- `putOffsets.ts`: Writes offset data to DynamoDB for retrieval

Jobs are enqueued via `enqueue()` function in src/arch/queues.ts, which sends messages to SQS queues. The fulfillment-pipeline (ecs/fulfillment-pipeline/) contains Lambda handlers that consume these messages.

**Key flow**: Upload → DB insert → plan → prepare → post → verify → cleanup

### Object Storage

Data items are stored in S3 (or S3-compatible storage). Two implementations:
- `S3ObjectStore` (src/arch/s3ObjectStore.ts): Production S3 integration
- `FileSystemObjectStore` (src/arch/fileSystemObjectStore.ts): Local development

Storage keys follow patterns like `${uploadId}/${chunkIndex}` for multipart uploads.

### Payment Service Integration

The `PaymentService` interface (src/arch/payment.ts) integrates with turbo-payment-service for:
- **x402 Protocol Support**: Primary payment flow using HTTP 402 with USDC (EIP-3009)
  - `getX402PriceQuote()`: Returns 402 Payment Required with payment requirements
  - `verifyAndSettleX402Payment()`: Validates and settles x402 USDC payments
  - `finalizeX402Payment()`: Fraud detection comparing declared vs actual byte count
- Balance checks and reservations (traditional flow)
- Credit adjustments on upload
- Free upload allowlist validation
- JWT token signing for inter-service auth

Uses circuit breaker pattern (via opossum) for resilience.

### x402 Payment Protocol (Primary Flow)

The service implements Coinbase's x402 standard as the primary payment method for uploads:

**Flow:**
1. Client uploads without X-PAYMENT header → Server returns 402 Payment Required
2. 402 response includes payment requirements (USDC amount, contract, recipient, timeout)
3. Client creates EIP-3009 payment authorization and signs with EIP-712
4. Client retries upload with `X-PAYMENT` header (base64 JSON with signature)
5. Server verifies payment, settles USDC transfer, processes upload
6. Server returns receipt with `x402Payment` object and `X-Payment-Response` header

**Key Headers:**
- `X-Payment-Required: x402-1` - Set on 402 responses
- `X-PAYMENT` - Client sends payment authorization (required with Content-Length)
- `X-Payment-Response` - Server returns payment confirmation (base64 JSON)

**Implementation:** See `src/routes/dataItemPost.ts:330-398` (402 response) and `:961-986` (payment response header)

**Standards:**
- x402 Protocol: https://github.com/coinbase/x402
- EIP-3009: TransferWithAuthorization for gasless USDC transfers
- ANS-104: Arweave data item signing (signatureType 3 for Ethereum wallets)

## Testing Strategy

- **Unit tests**: `src/**/*.test.ts` - Test isolated logic with mocked dependencies
- **Integration tests**: `tests/**/*.test.ts` - Test with real PostgreSQL and ArLocal in Docker
- Use `-g "pattern"` to run specific test suites during development
- `yarn test:docker` runs full suite in clean, isolated environment (recommended before commits)

## Multi-Environment Support

The service supports multiple deployment environments via `.env` files:
- Use `yarn dotenv -e .env.dev <command>` to target specific environments
- LocalStack integration enables local AWS service emulation for development
- ArLocal provides local Arweave gateway for testing

## Key Environment Variables

See `.env.sample` for full configuration. Critical variables:
- `NODE_ENV`: Environment mode (test, development, production)
- `DB_WRITER_ENDPOINT` / `DB_READER_ENDPOINT`: PostgreSQL connection endpoints
- `DB_PASSWORD`: Database password
- `PAYMENT_SERVICE_BASE_URL`: URL for turbo-payment-service integration
- `MIGRATE_ON_STARTUP`: Whether to run migrations on service start
- `ARWEAVE_WALLET`: JSON string of Arweave JWK for bundle signing (required)
- `ALLOW_LISTED_ADDRESSES`: Comma-separated addresses for free uploads
- `PRIVATE_ROUTE_SECRET`: Secret for inter-service authentication
- AWS credentials and regions (S3, SQS, DynamoDB, SSM, Secrets Manager)
- Gateway endpoints and feature flags

## Lambda Build Process

Lambda functions are bundled using esbuild via `yarn build:lambda` (scripts/bundle-lambdas.cjs). This:
1. Compiles TypeScript to JavaScript
2. Bundles each job handler into a single minified file
3. Outputs to `lib/jobs/<job-name>-min.js`
4. Excludes native database drivers (pg-native, sqlite3, etc.)

Bundled Lambdas: plan, prepare, post, seed, verify, optical-post, unbundle-bdi, cleanup-fs
