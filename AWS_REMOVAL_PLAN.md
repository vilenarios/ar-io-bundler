# AWS Dependency Removal Plan

## Current Status

✅ **Services Running**: All services are healthy and operational
✅ **Wallet Configured**: Using local `wallet.json` file
✅ **Infrastructure**: Docker-based PostgreSQL, Redis, and MinIO running

**Temporary State**: AWS SDK packages are installed but most functionality uses local `.env` configuration due to `NODE_ENV=development`.

---

## Current AWS Dependencies

### 1. **AWS S3** (Object Storage)
**Current Usage:**
- `packages/upload-service/src/arch/s3ObjectStore.ts`
- Stores uploaded data items and multipart uploads
- Uses `@aws-sdk/client-s3` and `@aws-sdk/lib-storage`

**Already Available Replacement:**
- ✅ **MinIO** is already running at `localhost:9000`
- MinIO is S3-compatible - same API
- Just need to configure the upload service to use it

**Files to Modify:**
- `.env`: Set `S3_ENDPOINT=http://localhost:9000`
- `s3ObjectStore.ts`: Already supports custom endpoints via `S3_ENDPOINT`

---

### 2. **AWS SQS** (Message Queues)
**Current Usage:**
- `packages/upload-service/src/jobs/*.ts` - Job queue system
- Uses `@aws-sdk/client-sqs`
- Queue-based workflow for bundle processing

**Already Available Replacement:**
- ✅ **BullMQ** (Redis-based queues) is already integrated
- Used in `packages/upload-service/src/arch/queues.ts`
- Redis queues already running at `localhost:6381`

**Migration Needed:**
- Lambda job handlers currently expect SQS messages
- Need to refactor to use BullMQ workers instead
- BullMQ provides similar queue/worker pattern

**Files to Modify:**
- `packages/upload-service/src/arch/queues.ts` - Expand BullMQ usage
- `packages/upload-service/src/jobs/*.ts` - Convert from Lambda to BullMQ workers
- Remove SQS message parsing, use BullMQ job data

---

### 3. **AWS DynamoDB** (NoSQL Database)
**Current Usage:**
- `packages/upload-service/src/utils/dynamoDbUtils.ts`
- Stores data item offsets for retrieval
- Uses `@aws-sdk/client-dynamodb`

**Replacement Options:**
1. **PostgreSQL** (already running) - Add offset table
2. **Redis** (already running) - Use for offset caching
3. **MinIO + JSON files** - Store offsets as objects

**Recommendation**: Use PostgreSQL
- Already have database migrations system
- Relational data fits well in PostgreSQL
- Better consistency guarantees

**Migration Steps:**
1. Create migration for `data_item_offsets` table
2. Replace DynamoDB calls with Knex queries
3. Remove `dynamoDbUtils.ts`

---

### 4. **AWS SSM Parameter Store**
**Current Usage:**
- `packages/upload-service/src/arch/ssmClient.ts`
- `packages/upload-service/src/arch/remoteConfig.ts`
- Stores configuration parameters
- Uses `@aws-sdk/client-ssm`

**Replacement:**
- ✅ **Environment Variables** via `.env` file
- Already loading via `dotenv` in `loadConfig()`

**Files to Modify:**
- Remove `ssmClient.ts`
- Update `remoteConfig.ts` to use `process.env` only
- Add all SSM parameters to `.env.sample`

---

### 5. **AWS Secrets Manager**
**Current Usage:**
- `packages/upload-service/src/utils/getArweaveWallet.ts`
- `packages/payment-service/src/utils/loadSecretsToEnv.ts`
- Stores sensitive configuration (wallet, API keys)
- Uses `@aws-sdk/client-secrets-manager`

**Replacement:**
- ✅ **Local files** for wallet (already using `wallet.json`)
- ✅ **Environment variables** for API keys (`.env` file)

**Already Implemented:**
- Wallet: `TURBO_JWK_FILE=./wallet.json` ✓
- Config already checks `turboLocalJwk` first ✓

