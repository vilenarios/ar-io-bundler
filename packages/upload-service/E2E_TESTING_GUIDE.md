# End-to-End Testing Guide

## Overview

This guide covers the comprehensive E2E test suite for the AWS-free Turbo Upload Service. The tests verify the complete flow from upload to AR.IO Gateway integration.

## Test Architecture

The E2E tests are designed to verify the complete AWS-free architecture:

```
Upload → MinIO → BullMQ → Workers → PostgreSQL → AR.IO Gateway
```

### Test Files

1. **`tests/e2e-aws-free.int.test.ts`** - Complete AWS-free architecture tests
   - Single data item uploads
   - Multipart uploads
   - MinIO storage verification
   - BullMQ queue processing
   - PostgreSQL offset storage
   - Database schema verification

2. **`tests/ario-optical-bridge.int.test.ts`** - AR.IO Gateway integration tests
   - Optical bridge notifications
   - Optimistic caching flow
   - Data item filtering
   - Latency measurements

3. **`tests/helpers/e2e-utils.ts`** - Test utilities
   - Setup/cleanup functions
   - Queue monitoring
   - Infrastructure verification
   - Helper functions

## Prerequisites

### Required Services

All services must be running before executing E2E tests:

```bash
# Start all infrastructure
yarn infra:up

# This starts:
# - PostgreSQL (port 5432)
# - Redis (port 6379) - for caching
# - Redis (port 6381) - for BullMQ queues
# - MinIO (ports 9000-9001)
```

### Optional Services (for full testing)

For complete AR.IO Gateway integration tests, you also need:

- **AR.IO Gateway** (port 3000) - Envoy proxy
- **AR.IO Core API** (port 4000) - Admin API

If these are not running, related tests will be skipped automatically.

## Running Tests

### Quick Start

```bash
# Run all E2E tests with infrastructure
yarn test:e2e:local

# This automatically:
# 1. Starts infrastructure (infra:up)
# 2. Runs E2E tests
# 3. Cleans up infrastructure (infra:down)
```

### Individual Test Suites

```bash
# Run all E2E tests (requires infra running)
yarn test:e2e

# Run AWS-free architecture tests only
yarn test:e2e:aws-free

# Run AR.IO Gateway integration tests only
yarn test:e2e:ario

# Run with specific test pattern
yarn test:e2e -g "Single Data Item"
```

### Manual Infrastructure Control

```bash
# Start infrastructure
yarn infra:up

# Run tests
yarn test:e2e

# View logs
yarn infra:logs

# Restart infrastructure
yarn infra:restart

# Stop infrastructure
yarn infra:down
```

## Test Coverage

### 1. Upload Flow Tests

**Single Data Item Upload:**
```typescript
- ✅ Upload via HTTP POST
- ✅ Verify response includes data item ID
- ✅ Verify MinIO storage
- ✅ Verify BullMQ queue enqueue
- ✅ Verify PostgreSQL insertion
```

**Multipart Upload:**
```typescript
- ✅ Create multipart upload
- ✅ Upload multiple chunks
- ✅ Verify chunks in MinIO
- ✅ Finalize upload
```

### 2. Infrastructure Tests

**MinIO Storage:**
```typescript
- ✅ Connection verification
- ✅ Object storage/retrieval
- ✅ Path-style URL configuration
- ✅ Bucket accessibility
```

**PostgreSQL Database:**
```typescript
- ✅ Table schema verification
- ✅ data_item_offsets table structure
- ✅ config table existence
- ✅ Index verification
- ✅ Record insertion/retrieval
```

**BullMQ Queues:**
```typescript
- ✅ All 11 queues configured
- ✅ Redis connection on port 6381
- ✅ Job enqueue/dequeue
- ✅ Queue statistics
```

### 3. AR.IO Gateway Integration

**Optical Bridge:**
```typescript
- ✅ Configuration verification
- ✅ Optical post job enqueue
- ✅ Data item header formatting
- ✅ AR.IO notification
```

**Optimistic Caching:**
```typescript
- ✅ Upload → AR.IO flow
- ✅ Immediate data availability
- ✅ Latency measurement (target: <100ms)
- ✅ Gateway accessibility
```

**Data Filtering:**
```typescript
- ✅ Low-priority AO message filtering
- ✅ High-priority message inclusion
- ✅ Tag-based filtering
```

### 4. Error Handling

```typescript
- ✅ Invalid data item rejection
- ✅ Oversized item rejection
- ✅ Optical bridge failure handling
- ✅ Graceful degradation
```

## Test Configuration

### Environment Variables

Create a `.env.test` file for test configuration:

```bash
# Upload Service
PORT=3001
NODE_ENV=test
TEST_BASE_URL=http://localhost:3001

# PostgreSQL
DB_WRITER_ENDPOINT=localhost
DB_READER_ENDPOINT=localhost
DB_PASSWORD=postgres

# Redis
REDIS_HOST=localhost
REDIS_PORT_QUEUES=6381

# MinIO
AWS_ENDPOINT=http://localhost:9000
S3_FORCE_PATH_STYLE=true
AWS_ACCESS_KEY_ID=minioadmin
AWS_SECRET_ACCESS_KEY=minioadmin123
AWS_REGION=us-east-1
DATA_ITEM_BUCKET=raw-data-items

# AR.IO Gateway (optional)
OPTICAL_BRIDGING_ENABLED=true
OPTICAL_BRIDGE_URL=http://localhost:4000/ar-io/admin/queue-data-item
AR_IO_ADMIN_KEY=your-admin-key
ARIO_GATEWAY_URL=http://localhost:3000
ARIO_CORE_URL=http://localhost:4000
```

### Test Timeouts

E2E tests use extended timeouts:

