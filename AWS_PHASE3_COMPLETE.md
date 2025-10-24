# AWS Removal - Phase 3: PostgreSQL (DynamoDB Replacement)

## ✅ **PHASE 3 COMPLETE!**

Successfully migrated from DynamoDB to PostgreSQL for the data item offsets table.

## Summary

Replaced AWS DynamoDB with PostgreSQL for storing and retrieving data item offset metadata. The PostgreSQL implementation was **already written** - we just needed to run the migration and wire it up!

## Changes Made

### 1. Database Migration ✅
**Created `data_item_offsets` table in PostgreSQL**

```sql
CREATE TABLE data_item_offsets (
  data_item_id VARCHAR(43) PRIMARY KEY,
  root_bundle_id VARCHAR(43) NOT NULL,
  start_offset_in_root_bundle BIGINT NOT NULL,
  raw_content_length BIGINT NOT NULL,
  payload_data_start INTEGER NOT NULL,
  payload_content_type VARCHAR(255),
  parent_data_item_id VARCHAR(43),
  start_offset_in_parent_data_item_payload BIGINT,
  expires_at BIGINT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_root_bundle_id ON data_item_offsets(root_bundle_id);
CREATE INDEX idx_parent_data_item_id ON data_item_offsets(parent_data_item_id);
CREATE INDEX idx_expires_at ON data_item_offsets(expires_at);
```

**Migration file**: `src/migrations/20251022011218_add_data_item_offsets_table.ts`

### 2. Architecture Updates ✅

**Modified files**:
- `src/arch/architecture.ts` - Added `dataItemOffsetsDB: DataItemOffsetsDB` to Architecture interface
- `src/middleware/architecture.ts` - Inject `dataItemOffsetsDB` into Koa context
- `src/server.ts` - Initialize `dataItemOffsetsDB` from defaultArchitecture

### 3. Route Updates ✅

**`src/routes/offsets.ts`** - Replaced DynamoDB calls with PostgreSQL
- **Before**: Used `getDynamoOffsetsInfo()` from `dynamoDbUtils.ts`
- **After**: Uses `dataItemOffsetsDB.getOffset()` from context

### 4. Job Updates ✅

**`src/jobs/putOffsets.ts`** - Already using PostgreSQL!
- Uses `DataItemOffsetsDB` class for batch inserts
- Supports 500-item batches (vs DynamoDB's 25-item limit)

### 5. Configuration ✅

**`.env` updates**:
```bash
DB_DATABASE=upload_service  # Added to specify correct database
```

## PostgreSQL vs DynamoDB Comparison

| Feature | PostgreSQL ✅ | DynamoDB ❌ |
|---------|--------------|-------------|
| Batch inserts | **500 items** | 25 items |
| Queries | Complex SQL with joins | Limited, expensive |
| Indexes | Multiple efficient indexes | Secondary indexes cost extra |
| Local development | Docker container | Requires AWS/LocalStack |
| Cost | Included in hosting | Per-request pricing |
| TTL/Expiration | Manual cleanup query | Built-in but delayed |

## Performance Benefits

1. **20x larger batches** - 500 items vs 25 items per write
2. **Efficient queries** - Indexed queries on root_bundle_id, parent_data_item_id, expires_at
3. **No rate limiting** - PostgreSQL doesn't have DynamoDB's throttling
4. **Relational queries** - Can join with other tables if needed

## Files Modified

1. `src/arch/architecture.ts` - Added DataItemOffsetsDB
2. `src/middleware/architecture.ts` - Inject to context
3. `src/server.ts` - Initialize dataItemOffsetsDB
4. `src/routes/offsets.ts` - Use PostgreSQL for GET /tx/:id/offset
5. `.env` - Added DB_DATABASE=upload_service

## Files Already Using PostgreSQL

- `src/arch/db/dataItemOffsets.ts` - PostgreSQL implementation (already existed!)
- `src/jobs/putOffsets.ts` - Batch offset writes (already using PostgreSQL!)
- `src/arch/db/migrator.ts` - Migration definition (already existed!)

## DynamoDB Code Status

**Still exists but unused**:
- `src/utils/dynamoDbUtils.ts` - Contains offset-related functions but no longer called
- Will be removed in Phase 5 along with AWS SDK packages

## Testing

The table was created successfully with all indexes:
```bash
docker exec ar-io-bundler-postgres psql -U turbo_admin -d upload_service -c "\d data_item_offsets"
```

## Next Steps

**Phase 4: SQS → BullMQ (4-6 hours)** - Most complex phase
- Replace AWS SQS with BullMQ (Redis-based queues)
- Update job workers to use BullMQ
- Configure queue processing

After Phase 4, we can remove all AWS SDK packages in Phase 5.