**Files to Modify:**
- Simplify `getArweaveWallet.ts` to only use local file
- Remove Secrets Manager fallbacks
- Update `.env.sample` with all secret placeholders

---

## Migration Plan

### Phase 1: Configuration Migration (1-2 hours)

**Goal**: Remove SSM and Secrets Manager dependencies

**Steps:**

1. **Document all AWS secrets/parameters**
   ```bash
   grep -r "getSecretValue\|getSSMParameter" packages/ --include="*.ts"
   ```

2. **Add to `.env`**
   - `HONEYCOMB_API_KEY=`
   - `ARWEAVE_WALLET` (or continue using `TURBO_JWK_FILE`)
   - Any optical wallet keys
   - All SSM parameters

3. **Simplify code**
   - `packages/upload-service/src/utils/getArweaveWallet.ts` - Remove AWS SDK, use local file only
   - `packages/upload-service/src/utils/config.ts` - Remove SSM calls
   - `packages/payment-service/src/utils/loadSecretsToEnv.ts` - Remove Secrets Manager
   - Delete `packages/upload-service/src/arch/ssmClient.ts`
   - Delete `packages/upload-service/src/arch/remoteConfig.ts` (or make env-only)

4. **Test**
   ```bash
   pm2 restart all
   curl http://localhost:4000/
   curl http://localhost:3001/
   ```

---

### Phase 2: S3 to MinIO Migration (30 minutes)

**Goal**: Use MinIO instead of AWS S3

**Steps:**

1. **Update `.env`**
   ```bash
   # S3-compatible object storage (MinIO)
   S3_ENDPOINT=http://localhost:9000
   S3_ACCESS_KEY_ID=minioadmin
   S3_SECRET_ACCESS_KEY=minioadmin
   S3_REGION=us-east-1
   S3_BUCKET=turbo-uploads
   ```

2. **Create MinIO bucket**
   ```bash
   # MinIO client already configured in docker-compose
   docker exec -it ar-io-bundler-minio mc mb local/turbo-uploads
   ```

3. **Test upload**
   - S3ObjectStore already supports custom endpoints
   - No code changes needed!

4. **Verify**
   ```bash
   docker exec -it ar-io-bundler-minio mc ls local/turbo-uploads
   ```

---

### Phase 3: DynamoDB to PostgreSQL Migration (2-3 hours)

**Goal**: Store offsets in PostgreSQL instead of DynamoDB

**Steps:**

1. **Create migration**
   ```bash
   cd packages/upload-service
   yarn db:migrate:new create_data_item_offsets_table
   ```

2. **Define schema** (in migration file)
   ```sql
   CREATE TABLE data_item_offsets (
     id VARCHAR(43) PRIMARY KEY,
     offset BIGINT NOT NULL,
     size BIGINT NOT NULL,
     bundle_id VARCHAR(43) NOT NULL,
     created_at TIMESTAMP DEFAULT NOW(),
     INDEX idx_bundle_id (bundle_id)
   );
   ```

3. **Replace DynamoDB calls**
   - Find all uses: `grep -r "dynamodb\|DynamoDB" packages/upload-service/src --include="*.ts"`
   - Replace with Knex queries
   - Example:
     ```typescript
     // OLD: await dynamoDb.putItem(...)
     // NEW: await db('data_item_offsets').insert({...})
     ```

4. **Delete DynamoDB files**
   - `packages/upload-service/src/utils/dynamoDbUtils.ts`

---

### Phase 4: SQS to BullMQ Migration (4-6 hours - Most Complex)

**Goal**: Replace Lambda+SQS workflow with BullMQ workers

**Current Architecture:**
```
Upload → DB → SQS Queue → Lambda Handler → Process
```

**New Architecture:**
```
Upload → DB → BullMQ Queue → Worker Process → Process
```

**Steps:**

