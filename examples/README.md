# AR.IO Bundler x402 Upload Examples

This directory contains production-ready examples for uploading files to AR.IO Bundler using Coinbase's **x402 payment protocol** with USDC stablecoins.

## ⚠️ **CRITICAL: Must Use HTTP Server for Browser Examples**

**MetaMask WILL NOT work when opening HTML files directly via `file://` protocol!**

### Quick Start:

```bash
cd examples
node serve.js
```

Then open: **http://localhost:8080/**

**Why?** For security reasons, MetaMask only injects `window.ethereum` on pages served via HTTP/HTTPS, not local `file://` URLs.

## Overview

The x402 protocol enables HTTP-native, pay-as-you-go payments using USDC on EVM chains (Base, Ethereum, Polygon). Upload files to Arweave without pre-loading credits—just pay with USDC as you upload.

### How It Works

1. **Get Price Quote** - Request upload cost in USDC from payment service (returns 200 OK with payment requirements)
2. **Create Payment Authorization** - Sign an EIP-3009 USDC transfer authorization with EIP-712
3. **Upload with Payment** - Send file with `X-PAYMENT` header containing the authorization
4. **Automatic Settlement** - Payment service verifies signature and settles payment; upload service processes file
5. **If Payment Missing** - Upload endpoint returns 402 Payment Required if no X-PAYMENT header provided

**Note:** Per x402 standard, the price quote endpoint returns **200 OK**. The **402 Payment Required** response only happens when you attempt to upload without payment.

### Browser Paywall (Optional Feature)

The payment service can serve an **interactive HTML paywall** for browser clients, providing a user-friendly alternative to programmatic x402 integration:

**Features:**
- 🌐 **Automatic browser detection** - Serves HTML to browsers, JSON to APIs
- 💰 **Coinbase Onramp integration** - Buy USDC directly in the payment flow
- 🔐 **MetaMask integration** - One-click payment authorization
- 🎨 **Beautiful UI** - Professional payment interface

**Usage:**
```bash
# 1. Enable browser paywall (optional - set in payment service .env)
X_402_CDP_CLIENT_KEY=your_coinbase_client_key

# 2. Open price quote URL in browser
open "http://localhost:4001/v1/x402/price/3/YOUR_ADDRESS?bytes=1024"

# 3. Browser displays interactive paywall with:
#    - Payment amount in USDC
#    - "Connect Wallet & Authorize Payment" button
#    - "Don't have USDC? Buy some first" button (Onramp)
```

**When to Use:**
- Non-technical users who prefer visual interfaces
- Users without USDC who need to buy it
- Quick testing without writing code

**When NOT to Use:**
- Automated/programmatic uploads (use CLI/SDK examples)
- Backend services (use Node.js example)
- Batch uploads (use programmatic approach)

## Examples

We provide **3 production-ready examples**:

### 1. 🚀 Simplest Example: `x402-raw-upload.html` ⭐ START HERE

**Upload raw files with automatic x402 payment using the official x402-fetch library.**

#### Why This Example?

- ✅ **Simplest approach** - No data item signing, no arbundles, just upload
- ✅ **Official x402-fetch library** - Automatic 402 payment detection and handling
- ✅ **Production-ready** - Uses Coinbase's official x402 implementation
- ✅ **Perfect for getting started** - Minimal code, maximum clarity
- ✅ **No build step** - Just open the HTML file via HTTP server

#### Quick Start

```bash
# Start the HTTP server (required for MetaMask)
cd examples
node serve.js

# Open in browser
http://localhost:8080/x402-raw-upload.html
```

#### Usage Flow

1. Connect MetaMask wallet
2. Select a file to upload
3. Click "Upload with x402 Payment"
4. x402-fetch automatically detects 402, prompts for payment signature
5. Upload completes with receipt

#### Code Example

```javascript
import { wrapFetchWithPayment } from 'x402-fetch';
import { createWalletClient, custom } from 'viem';
import { baseSepolia } from 'viem/chains';

// Create viem wallet client from MetaMask
const walletClient = createWalletClient({
  account,
  chain: baseSepolia,
  transport: custom(window.ethereum)
});

// Wrap fetch with automatic x402 handling
const fetchWithPayment = wrapFetchWithPayment(fetch, walletClient);

// Upload raw file - payment handled automatically!
const fileData = await file.arrayBuffer();
const response = await fetchWithPayment('https://upload.services.vilenarios.com/v1/tx', {
  method: 'POST',
  headers: {
    'Content-Type': file.type,
    'Content-Length': fileData.byteLength.toString(),
  },
  body: fileData
});

const receipt = await response.json();
console.log('Uploaded:', receipt.id);
```

#### Libraries Used

- **viem@2.x** - Ethereum wallet client
- **x402-fetch@latest** - Official Coinbase x402 SDK for automatic payment handling

---

### 2. 🌐 Advanced Example: `x402-upload-signed-data-item.html` ⭐ RECOMMENDED

**Complete browser-based x402 upload with signed ANS-104 data items.**

#### Why This Example?

