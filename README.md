# AR.IO Bundler

Complete ANS-104 data bundling platform for Arweave with AR.IO Gateway integration.

## Overview

AR.IO Bundler is a comprehensive platform that packages [ANS-104](https://github.com/ArweaveTeam/arweave-standards/blob/master/ans/ANS-104.md) data items for reliable delivery to Arweave. It consists of two primary microservices working together to provide upload and payment functionality with optimistic caching through AR.IO Gateway integration.

### Architecture

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

## Quick Start

### Prerequisites

- Node.js 18+ (via [nvm](https://github.com/nvm-sh/nvm))
- Yarn 3+
- Docker & Docker Compose
- PM2 (optional, for production)

### Installation

```bash
# Clone the repository
git clone https://github.com/vilenarios/ar-io-bundler.git
cd ar-io-bundler

# Install dependencies
yarn install

# Copy environment template
cp packages/upload-service/.env.sample packages/upload-service/.env

# Edit configuration (set TURBO_JWK_FILE, PRIVATE_ROUTE_SECRET, etc.)
nano packages/upload-service/.env

# Add your Arweave wallet
cp /path/to/your/wallet.json ./wallet.json

# Start infrastructure (PostgreSQL, Redis, MinIO)
docker compose up -d

# Run database migrations
yarn db:migrate

# Build services
yarn build

# Start with PM2 (production)
pm2 start infrastructure/pm2/ecosystem.config.js

# Or start in development mode
yarn dev:payment    # Terminal 1
yarn dev:upload     # Terminal 2
```

### Verify Installation

```bash
# Check services are running
curl http://localhost:3001/v1/info  # Upload service
curl http://localhost:4001/v1/info  # Payment service

# View queue dashboard
open http://localhost:3002/admin/queues
```

## Services

### Payment Service (`packages/payment-service`)

Handles payment processing, credit management, and blockchain payment gateway integrations.

**Features:**
- Cryptocurrency payment processing (Arweave, Ethereum, Solana, Matic, KYVE, Base-ETH)
- Stripe payment integration
- User balance and credit management
- ArNS (Arweave Name System) purchase handling
- Promotional code support
- Delegated payment approvals

**Port:** 4001

### Upload Service (`packages/upload-service`)

Accepts data item uploads and manages asynchronous fulfillment of data delivery to Arweave.

**Features:**
- Single and multipart data item uploads (up to 10GB)
- Asynchronous job processing via BullMQ (11 queues)
- ANS-104 bundle creation and posting
- MinIO object storage integration
- PostgreSQL offset storage for data retrieval
- PM2-managed workers for background processing
- AR.IO Gateway optimistic caching (optical posting)
- Nested bundle (BDI) unbundling

**Port:** 3001

## Project Structure

```
ar-io-bundler/
├── packages/              # Service packages
│   ├── payment-service/   # Payment processing service
│   └── upload-service/    # Upload and bundling service
├── infrastructure/        # Infrastructure configuration
│   ├── postgres/          # Database initialization
│   └── pm2/               # PM2 process configs
├── scripts/               # Automation scripts
├── docs/                  # Documentation
│   ├── architecture/      # System architecture
│   ├── setup/             # Installation guides
│   ├── operations/        # Production deployment
│   ├── api/               # API reference
│   └── migration/         # AWS migration history
└── docker-compose.yml     # Infrastructure definition
```

## Common Commands

```bash
# Development
yarn dev                    # Start all services in dev mode
yarn dev:payment            # Start only payment service
yarn dev:upload             # Start only upload service

# Building
yarn build                  # Build all packages
yarn build:payment          # Build payment service
yarn build:upload           # Build upload service

# Testing
yarn test                   # Run all tests
yarn test:unit              # Run unit tests only
yarn test:payment           # Test payment service
yarn test:upload            # Test upload service

# Database
yarn db:migrate             # Run all migrations
yarn db:migrate:payment     # Migrate payment service DB
yarn db:migrate:upload      # Migrate upload service DB

# Infrastructure
docker compose up -d        # Start all infrastructure
docker compose down         # Stop all infrastructure
docker compose restart      # Restart infrastructure
docker compose logs -f      # View infrastructure logs

# Production (PM2)
pm2 start infrastructure/pm2/ecosystem.config.js  # Start all services
pm2 stop all                # Stop all PM2 processes
pm2 restart all             # Restart all PM2 processes
pm2 logs                    # View PM2 logs
pm2 monit                   # Monitor PM2 processes

# Code Quality
yarn lint                   # Lint all packages
yarn lint:fix               # Fix linting issues
yarn format                 # Format all code
yarn format:check           # Check code formatting
yarn typecheck              # TypeScript type checking
```

## Infrastructure

The platform uses the following infrastructure components:

| Component | Port | Purpose |
|-----------|------|---------|
| PostgreSQL | 5432 | Relational database (2 databases) |
| Redis (cache) | 6379 | Application caching |
| Redis (queues) | 6381 | BullMQ job queues |
| MinIO API | 9000 | S3-compatible object storage |
| MinIO Console | 9001 | Web UI for MinIO |
| Upload Service | 3001 | Upload API |
| Bull Board | 3002 | Queue monitoring dashboard |
| Payment Service | 4001 | Payment API |

## Documentation

- 📐 **[Architecture](./docs/architecture/ARCHITECTURE.md)** - Complete system architecture
- 🚀 **[Setup Guide](./docs/setup/)** - Installation and configuration
- ⚙️ **[Operations](./docs/operations/)** - Production deployment and monitoring
- 🔌 **[API Reference](./docs/api/)** - Service API documentation
- 🔄 **[Migration History](./docs/migration/)** - AWS to open-source migration

## Development Workflow

1. **Make changes** in the appropriate package
2. **Run tests**: `yarn test:unit`
3. **Check types**: `yarn typecheck`
4. **Lint & format**: `yarn lint:fix && yarn format`
5. **Commit** (husky will run pre-commit hooks)

## Environment Configuration

Key environment variables to configure in `.env`:

```bash
# Required
PRIVATE_ROUTE_SECRET=           # Generate with: openssl rand -hex 32
DB_PASSWORD=postgres            # PostgreSQL password
TURBO_JWK_FILE=./wallet.json    # Arweave wallet for bundle signing

# Stripe (for credit card payments)
STRIPE_SECRET_KEY=              # Stripe API key
STRIPE_WEBHOOK_SECRET=          # Stripe webhook secret

# AR.IO Gateway Integration
OPTICAL_BRIDGING_ENABLED=true   # Enable optimistic caching
OPTICAL_BRIDGE_URL=             # AR.IO Gateway URL
AR_IO_ADMIN_KEY=                # AR.IO admin key

# Optional
ALLOW_LISTED_ADDRESSES=         # Comma-separated addresses for free uploads
```

See [Configuration Reference](./docs/architecture/ARCHITECTURE.md#configuration) for all environment variables.

## Key Features

- ✅ **ANS-104 Bundling**: Standards-compliant data item bundling
- ✅ **Multi-signature Support**: Arweave, Ethereum, Solana, and more
- ✅ **Multipart Uploads**: Support for large files (up to 10GB)
- ✅ **Crypto Payments**: Multiple blockchain payment options
- ✅ **Stripe Integration**: Credit card payment processing
- ✅ **ArNS Purchases**: Arweave Name System integration
- ✅ **Optimistic Caching**: AR.IO Gateway optical posting
- ✅ **Open Source Stack**: No cloud vendor lock-in
- ✅ **Self-hosted**: Full control over infrastructure

## Production Deployment

For production deployment, see:
- [Operations Guide](./docs/operations/) - Deployment, monitoring, backups
- [Architecture Documentation](./docs/architecture/ARCHITECTURE.md#deployment) - Detailed deployment instructions

Key considerations:
- Configure SSL/TLS with reverse proxy (nginx/Caddy)
- Set up database backups
- Configure monitoring and alerting
- Use strong secrets and credentials
- Follow security best practices

## Testing

```bash
# Unit tests (fast)
yarn test:unit

# Integration tests (requires infrastructure)
yarn workspace @ar-io-bundler/upload-service test:integration:local
yarn workspace @ar-io-bundler/payment-service test:integration:local
```

**Test Coverage**:
- Payment Service: 143 unit tests ✅
- Upload Service: 183 unit tests ✅
- Total: 326/326 passing

## Technology Stack

- **Runtime**: Node.js 18+, TypeScript
- **Package Manager**: Yarn 3.6.0 (workspaces)
- **Web Framework**: Koa 3.0
- **Database**: PostgreSQL 16.1
- **Cache**: Redis 7.2
- **Object Storage**: MinIO
- **Job Queue**: BullMQ
- **Process Manager**: PM2
- **ORM**: Knex.js
- **Testing**: Mocha, Chai
- **Observability**: Winston, OpenTelemetry, Prometheus

## License

This project is licensed under the GNU Affero General Public License v3.0 - see [LICENSE](./LICENSE) for details.

## Support

- **GitHub**: https://github.com/vilenarios/ar-io-bundler
- **Issues**: https://github.com/vilenarios/ar-io-bundler/issues
- **Documentation**: [docs/](./docs/)
- **Arweave**: https://docs.arweave.org
- **AR.IO**: https://docs.ar.io

---

**Built with ❤️ for the Arweave ecosystem**
