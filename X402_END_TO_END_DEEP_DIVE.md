# X402 End-to-End Integration Deep Dive

## Executive Summary

The x402 protocol provides **HTTP-native USDC payment** for data uploads without requiring pre-funded accounts. This document explains exactly how x402 integrates across your entire AR.IO Bundler system.

**Key Insight**: x402 is an **alternative payment method** that runs **parallel** to the traditional balance-based system. Users can pay per upload with USDC instead of pre-loading an account with credits.

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                        CLIENT FLOW                                │
│                                                                    │
│  1. Client uploads data with X-PAYMENT header                     │
│     POST /v1/tx                                                    │
│     Header: X-PAYMENT: <base64-encoded-x402-payment>              │
│     Header: Content-Length: 1024                                  │
│     Body: <binary data>                                            │
│                                                                    │
│                            ↓                                       │
└────────────────────────────┼──────────────────────────────────────┘
                             ↓
┌────────────────────────────▼──────────────────────────────────────┐
│                    UPLOAD SERVICE (Port 3001)                      │
│                  src/routes/dataItemPost.ts                        │
│                                                                    │
│  Detects X-PAYMENT header (line 174-177)                          │
│                                                                    │
│  ┌─────────────────────────────────────────────────────────┐     │
│  │ IF X-PAYMENT header present (line 286-330):            │     │
│  │                                                          │     │
│  │  1. Extract payment header from request                 │     │
│  │  2. Call payment service to verify & settle:            │     │
│  │     paymentService.verifyAndSettleX402Payment({         │     │
│  │       paymentHeader, dataItemId, byteCount, ...         │     │
│  │     })                                                   │     │
│  │                                                          │     │
│  │  3. If successful:                                      │     │
│  │     - Store x402PaymentId, txHash, network              │     │
│  │     - Skip traditional balance check                    │     │
│  │     - Continue with upload                              │     │
│  │                                                          │     │
│  │  4. If failed:                                          │     │
│  │     - Return 402 Payment Required                       │     │
│  │     - Include error details                             │     │
│  └─────────────────────────────────────────────────────────┘     │
│                                                                    │
│  ┌─────────────────────────────────────────────────────────┐     │
│  │ ELSE no X-PAYMENT header (line 330-399):               │     │
│  │                                                          │     │
│  │  1. Check if user has traditional balance:             │     │
│  │     paymentService.checkBalanceForData(...)             │     │
│  │                                                          │     │
│  │  2. If user has balance:                                │     │
│  │     - Continue with traditional flow                    │     │
│  │     - Reserve balance                                   │     │
│  │                                                          │     │
│  │  3. If no balance:                                      │     │
│  │     - Return 402 Payment Required                       │     │
│  │     - Include x402 payment requirements:                │     │
│  │       paymentService.getX402PriceQuote(...)             │     │
│  │                                                          │     │
│  │     Response includes:                                  │     │
│  │     - x402Version: 1                                    │     │
│  │     - accepts: [payment requirements]                   │     │
│  │     - network (e.g., base-mainnet)                      │     │
│  │     - maxAmountRequired (USDC)                          │     │
│  │     - payTo address                                     │     │
│  └─────────────────────────────────────────────────────────┘     │
│                                                                    │
│  After upload completes (line 526-571):                           │
│  ┌─────────────────────────────────────────────────────────┐     │
│  │  IF x402 payment was used:                              │     │
│  │    paymentService.finalizeX402Payment({                 │     │
│  │      dataItemId,                                         │     │
│  │      actualByteCount: <real size>                       │     │
│  │    })                                                    │     │
│  │                                                          │     │
│  │  - Compares declared vs actual size                     │     │
│  │  - Fraud detection (if actual > declared)               │     │
│  │  - Refund if overpaid                                   │     │
│  └─────────────────────────────────────────────────────────┘     │
│                                                                    │
│  Return response with x402Payment details (line 961-986)          │
│  Body: { ...receipt, x402Payment: { paymentId, txHash, ... } }    │
│  Header: X-Payment-Response: <base64-payment-details>             │
└────────────────────────────┬──────────────────────────────────────┘
                             ↓
                   HTTP calls to Payment Service
                             ↓
