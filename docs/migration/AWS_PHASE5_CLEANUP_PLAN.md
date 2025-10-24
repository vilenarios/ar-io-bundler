# AWS Removal - Phase 5: Final Cleanup Plan

## Executive Summary

**Goal**: Remove all unused AWS SDK dependencies while preserving MinIO S3 compatibility.

**Status**: Audit complete. DynamoDB still actively used as a **cache layer** (not primary storage).

**Decision Required**: Keep or remove DynamoDB caching functionality?

---

## Current AWS SDK Usage Analysis

### ✅ KEEP - Required for MinIO (S3-compatible storage)

**Files using these:**
- `src/arch/s3ObjectStore.ts`

**Dependencies:**
```json
"@aws-sdk/client-s3": "3.529.0",          // S3 client (works with MinIO via S3_ENDPOINT)
"@aws-sdk/lib-storage": "3.529.0",        // S3 multipart uploads
"@aws-sdk/util-retry": "3.529.0",         // Retry strategies
"@aws-sdk/node-http-handler": "3.374.0",  // HTTP handler (likely transitive)
"@aws-sdk/signature-v4-crt": "3.678.0"    // S3 signing (likely for MinIO)
```

**Justification**: MinIO requires S3-compatible SDK. All S3 operations work via `S3_ENDPOINT` env var.

---

### ⚠️ DECISION REQUIRED - DynamoDB Cache Layer

**Current Usage**: DynamoDB is used as **one of multiple cache layers** for data items.

#### Active DynamoDB Code Locations

**1. `src/utils/dataItemUtils.ts`**

**Line 1271** - Cache data item binary data:
```typescript
await putDynamoDataItem({
  dataItemId,
  data: buffer,
  size: buffer.length,
  payloadStart: payloadDataStart,
  contentType: payloadContentType,
  logger,
});
actualStores.push("ddb");  // DynamoDB is one of several stores
```

**Line 1571** - Cache nested data item offset info:
```typescript
await putDynamoOffsetsInfo({
  dataItemId,
  parentDataItemId,
  startOffsetInParentDataItemPayload: ...,
  rawContentLength,
  payloadContentType,
  payloadDataStart,
  logger,
});
actualStores.push("ddb");
```

**2. `src/routes/status.ts`**

**Line 32** - Retrieve offset info for status endpoint:
```typescript
const [maybeOffsetsInfo, info] = await Promise.all([
  getDynamoOffsetsInfo(ctx.params.id, logger),  // DynamoDB cache
  database.getDataItemInfo(ctx.params.id),      // PostgreSQL primary
]);
```

#### Storage Architecture

The service uses **multiple storage layers** in parallel:
1. **"cache"** - ElastiCache/Redis (in-memory cache)
2. **"fs_backup"** - Filesystem backup
3. **"ddb"** - DynamoDB (persistent cache layer)
4. **"object_store"** - S3/MinIO (primary object storage)

**Pattern**: Data is written to all configured stores simultaneously for redundancy/performance.

#### DynamoDB Package

```json
"@aws-sdk/client-dynamodb": "3.529.0"
```

**Files using it:**
- `src/utils/dynamoDbUtils.ts` - DynamoDB client and helper functions

---

## Option 1: Remove DynamoDB Entirely (Recommended)

**Effort**: 2-3 hours
**Risk**: Low (PostgreSQL already handles offsets, Redis handles caching)

### Changes Required

1. **Modify `src/utils/dataItemUtils.ts`**:
   - Remove `dynamoStream` logic (lines ~1268-1290)
   - Remove nested DynamoDB caching (lines ~1571-1584)
   - Keep other storage layers: cache, fs_backup, object_store

2. **Modify `src/routes/status.ts`**:
   - Remove `getDynamoOffsetsInfo()` call
   - Use only `database.getDataItemInfo()` (PostgreSQL)
   - Or use `dataItemOffsetsDB.getOffset()` if available

3. **Delete `src/utils/dynamoDbUtils.ts`**:
   - Remove all DynamoDB helper functions
   - No longer needed after above changes

4. **Remove package dependencies**:
   ```bash
   yarn remove @aws-sdk/client-dynamodb
   ```

### Benefits
- Simplifies architecture (fewer moving parts)
- Reduces AWS dependencies to just S3 SDK (for MinIO)
- PostgreSQL + Redis already provide caching and persistence
- Eliminates DynamoDB costs if accidentally deployed to AWS

