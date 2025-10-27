# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is the Turbo Payment Service - a Node.js payment processing service that handles cryptocurrency payments (Arweave, Ethereum, Solana, Matic/POL, KYVE, Base-ETH), Stripe payments, and credit management for ArDrive's Turbo infrastructure. The service manages user balances, payment receipts, promotional codes, and ArNS (Arweave Name System) purchases.

## Key Commands

### Development Setup
```bash
cp .env.sample .env  # Create environment file (update with actual values)
yarn                 # Install dependencies
yarn build           # Clean and compile TypeScript to lib/
yarn db:up           # Start PostgreSQL in Docker and run migrations
yarn start           # Start the compiled service
yarn start:watch     # Development mode with hot reloading via nodemon
```

### Testing
```bash
# Unit tests only (tests in src/**/*.test.ts)
yarn test:unit

# Integration tests only (tests in tests/**/*.test.ts)
yarn test:integration:local          # Runs against local docker postgres
yarn test:integration:local -g "Router"  # Run specific integration tests

# All tests
yarn test            # Run all unit and integration tests
yarn test:docker     # Run all tests in isolated Docker container

# Continuous testing during development
watch -n 30 'yarn test:integration:local -g "Router"'  # Re-run tests every 30s
```

### Code Quality
```bash
yarn lint:check      # Check for ESLint errors
yarn lint:fix        # Auto-fix ESLint errors
yarn format:check    # Check Prettier formatting
yarn format:fix      # Auto-fix Prettier formatting
yarn typecheck       # Run TypeScript type checking without emitting files
```

### Database Migrations
```bash
yarn db:migrate:latest                    # Run all pending migrations
yarn db:migrate:rollback                  # Rollback last migration
yarn db:migrate:rollback --all            # Rollback all migrations
yarn db:migrate:list                      # List all applied migrations
yarn db:migrate:make MIGRATION_NAME       # Create new migration file

# Manual migration commands
yarn knex migrate:up MIGRATION_NAME.ts --knexfile src/database/knexfile.ts
yarn knex migrate:down MIGRATION_NAME.ts --knexfile src/database/knexfile.ts
```

#### Creating Migrations
1. Add migration logic to `src/database/schema.ts` as a static function
2. Run `yarn db:migrate:make MIGRATION_NAME` to generate migration file in `src/migrations/`
3. Update the generated migration to call the function from step 1
4. Run `yarn db:migrate:latest` to apply the migration

### Docker
```bash
yarn start:docker    # Run service + postgres in docker
yarn db:up           # Start only postgres container
yarn db:down         # Stop and remove postgres container with volume
```

## Architecture Overview

### Core Architecture Pattern
The service uses a dependency injection pattern centered around the `Architecture` interface (src/architecture.ts:24):
```typescript
interface Architecture {
  paymentDatabase: Database;
  pricingService: PricingService;
  stripe: Stripe;
  emailProvider?: EmailProvider;
  gatewayMap: GatewayMap;
}
```

This architecture object is injected into the Koa middleware context, making these dependencies available to all route handlers.

### Application Structure

**Entry Point (src/index.ts)**
- Starts HTTP server via `createServer()`
- Starts SQS consumers via `startConsumers()`

**HTTP Server (src/server.ts)**
- Koa-based REST API on port 4000 (configurable)
- JWT authentication middleware (passthrough mode - routes handle auth checks)
- Architecture dependencies injected via middleware
- Routes defined in src/router.ts

**SQS Consumers (src/consumer.ts)**
Two background job processors:
1. **Pending Payment TX Queue**: Credits user accounts when blockchain transactions are confirmed
2. **Admin Credit Tool Queue**: Bulk credit operations for administrative tasks

### Key Components

**Database Layer (src/database/)**
- `Database` interface defines all data operations
- `PostgresDatabase` is the primary implementation using Knex.js
- Schema migrations in src/migrations/
- Database types and mappings in dbTypes.ts and dbMaps.ts

**Gateway Layer (src/gateway/)**
- Abstract `Gateway` class defines blockchain interaction interface
- Implementations: ArweaveGateway, EthereumGateway, SolanaGateway, MaticGateway, KyveGateway, BaseEthGateway, ARIOGateway
- Gateways handle: transaction verification, balance checks, address validation
- Each gateway knows how to poll for transaction confirmations on its blockchain

**Pricing Service (src/pricing/)**
- `PricingService` interface with `TurboPricingService` implementation
- Oracles for rate conversions:
  - `BytesToWinstonOracle`: Storage bytes → Arweave Winston
  - `TokenToFiatOracle`: Cryptocurrency → Fiat currency
- Handles promotional codes, discounts, and payment adjustments

**Routes (src/routes/)**
Key route categories:
- **x402 Payment Protocol (Primary)**: `/v1/x402/*` - HTTP 402 standard with USDC
  - `GET /v1/x402/price/:signatureType/:address?bytes=N` - Returns 402 with payment requirements
  - `POST /v1/x402/payment/:signatureType/:address` - Verify and settle x402 payment
  - `POST /v1/x402/finalize` - Finalize payment with fraud detection
- Price calculation: `/v1/price/*`, `/v1/arns/price/*`
- Balance operations: `/v1/balance`, `/v1/reserve-balance`, `/v1/refund-balance`
- Payments: `/v1/top-up`, `/v1/redeem`, `/v1/stripe-webhook`
- ArNS purchases: `/v1/arns/purchase`, `/v1/arns/quote`
- Delegated payment approvals: `/v1/account/approvals/*`

**Middleware (src/middleware/)**
- `verifySignature`: Validates cryptographic signatures on requests
- `architectureMiddleware`: Injects Architecture dependencies into context
- `loggerMiddleware`: Request/response logging