┌────────────────────────────▼──────────────────────────────────────┐
│                   PAYMENT SERVICE (Port 4001)                      │
│                                                                    │
│  THREE x402 ENDPOINTS:                                            │
│                                                                    │
│  1️⃣  GET /v1/x402/price/:signatureType/:address?bytes=N           │
│     src/routes/x402Price.ts                                        │
│     ┌──────────────────────────────────────────────────┐          │
│     │ Called by upload service when user has no balance│          │
│     │                                                   │          │
│     │ Logic:                                            │          │
│     │ 1. Get Winston price from pricingService         │          │
│     │ 2. Add pricing buffer (15% default)              │          │
│     │ 3. Convert Winston → USDC via X402PricingOracle  │          │
│     │ 4. Build payment requirements for all enabled    │          │
│     │    networks (Base, Ethereum, Polygon)            │          │
│     │                                                   │          │
│     │ Returns: 200 OK (NOT 402)                        │          │
│     │ {                                                 │          │
│     │   x402Version: 1,                                │          │
│     │   accepts: [                                     │          │
│     │     {                                            │          │
│     │       scheme: "exact",                           │          │
│     │       network: "base-mainnet",                   │          │
│     │       maxAmountRequired: "1500000", // USDC      │          │
│     │       asset: "0x833...", // USDC contract        │          │
│     │       payTo: "0xYourAddress",                    │          │
│     │       timeout: { validBefore: timestamp },       │          │
│     │       extra: { name: "USD Coin", version: "2" }  │          │
│     │     }                                            │          │
│     │   ]                                              │          │
│     │ }                                                 │          │
│     │                                                   │          │
│     │ BROWSER SUPPORT:                                 │          │
│     │ - If client is browser + CDP_CLIENT_KEY set:     │          │
│     │   Returns HTML paywall with Coinbase Onramp      │          │
│     │ - Else: Returns JSON                             │          │
│     └──────────────────────────────────────────────────┘          │
│                                                                    │
│  2️⃣  POST /v1/x402/payment/:signatureType/:address                │
│     src/routes/x402Payment.ts                                      │
│     ┌──────────────────────────────────────────────────┐          │
│     │ Called by upload service when X-PAYMENT received │          │
│     │                                                   │          │
│     │ Body: {                                           │          │
│     │   paymentHeader: "<base64-x402-payload>",        │          │
│     │   dataItemId: "abc123",                          │          │
│     │   byteCount: 1024,                               │          │
│     │   mode: "hybrid" // or "payg" or "topup"        │          │
│     │ }                                                 │          │
│     │                                                   │          │
│     │ Logic:                                            │          │
│     │ 1. Decode payment header (base64 → JSON)         │          │
│     │ 2. Calculate Winston cost for upload             │          │
│     │ 3. Convert to USDC via X402PricingOracle         │          │
│     │ 4. Build payment requirements                    │          │
│     │ 5. Verify payment signature (EIP-712):           │          │
│     │    x402Service.verifyPayment(...)                │          │
│     │    - Validates signature matches payer           │          │
│     │    - Validates amount >= required                │          │
│     │    - Validates recipient address                 │          │
│     │    - Validates timeout not expired               │          │
│     │    - Optional: Verify with facilitator           │          │
│     │                                                   │          │
│     │ 6. Settle payment on-chain:                      │          │
│     │    x402Service.settlePayment(...)                │          │
│     │    - Calls Coinbase facilitator (with CDP auth)  │          │
│     │    - Facilitator executes EIP-3009 transfer      │          │
│     │    - Returns transaction hash                    │          │
│     │                                                   │          │
│     │ 7. Convert USDC → Winston via oracle             │          │
│     │                                                   │          │
│     │ 8. Create payment record in database:            │          │
│     │    paymentDatabase.createX402Payment({...})      │          │
│     │                                                   │          │
│     │ 9. Handle payment mode:                          │          │
│     │    a) PAYG: Reserve winc for this upload         │          │
│     │       - Create reservation in database           │          │
│     │       - Links payment to data item               │          │
│     │                                                   │          │
│     │    b) Top-up: Credit entire amount to balance    │          │
│     │       - Adjust user balance in database          │          │
│     │       - User can use for future uploads          │          │
│     │                                                   │          │
│     │    c) Hybrid: Reserve + credit excess            │          │
│     │       - Reserve exact cost for this upload       │          │
│     │       - Credit remaining to balance              │          │
│     │       - Best UX: pay once, extras credited       │          │
│     │                                                   │          │
│     │ Returns: 200 OK                                  │          │
│     │ {                                                 │          │
│     │   success: true,                                 │          │
│     │   paymentId: "uuid",                             │          │
│     │   txHash: "0x123...",                            │          │
│     │   network: "base-mainnet",                       │          │
│     │   wincPaid: "1000000",                           │          │
│     │   wincReserved: "800000",                        │          │
│     │   wincCredited: "200000",                        │          │
│     │   mode: "hybrid"                                 │          │
│     │ }                                                 │          │
│     └──────────────────────────────────────────────────┘          │
│                                                                    │
│  3️⃣  POST /v1/x402/finalize                                       │
│     src/routes/x402Finalize.ts                                     │
│     ┌──────────────────────────────────────────────────┐          │
│     │ Called by upload service after upload completes  │          │
│     │                                                   │          │
│     │ Body: {                                           │          │
│     │   dataItemId: "abc123",                          │          │
│     │   actualByteCount: 1050                          │          │
│     │ }                                                 │          │
│     │                                                   │          │
│     │ Logic:                                            │          │
│     │ 1. Get payment record from database              │          │
│     │ 2. Get declared byte count from payment          │          │
│     │ 3. Compare actual vs declared:                   │          │
│     │                                                   │          │
│     │    FRAUD: actual > declared + 5% tolerance       │          │
│     │    ┌────────────────────────────────────┐        │          │
│     │    │ - Set status = "fraud_penalty"     │        │          │
│     │    │ - Keep payment as penalty          │        │          │
│     │    │ - No refund                         │        │          │
│     │    │ - Log fraud attempt                 │        │          │
│     │    └────────────────────────────────────┘        │          │
│     │                                                   │          │
│     │    OVERPAID: actual < declared - 5% tolerance    │          │
│     │    ┌────────────────────────────────────┐        │          │
│     │    │ - Set status = "refunded"          │        │          │
│     │    │ - Calculate refund amount           │        │          │
│     │    │ - Credit refund to user balance     │        │          │
│     │    │ - Log refund                        │        │          │
│     │    └────────────────────────────────────┘        │          │
│     │                                                   │          │
│     │    WITHIN TOLERANCE: ±5%                         │          │
│     │    ┌────────────────────────────────────┐        │          │
│     │    │ - Set status = "confirmed"         │        │          │
│     │    │ - No adjustment needed              │        │          │
│     │    └────────────────────────────────────┘        │          │
│     │                                                   │          │
│     │ 4. Update payment record in database             │          │
│     │                                                   │          │
│     │ Returns: 200 OK                                  │          │
│     │ {                                                 │          │
│     │   success: true,                                 │          │
│     │   status: "confirmed|refunded|fraud_penalty",    │          │
│     │   actualByteCount: 1050,                         │          │
│     │   refundWinc: "0" // if refunded                 │          │
│     │ }                                                 │          │
│     └──────────────────────────────────────────────────┘          │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │              SUPPORTING SERVICES                          │    │
│  │                                                            │    │
│  │  X402Service (src/x402/x402Service.ts):                   │    │
│  │  - verifyPayment(): EIP-712 signature verification        │    │
│  │  - settlePayment(): Calls Coinbase facilitator            │    │
│  │  - Includes CDP API authentication headers                │    │
│  │                                                            │    │
│  │  X402PricingOracle (src/pricing/x402PricingOracle.ts):    │    │
│  │  - getUSDCForWinston(): Convert AR → USD → USDC           │    │
│  │  - getWinstonForUSDC(): Convert USDC → USD → AR           │    │
│  │  - Fetches AR/USD from CoinGecko (5min cache)             │    │
│  │                                                            │    │
│  │  Database (src/database/postgres.ts):                     │    │
│  │  - createX402Payment()                                    │    │
│  │  - createX402PaymentReservation()                         │    │
│  │  - finalizeX402Payment()                                  │    │
│  │  - getX402PaymentByDataItemId()                           │    │
│  │  - adjustUserWinstonBalance()                             │    │
│  └──────────────────────────────────────────────────────────┘    │
└────────────────────────────┬──────────────────────────────────────┘
                             ↓
                   Calls Coinbase Facilitator
                             ↓
