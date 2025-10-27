# Pre-Testing Checklist - AR.IO Bundler

**Date:** 2025-10-26
**Ready for User Testing:** ✅ YES (with notes below)

---

## ✅ Infrastructure Status - ALL HEALTHY

### Services Running
- ✅ **Payment Service** (port 4001) - 2 instances, 40m uptime
- ✅ **Upload API** (port 3001) - 2 instances, 2h uptime
- ✅ **Upload Workers** - 11 BullMQ workers active
- ✅ **AR.IO Gateway** (port 4000) - Healthy, optical bridging enabled

### Infrastructure
- ✅ **PostgreSQL** - Up 3 days, healthy
- ✅ **Redis Cache** (port 6379) - Up 3 days, healthy
- ✅ **Redis Queues** (port 6381) - Up 3 days, healthy
- ✅ **MinIO** (ports 9000-9001) - Up 3 days, healthy

### Database
- ✅ **Upload Service DB** - 27 tables, 2 data items present
- ✅ **Payment Service DB** - 24 tables, migrations complete
- ✅ **Connectivity** - All services can access database

---

## ✅ Configuration Status

### Critical Secrets (All Configured)
- ✅ **PRIVATE_ROUTE_SECRET** - 256-bit key generated
- ✅ **JWT_SECRET** - 256-bit key generated
- ✅ **AR_IO_ADMIN_KEY** - 384-bit key (matches Gateway)
- ✅ **ARIO_SIGNING_JWK** - Wallet configured for ArNS

### Arweave Wallet
- ✅ **Wallet Address:** `8jNb-iG3a3XByFuZnZ_MWMQSZE0zvxPMaMMBNMYegY4`
- ✅ **Balance:** 61.5 AR (~$800 USD at $13/AR)
- ✅ **Status:** Sufficient for testing (can post ~100+ bundles)
- ✅ **Location:** `/home/vilenarios/ar-io-bundler/wallet.json`
- ✅ **Security:** Protected by .gitignore

### Integration
- ✅ **AR.IO Gateway URL:** `http://localhost:4000/ar-io/admin/queue-data-item`
- ✅ **Optical Bridging:** Enabled
- ✅ **Payment Service URL:** `http://localhost:4001`

---

## ⚠️ Known Limitations for Testing

### 1. Stripe Payments (NOT FUNCTIONAL)
**Status:** Using placeholder test key
**Impact:** Credit card payments will NOT work
**Workaround:** Use crypto payments or manually credit test accounts

To enable Stripe payments:
```bash
# 1. Sign up at stripe.com
# 2. Get test API key from dashboard
# 3. Update .env:
STRIPE_SECRET_KEY=sk_test_YOUR_REAL_KEY_HERE
STRIPE_WEBHOOK_SECRET=whsec_YOUR_WEBHOOK_SECRET

# 4. Restart payment service:
pm2 restart payment-service --update-env
```

### 2. Blockchain RPC Endpoints (LIMITED)
**Status:** Most endpoints not configured
**Impact:** Only Arweave, Solana, Matic payments will work (public endpoints)
**Configured:**
- ✅ Arweave: `https://arweave.net`
- ✅ Solana: `https://api.mainnet-beta.solana.com`
- ✅ Matic: `https://polygon-rpc.com`
- ❌ Ethereum: Not configured
- ❌ KYVE: Using default
- ❌ Base-ETH: Using default

**Workaround:** Get free RPC endpoints from:
- Ethereum: Infura, Alchemy, or QuickNode
- Others: Public endpoints available

### 3. Email Notifications (NOT CONFIGURED)
**Status:** MANDRILL_API_KEY not set
**Impact:** Email gifting won't work
**Required only if:** Using email-based credit gifting feature

### 4. Rate Calculation (MAY FAIL)
**Status:** Oracle endpoints may be unreachable
**Impact:** Price quotes might fail
**Expected:** Some "Failed to calculate rates" errors

---

## 🧪 Testing Recommendations

### Quick Smoke Test
```bash
# 1. Check services are responding
curl http://localhost:4001/info
curl http://localhost:3001/v1/health || echo "Expected - health endpoint may not exist"

# 2. Check PM2 processes
pm2 status

# 3. Check logs for errors
pm2 logs --lines 20
```

### Test Upload Flow (Recommended First Test)

**Using turbo-cli (if available):**
```bash
# Install turbo CLI
npm install -g @ardrive/turbo-sdk

# Configure to use local bundler
export TURBO_UPLOAD_URL=http://localhost:3001
export TURBO_PAYMENT_URL=http://localhost:4001

# Upload a test file
turbo upload-file test.txt
```

**Using curl (manual test):**
```bash
# 1. Create test data item
echo "Hello AR.IO Bundler!" > test.txt

# 2. Get wallet address for payments
WALLET_ADDRESS=$(curl -s http://localhost:4001/info | jq -r '.addresses.arweave')

# 3. Check balance (should be 0 for new wallet)
curl "http://localhost:4001/v1/account/balance/arweave/$WALLET_ADDRESS"

# 4. Try upload (will fail with 402 Payment Required - expected)
curl -X POST http://localhost:3001/v1/tx \
  -H "Content-Type: application/octet-stream" \
  --data-binary @test.txt

# Expected response: 402 Payment Required
# This is correct - wallet needs credits!
```

