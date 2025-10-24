# E2E Testing Quick Start 🚀

## TL;DR

```bash
# Run all E2E tests (automatic infrastructure setup/teardown)
yarn test:e2e:local

# That's it! ✅
```

## What Gets Tested

✅ **Upload Flow**
- Single data item uploads
- Multipart uploads
- Data validation

✅ **AWS-Free Architecture**
- MinIO storage (S3 replacement)
- BullMQ queues (SQS replacement)
- PostgreSQL offsets (DynamoDB replacement)
- PM2 workers (Lambda replacement)

✅ **AR.IO Gateway Integration**
- Optical bridge notifications
- Optimistic caching
- Immediate data availability

## Commands

### Recommended (Auto-Setup)

```bash
# Run all E2E tests with automatic infrastructure management
yarn test:e2e:local
```

### Manual Control

```bash
# 1. Start infrastructure
yarn infra:up

# 2. Run tests
yarn test:e2e                    # All E2E tests
yarn test:e2e:aws-free          # AWS-free architecture only
yarn test:e2e:ario              # AR.IO Gateway integration only

# 3. Stop infrastructure
yarn infra:down
```

### Development Workflow

```bash
# Start services
yarn infra:up

# Watch mode (keep infrastructure running)
yarn test:e2e -w

# View logs while testing
yarn infra:logs

# Restart infrastructure if needed
yarn infra:restart
```

## Test Output Example

```bash
$ yarn test:e2e:local

  E2E AWS-Free Integration Tests
    Single Data Item Upload Flow
      ✓ should accept a valid data item upload (245ms)
      ✓ should store the data item in MinIO (156ms)
      ✓ should enqueue job to BullMQ new-data-item queue (89ms)
      ✓ should insert the data item into PostgreSQL new_data_item table (134ms)

    Multipart Upload Flow
      ✓ should create a multipart upload (67ms)
      ✓ should upload chunks to the multipart upload (456ms)
      ✓ should verify chunks are stored in MinIO (123ms)

    Queue Processing and Offset Storage
      ✓ should process plan-bundle jobs when triggered (1234ms)
      ✓ should handle put-offsets jobs (567ms)

    MinIO Storage Verification
      ✓ should connect to MinIO successfully (45ms)
      ✓ should use S3-compatible path-style URLs (12ms)

    PostgreSQL Database Verification
      ✓ should have data_item_offsets table with correct schema (89ms)
      ✓ should have config table for settings (45ms)
      ✓ should have all required indexes on data_item_offsets (78ms)

    BullMQ Queue Verification
      ✓ should have all 11 queues configured (234ms)
      ✓ should connect to Redis on port 6381 (23ms)

  AR.IO Gateway Optical Bridge Integration
    Optical Bridge Configuration
      ✓ should have optical bridging enabled (5ms)
      ✓ should have AR.IO bridge URL configured (3ms)

    Optimistic Caching Flow
      ✓ should upload data item and trigger optical bridge (345ms)
      ✓ should be accessible via AR.IO Gateway immediately (234ms)
      ✓ should measure end-to-end latency (upload to AR.IO access) (567ms)

  23 passing (8s)

✨ All tests passed!
```

## Infrastructure Services

When you run `yarn infra:up`, these services start:

| Service | Port | Purpose |
|---------|------|---------|
| PostgreSQL | 5432 | Database for data items and offsets |
| Redis (cache) | 6379 | Caching layer |
| Redis (queues) | 6381 | BullMQ job queues |
| MinIO S3 API | 9000 | S3-compatible object storage |
| MinIO Console | 9001 | Web UI for MinIO |

**Optional (for full AR.IO tests):**
| Service | Port | Purpose |
|---------|------|---------|
| AR.IO Gateway | 3000 | Gateway Envoy proxy |
| AR.IO Core | 4000 | Gateway admin API |

## Debugging

```bash
# View all logs
yarn infra:logs

# View specific service logs
docker compose logs -f upload-service-minio
docker compose logs -f upload-service-pg
docker compose logs -f redis-queues

# Check service status
docker compose ps

# Access MinIO Console (browse uploaded files)
open http://localhost:9001
# Login: minioadmin / minioadmin123

# Connect to PostgreSQL
docker exec -it upload-service-pg psql -U postgres -d postgres

# Connect to Redis
docker exec -it redis-queues redis-cli -p 6381
```

## Common Issues

### "Connection refused" errors

```bash
# Services not ready yet - wait 10-15 seconds after startup
yarn infra:up
sleep 15
yarn test:e2e
```

### Tests hang or timeout

```bash
# Stop PM2 workers (they interfere with test expectations)
pm2 stop all

# Restart infrastructure
yarn infra:restart
```

### Port conflicts

```bash
# Check what's using ports
lsof -i :3001,5432,6379,6381,9000,9001

# Stop conflicting services
yarn infra:down
# Or: docker compose down
```

## Test Files

| File | Tests |
|------|-------|
| `tests/e2e-aws-free.int.test.ts` | Complete AWS-free architecture |
| `tests/ario-optical-bridge.int.test.ts` | AR.IO Gateway integration |
| `tests/helpers/e2e-utils.ts` | Test utilities and helpers |

## Environment Configuration

Tests use environment variables from `.env` file:

```bash
# Upload Service
PORT=3001
TEST_BASE_URL=http://localhost:3001

# MinIO
AWS_ENDPOINT=http://localhost:9000
S3_FORCE_PATH_STYLE=true
AWS_ACCESS_KEY_ID=minioadmin
AWS_SECRET_ACCESS_KEY=minioadmin123

# Redis
REDIS_PORT_QUEUES=6381

# AR.IO Gateway (optional)
OPTICAL_BRIDGING_ENABLED=true
OPTICAL_BRIDGE_URL=http://localhost:4000/ar-io/admin/queue-data-item
```

## What to Expect

**First run:** ~30 seconds
- Infrastructure startup
- Database migrations
- Test execution

**Subsequent runs:** ~5-10 seconds
- Infrastructure already running
- Tests execute faster

**Success criteria:**
- ✅ All tests pass
- ✅ No connection errors
- ✅ Data stored in MinIO
- ✅ Offsets in PostgreSQL
- ✅ Jobs in BullMQ queues

## Next Steps

1. **Run tests:** `yarn test:e2e:local`
2. **Check results:** All tests should pass
3. **Browse data:** Open MinIO Console at `http://localhost:9001`
4. **Inspect database:** Connect to PostgreSQL and check tables
5. **Monitor queues:** Run Bull Board dashboard (if configured)

## Full Documentation

For complete testing guide, see: [`E2E_TESTING_GUIDE.md`](./E2E_TESTING_GUIDE.md)

---

**Questions?** Check the troubleshooting section above or review the full testing guide.
