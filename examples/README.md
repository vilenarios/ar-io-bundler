# x402 Upload Examples

This directory contains examples demonstrating how to upload files to AR.IO Bundler using Coinbase's x402 payment protocol with USDC stablecoins.

## Overview

The x402 protocol enables HTTP-native payments using USDC on EVM chains (Base, Ethereum, Polygon). These examples show how to:

1. Get a price quote for an upload (in USDC)
2. Create an EIP-3009 USDC transfer authorization
3. Sign it with EIP-712
4. Upload a file with the x402 payment

## Examples

### 1. Complete Browser Example (`x402-complete-upload.html`) ⭐ RECOMMENDED

**The complete solution!** Creates ANS-104 data items signed with Ethereum and pays with USDC.

#### What Makes This Complete?

This example handles **both required signatures** using a **single Ethereum wallet**:

1. **Data Item Signature** - Signs your file with Ethereum key (creates ANS-104 bundle)
2. **Payment Signature** - Signs USDC payment authorization (via x402)

**Both use the same MetaMask wallet!** No Arweave wallet needed.

#### How It Works

```javascript
// Step 1: Create ANS-104 data item
const dataItem = arbundles.DataItem.blank();
dataItem.data = fileData;
dataItem.addTag('Content-Type', 'image/jpeg');

// Step 2: Sign with Ethereum wallet (signatureType 3)
const ethSigner = new EthereumSigner(metamaskSigner);
await dataItem.sign(ethSigner);  // ← MetaMask prompt #1

// Step 3: Get signed bytes
const signedDataItem = dataItem.getRaw();

// Step 4: Upload with x402 payment
const response = await x402fetch(uploadUrl, {
  body: signedDataItem,      // ← Properly signed ANS-104 bundle
  signer: metamaskSigner,    // ← Same wallet for payment! Prompt #2
});
```

#### User Experience

The user will see **two MetaMask popups**:

1. **First popup:** "Sign message" - Creating the data item signature
2. **Second popup:** "Sign typed data" - Authorizing the USDC payment

#### Features

- ✅ **One wallet for everything** - No Arweave wallet needed
- ✅ **Proper ANS-104 bundles** - Upload service accepts it
- ✅ **Ethereum signatures** - SignatureType 3 supported by Turbo
- ✅ **Automatic payment** - x402fetch handles USDC authorization
- ✅ **Optional tags** - Add Content-Type, File-Name, etc.
- ✅ **No build step** - Open HTML file and go!

#### Installation

```bash
# Just open it!
open examples/x402-complete-upload.html
```

#### Libraries Used

- `arbundles` - Creates and signs ANS-104 data items
- `ethers.js` - Ethereum wallet interaction
- `@coinbase/x402` - Automatic x402 payment handling

---

### 2. Node.js CLI Example (`x402-upload-example.js`)

A command-line tool for uploading files from Node.js.

#### Installation

```bash
npm install ethers@6 axios arweave arbundles
```

#### Configuration

Set environment variables:

```bash
# Required: Your Ethereum wallet private key
export ETH_PRIVATE_KEY="0x1234..."

# Optional: Service URLs (defaults to localhost)
export UPLOAD_SERVICE_URL="http://localhost:3000"
export PAYMENT_SERVICE_URL="http://localhost:4000"

# Optional: RPC URL (defaults to Base Sepolia)
export BASE_SEPOLIA_RPC_URL="https://sepolia.base.org"
```

Or edit the `CONFIG` object in the file directly.

#### Usage

```bash
# Upload a file
node x402-upload-example.js ./my-file.txt

# Upload an image
node x402-upload-example.js ./photo.jpg

# Upload any file
node x402-upload-example.js /path/to/file
```

#### Features

- ✅ Checks USDC balance before upload
- ✅ Gets price quote from payment service
- ✅ Creates and signs EIP-712 authorization
- ✅ Uploads file with x402 payment header
- ✅ Displays receipt with transaction hash
- ✅ Can be used as a library (exports functions)

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
       "paymentId": "uuid",
       "txHash": "0xabcd...",
       "network": "base-sepolia",
       "mode": "hybrid"
     }
   }

✨ Success! Your file has been uploaded and paid for with USDC.
   View on Arweave: https://arweave.net/xyz789...
```

---

### 3. Browser Example with x402fetch (`x402-browser-upload-with-x402fetch.html`)

**The easiest way!** Uses Coinbase's official `x402fetch` library that automatically handles the entire payment flow.

#### What is x402fetch?

`x402fetch` is Coinbase's client library that works like regular `fetch()` but automatically handles x402 payments:

```javascript
// Instead of manually handling price quotes, signatures, headers...
const response = await x402fetch(url, {
  method: 'POST',
  body: fileData,
  signer: metamaskSigner  // Just pass your MetaMask signer!
});
// x402fetch does everything automatically! 🎉
```

#### Features

- ✅ **Automatic price quote requests** - No manual API calls needed
- ✅ **Automatic EIP-712 signing** - Prompts MetaMask at the right time
- ✅ **Automatic X-PAYMENT headers** - No manual header construction
- ✅ **Built-in retry logic** - Handles network errors gracefully
- ✅ **Progress callbacks** - Know exactly what's happening
- ✅ **Works like fetch()** - Familiar API, just with payments!

#### Installation

No installation! Just open the HTML file:

```bash
# Open directly
open examples/x402-browser-upload-with-x402fetch.html

