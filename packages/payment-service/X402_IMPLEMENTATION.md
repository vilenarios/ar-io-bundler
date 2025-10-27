# x402 Payment Integration - Implementation Status

## Overview

This document describes the Coinbase x402 payment protocol integration for AR.IO Bundler. The x402 protocol enables HTTP-native stablecoin payments (USDC) for data uploads without requiring pre-funded accounts.

## What is x402?

x402 is an open payments protocol that uses the HTTP 402 "Payment Required" status code to enable instant stablecoin payments. Key features:
- **Instant settlement**: ~2 second settlement time
- **Zero protocol fees**: No x402 fees for merchants or customers
- **Micropayments**: Minimum payment of $0.001
- **EIP-3009 based**: Uses gasless transfers via EIP-712 signatures
- **Chain agnostic**: Supports multiple EVM networks

## Implementation Status

### ✅ Completed (Payment Service)

#### 1. **Core Infrastructure**
- [x] x402 configuration constants (`src/constants.ts`)
- [x] Network configurations (Base, Ethereum, Polygon, testnets)
- [x] Environment variable support
- [x] TypeScript types (`src/database/dbTypes.ts`)

#### 2. **Database Layer**
- [x] Migration for x402 tables (`src/migrations/20251027000000_x402_payments.ts`)
  - `x402_payment_transaction` table
  - `x402_payment_reservation` table
- [x] Database interface methods (`src/database/database.ts`)
- [x] PostgreSQL implementation (`src/database/postgres.ts`)
  - createX402Payment
  - getX402Payment / getX402PaymentByTxHash / getX402PaymentByDataItemId
  - finalizeX402Payment
  - createX402PaymentReservation
  - getX402PaymentReservation
  - deleteX402PaymentReservation
  - cleanupExpiredX402Reservations

#### 3. **Pricing & Conversion**
- [x] X402PricingOracle (`src/pricing/x402PricingOracle.ts`)
  - Winston → USDC conversion
  - USDC → Winston conversion
  - AR/USD price fetching from CoinGecko
  - 5-minute price caching

#### 4. **Payment Verification & Settlement**
- [x] X402Service (`src/x402/x402Service.ts`)
  - EIP-712 signature verification
  - Payment amount validation
  - Facilitator integration for settlement
  - Multi-network support
- [x] X402Gateway (`src/gateway/x402.ts`)
  - Transaction status checking
  - Block confirmation tracking

#### 5. **API Routes**
- [x] GET `/v1/x402/price/:signatureType/:address?bytes=N`
  - Returns 402 Payment Required response with USDC amount
  - Supports all enabled networks
- [x] POST `/v1/x402/payment/:signatureType/:address`
  - Verifies and settles x402 payment
  - Supports 3 modes: payg, topup, hybrid
  - Creates payment records and reservations
- [x] POST `/v1/x402/finalize`
  - Finalizes payment after upload validation
  - Detects fraud (actual > declared bytes)
  - Issues refunds (actual < declared bytes)

#### 6. **Architecture Integration**
- [x] X402Service added to Architecture interface
- [x] Server initialization (`src/server.ts`)
- [x] Router configuration (`src/router.ts`)

### ✅ Completed (Upload Service Integration)

#### 1. **Upload Service Changes**
- [x] Add x402 payment support to `packages/upload-service/src/routes/dataItemPost.ts`
  - Detect `X-PAYMENT` header
  - Call payment service x402 endpoints
  - Skip traditional balance check/reservation if paid via x402
- [x] Add fraud detection validation
  - Compare actual vs declared Content-Length
  - Call finalize endpoint
- [x] Add payment service client methods (`src/arch/payment.ts`)
  - getX402PriceQuote()
  - verifyAndSettleX402Payment()
  - finalizeX402Payment()

#### 2. **Testing**
- [ ] Unit tests for x402 components
- [ ] Integration tests with mock facilitator
- [ ] E2E tests with test networks
- [ ] Fraud detection scenario tests

#### 3. **Documentation**
- [ ] API documentation
- [ ] Integration guide for clients
- [ ] Deployment guide for gateway operators
- [ ] Environment variable reference

### 🔮 Future Enhancements

- [ ] Self-hosted facilitator (currently relies on Coinbase)
- [ ] Deferred payment scheme support (when available)
- [ ] Additional EVM networks (Arbitrum, Optimism, etc.)
- [ ] Non-EVM chain support (if x402 expands)
- [ ] Admin UI for x402 configuration
- [ ] Metrics and monitoring dashboards

## Architecture

### Payment Flow