┌────────────────────────────▼──────────────────────────────────────┐
│             COINBASE CDP FACILITATOR (External)                    │
│                                                                    │
│  URL: https://facilitator.base.coinbasecloud.net                  │
│                                                                    │
│  Authentication:                                                   │
│  Headers:                                                          │
│    X-CDP-API-KEY-ID: <your-cdp-key-id>                            │
│    X-CDP-API-KEY-SECRET: <your-cdp-key-secret>                    │
│                                                                    │
│  ┌─────────────────────────────────────────────────────┐          │
│  │ POST /settle                                         │          │
│  │                                                      │          │
│  │ Body: {                                              │          │
│  │   x402Version: 1,                                   │          │
│  │   paymentHeader: "<base64>",                        │          │
│  │   paymentRequirements: { ... }                      │          │
│  │ }                                                    │          │
│  │                                                      │          │
│  │ Facilitator Actions:                                │          │
│  │ 1. Validates CDP credentials                        │          │
│  │ 2. Decodes payment header                           │          │
│  │ 3. Verifies EIP-712 signature                       │          │
│  │ 4. Checks USDC contract balance                     │          │
│  │ 5. Executes EIP-3009 transferWithAuthorization      │          │
│  │ 6. Waits for transaction confirmation               │          │
│  │ 7. Returns transaction hash                         │          │
│  │                                                      │          │
│  │ Returns: {                                           │          │
│  │   transactionHash: "0xabc...",                      │          │
│  │   network: "base-mainnet"                           │          │
│  │ }                                                    │          │
│  └─────────────────────────────────────────────────────┘          │
└────────────────────────────────────────────────────────────────────┘
```

---

## Complete Payment Flow Scenarios

### Scenario 1: New User, First Upload with x402 (No Account Balance)

```
1. CLIENT: POST /v1/tx
   Headers:
     Content-Length: 1024
     X-PAYMENT: <base64-x402-payment>
   Body: <binary data>

   ↓

