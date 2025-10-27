# AR.IO Bundler Management Scripts

This directory contains scripts for managing the AR.IO Bundler services.

## Quick Start

```bash
# Start all services
./scripts/start.sh

# Stop all services
./scripts/stop.sh

# Restart all services
./scripts/restart.sh
```

## Available Scripts

### `start.sh` - Start All Services

Starts the complete AR.IO Bundler stack:
- Checks and starts Docker infrastructure (PostgreSQL, Redis, MinIO)
- Builds services if needed
- Starts payment-service on port 4001 (2 instances)
- Starts upload-api on port 3001 (2 instances)
- Saves PM2 configuration

**Prerequisites:**
- Docker and Docker Compose installed
- Wallet file at `./wallet.json`
- Configuration files at `./packages/*/env`

**Usage:**
```bash
./scripts/start.sh
```

**What it does:**
1. ✅ Checks Docker infrastructure
2. ✅ Builds if needed
3. ✅ Validates wallet and config
4. ✅ Starts services with explicit PORT configuration
5. ✅ Saves PM2 state
6. ✅ Shows service status and URLs

### `stop.sh` - Stop All Services

Stops all PM2-managed services without removing them from PM2.

**Usage:**
```bash
./scripts/stop.sh
```

**Note:** Infrastructure (Docker) continues running. To stop infrastructure:
```bash
docker compose down
```

### `restart.sh` - Restart Services

Restarts all running services (zero-downtime reload).

**Usage:**
```bash
./scripts/restart.sh
```

### `migrate-all.sh` - Run Database Migrations

Runs migrations for both payment and upload service databases.

**Usage:**
```bash
./scripts/migrate-all.sh
```

### `setup.sh` - Initial Setup

Initial project setup script (creates databases, runs migrations, etc.).

**Usage:**
```bash
./scripts/setup.sh
```

## Service Management

### Starting Services
```bash
# Start everything with one command
./scripts/start.sh

# Start just infrastructure
docker compose up -d

# Start specific service manually
cd packages/payment-service
PORT=4001 NODE_ENV=production pm2 start lib/index.js --name payment-service -i 2
```

### Stopping Services
```bash
# Stop all services
./scripts/stop.sh

# Stop specific service
pm2 stop payment-service
pm2 stop upload-api

# Stop infrastructure
docker compose down
```

### Restarting Services
```bash
# Restart all services
./scripts/restart.sh

# Restart specific service
pm2 restart payment-service
pm2 restart upload-api

# Graceful reload (zero-downtime)
pm2 reload all
```

### Monitoring
```bash
# View all logs
pm2 logs

# View specific service logs
pm2 logs payment-service
pm2 logs upload-api

# Real-time monitoring
pm2 monit

# Process list
pm2 list

# Service status
pm2 show payment-service
```

## Port Configuration

The scripts use **explicit PORT environment variables** to prevent conflicts with AR.IO Gateway:

| Service | Port | Instances |
|---------|------|-----------|
| Payment Service | 4001 | 2 (cluster) |
| Upload Service | 3001 | 2 (cluster) |

**Reserved Ports (AR.IO Gateway):**
- 3000: Gateway Envoy
- 4000: Gateway Core
- 5050: Gateway Observer

**Infrastructure Ports:**
- 5432: PostgreSQL
- 6379: Redis Cache
- 6381: Redis Queues
- 9000: MinIO API
- 9001: MinIO Console

## Troubleshooting

### Services won't start

Check prerequisites:
```bash
# Check Docker
docker ps

# Check wallet
ls -la wallet.json

# Check .env files
ls -la packages/payment-service/.env
ls -la packages/upload-service/.env

# Check builds
ls -la packages/payment-service/lib
ls -la packages/upload-service/lib
```

### Port conflicts

Verify no other services are using bundler ports:
```bash
ss -tlnp | grep -E ":3001|:4001"
```

If ports are in use:
```bash
# Stop existing PM2 processes
pm2 delete all

# Kill processes on specific port
lsof -ti:3001 | xargs kill -9
lsof -ti:4001 | xargs kill -9
```

### View detailed logs

```bash
# Last 50 lines
pm2 logs --lines 50

# Specific service, last 100 lines
pm2 logs payment-service --lines 100

# Follow logs in real-time
pm2 logs --lines 0
```

### Reset everything

```bash
# Stop and remove all PM2 processes
pm2 delete all

# Stop infrastructure
docker compose down

# Start fresh
./scripts/start.sh
```

## Advanced Usage

### Custom Environment

```bash
# Start with custom NODE_ENV
NODE_ENV=development ./scripts/start.sh

# Start with custom ports (modify script or use manual approach)
cd packages/payment-service
PORT=5001 pm2 start lib/index.js --name payment-service
```

### Production Deployment

For production, consider:
1. **SSL/TLS**: Use nginx/Caddy reverse proxy
2. **Monitoring**: Set up Prometheus + Grafana
3. **Logging**: Configure log rotation
4. **Backups**: Automated database backups
5. **Secrets**: Use environment-specific .env files

### PM2 Startup on Boot

Configure PM2 to start on system boot:
```bash
# Generate startup script
pm2 startup

# Run the command it outputs (requires sudo)

# Save current process list
pm2 save
```

## Testing

After starting services, verify they're working:

```bash
# Health checks
curl http://localhost:3001/health  # Should return: OK
curl http://localhost:4001/health  # Should return: OK

# Pricing endpoint
curl "http://localhost:4001/v1/price/bytes/1000000"

# x402 pricing
curl "http://localhost:4001/v1/x402/price/1/YOUR_ADDRESS?bytes=1000000"
```

## Directory Structure

```
scripts/
├── README.md          # This file
├── start.sh           # Start all services
├── stop.sh            # Stop all services
├── restart.sh         # Restart all services
├── migrate-all.sh     # Run database migrations
├── setup.sh           # Initial setup
└── dev.sh             # Development mode (deprecated)
```

## Migration from Old Approach

If you were using the PM2 ecosystem.config.js approach, the new scripts provide:
- ✅ Explicit PORT configuration (prevents conflicts)
- ✅ Better error checking and validation
- ✅ Clearer output and status information
- ✅ Simpler to understand and debug
- ✅ Works reliably with .env files in package directories

---

For more information, see the main [README.md](../README.md)