```
1. User uploads data with X-PAYMENT header
   POST /v1/tx
   Headers: X-PAYMENT: <base64-encoded-payload>
            Content-Length: 1024

2. Upload service calls payment service
   GET /v1/x402/price/1/address?bytes=1024
   → Returns 402 with USDC amount

   POST /v1/x402/payment/1/address
   Body: { paymentHeader, dataItemId, byteCount, mode: "hybrid" }
   → Verifies signature, settles on-chain, creates reservation

3. Upload service streams data and validates

4. Upload service calls finalize
   POST /v1/x402/finalize
   Body: { dataItemId, actualByteCount }
   → Confirms payment, issues refund if overpaid, penalizes if fraud

5. Success! Data item uploaded and paid for
```

### Database Schema

**x402_payment_transaction**
- Primary key: `id` (UUID)
- Unique: `tx_hash` (on-chain transaction)
- Links to: `user_address`, `data_item_id` (optional for top-up mode)
- Tracks: payment amount, mode, status, byte counts

**x402_payment_reservation**
- Primary key: `data_item_id`
- Foreign key: `x402_payment_id`
- Auto-expires after 1 hour
- Cleanup job removes expired reservations

### Payment Modes

**PAYG (Pay-As-You-Go)**
- User pays exact amount for specific upload
- Payment reserved for that data item only
- No balance credited

**Top-Up**
- User pays arbitrary amount
- Entire amount credited to balance
- Use for future uploads

**Hybrid (Default)**
- User pays for specific upload
- Excess amount credited to balance
- Best UX: pay once, use excess later

## Configuration

### Required Environment Variables

```bash
# Enable/disable x402 (default: true)
X402_ENABLED=true

# Payment recipient address (REQUIRED if x402 enabled)
X402_PAYMENT_ADDRESS=0xYourWalletAddress

# Network-specific configuration
BASE_MAINNET_RPC_URL=https://mainnet.base.org
X402_BASE_ENABLED=true  # Default: true
X402_BASE_MIN_CONFIRMATIONS=1

ETHEREUM_MAINNET_RPC_URL=https://cloudflare-eth.com/
X402_ETH_ENABLED=false  # Default: false (enable Base first)
X402_ETH_MIN_CONFIRMATIONS=3

POLYGON_MAINNET_RPC_URL=https://polygon-rpc.com/
X402_POLYGON_ENABLED=false  # Default: false
X402_POLYGON_MIN_CONFIRMATIONS=10

# Facilitator URLs (optional, for settlement)
X402_FACILITATOR_URL_BASE=https://facilitator.base.org
X402_FACILITATOR_URL_ETH=https://facilitator.ethereum.org

# Payment configuration
X402_DEFAULT_MODE=hybrid  # payg | topup | hybrid
X402_PAYMENT_TIMEOUT_MS=300000  # 5 minutes
X402_PRICING_BUFFER_PERCENT=15  # 15% buffer for volatility
X402_FRAUD_TOLERANCE_PERCENT=5  # 5% tolerance for size mismatch

# CoinGecko (for AR/USD price)
COINGECKO_API_KEY=optional  # Uses free tier if not set
```

### Deployment Modes

**Minimal (x402-only)**
```bash
X402_ENABLED=true
STRIPE_ENABLED=false
CRYPTO_MONITORING_ENABLED=false
ARNS_ENABLED=false
GIFTING_ENABLED=false
```

**Full-featured**
```bash
# All payment methods enabled
X402_ENABLED=true
STRIPE_ENABLED=true
CRYPTO_MONITORING_ENABLED=true
# ... etc
```

## Security Considerations

### Fraud Prevention
1. **Content-Length validation**: Server enforces declared size
2. **Stream monitoring**: Connection killed if exceeds declared
3. **Post-upload validation**: Actual bytes compared to declared
4. **Penalty system**: Payment kept if fraud detected (>5% over)
5. **Audit logging**: All fraud attempts logged

### Signature Verification
- EIP-712 typed structured data
- Domain separation per token contract
- Nonce prevents replay attacks
- Timeout prevents stale transactions

### Network Security
- Facilitator verification (optional)
- On-chain settlement confirmation
- Block confirmation requirements (configurable per network)

## API Examples

### Upload with x402 Payment

**Request:**
```http
POST /v1/tx HTTP/1.1
Content-Type: application/octet-stream
Content-Length: 1048576
X-PAYMENT: eyJ4NDAyVmVyc2lvbiI6MSwic2NoZW1lIjoiZXhhY3QiLCAuLi59

[binary data item content]
```