2. UPLOAD SERVICE (dataItemPost.ts:286-330):
   - Detects X-PAYMENT header
   - Calls: paymentService.verifyAndSettleX402Payment({
       paymentHeader: "<base64>",
       dataItemId: "xyz",
       byteCount: 1024,
       nativeAddress: "0xUser",
       signatureType: 3,
       mode: "hybrid"
     })

   ↓

3. PAYMENT SERVICE (x402Payment.ts):
   POST /v1/x402/payment/3/0xUser

   a) Calculate cost:
      - Winston: 1,000,000 (from pricing service)
      - +15% buffer: 1,150,000
      - Convert to USDC: $1.50 (via CoinGecko)

   b) Verify signature:
      - Extract authorization from payment header
      - Verify EIP-712 signature matches payer
      - Validate amount >= $1.50
      - Validate payTo address

   c) Settle on-chain:
      - POST to Coinbase facilitator (with CDP auth)
      - Facilitator executes USDC transfer
      - Returns tx hash: 0xabc...

   d) Save to database:
      - Create x402_payment_transaction record
      - Create x402_payment_reservation (links to data item)

   e) Handle hybrid mode:
      - User paid $2.00 USDC
      - Cost: $1.50 (1,150,000 winc)
      - Excess: $0.50 (383,333 winc)
      - Reserve 1,150,000 winc for this upload
      - Credit 383,333 winc to user balance for future use

   Returns: {
     success: true,
     paymentId: "uuid-1",
     txHash: "0xabc...",
     network: "base-mainnet",
     wincPaid: "1533333",
     wincReserved: "1150000",
     wincCredited: "383333",
     mode: "hybrid"
   }

   ↓

4. UPLOAD SERVICE:
   - Payment verified! ✅
   - Continue with upload
   - Store data in MinIO
   - Validate actual size: 1050 bytes (not 1024 declared)

   ↓

5. UPLOAD SERVICE (dataItemPost.ts:526-571):
   - Call: paymentService.finalizeX402Payment({
       dataItemId: "xyz",
       actualByteCount: 1050
     })

   ↓

6. PAYMENT SERVICE (x402Finalize.ts):
   POST /v1/x402/finalize

   - Declared: 1024 bytes
   - Actual: 1050 bytes
   - Tolerance: ±5% (±51 bytes)
   - Difference: +26 bytes (within tolerance ✅)

   - Status: "confirmed"
   - No refund needed
   - Update payment record

   ↓

