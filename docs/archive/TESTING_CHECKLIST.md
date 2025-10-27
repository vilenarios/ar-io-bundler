# Pre-Testing Checklist for AR.IO Bundler + x402

## External Dependencies Found

### 1. Arweave Gateway Dependencies ⚠️

**Current Issue:** Both services default to `https://arweave.net`

**Impact:**
- Bundle posting goes to arweave.net
- Pricing queries hit arweave.net/price API
- Transaction verification uses arweave.net

**Solution Options:**

#### Option A: Use Local AR.IO Gateway (Recommended for Testing)
```bash
# Update .env files:
ARWEAVE_GATEWAY=http://localhost:3000
PUBLIC_ACCESS_GATEWAY=http://localhost:3000
```

**Pros:** 
- No external dependencies
- Faster testing
- Works offline
- Full control

**Cons:**
- Local gateway needs to be synced for real data
- May not have pricing endpoint

#### Option B: Keep arweave.net (For Production-Like Testing)
```bash
# Keep current settings
ARWEAVE_GATEWAY=https://arweave.net
```

**Pros:**
- Real pricing data
- Production-like behavior
- No sync required

**Cons:**
- Requires internet
- Slower
- Dependent on arweave.net availability

### 2. CoinGecko API (x402 Pricing) ⚠️

**Current:** X402PricingOracle queries `api.coingecko.com` for AR/USD rates

**Code Location:** `packages/payment-service/src/pricing/x402PricingOracle.ts:24`

**Impact:** x402 USDC pricing requires live AR price from CoinGecko

**No configuration needed** - Has 5-minute cache and fallback to stale data

### 3. Pricing Oracles ⚠️

**BytesToWinstonOracle** hardcoded to `https://arweave.net/price/{bytes}`

**Code Location:** `packages/payment-service/src/pricing/oracles/bytesToWinstonOracle.ts`

**Impact:** All upload pricing calculations

**Cannot be configured** - Would need code change to use local gateway

### 4. TokenToFiatOracle (CoinGecko) ⚠️

**Queries CoinGecko for crypto → fiat conversions**

**Impact:** Payment conversions for ETH, SOL, MATIC, etc.

**No configuration needed** - Works automatically

## Configuration Recommendations

### For Local/Offline Testing:

```bash
# Upload Service .env
ARWEAVE_GATEWAY=http://localhost:3000
PUBLIC_ACCESS_GATEWAY=http://localhost:3000

# Payment Service .env  
ARWEAVE_GATEWAY=http://localhost:3000
```

**Note:** Local gateway may not support `/price` endpoint. Pricing might fail gracefully.

### For Internet-Connected Testing (Recommended):

```bash
# Keep current settings - both services already configured
ARWEAVE_GATEWAY=https://arweave.net
```

**This allows:**
- ✅ Real pricing data
- ✅ CoinGecko AR/USD rates for x402
- ✅ TokenToFiat conversions
- ✅ Full production-like behavior

## Testing Scenarios

### Scenario 1: x402 Payment Flow (Requires Internet)
```bash
# Dependencies:
# - CoinGecko API (AR/USD rates)
# - arweave.net (winston pricing)
# - Ethereum RPC (for settlement - if using real blockchain)

# Test command:
curl "http://localhost:4001/v1/x402/price/1/ADDRESS?bytes=1000000"
```

### Scenario 2: Traditional Upload (Can be offline with local gateway)
```bash
# Configure for local gateway if testing offline
# Otherwise keep arweave.net for real pricing

# Test command:
curl -X POST http://localhost:3001/v1/tx \
  -H "Content-Type: application/octet-stream" \
  --data-binary @test-file.bin
```

### Scenario 3: Balance Operations (Fully Local)
```bash
# No external dependencies
# Works entirely with local database

curl "http://localhost:4001/v1/account/balance?address=ADDRESS"
```

## Current Configuration Status

✅ **Local AR.IO Gateway:** Running on port 3000/4000  
✅ **Services:** Configured to use arweave.net (production-like)  
✅ **Databases:** Local PostgreSQL  
✅ **Redis/MinIO:** Local Docker containers  
⚠️ **Internet Required For:**
- Pricing queries (arweave.net/price)
- x402 AR/USD rates (CoinGecko)
- Token conversions (CoinGecko)
- Real bundle posting (if testing end-to-end)

## Recommendations Before Testing

### 1. Decide on Gateway Strategy
```bash
# For offline/local testing:
# - Update ARWEAVE_GATEWAY to http://localhost:3000
# - Accept that pricing may not work
# - Focus on x402 flow testing with mocked prices

# For full integration testing:
# - Keep ARWEAVE_GATEWAY=https://arweave.net (current)
# - Ensure internet connectivity
# - Test with real pricing data
```

### 2. Check External Services
```bash
# Test arweave.net availability
curl -s https://arweave.net/price/1000000

# Test CoinGecko availability  
curl -s "https://api.coingecko.com/api/v3/simple/price?ids=arweave&vs_currencies=usd"

# Test local gateway
curl -s http://localhost:3000/ar-io/info
```

### 3. Verify All Services Running
```bash
pm2 list
# Should show:
# - payment-service (2 instances) ✅
# - upload-api (2 instances) ✅
# - upload-workers ✅
```

### 4. Test Basic Endpoints
```bash
# Payment service health
curl http://localhost:4001/health

# Upload service health  
curl http://localhost:3001/health

# Payment service info
curl http://localhost:4001/v1/info

# x402 pricing (requires internet)
curl "http://localhost:4001/v1/x402/price/1/7gI4LqBxQSyTRu5e2Zfgyw2UEMgsUsxsoW2KajneFC8?bytes=1000000"
```

## Final Recommendation

**Keep current configuration (arweave.net)** for testing because:

1. ✅ x402 requires CoinGecko anyway (needs internet)
2. ✅ Real pricing data gives accurate tests
3. ✅ Local gateway may not support all endpoints
4. ✅ Can test actual production behavior
5. ✅ Already configured correctly

**Only switch to local gateway if:**
- Testing offline
- Don't care about accurate pricing
- Want to avoid external dependencies
- Developing/debugging upload flow only

