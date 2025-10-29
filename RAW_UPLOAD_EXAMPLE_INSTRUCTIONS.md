# Instructions for Creating Raw Data Upload Example

## Objective

Create a working example that demonstrates uploading raw data to the AR.IO Bundler's server-signed upload endpoint using the x402 payment protocol.

## Overview

The AR.IO Bundler supports two upload modes at `POST /v1/tx`:

1. **Traditional ANS-104 Upload** - Client creates and signs ANS-104 data items
2. **Raw Data Upload** - Server creates and signs data items (AI agent friendly)

Your task is to create an example for **Mode 2: Raw Data Upload**.

## How It Works

### Smart Detection
The service automatically detects upload type by checking the first 2 bytes:
- If bytes are a valid ANS-104 signature type (1-8): Traditional upload
- Otherwise: Raw data upload

### Two-Phase x402 Flow

**Phase 1: Get Price Quote (402 Response)**
```bash
POST /v1/tx
Content-Type: application/json
Content-Length: 1234

<raw-data>
```

Response (402 Payment Required):
```json
{
  "x402Version": 1,
  "accepts": [{
    "scheme": "eip-3009",
    "network": "base-sepolia",
    "maxAmountRequired": "10000",
    "resource": "/v1/tx",
    "description": "Upload 1234 bytes to Arweave via AR.IO Bundler",
    "payTo": "0x...",
    "maxTimeoutSeconds": 3600,
    "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
  }]
}
```

**Phase 2: Upload with Payment**
```bash
POST /v1/tx
Content-Type: application/json
Content-Length: 1234
X-PAYMENT: <base64-eip3009-authorization>

<raw-data>
```

Response (201 Created):
```json
{
  "id": "abc123...",
  "owner": "xyz789...",  // Server's raw data item wallet
  "payer": "0x...",      // Your Ethereum address
  "receipt": {...},
  "x402Payment": {
    "paymentId": "uuid",
    "transactionHash": "0x...",
    "network": "base-sepolia",
    "mode": "hybrid"
  }
}
```

## Implementation Requirements

### 1. Environment Setup

Create an example in `examples/raw-data-upload/` with:

```
examples/raw-data-upload/
├── package.json
├── .env.example
├── README.md
├── src/
│   ├── upload.ts          # Main upload logic
│   └── eip3009.ts         # EIP-3009 payment authorization
└── data/
    └── sample.json        # Sample data to upload
```

### 2. Dependencies Needed

```json
{
  "dependencies": {
    "ethers": "^6.x",           // For EIP-712 signing
    "axios": "^1.x",            // For HTTP requests
    "dotenv": "^16.x"           // For environment variables
  }
}
```

### 3. Environment Variables (.env.example)

```bash
# Upload Service URL
UPLOAD_SERVICE_URL=http://localhost:3001

# Ethereum wallet (for x402 payment signing)
ETHEREUM_PRIVATE_KEY=0x...

# USDC contract address (Base Sepolia testnet)
USDC_CONTRACT_ADDRESS=0x036CbD53842c5426634e7929541eC2318f3dCF7e

# Network
NETWORK=base-sepolia
```

### 4. Core Implementation Steps

#### Step 1: Create EIP-3009 Payment Authorization

The X-PAYMENT header must contain a base64-encoded JSON with:
```typescript
{
  "x402Version": 1,
  "scheme": "eip-3009",
  "network": "base-sepolia",
  "payload": {
    "authorization": {
      "from": "0x...",              // Payer address
      "to": "0x...",                // Recipient (from 402 response)
      "value": "10000",             // USDC amount (from 402 response)
      "validAfter": 0,
      "validBefore": 1234567890,    // Unix timestamp + timeout
      "nonce": "0x..."              // Random 32-byte hex
    },
    "signature": "0x..."            // EIP-712 signature
  }
}
```

#### Step 2: EIP-712 Typed Data Structure

```typescript
const domain = {
  name: "USD Coin",
  version: "2",
  chainId: 84532,  // Base Sepolia
  verifyingContract: usdcContractAddress
};

const types = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" }
  ]
};

const message = {
  from: payerAddress,
  to: recipientAddress,
  value: usdcAmount,
  validAfter: 0,
  validBefore: Math.floor(Date.now() / 1000) + 3600,
  nonce: randomNonce
};
```

#### Step 3: Upload Flow

```typescript
// 1. Get price quote
const priceResponse = await axios.post(
  `${uploadServiceUrl}/v1/tx`,
  rawData,
  {
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': rawData.length.toString()
    },
    validateStatus: (status) => status === 402
  }
);

// 2. Create EIP-3009 authorization
const paymentRequirements = priceResponse.data.accepts[0];
const authorization = await createEIP3009Authorization(
  wallet,
  paymentRequirements
);

// 3. Upload with payment
const uploadResponse = await axios.post(
  `${uploadServiceUrl}/v1/tx`,
  rawData,
  {
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': rawData.length.toString(),
      'X-PAYMENT': Buffer.from(JSON.stringify(authorization)).toString('base64')
    }
  }
);

console.log('Upload successful!');
console.log('Data Item ID:', uploadResponse.data.id);
console.log('Owner (server wallet):', uploadResponse.data.owner);
console.log('Payer (your address):', uploadResponse.data.payer);
```