# Or serve locally
python3 -m http.server 8080
# Visit http://localhost:8080/x402-browser-upload-with-x402fetch.html
```

#### How It Works

```javascript
// 🎉 The entire payment flow in one function call!
const response = await window.x402.fetch(`${uploadUrl}/v1/tx`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/octet-stream',
    'Content-Length': fileSize.toString(),
  },
  body: fileBuffer,

  // x402-specific options
  signer: signer,           // Your MetaMask signer
  network: 'base-sepolia',  // Which network to use

  // Optional: Progress callbacks
  onPaymentRequired: (requirements) => {
    console.log('Payment needed:', requirements);
  },
  onPaymentSigning: () => {
    console.log('Please sign in MetaMask...');
  },
  onPaymentSigned: () => {
    console.log('Payment signed!');
  },
});

const data = await response.json();
console.log('Uploaded:', data.id);
```

#### Comparison

**Manual x402 (70+ lines):**
```javascript
// 1. Get price quote
const quote = await axios.get('/v1/x402/price/...');

// 2. Build EIP-712 domain
const domain = { name: 'USD Coin', version: '2', ... };

// 3. Create authorization
const authorization = { from, to, value, validAfter, validBefore, nonce };

// 4. Sign with MetaMask
const signature = await signer.signTypedData(domain, types, authorization);

// 5. Build payment payload
const paymentPayload = { x402Version: 1, scheme: 'eip-3009', ... };

// 6. Encode as base64
const paymentHeader = btoa(JSON.stringify(paymentPayload));

// 7. Upload with header
const response = await axios.post(url, data, {
  headers: { 'X-PAYMENT': paymentHeader }
});
```

**x402fetch (5 lines):**
```javascript
const response = await x402fetch(url, {
  method: 'POST',
  body: data,
  signer: signer
});
```

---

### 4. Browser Example - Manual (`x402-browser-upload.html`)

A web-based interface showing the **manual x402 implementation** (for educational purposes).

#### Installation

No installation required! Just open the HTML file in a browser.

```bash
# Open in default browser
open x402-browser-upload.html