### Risks
- Potential performance impact if DynamoDB cache was heavily used
- May need to verify Redis cache is sufficient for offset lookups

---

## Option 2: Keep DynamoDB Cache Layer

**Effort**: Minimal cleanup only
**Risk**: None (maintains current functionality)

### If keeping DynamoDB:
- Document as technical debt
- Ensure it's disabled in local development (.env)
- Keep the package dependency
- Only remove unused AWS packages (below)

---

## ❌ REMOVE - Unused AWS SDK Packages

### 1. AWS Secrets Manager (Phase 1 complete)
```json
"@aws-sdk/client-secrets-manager": "3.529.0"
```
**Status**: No longer used. Removed in Phase 1 (switched to .env).

### 2. AWS SSM Parameter Store (Phase 1 complete)
```json
"@aws-sdk/client-ssm": "3.529.0"
```
**Status**: No longer used. Removed in Phase 1 (switched to .env).

**Commented import to remove:**
- `src/jobs/cleanup-fs.ts:17` - Commented SSM import

### 3. AWS SQS (Phase 4 complete - BullMQ deployed)
```json
"@aws-sdk/client-sqs": "3.529.0",
"aws-lambda": "^1.0.7",
"@types/aws-lambda": "^8.10.108"  // devDependency
```

**Status**: No longer used. BullMQ fully deployed with 11 queues and workers.

#### Unused SQS/Lambda Imports to Remove:

**`src/jobs/optical-post.ts:17`**:
```typescript
import { SQSEvent } from "aws-lambda";
```

**`src/jobs/unbundle-bdi.ts:17,19`**:
```typescript
import { Message } from "@aws-sdk/client-sqs";
import { SQSEvent } from "aws-lambda";
```

**`src/routes/multiPartUploads.ts:18`**:
```typescript
import { Message } from "@aws-sdk/client-sqs";
```

#### Unused Lambda Handler Exports to Remove:

**`src/jobs/optical-post.ts:319`** - Export unused Lambda handler:
```typescript
export async function handler(sqsEvent: SQSEvent): Promise<void> {
  // ... Lambda wrapper (not used, BullMQ workers call handleJob directly)
}
```

**`src/jobs/unbundle-bdi.ts:59`** - Export unused Lambda handler:
```typescript
export async function handler(event: SQSEvent): Promise<void> {
  // ... Lambda wrapper (not used, BullMQ workers call handleJob directly)
}
```

**Verification**: Workers in `src/workers/allWorkers.ts` call the job functions directly, not through Lambda.

---

## Cleanup Execution Plan

### Phase 5A: Minimal Cleanup (1 hour)

**Remove unused AWS SDK packages only**:

1. ✅ Remove unused imports:
   - `src/jobs/optical-post.ts:17` - Remove `SQSEvent` import
   - `src/jobs/unbundle-bdi.ts:17,19` - Remove `Message` and `SQSEvent` imports
   - `src/routes/multiPartUploads.ts:18` - Remove `Message` import
   - `src/jobs/cleanup-fs.ts:17` - Remove commented SSM import

2. ✅ Remove unused Lambda handler exports:
   - `src/jobs/optical-post.ts:319` - Remove `handler(sqsEvent: SQSEvent)`
   - `src/jobs/unbundle-bdi.ts:59` - Remove `handler(event: SQSEvent)`

3. ✅ Remove AWS SDK packages:
   ```bash
   cd packages/upload-service
   yarn remove @aws-sdk/client-secrets-manager \
               @aws-sdk/client-ssm \
               @aws-sdk/client-sqs \
               aws-lambda

   # Remove from devDependencies
   yarn remove -D @types/aws-lambda
   ```

4. ✅ Rebuild and test:
   ```bash
   yarn build
   yarn test:unit
   ```

**Result**: Removes all confirmed-unused AWS packages while keeping DynamoDB cache functional.

---

### Phase 5B: Full DynamoDB Removal (Optional, +2 hours)

**Only if user approves Option 1 (Remove DynamoDB)**:

5. ⚠️ Modify `src/utils/dataItemUtils.ts`:
   - Comment out or remove `dynamoStream` logic
   - Remove `putDynamoOffsetsInfo` calls

