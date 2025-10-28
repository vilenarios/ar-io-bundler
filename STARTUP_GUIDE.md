# AR.IO Bundler - Complete Startup Guide

## Quick Start (Two Commands)

```bash
cd /home/vilenarios/ar-io-bundler
./scripts/start.sh    # Start everything
./scripts/verify.sh   # Verify all systems are healthy
```

The start command starts **EVERYTHING**:
- ✅ Docker infrastructure (PostgreSQL, Redis, MinIO)
- ✅ Payment Service (port 4001)
- ✅ Upload Service (port 3001)
- ✅ Upload Workers (background bundling)

The verify command checks:
- ✅ All Docker containers are healthy
- ✅ All PM2 processes are online
- ✅ HTTP endpoints are responding
- ✅ Services can communicate
- ✅ No critical errors in logs

---

## All Available Scripts

### 1. Start Everything
```bash
./scripts/start.sh
```

**What it does:**
- Checks and starts Docker infrastructure (PostgreSQL, Redis, MinIO)
- Verifies services are built (builds if needed)
- Validates configuration (.env files, wallet.json)
- Starts Payment Service on port 4001 (2 instances)
- Starts Upload Service on port 3001 (2 instances)
- Starts Upload Workers (background job processing)
- Saves PM2 configuration
- Shows status and helpful commands

**Prerequisites checked:**
- wallet.json exists
- .env files exist in both services
- Docker is available

---

### 2. Verify System Health
```bash
./scripts/verify.sh
```

**What it does:**
- Checks all Docker containers are running and healthy
- Verifies all PM2 processes are online
- Tests HTTP endpoints (health, pricing)
- Confirms service connectivity (Redis, inter-service)
- Checks cron job is configured
- Scans logs for critical errors
- Provides summary report with pass/fail counts

**Exit codes:**
- 0 = All checks passed
- 1 = One or more checks failed

**Use this after startup to confirm everything is working!**

---

### 3. Stop Everything
```bash
./scripts/stop.sh
```

**What it does:**
- Stops all PM2 processes (payment-service, upload-api, upload-workers)
- Deletes PM2 processes
- Stops Docker infrastructure (PostgreSQL, Redis, MinIO)
- Shows final status

**Stop PM2 only (keep Docker running):**
```bash
./scripts/stop.sh --services-only
```

---

### 4. Restart Services

**Restart PM2 services only:**
```bash
./scripts/restart.sh
```

**Restart EVERYTHING including Docker:**
```bash
./scripts/restart.sh --with-docker
```

**What it does:**
- Optionally restarts Docker infrastructure
- Restarts all PM2 services
- If no services are running, calls start.sh instead
- Shows status

---

## Typical Workflow

### First Time Setup
```bash
# 1. Clone and install
git clone https://github.com/vilenarios/ar-io-bundler.git
cd ar-io-bundler
yarn install

# 2. Configure environment
cp packages/payment-service/.env.sample packages/payment-service/.env
cp packages/upload-service/.env.sample packages/upload-service/.env
# Edit both .env files with your configuration

# 3. Add wallet
cp /path/to/your/wallet.json ./wallet.json

# 4. Start everything!
./scripts/start.sh
```

### Daily Development
```bash
# Morning: Start everything
./scripts/start.sh

# During work: Restart after code changes
./scripts/restart.sh

# Evening: Stop everything
./scripts/stop.sh
```

### After Code Changes
```bash
# Rebuild services
cd packages/payment-service && yarn build
cd ../upload-service && yarn build

# Restart services
cd /home/vilenarios/ar-io-bundler
./scripts/restart.sh
```

### Troubleshooting
```bash
# Full reset
./scripts/stop.sh
docker compose down -v  # Remove volumes
./scripts/start.sh
```

---

## System Architecture

### Docker Infrastructure (Always Running First)
- **PostgreSQL** (port 5432) - Two databases: payment_service, upload_service
- **Redis Cache** (port 6379) - Data caching
- **Redis Queues** (port 6381) - BullMQ job queues
- **MinIO** (ports 9000-9001) - S3-compatible object storage