- ✅ **Production-ready** - Tested and verified implementation
- ✅ **Single MetaMask wallet** - Uses one Ethereum wallet for both data signing and payment
- ✅ **Comprehensive** - Complete ANS-104 data item signing with arbundles
- ✅ **Well-documented** - Inline comments explain every step
- ✅ **No build step** - Just open the HTML file via HTTP server
- ✅ **Clean x402 flow** - Gets price quote first, then uploads with payment

#### Key Features

**Handles Both Required Signatures:**
1. **Data Item Signature** - Signs your file data as an ANS-104 bundle (signatureType 3 for Ethereum)
2. **Payment Signature** - Signs USDC payment authorization with EIP-712

**Both use the same MetaMask wallet!** No Arweave wallet needed.

#### Quick Start

```bash
# Start the HTTP server (required for MetaMask)
cd examples
node serve.js

# Open in browser
http://localhost:8080/x402-upload-signed-data-item.html
```

#### Usage Flow

1. Connect MetaMask wallet
2. Select a file to upload
3. Click "Upload with USDC Payment"
4. Sign data item (MetaMask prompt #1)
5. Sign USDC payment (MetaMask prompt #2)
6. Upload completes with receipt

#### Code Example

```javascript
// Step 1: Create and sign ANS-104 data item
const dataItem = window.arbundles.createData(fileData, signer);
dataItem.addTag('Content-Type', 'image/jpeg');
await dataItem.sign(signer);
const signedDataItem = dataItem.getRaw();

// Step 2: Get price quote
const priceResponse = await fetch(
  `${paymentUrl}/v1/x402/price/3/${address}?bytes=${size}`
);
const { accepts } = await priceResponse.json();

// Step 3: Create and sign EIP-712 payment authorization
const signature = await metamaskSigner.signTypedData(domain, types, authorization);

// Step 4: Build x402 payment header
const paymentHeader = btoa(JSON.stringify({
  x402Version: 1,
  scheme: 'eip-3009',
  network: 'base-sepolia',
  payload: { signature, authorization }
}));

// Step 5: Upload with X-PAYMENT header
const response = await fetch(`${uploadUrl}/v1/tx`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/octet-stream',
    'Content-Length': size.toString(),
    'X-PAYMENT': paymentHeader
  },
  body: signedDataItem
});

const receipt = await response.json();
console.log('Uploaded:', receipt.id);
console.log('Payment:', receipt.x402Payment);
```

#### Libraries Used

- **ethers.js v6** - Ethereum wallet and EIP-712 signing
- **@dha-team/arbundles@1.0.4** - ANS-104 data item creation and signing

---

### 3. 🖥️ Node.js Example: `x402-upload-example.js` ⭐ RECOMMENDED

**Command-line tool for uploading files from Node.js/backend applications.**

#### Why This Example?

- ✅ **Backend-friendly** - Server-side, CI/CD, automated uploads
- ✅ **CLI tool** - Upload files from command line
- ✅ **Library mode** - Export functions for use in your own code
- ✅ **Complete error handling** - Production-grade error messages
- ✅ **Balance checking** - Verifies USDC balance before upload
- ✅ **Browser paywall fallback** - Suggests browser UI if USDC balance insufficient

#### Installation

```bash
npm install ethers@6 axios arweave arbundles
```

#### Configuration

**Option 1: Environment Variables**

```bash
# Required: Your Ethereum wallet private key
export ETH_PRIVATE_KEY="0x1234..."

# Optional: Network (defaults to base-mainnet)
export X402_NETWORK="base-mainnet"  # or "base-sepolia" for testing

# Optional: Service URLs (defaults to localhost)
export UPLOAD_SERVICE_URL="http://localhost:3001"
export PAYMENT_SERVICE_URL="http://localhost:4001"

# Optional: RPC URL (auto-selected based on network)
export BASE_RPC_URL="https://mainnet.base.org"
```

**Option 2: Edit Config Object**

Edit the `CONFIG` object in `x402-upload-example.js` directly.

#### Usage

**As CLI Tool:**

```bash
# Upload a file
node x402-upload-example.js ./my-file.txt

# Upload an image
node x402-upload-example.js ./photo.jpg

# Upload any file
node x402-upload-example.js /path/to/any-file
```

**As Library:**

```javascript
const { uploadFileWithX402, checkUsdcBalance } = require('./x402-upload-example.js');

// Check balance first
const balance = await checkUsdcBalance(wallet, usdcContract);
console.log(`USDC Balance: ${balance} USDC`);

// Upload a file
const receipt = await uploadFileWithX402('./myfile.txt');
console.log('Upload ID:', receipt.id);
console.log('Payment:', receipt.x402Payment);
```

#### Features

- ✅ Checks USDC balance before upload
- ✅ Gets price quote from payment service
- ✅ Creates and signs ANS-104 data items
- ✅ Creates and signs EIP-712 payment authorization
- ✅ Uploads file with x402 payment header
- ✅ Displays detailed receipt with transaction hash
- ✅ Can be used as a CLI or imported as library

#### Example Output

```
🚀 AR.IO x402 Upload Example

💵 USDC Balance: 10.5 USDC
📊 Getting price quote for 2048 bytes...
✅ Price quote received
   Networks available: base-sepolia, base-mainnet
💰 Creating payment authorization for base-sepolia...
   Amount required: 0.000123 USDC
   Recipient: 0x1234567890123456789012345678901234567890
✍️  Signing authorization with EIP-712...
✅ Payment authorization created and signed
📤 Uploading file (2048 bytes) with x402 payment...
✅ Upload successful!
   Receipt: {
     "id": "xyz789...",
     "x402Payment": {
       "paymentId": "550e8400-e29b-41d4-a716-446655440000",
       "txHash": "0xabcd...",
       "network": "base-sepolia",
       "mode": "hybrid"
     }
   }

✨ Success! Your file has been uploaded and paid for with USDC.
   View on Arweave: https://arweave.net/xyz789...
```

#### Libraries Used

- **ethers.js v6** - Ethereum wallet and EIP-712 signing
- **arweave** - Arweave utilities
- **arbundles** - ANS-104 data item creation
- **axios** - HTTP requests

---

## API Documentation

Both examples interact with the AR.IO Bundler APIs. Full specifications available in OpenAPI format:

### Upload Service API

**Location:** `packages/upload-service/docs/openapi.yaml`

**x402-Related Endpoints:**

- `POST /v1/tx` - Upload signed data item
  - Accepts `X-PAYMENT` header for x402 payments
  - Requires `Content-Length` header when using X-PAYMENT
  - Returns receipt with `x402Payment` object if paid via x402

### Payment Service API

**Location:** `packages/payment-service/docs/openapi.yaml`

**x402 Endpoints:**

- `GET /v1/x402/price/{signatureType}/{address}?bytes=N`
  - Get payment requirements for uploading N bytes
  - Returns **200 OK** with payment requirements (per x402 standard)
  - **Content Negotiation:**
    - API clients (Accept: application/json) → JSON with payment requirements
    - Browser clients (Accept: text/html) → Interactive HTML paywall with Coinbase Onramp
  - Response includes USDC amount, contract address, recipient, timeout
  - **Browser Paywall Features** (when X_402_CDP_CLIENT_KEY configured):
    - MetaMask wallet connection
    - EIP-712 payment signing UI
    - Coinbase Onramp for buying USDC
    - Automatic payment signature generation

- `POST /v1/x402/payment/{signatureType}/{address}`
  - Verify and settle x402 payment
  - Request body: `{ paymentHeader, dataItemId, byteCount, mode }`
  - Returns payment result with `paymentId`, `txHash`, `network`

- `POST /v1/x402/finalize`
  - Finalize payment after upload (fraud detection)
  - Compares declared vs actual byte count
  - Returns finalization result with refund or fraud penalty

## Payment Modes

The x402 protocol supports 3 payment modes:

| Mode | Description | Use Case |
|------|-------------|----------|
| **payg** | Pay-as-you-go - USDC deducted per upload | One-time uploads, no account needed |
| **topup** | Top up account balance with USDC | Frequent uploads, account-based billing |
| **hybrid** | Pay for upload + any excess tops up balance | Default mode - best of both worlds |

**Default mode:** `hybrid` (recommended)

## Network Support

The examples support multiple EVM networks:

- **Base Sepolia** (testnet) - Default for testing
- **Base Mainnet** (production) - Production USDC payments
- **Ethereum Mainnet** - L1 USDC support
- **Polygon** - Lower gas fees

Configure network in examples or via environment variables.

## USDC Contracts

### Testnet (Base Sepolia)
- **USDC Contract:** `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
- **Get Test USDC:** [Base Sepolia Faucet](https://www.coinbase.com/faucets/base-sepolia-faucet)

### Mainnet (Base)
- **USDC Contract:** `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- **Get USDC:** Bridge from Ethereum or buy on exchanges

## Troubleshooting

### "Insufficient USDC balance"
- Check your USDC balance using example's balance checker
- For testnet: Get test USDC from Base Sepolia faucet
- For mainnet: Ensure you have enough USDC in your wallet

### "Payment verification failed"
- Ensure you're using the correct network (testnet vs mainnet)
- Check that payment service is running and accessible
- Verify USDC contract address matches the network

### "Content-Length required"
- When using X-PAYMENT header, Content-Length must be present
- This enables fraud detection (declared vs actual size)

### "Data item parsing error"
- Ensure file is properly signed as ANS-104 data item
- Check that arbundles library is correctly loaded
- Verify signer is properly initialized

## Additional Resources

- **x402 Protocol Spec:** https://github.com/coinbase/x402
- **EIP-3009 Standard:** https://eips.ethereum.org/EIPS/eip-3009
- **ANS-104 Spec:** https://github.com/ArweaveTeam/arweave-standards/blob/master/ans/ANS-104.md
- **Technical Analysis:** See `ANALYSIS.md` for detailed implementation notes

## Support

For issues or questions:
- Check `ANALYSIS.md` for technical details
- Review OpenAPI specs in `packages/*/docs/openapi.yaml`
- Open an issue in the GitHub repository