1. **Create BullMQ worker file**
   ```typescript
   // packages/upload-service/src/workers/jobWorkers.ts
   import { Worker } from 'bullmq';
   import { redisConfig } from '../arch/queues';
   import * as jobs from '../jobs';

   const workers = [
     new Worker('plan', jobs.plan, { connection: redisConfig }),
     new Worker('prepare', jobs.prepare, { connection: redisConfig }),
     new Worker('post', jobs.post, { connection: redisConfig }),
     new Worker('verify', jobs.verify, { connection: redisConfig }),
     // ... etc
   ];
   ```

2. **Update job files** (remove SQS-specific code)
   - Remove `Message` type from `@aws-sdk/client-sqs`
   - Remove SQS message parsing
   - Use BullMQ job `data` directly

3. **Update enqueue logic**
   - Already using BullMQ in `packages/upload-service/src/arch/queues.ts`
   - Verify all job types are defined

4. **Create new PM2 config** for workers
   ```javascript
   {
     name: "upload-workers-bullmq",
     script: "./lib/workers/jobWorkers.js",
     cwd: "./packages/upload-service",
     instances: 1,
     exec_mode: "fork"
   }
   ```

5. **Delete Lambda-specific code**
   - `packages/upload-service/ecs/fulfillment-pipeline/` (entire directory)
   - `scripts/bundle-lambdas.cjs`

---

### Phase 5: Final Cleanup (1 hour)

**Goal**: Remove all AWS SDK packages and references

**Steps:**

1. **Remove packages**
   ```bash
   cd packages/upload-service
   yarn remove @aws-sdk/client-dynamodb @aws-sdk/client-s3 @aws-sdk/client-secrets-manager @aws-sdk/client-sqs @aws-sdk/client-ssm @aws-sdk/lib-storage @aws-sdk/node-http-handler @aws-sdk/signature-v4-crt @aws-sdk/util-retry

   cd ../payment-service
   yarn remove @aws-sdk/client-secrets-manager @aws-sdk/client-ssm
   ```

2. **Search for remaining AWS references**
   ```bash
   grep -r "@aws-sdk\|AWS_\|aws-" packages/ --include="*.ts" --include="*.js"
   ```

3. **Update documentation**
   - README.md
   - .env.sample
   - deployment guides

4. **Test full workflow**
   - Upload test data item
   - Verify queuing
   - Verify processing
   - Verify bundle creation

---

## Testing Checklist

After each phase:

- [ ] Services start without errors
- [ ] Health endpoints respond
- [ ] Database connections work
- [ ] Redis connections work
- [ ] No AWS SDK import errors

Full system test:
- [ ] Upload single data item
- [ ] Upload multipart data item
- [ ] Verify bundle processing
- [ ] Check data persistence
- [ ] Verify queue processing

---

## Rollback Plan

Each phase is isolated and can be rolled back:

1. **Phase 1-2**: Revert `.env` changes, restore original files from git
2. **Phase 3**: Rollback database migration: `yarn db:migrate:rollback`
3. **Phase 4**: Keep both systems running, switch traffic back to Lambda
4. **Phase 5**: Reinstall packages: `yarn add @aws-sdk/...`

---

## Estimated Timeline

| Phase | Duration | Complexity |
|-------|----------|------------|
| Phase 1: Config Migration | 1-2 hours | Low |
| Phase 2: S3 → MinIO | 30 minutes | Very Low |
| Phase 3: DynamoDB → PostgreSQL | 2-3 hours | Medium |
| Phase 4: SQS → BullMQ | 4-6 hours | High |
| Phase 5: Cleanup | 1 hour | Low |
| **Total** | **9-12.5 hours** | |

---

## Benefits After Migration

1. **Zero AWS costs** - Everything runs locally/on-prem
2. **Simpler deployment** - Docker Compose instead of CloudFormation
3. **Faster development** - No AWS API latency
4. **Better debugging** - All logs local
5. **More portable** - Runs anywhere Docker runs
6. **Open source stack** - PostgreSQL, Redis, MinIO

---

## Next Steps

Ready to start? Choose one:

1. **Start Phase 1** - Config migration (safest, quickest wins)
2. **Start Phase 2** - S3→MinIO (simplest, immediate benefit)
3. **Full migration** - Execute all phases in order

Let me know when you want to proceed!
