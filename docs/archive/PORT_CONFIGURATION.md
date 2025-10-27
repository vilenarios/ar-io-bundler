# Port Configuration for AR.IO Gateway + Bundler

## Services Running on This Server

### AR.IO Gateway (Docker Containers)
- **Port 3000**: Gateway Envoy (Frontend/HTTP Proxy)
- **Port 4000**: Gateway Core Service  
- **Port 5050**: Gateway Observer
- **Port 32778**: Gateway Redis (randomly mapped from 6379)

### AR.IO Bundler Services (PM2)
- **Port 3001**: Upload Service API
- **Port 4001**: Payment Service API

### AR.IO Bundler Infrastructure (Docker)
- **Port 5432**: PostgreSQL Database
- **Port 6379**: Redis Cache  
- **Port 6381**: Redis Queues
- **Port 9000-9001**: MinIO S3-Compatible Storage

## Service Communication

```
Upload Service (3001) ──> Payment Service (4001)
         │
         ├──> PostgreSQL (5432 - upload_service DB)
         ├──> Redis Cache (6379)
         ├──> Redis Queues (6381)
         └──> MinIO (9000-9001)

Payment Service (4001) ──> PostgreSQL (5432 - payment_service DB)
```

## Environment Variable Configuration

### Upload Service (.env)
```bash
PORT=3001
UPLOAD_SERVICE_PORT=3001
PAYMENT_SERVICE_BASE_URL=localhost:4001
PAYMENT_SERVICE_PROTOCOL=https
TURBO_JWK_FILE=/home/vilenarios/ar-io-bundler/wallet.json
DB_DATABASE=upload_service
```

### Payment Service (.env)
```bash
PORT=4001
PAYMENT_SERVICE_PORT=4001
X402_PAYMENT_ADDRESS=0xCFd3f996447a541Cbfba5422310EDb417d9f2cE6
DB_DATABASE=payment_service
```

## PM2 Process Management

Start services with explicit PORT environment variables:
```bash
# Payment Service
PORT=4001 NODE_ENV=development pm2 start lib/index.js --name payment-service -i 2

# Upload Service  
PORT=3001 NODE_ENV=production pm2 start lib/index.js --name upload-api -i 2

# Save configuration
pm2 save
```

## Important Notes

1. **Never use port 3000 or 4000** - Reserved for AR.IO Gateway
2. **Always set PORT explicitly** when starting PM2 services
3. **PAYMENT_SERVICE_BASE_URL** should NOT include protocol (it's prepended automatically)
4. **wallet.json** must be in `/home/vilenarios/ar-io-bundler/` directory
5. **Both databases** (upload_service and payment_service) run on same PostgreSQL instance (port 5432)

## Verification Commands

```bash
# Check all services
pm2 list

# Check ports in use
ss -tlnp | grep -E "3000|3001|4000|4001|5432|6379"

# Test endpoints
curl http://localhost:3001/health  # Upload service
curl http://localhost:4001/health  # Payment service
curl http://localhost:3000/        # AR.IO Gateway
```

## x402 Integration Status

✅ Payment Service: Fully functional with x402 endpoints
✅ Upload Service: x402 code integrated, ready for testing
✅ Database: x402 migration applied (20251027000000_x402_payments)
✅ All non-x402 functionality: Working correctly