**Successful Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "id": "xyz789",
  "timestamp": 1735257600000,
  "winc": "0",
  "version": "1.0.0",
  "deadlineHeight": 1234567,
  "dataCaches": ["arweave.net"],
  "fastFinalityIndexes": [],
  "owner": "abc123",
  "x402Payment": {
    "paymentId": "uuid",
    "txHash": "0x123...",
    "network": "base-mainnet",
    "mode": "hybrid"
  }
}
```

**Fraud Detected Response:**
```http
HTTP/1.1 402 Payment Required

{
  "error": "Fraud detected: declared 1048576 bytes but uploaded 2097152 bytes. Payment kept as penalty."
}
```

### Get Price Quote (Payment Service)

**Request:**
```http
GET /v1/x402/price/1/abc123?bytes=1048576 HTTP/1.1
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "x402Version": 1,
  "accepts": [{
    "scheme": "exact",
    "network": "base-mainnet",
    "maxAmountRequired": "1500000",
    "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "payTo": "0xYourAddress",
    "timeout": {
      "validBefore": 1735257600000
    },
    "extra": {
      "name": "USD Coin",
      "version": "2"
    }
  }]
}
```

### Submit Payment

**Request:**
```http
POST /v1/x402/payment/1/abc123 HTTP/1.1
Content-Type: application/json

{
  "paymentHeader": "eyJ4NDAyVmVyc2lvbiI6MSwic2NoZW1lIjoiZXhhY3QiLCAuLi59",
  "dataItemId": "xyz789",
  "byteCount": 1048576,
  "mode": "hybrid"
}
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "success": true,
  "paymentId": "uuid",
  "txHash": "0x123...",
  "network": "base-mainnet",
  "wincPaid": "1000000",
  "wincReserved": "800000",
  "wincCredited": "200000",
  "mode": "hybrid"
}
```

## Testing

### Local Testing with Base Sepolia

```bash
# Set testnet configuration
X402_BASE_TESTNET_ENABLED=true
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
X402_PAYMENT_ADDRESS=0xYourTestAddress

# Run migrations
yarn db:migrate:latest

# Start server
yarn start:dev

# Test price endpoint
curl http://localhost:3000/v1/x402/price/1/testaddress?bytes=1024
```

### Integration Testing

```typescript
// Test x402 payment flow
const paymentHeader = createX402Payment({
  from: '0xUser',
  to: '0xService',
  value: '1500000', // 1.5 USDC
  network: 'base-sepolia'
});

const response = await axios.post('/v1/x402/payment/1/address', {
  paymentHeader,
  dataItemId: 'test123',
  byteCount: 1024,
  mode: 'payg'
});

expect(response.status).toBe(200);
expect(response.data.success).toBe(true);
```

## Monitoring

### Key Metrics to Track

- x402 payments received (total, by network)
- Payment amounts (USDC, Winston)
- Verification duration
- Settlement duration
- Verification failures (by reason)
- Fraud attempts detected
- Refunds issued (overpayment)

### Logs to Monitor

```
logger.info("X402 payment successful")
logger.warn("X402 fraud detected")
logger.error("X402 payment verification failed")
logger.error("X402 payment settlement failed")
```

## Troubleshooting

### Common Issues

**"X402_PAYMENT_ADDRESS must be set"**
- Set `X402_PAYMENT_ADDRESS` environment variable
- Or disable x402: `X402_ENABLED=false`

**"Network not enabled"**
- Check network-specific env vars: `X402_BASE_ENABLED=true`
- Verify network name matches configuration

**"Payment verification failed: Invalid EIP-712 signature"**
- Verify token contract address matches network config
- Check EIP-712 domain version (should be "2" for USDC)
- Ensure signature is for correct domain

**"Payment settlement failed"**
- Check facilitator URL is set and reachable
- Verify RPC endpoint is responsive
- Check wallet has gas for settlement (if self-hosting)

## Next Steps

To complete the x402 integration:

1. **Integrate with upload service** (see "Pending" section above)
2. **Write comprehensive tests**
3. **Deploy to staging environment**
4. **Test with Base Sepolia testnet**
5. **Monitor metrics and logs**
6. **Gradual rollout to production**
7. **Document for gateway operators**

## Resources

- [x402 Specification](https://github.com/coinbase/x402)
- [x402 Foundation](https://www.x402.org/)
- [EIP-712 Standard](https://eips.ethereum.org/EIPS/eip-712)
- [EIP-3009 Standard](https://eips.ethereum.org/EIPS/eip-3009)
- [Coinbase Developer Portal](https://www.coinbase.com/developer-platform/products/x402)