### Test Payment/Credit Flow

**Option 1: Manual Credit (for testing)**
```bash
# Add credits directly to database (development only)
docker exec -it ar-io-bundler-postgres psql -U turbo_admin -d payment_service -c "
INSERT INTO user (user_address, user_address_type, winston_credit_balance)
VALUES ('YOUR_WALLET_ADDRESS', 'arweave', '1000000000000')
ON CONFLICT (user_address) DO UPDATE
SET winston_credit_balance = user.winston_credit_balance + 1000000000000;
"
```

**Option 2: Crypto Payment (real test)**
- Send AR tokens to payment wallet
- Use `/v1/account/balance/:token` endpoint to track payment
- System will credit account automatically

### Monitor Queue Processing
```bash
# Watch queue workers processing jobs
pm2 logs upload-workers

# Check queue status (if Bull Board is running)
curl http://localhost:3002  # Bull Board dashboard
```

### Check Optical Posting to AR.IO Gateway
```bash
# After successful upload, check AR.IO Gateway received it
curl "http://localhost:4000/ar-io/admin/queue-status" \
  -H "Authorization: Bearer YOUR_ADMIN_KEY"
```

---

## 📊 Expected Behaviors During Testing

### Successful Upload Flow
1. POST data item to `/v1/tx`
2. Response: 402 Payment Required (if no balance)
3. Credit account via payment or manual DB insert
4. Retry upload
5. Response: 200 OK with receipt
6. Workers process: plan → prepare → post → verify
7. Bundle posted to Arweave
8. Data item queued to AR.IO Gateway (optical posting)

### Expected Errors (Normal)
- ❌ **402 Payment Required** - User needs credits
- ❌ **503 Service Unavailable** - Payment service connectivity issue
- ❌ **"Failed to calculate rates"** - Oracle endpoints unreachable
- ❌ **"Internal Server Error"** on some info endpoints - Missing optional config

### Errors Requiring Investigation
- ❌ Services not listening on ports (check PM2)
- ❌ Database connection errors (check PostgreSQL)
- ❌ Queue processing failures (check worker logs)
- ❌ Bundle posting failures (check wallet balance)

---

## 🔍 Troubleshooting Commands

### Check Service Health
```bash
pm2 status
pm2 logs --lines 50
docker ps
netstat -tlnp | grep -E ":(3001|4001)"
```

### Check Database
```bash
# Upload service data
docker exec ar-io-bundler-postgres psql -U turbo_admin -d upload_service -c \
  "SELECT COUNT(*) FROM new_data_item;"

# Payment service credits
docker exec ar-io-bundler-postgres psql -U turbo_admin -d payment_service -c \
  "SELECT user_address, winston_credit_balance FROM \"user\" LIMIT 5;"
```

### Check Queues
```bash
# Redis queues
docker exec ar-io-bundler-redis-queues redis-cli -p 6381 INFO

# Queue workers
pm2 logs upload-workers --lines 50
```

### Check Wallet Balance
```bash
WALLET=$(curl -s http://localhost:4001/info | jq -r '.addresses.arweave')
curl "https://arweave.net/wallet/$WALLET/balance"
```

### Restart Services
```bash
# Restart specific service
pm2 restart payment-service --update-env
pm2 restart upload-api --update-env
pm2 restart upload-workers

# Restart all
pm2 restart all --update-env

# Check status
pm2 status
```

---

## 📝 Testing Notes & Observations

### What to Monitor
1. **PM2 restart counts** - Should stay at 0-1 (high counts indicate crashes)
2. **Memory usage** - Services should stay under 200MB each
3. **Log errors** - Check for repeating errors
4. **Queue processing** - Workers should process jobs within seconds
5. **Database growth** - Monitor new_data_item table size

### Success Criteria
- ✅ Upload endpoint accepts data items
- ✅ Payment/credit system working
- ✅ Queue workers process jobs
- ✅ Bundles posted to Arweave successfully
- ✅ Optical posting to AR.IO Gateway works
- ✅ Services stable (no crashes)

---

## ✅ Ready for Testing!

**Overall Status:** System is ready for user testing with the noted limitations.

**Recommended First Test:** Upload a small test file and verify the complete flow from upload → payment → bundling → Arweave posting.

**Critical for Production:**
- Add real Stripe keys for payments
- Configure blockchain RPC endpoints
- Set up monitoring/alerting
- Add backup/disaster recovery

**Current Wallet Balance:** 61.5 AR is sufficient for extensive testing but monitor usage.

---

## 🆘 Need Help?

**View Logs:**
```bash
pm2 logs
```

**Full System Status:**
```bash
cat SERVICES_STATUS.md
```

**Restart Everything:**
```bash
pm2 restart all --update-env
docker restart ar-io-bundler-postgres ar-io-bundler-redis-cache ar-io-bundler-redis-queues ar-io-bundler-minio
```

**Emergency Reset:**
```bash
pm2 delete all
pm2 start infrastructure/pm2/ecosystem.config.js
```

Good luck with testing! 🚀
