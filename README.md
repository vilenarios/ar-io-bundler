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
│  │  (Port 4000) │ Auth │  (Port 3001) │ Cache│  (Port 3000) │  │
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
- PM2 (for production)

### Installation

```bash
# Clone the repository
git clone https://github.com/ar-io/ar-io-bundler.git
cd ar-io-bundler

# Run setup script
./scripts/setup.sh

# Edit configuration
cp .env.sample .env
nano .env

# Add your Arweave wallet
cp /path/to/your/wallet.json ./wallet.json

# Start infrastructure
yarn infra:up

# Start services (development)
yarn dev

# Or start with PM2 (production)
yarn pm2:start
```

## Services

### Payment Service (`packages/payment-service`)

Handles payment processing, credit management, and blockchain payment gateway integrations.

**Features:**
- Cryptocurrency payment processing (Arweave, Ethereum, Solana, Matic, KYVE, Base-ETH, ARIO)
- Stripe payment integration
- User balance and credit management
- ArNS (Arweave Name System) purchase handling
- Promotional code support

**Port:** 4000

### Upload Service (`packages/upload-service`)

Accepts data item uploads and manages asynchronous fulfillment of data delivery to Arweave.

**Features:**
- Single and multipart data item uploads
- Asynchronous job processing via BullMQ (11 queues)
- MinIO object storage integration
- PostgreSQL offset storage
- PM2-managed workers
- AR.IO Gateway optimistic caching

**Port:** 3001

### Shared Package (`packages/shared`)

Common code shared between services including types, utilities, and middleware.

## Project Structure

```
ar-io-bundler/
├── packages/              # Service packages
│   ├── payment-service/   # Payment processing service
│   ├── upload-service/    # Upload and bundling service
│   └── shared/            # Shared code and utilities
├── infrastructure/        # Infrastructure as code
│   ├── docker/            # Dockerfiles
│   ├── postgres/          # Database configs
│   ├── redis/             # Redis configs
│   ├── minio/             # MinIO configs
│   ├── nginx/             # Reverse proxy configs
│   └── pm2/               # PM2 process configs
├── scripts/               # Automation scripts
├── docs/                  # Documentation
├── tests/                 # End-to-end integration tests
└── deployment/            # Deployment configurations
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
yarn test:e2e               # Run end-to-end tests
yarn test:payment           # Test payment service
yarn test:upload            # Test upload service

# Database
yarn db:up                  # Start database infrastructure
yarn db:down                # Stop database infrastructure
yarn db:migrate             # Run all migrations
yarn db:migrate:payment     # Migrate payment service DB
yarn db:migrate:upload      # Migrate upload service DB

# Infrastructure
yarn infra:up               # Start all infrastructure
yarn infra:down             # Stop all infrastructure
yarn infra:restart          # Restart infrastructure
yarn infra:logs             # View infrastructure logs

# Production (PM2)
yarn pm2:start              # Start all services with PM2
yarn pm2:stop               # Stop all PM2 processes
yarn pm2:restart            # Restart all PM2 processes
yarn pm2:logs               # View PM2 logs
yarn pm2:monit              # Monitor PM2 processes

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
| PostgreSQL | 5432 | Relational database |
| Redis (cache) | 6379 | Application caching |
| Redis (queues) | 6381 | BullMQ job queues |
| MinIO | 9000-9001 | S3-compatible object storage |
| Payment Service | 4000 | Payment API |
| Upload Service | 3001 | Upload API |
| Bull Board | 3002 | Queue monitoring dashboard |
| AR.IO Gateway | 3000 | Gateway (optional) |

## Documentation

- **[Administrator Guide](./ADMINISTRATOR_GUIDE.md)** - Complete setup and deployment guide
- **[E2E Testing Guide](./docs/setup/e2e-testing.md)** - Testing documentation
- **[Architecture Overview](./docs/architecture/overview.md)** - System architecture
- **[API Documentation](./docs/api/)** - Service API references
- **[Troubleshooting](./docs/operations/troubleshooting.md)** - Common issues and solutions

## Development Workflow

1. **Make changes** in the appropriate package
2. **Run tests**: `yarn test:unit` or `yarn test:integration`
3. **Check types**: `yarn typecheck`
4. **Lint**: `yarn lint:fix`
5. **Format**: `yarn format`
6. **Test E2E**: `yarn test:e2e`
7. **Commit** (husky will run pre-commit hooks)

## Production Deployment

See the [Administrator Guide](./ADMINISTRATOR_GUIDE.md) for complete production deployment instructions including:

- Security hardening
- Nginx reverse proxy setup
- SSL/TLS configuration
- Firewall configuration
- Backup procedures
- Monitoring setup

## Environment Configuration

Copy `.env.sample` to `.env` and configure:

```bash
# Required
PRIVATE_ROUTE_SECRET=         # Inter-service auth secret
DB_PASSWORD=                  # PostgreSQL password
STRIPE_SECRET_KEY=            # Stripe API key (for payments)
TURBO_JWK_FILE=./wallet.json  # Arweave wallet for bundle signing

# Optional
OPTICAL_BRIDGING_ENABLED=true     # Enable AR.IO Gateway integration
AR_IO_ADMIN_KEY=                  # AR.IO admin key
ALLOW_LISTED_ADDRESSES=           # Free upload addresses
```

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for contribution guidelines.

## License

This project is licensed under the Apache License 2.0 - see [LICENSE-Apache-2.0.md](./LICENSE-Apache-2.0.md) for details.

## Support

- **Issues**: [GitHub Issues](https://github.com/ar-io/ar-io-bundler/issues)
- **Documentation**: [docs/](./docs/)
- **Administrator Guide**: [ADMINISTRATOR_GUIDE.md](./ADMINISTRATOR_GUIDE.md)

---

**Maintained by the AR.IO team**