- Default: 30 seconds
- Queue processing: 10 seconds
- AR.IO Gateway checks: 5 seconds

Adjust in individual test files if needed:

```typescript
describe("My Test Suite", function () {
  this.timeout(60000); // 60 seconds
});
```

## Debugging Tests

### Enable Debug Logging

```bash
# Set environment variable
export LOG_LEVEL=debug

# Run tests with debug output
yarn test:e2e
```

### Check Infrastructure Status

```bash
# View all container logs
yarn infra:logs

# Check specific service
docker compose logs -f upload-service-minio
docker compose logs -f upload-service-pg
docker compose logs -f redis-queues

# Check service health
docker compose ps
```

### Inspect Test Data

**PostgreSQL:**
```bash
docker exec -it upload-service-pg psql -U postgres -d postgres

# Check data items
SELECT * FROM new_data_item LIMIT 10;

# Check offsets
SELECT * FROM data_item_offsets LIMIT 10;

# Check queues (if using pgboss alternative)
SELECT * FROM queue_jobs;
```

**MinIO:**
```bash
# Access MinIO Console
open http://localhost:9001

# Login: minioadmin / minioadmin123
# Browse buckets: raw-data-items, backup-data-items
```

**Redis:**
```bash
# Connect to Redis CLI
docker exec -it redis-queues redis-cli -p 6381

# List all queues
KEYS bull:*

# Check queue length
LLEN bull:upload-new-data-item:wait
```

### Common Issues

**1. Tests hang on queue processing**
```bash
# Ensure workers are NOT running during tests
pm2 stop all

# Tests should process jobs synchronously
# Workers interfere with test expectations
```

**2. MinIO connection refused**
```bash
# Verify MinIO is running
docker compose ps minio

# Check MinIO logs
docker compose logs minio

# Restart MinIO
docker compose restart minio
```

**3. PostgreSQL connection errors**
```bash
# Verify database is running
docker compose ps upload-service-pg

# Run migrations
yarn db:migrate:latest

# Check database logs
docker compose logs upload-service-pg
```

**4. Redis connection errors**
```bash
# Check both Redis instances
docker compose ps redis redis-queues

# Verify ports
netstat -an | grep 6379
netstat -an | grep 6381
```

## Test Data Cleanup

Tests automatically clean up test data, but you can manually reset:

```bash
# Reset entire infrastructure
yarn infra:down
yarn infra:up

# Clear specific database tables
docker exec -it upload-service-pg psql -U postgres -d postgres \
  -c "TRUNCATE new_data_item, data_item_offsets CASCADE;"

# Clear MinIO bucket
docker exec upload-service-minio mc rm --recursive --force minio/raw-data-items
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: E2E Tests

on: [push, pull_request]

jobs:
  e2e:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: yarn install

      - name: Start infrastructure
        run: yarn infra:up

      - name: Wait for services
        run: sleep 10

      - name: Run E2E tests
        run: yarn test:e2e

      - name: Cleanup
        if: always()
        run: yarn infra:down
```

## Performance Benchmarks

Expected performance metrics:

| Metric | Target | Actual (Your Results) |
|--------|--------|----------------------|
| Single upload | < 500ms | ___ ms |
| Multipart create | < 200ms | ___ ms |
| MinIO storage | < 100ms | ___ ms |
| Queue enqueue | < 50ms | ___ ms |
| PostgreSQL insert | < 100ms | ___ ms |
| AR.IO Gateway access | < 100ms | ___ ms |
| End-to-end (upload → AR.IO) | < 5000ms | ___ ms |

## Writing New Tests

### Test Template

```typescript
import { expect } from "chai";
import {
  setupE2EContext,
  cleanupE2EContext,
  E2ETestContext,
} from "./helpers/e2e-utils";

describe("My New Feature Tests", function () {
  this.timeout(30000);

  let context: E2ETestContext;

  before(async () => {
    context = await setupE2EContext();
  });

  after(async () => {
    await cleanupE2EContext(context);
  });

  it("should test my feature", async () => {
    // Your test logic here
    expect(true).to.be.true;
  });
});
```

### Best Practices

1. **Use test utilities** - Leverage `e2e-utils.ts` helpers
2. **Clean up test data** - Remove test artifacts after tests
3. **Skip unavailable services** - Use `this.skip()` for optional services
4. **Measure performance** - Use `measureTime()` utility
5. **Verify infrastructure** - Check services are running before tests
6. **Handle timeouts** - Set appropriate timeouts for async operations

## Troubleshooting

### Test Failures

**"Connection refused" errors:**
- Ensure `yarn infra:up` completed successfully
- Check `docker compose ps` shows all services as "Up"
- Wait 10-15 seconds after `infra:up` for services to be ready

**"Timeout exceeded" errors:**
- Increase test timeout: `this.timeout(60000)`
- Check if workers are interfering: `pm2 stop all`
- Verify services aren't overloaded: `docker stats`

**"Queue not found" errors:**
- Verify Redis is on port 6381: `docker compose ps redis-queues`
- Check queue configuration in `src/arch/queues/config.ts`

## Additional Resources

- [Mocha Testing Framework](https://mochajs.org/)
- [Chai Assertions](https://www.chaijs.com/)
- [BullMQ Documentation](https://docs.bullmq.io/)
- [MinIO Testing](https://min.io/docs/minio/linux/developers/minio-drivers.html)
- [AR.IO Gateway Docs](https://ar.io/docs/)

## Support

If tests fail unexpectedly:

1. Check `yarn infra:logs` for service errors
2. Verify `.env` configuration matches `.env.sample`
3. Ensure ports are not in use: `lsof -i :3001,5432,6379,6381,9000,9001`
4. Try `yarn infra:restart` to reset services
5. Create an issue with test output and logs

---

**Happy Testing!** 🎉