### PM2 Services (Started After Docker)
1. **payment-service** (port 4001) - 2 instances, cluster mode
2. **upload-api** (port 3001) - 2 instances, cluster mode
3. **upload-workers** - 1 instance, fork mode (background jobs)

---

## Verification Commands

### Check Status
```bash
# PM2 services
pm2 list

# Docker infrastructure
docker compose ps

# Test endpoints
curl http://localhost:4001/health  # Payment service
curl http://localhost:3001/health  # Upload service
curl http://localhost:4001/v1/price/bytes/1000000  # Pricing
```

### View Logs
```bash
# All logs
pm2 logs

# Specific service
pm2 logs payment-service
pm2 logs upload-api
pm2 logs upload-workers

# Docker logs
docker compose logs -f postgres
docker compose logs -f redis-cache
```

### Monitor Resources
```bash
# PM2 monitoring
pm2 monit

# Docker stats
docker stats
```

---

## Port Allocation

| Service | Port | Purpose |
|---------|------|---------|
| Upload Service | 3001 | Upload API |
| Payment Service | 4001 | Payment API |
| PostgreSQL | 5432 | Database |
| Redis Cache | 6379 | Caching |
| Redis Queues | 6381 | Job queues |
| MinIO API | 9000 | Object storage |
| MinIO Console | 9001 | MinIO web UI |

**Note:** Ports 3000, 4000, 5050 are reserved for AR.IO Gateway if co-located.

---

## Critical: Bundle Planning Cron Job

The bundling pipeline requires a cron job to trigger bundle planning every 5 minutes:

```bash
# Add cron job
(crontab -l 2>/dev/null | grep -v "trigger-plan" ; echo "*/5 * * * * /home/vilenarios/ar-io-bundler/packages/upload-service/cron-trigger-plan.sh >> /tmp/bundle-plan-cron.log 2>&1") | crontab -

# Verify
crontab -l | grep trigger-plan

# View cron logs
tail -f /tmp/bundle-plan-cron.log
```

Without this cron job, uploaded data items will NOT be bundled and posted to Arweave!

---

## Script Options Summary

| Script | Default Behavior | Options |
|--------|------------------|---------|
| `start.sh` | Starts Docker + PM2 | None |
| `stop.sh` | Stops PM2 + Docker | `--services-only` (keep Docker running) |
| `restart.sh` | Restarts PM2 only | `--with-docker` (also restart Docker) |

---

## Common Issues

### "Port already in use"
**Problem:** Service fails to start with EADDRINUSE

**Solution:** Check what's using the port and stop it:
```bash
ss -tlnp | grep :4001
pm2 list
./scripts/stop.sh
./scripts/start.sh
```

### "Docker not running"
**Problem:** Infrastructure check fails

**Solution:**
```bash
sudo systemctl start docker
docker compose up -d
./scripts/start.sh
```

### "Services not building"
**Problem:** Build errors

**Solution:**
```bash
cd packages/payment-service
yarn install
yarn build

cd ../upload-service
yarn install
yarn build
```

### "Workers not processing"
**Problem:** Uploads succeed but never bundle

**Solution:**
1. Check workers are running: `pm2 list | grep workers`
2. Check cron job: `crontab -l | grep trigger-plan`
3. Manual trigger: `cd packages/upload-service && ./cron-trigger-plan.sh`
4. Check logs: `pm2 logs upload-workers`

---

## Files Created/Modified

- ✅ `/scripts/start.sh` - Improved to handle full system
- ✅ `/scripts/stop.sh` - Now stops Docker + PM2
- ✅ `/scripts/restart.sh` - Now can restart Docker too
- ✅ `/STARTUP_GUIDE.md` - This file
- ✅ `/CLAUDE.md` - Updated with new script documentation

---

## Next Steps After Starting

1. **Verify Services:**
   ```bash
   curl http://localhost:4001/health
   curl http://localhost:3001/health
   ```

2. **Check Cron Job:**
   ```bash
   crontab -l | grep trigger-plan
   ```

3. **Monitor Logs:**
   ```bash
   pm2 logs
   ```

4. **Test Upload:**
   - See README.md for upload examples
   - See packages/upload-service/CLAUDE.md for API details

---

**Built with ❤️ for the Arweave ecosystem**