### 5. Request Format Options

**Option A: Binary with Headers**
```typescript
const data = Buffer.from(JSON.stringify({ message: "Hello World" }));

await axios.post(url, data, {
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length.toString(),
    'X-Tag-App-Name': 'MyApp',
    'X-Tag-Version': '1.0',
    'X-PAYMENT': paymentHeaderBase64
  }
});
```

**Option B: JSON Envelope**
```typescript
const payload = {
  data: Buffer.from(JSON.stringify({ message: "Hello World" })).toString('base64'),
  contentType: 'application/json',
  tags: [
    { name: 'App-Name', value: 'MyApp' },
    { name: 'Version', value: '1.0' }
  ]
};

await axios.post(url, payload, {
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': JSON.stringify(payload).length.toString(),
    'X-PAYMENT': paymentHeaderBase64
  }
});
```

## Auto-Added Tags

The server automatically adds these tags to raw uploads:
- `Bundler`: Service name (from APP_NAME env var)
- `Upload-Type`: "raw-data-x402"
- `Payer-Address`: Your Ethereum address (from X-PAYMENT)
- `Upload-Timestamp`: Unix timestamp
- `Content-Type`: MIME type

## Testing

### Local Testing Setup

1. Start the bundler services:
```bash
cd /home/vilenarios/ar-io-bundler
docker compose up -d
yarn db:migrate
pm2 start infrastructure/pm2/ecosystem.config.js
```

2. Verify services are running:
```bash
curl http://localhost:3001/v1/info  # Upload service
curl http://localhost:4001/v1/info  # Payment service
```

3. Run your example:
```bash
cd examples/raw-data-upload
cp .env.example .env
# Edit .env with your Ethereum private key
yarn install
yarn start
```

## Success Criteria

Your example should:
1. ✅ Generate a random nonce for EIP-3009
2. ✅ Create valid EIP-712 signature for payment authorization
3. ✅ Handle 402 Payment Required response correctly
4. ✅ Successfully upload data with X-PAYMENT header
5. ✅ Print the resulting data item ID and transaction hash
6. ✅ Include comprehensive error handling
7. ✅ Include a README with setup instructions
8. ✅ Work with both request format options (binary + headers and JSON envelope)

## Reference Documentation

- **Upload Service README**: `/home/vilenarios/ar-io-bundler/packages/upload-service/README.md`
- **Architecture Docs**: `/home/vilenarios/ar-io-bundler/docs/architecture/ARCHITECTURE.md`
- **OpenAPI Spec**: `/home/vilenarios/ar-io-bundler/packages/upload-service/docs/openapi.yaml`
- **x402 Protocol**: https://github.com/coinbase/x402
- **EIP-3009**: https://eips.ethereum.org/EIPS/eip-3009
- **EIP-712**: https://eips.ethereum.org/EIPS/eip-712

## Example Output

When successful, your example should output:
```
🚀 Uploading raw data to AR.IO Bundler...

📝 Step 1: Getting price quote...
   Price: 0.000010 USDC for 1234 bytes

💰 Step 2: Creating EIP-3009 payment authorization...
   Nonce: 0x1234...
   Amount: 10000 (USDC atomic units)
   Valid until: 2025-10-29T04:08:45Z

📤 Step 3: Uploading with payment...
   ✓ Upload successful!

📊 Results:
   Data Item ID: QpmY8mZmFEC8RxNsgbxSV6e36OF6quIYaPRKzvUco0o
   Owner (server): 8wgRDgvYOrtSaWEIV21g0lTuWDUnTu4_iYj4hmA7PI0
   Payer (you): 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0
   Transaction: 0xabc123...
   Network: base-sepolia

🔗 View on Arweave: https://arweave.net/QpmY8mZmFEC8RxNsgbxSV6e36OF6quIYaPRKzvUco0o
```

## Notes

- Use Base Sepolia testnet USDC for testing (contract: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`)
- You'll need testnet USDC - get from Coinbase faucet or testnet faucet
- The nonce must be unique per payment (use `crypto.randomBytes(32)`)
- Payment mode defaults to "hybrid" (pays for upload + excess tops up balance)
- The server's raw data item wallet is automatically whitelisted (no balance checks)

## Questions?

If you encounter issues:
1. Check that services are running: `pm2 status`
2. Check logs: `pm2 logs upload-api`
3. Verify USDC contract address matches the network
4. Ensure your wallet has testnet USDC
5. Verify the EIP-712 signature is valid

Good luck! 🚀