### Data Flow Examples

**Payment Processing (Stripe)**
1. User initiates payment → Stripe checkout session created
2. Stripe webhook → `/v1/stripe-webhook` → `stripeRoute`
3. Event handlers process payment → Create payment receipt
4. Credits added to user balance in database

**Crypto Payment Processing**
1. User submits transaction ID → `/v1/account/balance/:token` → `addPendingPaymentTx`
2. Transaction stored as "pending" in database
3. SQS message triggers `creditPendingTx` job
4. Gateway polls blockchain for confirmation
5. When confirmed: credits applied, receipt created, transaction marked as "credited"

**ArNS Purchase Flow**
1. Price quote: `GET /v1/arns/price/:intent/:name`
2. Purchase initiation: `POST /v1/arns/purchase/:intent/:name`
3. Status check: `GET /v1/arns/purchase/:nonce`
4. Stripe payment flow or crypto payment flow
5. On success: interact with ARIOGateway to complete ArNS registration

### x402 Payment Protocol (Primary Flow)

The service implements Coinbase's x402 standard as the primary payment method:

**Three-Phase Flow:**

**Phase 1: Price Quote (GET /v1/x402/price/:signatureType/:address?bytes=N)**
- Returns 402 Payment Required (NOT 200!)
- Headers: `X-Payment-Required: x402-1`
- Response includes PaymentRequirements with all required fields:
  - `scheme`: "exact" (EIP-3009 payment scheme)
  - `network`: "base-sepolia", "base-mainnet", etc.
  - `maxAmountRequired`: USDC amount in smallest unit (6 decimals)
  - `resource`: "/v1/tx" (the upload endpoint)
  - `description`: Human-readable payment description
  - `mimeType`: "application/json"
  - `payTo`: Recipient Ethereum address
  - `maxTimeoutSeconds`: Payment authorization timeout
  - `asset`: USDC contract address
  - `extra`: { name: "USD Coin", version: "2" }

**Phase 2: Verify and Settle (POST /v1/x402/payment/:signatureType/:address)**
- Validates X-PAYMENT header (base64 JSON with EIP-712 signature)
- Verifies EIP-3009 authorization signature
- Calls USDC contract's `receiveWithAuthorization()` or simulates transfer
- Returns payment result with paymentId, txHash, network, mode

**Phase 3: Finalize (POST /v1/x402/finalize)**
- Fraud detection: compares declared byteCount vs actual data item size
- Refunds or penalizes based on discrepancy
- Returns finalization status

**Implementation Files:**
- `src/routes/x402Price.ts` - 402 responses with payment requirements
- `src/routes/x402Payment.ts` - Payment verification and settlement
- `src/routes/x402Finalize.ts` - Fraud detection and finalization
- `src/x402/x402Service.ts` - Type definitions and interfaces
- `src/pricing/x402PricingOracle.ts` - AR → USD → USDC conversion

**Payment Modes:**
- `payg`: Pay-as-you-go (payment covers only this upload)
- `topup`: Credit account balance (payment adds to user credits)
- `hybrid`: Pay for upload + excess tops up balance (DEFAULT)

**Standards:**
- x402 Protocol: https://github.com/coinbase/x402
- EIP-3009: TransferWithAuthorization (gasless USDC transfers)
- EIP-712: Typed structured data signing

## Important Implementation Notes

### Environment Configuration
- Set `NODE_ENV=test` to avoid AWS credential lookups during local development
- Secrets loaded from AWS Secrets Manager in production via `loadSecretsToEnv()`
- Required env vars: `STRIPE_SECRET_KEY`, `PRIVATE_ROUTE_SECRET`

### Cryptographic Address Types
The service supports multiple address types (DestinationAddressType):
- `arweave`: Base64URL Arweave addresses
- `ethereum`: Ethereum addresses
- `solana` / `ed25519`: Solana addresses
- `kyve`: KYVE addresses
- `email`: Email-based gifting
- `matic` / `pol`: Polygon addresses
- `base-eth`: Base chain addresses

Each has validation in `src/utils/base64.ts` via `isValidUserAddress()`

### Balance Reservations
The service implements a reservation system for balance holds:
- `reserveBalance`: Temporarily lock credits for a pending operation
- `refundBalance`: Release reserved credits back to available balance
- Used to prevent double-spending during multi-step operations

### Testing Patterns
- **Unit tests**: Co-located with source files (*.test.ts in src/)
- **Integration tests**: Separate tests/ directory
- Integration tests require postgres - use `yarn test:integration:local` which handles DB lifecycle
- Test helpers in tests/dbTestHelper.ts for database setup/teardown
- Use `dbTestHelper.ts` functions for integration test database management

### Type System
Custom types in src/types/ provide domain modeling:
- `Winston`, `W`: Arweave's smallest unit (10^-12 AR)
- `ByteCount`: Validated byte quantities
- `PositiveFiniteInteger`: Ensures positive integers
- Strong typing prevents unit confusion (bytes vs winston vs fiat)

### Husky Git Hooks
Pre-commit hooks run linting and formatting - configured via husky and lint-staged in package.json

### API Compatibility
Maintains backward compatibility with older ArDrive/Arweave ecosystem tools:
- `/account/balance/:token` routes (legacy format)
- `/price/:token/:amount` routes (Arconnect compatibility)
- Stubbed balance routes return large dummy values for compatibility

## Development Workflow

1. Make code changes
2. Run `yarn typecheck` to catch type errors
3. Run `yarn lint:fix` and `yarn format:fix` before committing
4. Run relevant tests: `yarn test:unit` or `yarn test:integration:local`
5. Commit (husky will run pre-commit hooks)
6. Migrations: Follow the migration creation process if database changes are needed