7. UPLOAD SERVICE:
   - Queue for bundling
   - Return receipt to client:

   Response: 200 OK
   {
     id: "xyz",
     timestamp: 1735257600000,
     winc: "0", // x402 paid
     signature: "...",
     owner: "0xUser",
     x402Payment: {
       paymentId: "uuid-1",
       txHash: "0xabc...",
       network: "base-mainnet",
       mode: "hybrid"
     }
   }

CLIENT RECEIVES:
- Upload successful!
- $1.50 charged for this upload
- $0.50 credited to account for future uploads
- User now has 383,333 winc balance
```

### Scenario 2: Returning User (Has Balance from Previous x402 Hybrid)

```
1. CLIENT: POST /v1/tx
   Headers:
     Content-Length: 512  # Smaller upload
   Body: <binary data>
   # NO X-PAYMENT header this time!

   ↓

2. UPLOAD SERVICE (dataItemPost.ts:330-399):
   - No X-PAYMENT header detected
   - Call: paymentService.checkBalanceForData({
       nativeAddress: "0xUser",
       size: 512,
       signatureType: 3
     })

   ↓

3. PAYMENT SERVICE:
   GET /v1/check-balance/ethereum/0xUser?byteCount=512

   - Check database for user balance
   - User has: 383,333 winc (from previous hybrid payment)
   - Cost for 512 bytes: 500,000 winc
   - User doesn't have enough! ❌

   Returns: {
     userHasSufficientBalance: false,
     bytesCostInWinc: "500000",
     userBalanceInWinc: "383333"
   }

   ↓

4. UPLOAD SERVICE (dataItemPost.ts:354-398):
   - User has no sufficient balance
   - Get x402 payment requirements:

   Call: paymentService.getX402PriceQuote({
     byteCount: 512,
     nativeAddress: "0xUser",
     signatureType: 3
   })

   ↓

5. PAYMENT SERVICE (x402Price.ts):
   GET /v1/x402/price/3/0xUser?bytes=512

   - Calculate cost: 575,000 winc (with buffer)
   - Convert to USDC: $0.75
   - Generate payment requirements for Base

   Returns: 200 OK (note: NOT 402!)
   {
     x402Version: 1,
     accepts: [{
       scheme: "exact",
       network: "base-mainnet",
       maxAmountRequired: "750000", # $0.75 USDC
       asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
       payTo: "0xYourBundlerAddress",
       timeout: { validBefore: 1735260000000 }
     }]
   }

   ↓

6. UPLOAD SERVICE:
   Return: 402 Payment Required
   Headers:
     X-Payment-Required: x402-1
   Body: {
     x402Version: 1,
     accepts: [{ ... }]
   }

CLIENT RECEIVES:
- 402 Payment Required
- Payment details for $0.75 USDC
- Client can:
  a) Create x402 payment signature
  b) Retry upload with X-PAYMENT header
  c) OR top up balance traditionally
```

### Scenario 3: Fraud Detection (Declared < Actual)

```
1. CLIENT: POST /v1/tx
   Headers:
     Content-Length: 1024  # Claims 1KB
     X-PAYMENT: <payment for 1KB>
   Body: <actual 2048 bytes!>  # Actually sends 2KB 🚨

   ↓

2. UPLOAD SERVICE:
   - Payment verified for 1024 bytes ✅
   - Start upload...
   - Data streams in...
   - Actual size detected: 2048 bytes!

   ↓

3. UPLOAD SERVICE (dataItemPost.ts:526-571):
   Call: paymentService.finalizeX402Payment({
     dataItemId: "fraud-xyz",
     actualByteCount: 2048
   })

   ↓

4. PAYMENT SERVICE (x402Finalize.ts:86-96):
   - Declared: 1024 bytes
   - Actual: 2048 bytes
   - Tolerance: ±5% (±51 bytes)
   - Difference: +1024 bytes (100% over! 🚨)

   FRAUD DETECTED! ❌

   - Set status: "fraud_penalty"
   - Keep payment (no refund)
   - Log fraud attempt with user address

   ↓