6. ⚠️ Modify `src/routes/status.ts`:
   - Remove `getDynamoOffsetsInfo` call
   - Use PostgreSQL-only lookup

7. ⚠️ Delete `src/utils/dynamoDbUtils.ts`

8. ⚠️ Remove DynamoDB package:
   ```bash
   yarn remove @aws-sdk/client-dynamodb
   ```

9. ⚠️ Test thoroughly:
   ```bash
   yarn build
   yarn test:unit
   yarn test:integration:local
   ```

**Result**: Zero AWS dependencies except S3 SDK (for MinIO).

---

## Verification Commands

### After Phase 5A (Minimal):
```bash
# Verify no SQS/SSM/Secrets Manager imports
grep -r "from.*aws-sdk.*sqs" packages/upload-service/src
grep -r "from.*aws-sdk.*ssm" packages/upload-service/src
grep -r "from.*aws-sdk.*secrets" packages/upload-service/src
grep -r "from.*aws-lambda" packages/upload-service/src

# Should return 0 results

# Verify S3 and DynamoDB still present (if keeping DynamoDB)
grep -r "from.*@aws-sdk.*s3" packages/upload-service/src
grep -r "from.*@aws-sdk.*dynamodb" packages/upload-service/src

# Should find s3ObjectStore.ts and dynamoDbUtils.ts
```

### After Phase 5B (Full, if done):
```bash
# Verify ONLY S3 SDK imports remain
grep -r "from.*@aws-sdk" packages/upload-service/src

# Should ONLY find:
# - src/arch/s3ObjectStore.ts (client-s3, lib-storage, util-retry)
```

---

## Final AWS Dependencies (After Phase 5A)

### Production Dependencies
```json
"@aws-sdk/client-s3": "3.529.0",          // ✅ MinIO compatibility
"@aws-sdk/lib-storage": "3.529.0",        // ✅ S3 multipart uploads
"@aws-sdk/util-retry": "3.529.0",         // ✅ S3 retry strategies
"@aws-sdk/client-dynamodb": "3.529.0",    // ⚠️  Cache layer (optional)
"@aws-sdk/node-http-handler": "3.374.0",  // ✅ HTTP handler
"@aws-sdk/signature-v4-crt": "3.678.0"    // ✅ S3 signing
```

### DevDependencies (Types only)
```json
"@aws-sdk/types": "^3.357.0"  // ✅ TypeScript types
```

---

## Final AWS SDK Status (After Phase 5B - Optional)

### If DynamoDB removed:
```json
"@aws-sdk/client-s3": "3.529.0",          // ✅ MinIO only
"@aws-sdk/lib-storage": "3.529.0",        // ✅ MinIO only
"@aws-sdk/util-retry": "3.529.0",         // ✅ MinIO only
"@aws-sdk/node-http-handler": "3.374.0",  // ✅ Transitive
"@aws-sdk/signature-v4-crt": "3.678.0",   // ✅ S3 signing
```

**AWS Usage**: 100% MinIO (S3-compatible), 0% actual AWS services.

---

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| DynamoDB cache removal impacts performance | Test with load testing; Redis cache should compensate |
| S3 SDK removal breaks MinIO | Keep all S3-related packages (client-s3, lib-storage, util-retry) |
| Services fail to start after cleanup | Rebuild and run `yarn test:unit` before deploying |
| Missing type definitions | Keep `@aws-sdk/types` in devDependencies |

---

## Recommended Action

**Start with Phase 5A (Minimal Cleanup)**:
- Low risk, high value
- Removes confirmed-unused packages
- 1 hour effort
- Services remain fully functional

**Then decide on Phase 5B (DynamoDB Removal)**:
- Requires user approval
- 2-3 hour effort
- Achieves 100% AWS-free goal (except S3 SDK for MinIO)
- Simplifies architecture

---

## User Decision Required

**Question**: Should we remove the DynamoDB cache layer entirely?

**Option 1 (Recommended)**: Remove DynamoDB
- PostgreSQL handles offsets (already migrated)
- Redis handles in-memory caching
- Simplifies architecture
- **Effort**: +2 hours

**Option 2**: Keep DynamoDB as cache layer
- Maintains current redundancy
- No additional work beyond Phase 5A
- Document as technical debt
- **Effort**: 0 hours

**Please advise which option to proceed with.**
