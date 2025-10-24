# AWS Removal - Phase 2: MinIO (S3 Replacement)

## ✅ **PHASE 2 COMPLETE!**

MinIO is fully configured and operational as an S3-compatible storage replacement for AWS S3.

## Status

### MinIO Infrastructure ✅
- **Container**: `ar-io-bundler-minio` running and healthy
- **Ports**: 9000 (API), 9001 (Console)
- **Health**: Verified with health endpoint

### Buckets Created ✅
- `raw-data-items` - Primary data item storage
- `backup-data-items` - Backup data item storage

### Configuration ✅
- **Endpoint**: `http://localhost:9000` (configured in .env)
- **Credentials**: minioadmin / minioadmin123
- **Path Style**: Enabled (`S3_FORCE_PATH_STYLE=true`)
- **Region**: us-east-1

### S3 Client Configuration ✅
The upload service's `S3ObjectStore` (packages/upload-service/src/arch/s3ObjectStore.ts:116-195) is properly configured to use MinIO:
- Uses `S3_ENDPOINT` environment variable
- Uses `S3_FORCE_PATH_STYLE` for path-style bucket access
- Supports custom credentials via AWS SDK configuration

### Testing ✅
- Successfully uploaded test file to `raw-data-items`
- Successfully downloaded test file from MinIO
- Successfully deleted test file
- Confirmed S3 API compatibility

## .env Configuration

```bash
# MinIO (S3-Compatible Storage)
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin123
S3_REGION=us-east-1
S3_FORCE_PATH_STYLE=true
DATA_ITEM_BUCKET=raw-data-items
BACKUP_DATA_ITEM_BUCKET=backup-data-items
```

## No Code Changes Required

Phase 2 required **ZERO code changes** because:
1. The codebase already used `@aws-sdk/client-s3` which is S3-protocol compatible
2. MinIO implements the full S3 API
3. Environment variables allow seamless endpoint switching
4. MinIO was already configured and running from previous setup

## Verification Commands

```bash
# Check MinIO health
curl http://localhost:9000/minio/health/live

# List buckets
mc ls local/

# Test upload
echo "test" | mc pipe local/raw-data-items/test.txt

# Test download
mc cat local/raw-data-items/test.txt

# Clean up
mc rm local/raw-data-items/test.txt
```

## Next Steps

**Phase 3: DynamoDB → PostgreSQL (2-3 hours)**
- Create PostgreSQL migration for `offsets` table
- Replace DynamoDB calls with Knex queries in:
  - `src/utils/dynamoDbUtils.ts`
  - `src/jobs/putOffsets.ts`