5. UPLOAD SERVICE (dataItemPost.ts:548-555):
   - Finalize result: status = "fraud_penalty"
   - REJECT UPLOAD! ❌
   - Quarantine data
   - Remove from cache

   Return: 402 Payment Required
   {
     error: "Fraud detected: declared 1024 bytes but uploaded 2048 bytes. Payment kept as penalty."
   }

CLIENT RECEIVES:
- Upload rejected
- Payment kept as fraud penalty
- User lost their USDC
- Fraud logged for monitoring
```

---

## Key Integration Points

### 1. Upload Service → Payment Service Communication

**Client**: `TurboPaymentService` (`upload-service/src/arch/payment.ts`)

**Three x402-specific methods**:

```typescript
// Called when user has no balance (line 555-603)
async getX402PriceQuote({
  byteCount,
  nativeAddress,
  signatureType
}): Promise<X402PaymentRequiredResponse | null>

// Called when X-PAYMENT header detected (line 604-692)
async verifyAndSettleX402Payment({
  paymentHeader,
  dataItemId,
  byteCount,
  nativeAddress,
  signatureType,
  mode
}): Promise<X402PaymentResult>

// Called after upload completes (line 693-747)
async finalizeX402Payment({
  dataItemId,
  actualByteCount
}): Promise<X402FinalizeResult>
```

**Authentication**: JWT tokens with `PRIVATE_ROUTE_SECRET`

**Transport**: HTTPS REST calls via Axios

### 2. Payment Service → Coinbase CDP Integration

**Component**: `X402Service` (`payment-service/src/x402/x402Service.ts`)

**Key Methods**:

```typescript
// Verify EIP-712 signature locally (line 119-202)
async verifyPayment(
  paymentHeader: string,
  requirements: X402PaymentRequirements
): Promise<X402VerificationResult>

// Settle via Coinbase facilitator (line 207-283)
async settlePayment(
  paymentHeader: string,
  requirements: X402PaymentRequirements
): Promise<X402SettlementResult>
```

**CDP Authentication** (line 261-271):
```typescript
const headers: Record<string, string> = {
  "Content-Type": "application/json",
};

// Add CDP API authentication for mainnet
if (this.cdpApiKeyId && this.cdpApiKeySecret) {
  headers["X-CDP-API-KEY-ID"] = this.cdpApiKeyId;
  headers["X-CDP-API-KEY-SECRET"] = this.cdpApiKeySecret;
  logger.debug("Using CDP authentication for facilitator settlement");
}

