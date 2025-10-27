# AR.IO Bundler - Arweave.net Usage Analysis

## Where Bundles Are Posted

### 1. Bundle Posting (CONFIGURABLE via .env)
**File:** `packages/upload-service/src/constants.ts:67`
```typescript
export const gatewayUrl = new URL(
  process.env.ARWEAVE_GATEWAY || "https://arweave.net:443"
);
```

**Current Setting:** `ARWEAVE_GATEWAY=https://arweave.net` in .env

**Used By:**
- `packages/upload-service/src/jobs/post.ts:45-46`
- `ArweaveGateway` constructor → `postBundleTx()` → posts to `{gateway}/tx`

**Impact:** This is where your bundles are broadcast to the Arweave network.
Bundles go to: `https://arweave.net/tx`

---

## Where Pricing Calls Go (HARDCODED)

### 2. Price Oracle (HARDCODED - NOT CONFIGURABLE)
**File:** `packages/payment-service/src/pricing/oracles/bytesToWinstonOracle.ts:44`
```typescript
async getWinstonForBytes(bytes: ByteCount): Promise<Winston> {
  const url = `https://arweave.net/price/${bytes}`;
  // ...
}
```

**Impact:** This is HARDCODED and cannot be changed via environment variables.
Pricing calls go to: `https://arweave.net/price/{bytes}`

---

## Other Hardcoded References

### 3. Payment Service Gateway (Configurable Fallback)
**File:** `packages/payment-service/src/constants.ts:348`
```typescript
arweave: new URL(process.env.ARWEAVE_GATEWAY || "https://arweave.net:443"),
```

### 4. Public Access Gateway (Configurable)
**File:** `packages/upload-service/src/constants.ts:71`
```typescript
export const publicAccessGatewayUrl = new URL(
  process.env.PUBLIC_ACCESS_GATEWAY || "https://arweave.net:443"
);
```

### 5. AR.IO Gateway Integration (SEPARATE - Already Configured)
**Your .env has:**
```
OPTICAL_BRIDGE_URL=http://localhost:4000/ar-io/admin/queue-data-item
```
This is SEPARATE from Arweave posting - it's for optical caching to your AR.IO gateway.

---

## Summary: Two Separate Systems

### System 1: Arweave Network Posting (Main Chain)
- **Where:** `ARWEAVE_GATEWAY=https://arweave.net`
- **Purpose:** Post bundles to Arweave blockchain
- **Currently posts to:** arweave.net
- **Chunks go to:** `POST https://arweave.net/tx` then chunked uploads

### System 2: AR.IO Optical Bridge (Caching Layer)
- **Where:** `OPTICAL_BRIDGE_URL=http://localhost:4000/ar-io/admin/queue-data-item`
- **Purpose:** Fast caching on your AR.IO gateway
- **Currently posts to:** localhost:4000 (your AR.IO gateway)

---

## Recommendations

### Should You Change ARWEAVE_GATEWAY?

**Probably NOT** - Here's why:

1. **arweave.net is the official gateway** - It's reliable and maintained by the Arweave core team
2. **Your optical bridge is working** - Data is already being cached on your AR.IO gateway at localhost:4000
3. **Redundancy is good** - Posting to arweave.net ensures your bundles hit the main network

### If You Want to Use Your Own AR.IO Gateway for Posting:

**Change in .env:**
```bash
# Instead of:
ARWEAVE_GATEWAY=https://arweave.net

# Use:
ARWEAVE_GATEWAY=http://localhost:4000

# Or if you have a public AR.IO gateway:
ARWEAVE_GATEWAY=https://your-ario-gateway.com
```

**Then restart services:**
```bash
pm2 restart all --update-env
```

---

## Known Limitation

**The pricing oracle is HARDCODED to arweave.net**

This cannot be changed without modifying the source code in:
`packages/payment-service/src/pricing/oracles/bytesToWinstonOracle.ts`

This is probably fine since arweave.net's `/price` endpoint is the canonical source for Arweave pricing.

---

## Current Configuration Summary

✅ **Bundles posted to:** arweave.net (via ARWEAVE_GATEWAY)
✅ **Optical cache to:** localhost:4000 (via OPTICAL_BRIDGE_URL)
✅ **Pricing from:** arweave.net (hardcoded)
✅ **Dual posting:** Yes - both main chain AND AR.IO gateway

---

## Code References

### Bundle Posting Flow

1. **Upload received** → `packages/upload-service/src/routes/dataItemPost.ts`
2. **Plan job** → `packages/upload-service/src/jobs/plan.ts` (groups data items into bundles)
3. **Prepare job** → `packages/upload-service/src/jobs/prepare.ts` (downloads from S3, assembles bundle)
4. **Post job** → `packages/upload-service/src/jobs/post.ts:79-82`
   ```typescript
   const [transactionPostResponseData] = await Promise.all([
     arweaveGateway.postBundleTx(bundleTx),            // Posts to ARWEAVE_GATEWAY
     arweaveGateway.postBundleTxToAdminQueue(bundleTx.id), // Posts to OPTICAL_BRIDGE_URL
   ]);
   ```
5. **Verify job** → `packages/upload-service/src/jobs/verify.ts` (confirms bundle on-chain)

### Pricing Flow

1. **Price request** → `packages/payment-service/src/routes/price.ts`
2. **Pricing service** → `packages/payment-service/src/pricing/turboPricingService.ts`
3. **Oracle call** → `packages/payment-service/src/pricing/oracles/bytesToWinstonOracle.ts:44`
   ```typescript
   const url = `https://arweave.net/price/${bytes}`;
   ```

---

## Testing Your Configuration

```bash
# Check where bundles will be posted
grep ARWEAVE_GATEWAY .env

# Check optical bridge configuration
grep OPTICAL_BRIDGE_URL .env

# Verify payment service is using correct gateway
curl -s http://localhost:4001/info | jq '.gateway'

# Monitor post job to see where bundles go
pm2 logs upload-workers --lines 50 | grep -A 5 "Posting bundle"
```