# Or serve with a local server
python3 -m http.server 8080
# Then visit http://localhost:8080/x402-browser-upload.html
```

#### Features

- ✅ MetaMask integration for wallet connection
- ✅ Real-time USDC balance display
- ✅ Network selection (Base, Ethereum testnet/mainnet)
- ✅ File selection with size preview
- ✅ Automatic price quote and payment signing
- ✅ Live log display with color-coded messages
- ✅ Upload receipt with Arweave link
- ✅ Fully client-side (no backend needed)

#### Screenshots

<details>
<summary>Click to view interface screenshots</summary>

**Step 1: Connect Wallet**
- Click "Connect MetaMask"
- Approve connection in MetaMask
- View your address and USDC balance

**Step 2: Select File**
- Click "Choose File"
- Select any file from your computer
- View file name and size

**Step 3: Upload**
- Click "Get Price & Upload"
- Sign the EIP-712 message in MetaMask
- View upload progress in the log
- See receipt with Arweave link

</details>

---

## Network Configuration

### Testnet (Recommended for Testing)

**Base Sepolia**
- Chain ID: `84532`
- USDC Address: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
- RPC: `https://sepolia.base.org`
- Faucet: [Base Sepolia Faucet](https://www.coinbase.com/faucets/base-sepolia-faucet)

**Ethereum Sepolia**
- Chain ID: `11155111`
- USDC Address: `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`
- RPC: `https://sepolia.infura.io/v3/YOUR-PROJECT-ID`
- Faucet: [Sepolia Faucet](https://sepoliafaucet.com/)

### Mainnet (Production)

**Base Mainnet**
- Chain ID: `8453`
- USDC Address: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- RPC: `https://mainnet.base.org`

**Ethereum Mainnet**
- Chain ID: `1`
- USDC Address: `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48`
- RPC: `https://mainnet.infura.io/v3/YOUR-PROJECT-ID`

---

## How It Works

### 1. Price Quote (HTTP 402 Response)

```http
GET /v1/x402/price/1/address?bytes=1024
```

Response (402 Payment Required):
```json
{
  "x402Version": 1,
  "accepts": [
    {
      "scheme": "eip-3009",
      "network": "base-sepolia",
      "maxAmountRequired": "123456",
      "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      "payTo": "0x1234567890123456789012345678901234567890",
      "timeout": { "validBefore": 1735257600000 },
      "extra": { "name": "USDC", "version": "2" }
    }
  ]
}
```

### 2. Create EIP-712 Signature

```javascript
const domain = {
  name: 'USD Coin',
  version: '2',
  chainId: 84532,
  verifyingContract: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
};

const types = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
};

const signature = await signer.signTypedData(domain, types, authorization);
```

### 3. Create x402 Payment Header

```javascript
const paymentPayload = {
  x402Version: 1,
  scheme: 'eip-3009',
  network: 'base-sepolia',
  payload: {
    signature: '0xabcd...',
    authorization: {
      from: '0xuser...',
      to: '0xrecipient...',
      value: '123456',
      validAfter: 1735254000,
      validBefore: 1735257600,
      nonce: '0xrandom...',
    },
  },
};

const paymentHeader = Buffer.from(JSON.stringify(paymentPayload)).toString('base64');
```

### 4. Upload with Payment Header

```http
POST /v1/tx
Content-Type: application/octet-stream
Content-Length: 1024
X-PAYMENT: eyJ4NDAyVmVyc2lvbiI6MSwic2NoZW1lIjoiZXhhY3QiLCAuLi59

[binary file data]
```

### 5. Receive Receipt

```json
{
  "id": "xyz789...",
  "timestamp": 1735257600000,
  "winc": "0",
  "x402Payment": {
    "paymentId": "uuid",
    "txHash": "0xabcd...",
    "network": "base-sepolia",
    "mode": "hybrid"
  }
}
```

---

## Testing

### Get Test USDC

1. **Base Sepolia**: Use [Coinbase Faucet](https://www.coinbase.com/faucets/base-sepolia-faucet)
2. **Ethereum Sepolia**: Bridge from Ethereum Sepolia using [Circle Bridge](https://www.circle.com/en/usdc-multichain/base)

### Verify Transaction

After upload, you can verify the USDC transaction on block explorers:

- **Base Sepolia**: https://sepolia.basescan.org/tx/[txHash]
- **Base Mainnet**: https://basescan.org/tx/[txHash]
- **Ethereum Sepolia**: https://sepolia.etherscan.io/tx/[txHash]
- **Ethereum Mainnet**: https://etherscan.io/tx/[txHash]

---

## Troubleshooting

### "MetaMask not installed"
- Install [MetaMask browser extension](https://metamask.io/)

### "Insufficient USDC balance"
- Get testnet USDC from faucets (see "Get Test USDC" above)
- For mainnet, buy USDC from an exchange

### "Wrong network"
- Switch to the correct network in MetaMask
- For Base Sepolia, you may need to add it manually:
  - Network Name: Base Sepolia
  - RPC URL: https://sepolia.base.org
  - Chain ID: 84532
  - Currency: ETH

### "Payment verification failed"
- Ensure you're on the correct network
- Check that Content-Length header matches actual file size
- Verify USDC contract address is correct for the network

### "Upload rejected - fraud detected"
- This means the declared file size (Content-Length) didn't match actual upload size
- Ensure you're setting Content-Length correctly
- Don't modify the file between getting price quote and uploading

---

## Advanced Usage

### Using as a Library (Node.js)

```javascript
const x402 = require('./x402-upload-example');

// Get price quote
const quote = await x402.getPriceQuote('./file.txt', 1);

// Create payment
const { paymentHeader } = await x402.createX402Payment(quote);

// Upload
const receipt = await x402.uploadWithX402('./file.txt', paymentHeader);

console.log('Uploaded:', receipt.id);
```

### Custom Network Configuration

```javascript
// Add custom network to CONFIG
x402.CONFIG.networks['my-custom-network'] = {
  chainId: 1234,
  usdcAddress: '0x...',
  rpcUrl: 'https://...',
};
```

### Payment Modes

The x402 integration supports three payment modes:

1. **PAYG (Pay-as-you-go)**: Pay exact amount for upload
2. **Top-up**: Add entire payment to balance
3. **Hybrid** (default): Pay for upload + credit excess to balance

To specify mode in Node.js:
```javascript
// Modify the upload request to include mode
const response = await axios.post(url, data, {
  headers: {
    'X-PAYMENT': paymentHeader,
    'X-PAYMENT-MODE': 'topup', // or 'payg' or 'hybrid'
  },
});
```

---

## Security Notes

⚠️ **Never commit private keys to version control!**

- Use environment variables for private keys
- Use `.env` files (and add to `.gitignore`)
- For production, use secure key management (AWS KMS, HashiCorp Vault, etc.)

⚠️ **Always verify transaction details before signing**

- Check the amount in USDC
- Verify the recipient address
- Confirm the network matches your expectation

---

## Resources

- [Coinbase x402 Protocol Spec](https://github.com/coinbase/x402)
- [EIP-3009: Transfer With Authorization](https://eips.ethereum.org/EIPS/eip-3009)
- [EIP-712: Typed Structured Data](https://eips.ethereum.org/EIPS/eip-712)
- [AR.IO Bundler Documentation](../README.md)
- [USDC Documentation](https://www.circle.com/en/usdc)

---

## Support

For issues or questions:
- Open an issue on GitHub
- Check the [implementation documentation](../packages/payment-service/X402_IMPLEMENTATION.md)
- Review test cases in `packages/payment-service/tests/x402.int.test.ts`

---

## License

Copyright (C) 2022-2024 Permanent Data Solutions, Inc. All Rights Reserved.

This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