const response = await axios.post(
  `${networkConfig.facilitatorUrl}/settle`,
  { x402Version: 1, paymentHeader, paymentRequirements: requirements },
  { headers, timeout: 30000 }
);
```

### 3. Database Schema

**Two main tables**:

**`x402_payment_transaction`** (payment-service):
```sql
CREATE TABLE x402_payment_transaction (
  id UUID PRIMARY KEY,
  user_address VARCHAR,
  user_address_type VARCHAR,
  tx_hash VARCHAR UNIQUE,  -- Blockchain transaction hash
  network VARCHAR,          -- base-mainnet, ethereum-mainnet, etc.
  token_address VARCHAR,    -- USDC contract address
  usdc_amount VARCHAR,      -- Amount in USDC (6 decimals)
  winc_amount VARCHAR,      -- Converted Winston amount
  mode VARCHAR,             -- payg, topup, hybrid
  data_item_id VARCHAR,     -- Optional (NULL for top-up)
  declared_byte_count INT,  -- Size user claimed
  actual_byte_count INT,    -- Actual size uploaded
  status VARCHAR,           -- pending_validation, confirmed, refunded, fraud_penalty
  payer_address VARCHAR,    -- Who signed the payment
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

**`x402_payment_reservation`** (payment-service):
```sql
CREATE TABLE x402_payment_reservation (
  data_item_id VARCHAR PRIMARY KEY,  -- Links to data item
  x402_payment_id UUID REFERENCES x402_payment_transaction(id),
  winc_reserved VARCHAR,             -- Amount reserved for this upload
  expires_at TIMESTAMP,              -- Auto-cleanup after 1 hour
  created_at TIMESTAMP
);
```

### 4. Pricing Conversion

**Component**: `X402PricingOracle` (`payment-service/src/pricing/x402PricingOracle.ts`)

**Flow**:
```
Winston Cost (AR pricing)
    ↓
Convert AR → USD (via CoinGecko API)
    ↓
USD Amount
    ↓
Convert USD → USDC (6 decimals)
    ↓
USDC Amount (for x402 payment)
```

**Example**:
- Upload: 1MB
- Winston cost: 1,000,000 (from pricing service)
- +15% buffer: 1,150,000 winc
- AR price: $12.50 per AR (from CoinGecko)
- USD amount: (1,150,000 / 1e12) * $12.50 = $0.014375
- USDC amount: 14,375 (= $0.014375 * 1e6)

**Cache**: AR/USD price cached for 5 minutes

---

## Payment Modes Explained

### PAYG (Pay-As-You-Go)
- **Use case**: Single upload, no account needed
- **Flow**:
  1. User pays exact amount for this specific upload
  2. Payment reserved for this data item only
  3. No balance credited
  4. Payment deleted after upload confirmed
- **Best for**: One-time users, privacy-conscious users

### Top-Up
- **Use case**: Pre-fund account with USDC
- **Flow**:
  1. User pays any amount (not tied to upload)
  2. Entire amount converted to Winston
  3. Winston credited to user balance
  4. User can use balance for multiple future uploads
- **Best for**: Power users, batch uploads

### Hybrid (Default, Recommended)
- **Use case**: Pay for upload + keep excess
- **Flow**:
  1. User pays for specific upload
  2. Exact cost reserved for this data item
  3. Excess amount credited to balance
  4. Best UX: one payment covers now + future
- **Best for**: Most users, best UX
- **Example**:
  - User pays: $2.00 USDC
  - Upload costs: $1.50
  - Result:
    - $1.50 reserved for this upload
    - $0.50 credited to balance
    - User can use $0.50 for next upload

---

## Error Scenarios

### 1. Insufficient Payment
```
Declared: 1024 bytes ($1.50 required)
Paid: $1.00 USDC
Result: 402 Payment Required
Error: "Insufficient amount: 1000000 < 1500000"
```

### 2. Invalid Signature
```
Payment signed by: 0xUser
Payment from field: 0xOther
Result: 402 Payment Required
Error: "Invalid EIP-712 signature"
```

### 3. Expired Payment
```
validBefore: 2025-10-28T12:00:00Z
Current time: 2025-10-28T12:05:00Z
Result: 402 Payment Required
Error: "Payment authorization expired"
```

### 4. Network Not Enabled
```
Client uses: polygon-mainnet
Server config: Only base-mainnet enabled
Result: 400 Bad Request
Error: "Network polygon-mainnet is not enabled"
```

### 5. Settlement Failed
```
CDP credentials: Missing
Facilitator: Returns 401 Unauthorized
Result: 503 Service Unavailable
Error: "Payment settlement failed"
```

### 6. Fraud Detected
```
Declared: 1024 bytes
Actual: 2048 bytes
Tolerance: ±5% (±51 bytes)
Over by: 1024 bytes (100%)
Result: 402 Payment Required + data quarantined
Error: "Fraud detected: declared 1024 bytes but uploaded 2048 bytes. Payment kept as penalty."
Status: "fraud_penalty"
```

---

## Configuration Requirements

### Minimal Development (Testnet)
```bash
# payment-service/.env
X402_ENABLED=true
X402_PAYMENT_ADDRESS=0xYourTestAddress
X402_BASE_TESTNET_ENABLED=true
X402_FACILITATOR_URL_BASE_TESTNET=https://x402.org/facilitator
# No CDP credentials needed for testnet!
```

### Production (Mainnet)
```bash
# payment-service/.env
X402_ENABLED=true
X402_PAYMENT_ADDRESS=0xYourMainnetAddress

# REQUIRED for mainnet
CDP_API_KEY_ID=your-cdp-key-id
CDP_API_KEY_SECRET=your-cdp-key-secret

# Network configuration
X402_BASE_ENABLED=true
BASE_MAINNET_RPC_URL=https://mainnet.base.org
X402_FACILITATOR_URL_BASE=https://facilitator.base.coinbasecloud.net

# Pricing
COINGECKO_API_KEY=optional  # Free tier works
```

### Both Services Need
```bash
# MUST MATCH in both .env files
PRIVATE_ROUTE_SECRET=<same-value-both-services>

# upload-service/.env
PAYMENT_SERVICE_BASE_URL=localhost:4001  # NO protocol prefix!
```

---

## Monitoring & Debugging

### Key Log Messages

**Upload Service**:
```
"Processing x402 payment..." → Starting verification
"x402 payment successful" → Payment verified & settled
"Finalizing x402 payment with actual byte count" → Fraud detection
"x402 fraud detected" → Fraud penalty applied
"x402 payment finalized" → All done
```

**Payment Service**:
```
"Processing x402 payment" → Received payment request
"Verifying x402 payment" → Signature validation
"Settling x402 payment via facilitator" → Calling Coinbase
"X402 payment successful" → Transaction confirmed
"X402 fraud detected" → Size mismatch > tolerance
"X402 overpayment detected" → Issuing refund
```

### Metrics to Track

**Payment Service**:
- x402 payments received (count)
- x402 payment success rate (%)
- x402 verification failures (by reason)
- x402 settlement failures (by reason)
- x402 fraud attempts (count)
- x402 refunds issued (count)
- Average USDC amount per payment
- Average Winston per payment

**Upload Service**:
- Uploads paid via x402 (count)
- Uploads paid via traditional balance (count)
- 402 responses returned (count)
- Fraud quarantines (count)

### Database Queries

**Check payment status**:
```sql
SELECT * FROM x402_payment_transaction
WHERE data_item_id = 'xyz123';
```

**Find fraud attempts**:
```sql
SELECT * FROM x402_payment_transaction
WHERE status = 'fraud_penalty'
ORDER BY created_at DESC;
```

**Check user's x402 history**:
```sql
SELECT
  tx_hash,
  network,
  usdc_amount,
  winc_amount,
  mode,
  status,
  created_at
FROM x402_payment_transaction
WHERE user_address = '0xUser'
ORDER BY created_at DESC;
```

**Total x402 revenue**:
```sql
SELECT
  network,
  COUNT(*) as payment_count,
  SUM(CAST(usdc_amount AS BIGINT)) as total_usdc,
  SUM(CAST(winc_amount AS BIGINT)) as total_winc
FROM x402_payment_transaction
WHERE status IN ('confirmed', 'fraud_penalty')
GROUP BY network;
```

---

## FAQ

### Q: Why does x402 price route return 200 OK, not 402?
**A**: Per x402 standard, the **price quote endpoint** returns 200 OK with payment requirements. The **actual 402 response** happens at the upload endpoint when payment is required.

### Q: What happens if user has both balance AND sends X-PAYMENT header?
**A**: X-PAYMENT takes priority. The upload service checks for X-PAYMENT header first (line 286), and if present, uses x402 flow regardless of traditional balance.

### Q: Can users mix x402 and traditional payments?
**A**: Yes! In hybrid mode, excess x402 payment is credited to traditional balance. User can then use that balance for future uploads without x402.

### Q: What happens if settlement fails but signature is valid?
**A**: Upload is rejected with 503 error. Payment is NOT recorded in database. User can retry with same payment signature (nonce prevents double-spend).

### Q: How does fraud detection work exactly?
**A**: Compares `Content-Length` header (declared) vs actual streamed bytes. If actual > declared + 5% tolerance, marks as fraud and keeps payment as penalty.

### Q: Can I use x402 without Coinbase CDP credentials?
**A**: YES for testnet (use public facilitator at x402.org). NO for mainnet (requires CDP credentials for settlement).

### Q: What networks are supported?
**A**: Base (primary), Ethereum, Polygon. Only USDC token. EVM chains only (no Solana/etc).

### Q: How long does settlement take?
**A**: Typically 2-5 seconds for signature verification + on-chain settlement on Base. Slower on Ethereum (~15-30 seconds).

---

## Summary

**x402 is a complete alternative payment flow** that:

1. **Runs parallel to traditional balance system** - Users can choose either
2. **Verifies signature locally** - No blockchain calls needed for verification
3. **Settles via Coinbase CDP** - Requires CDP credentials for mainnet
4. **Prevents fraud** - Compares declared vs actual upload size
5. **Supports three modes** - PAYG, top-up, hybrid
6. **Integrates at upload boundary** - Upload service detects X-PAYMENT header and calls payment service
7. **Requires finalization** - Upload service must call finalize after upload completes

The key insight: **x402 doesn't replace the traditional system - it provides an alternative for users who prefer pay-per-upload with USDC over pre-funding an account.**
