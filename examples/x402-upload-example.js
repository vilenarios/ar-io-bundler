/**
 * Example: Upload a file to AR.IO Bundler using Coinbase x402 payment protocol
 *
 * This example demonstrates how to:
 * 1. Get a price quote for an upload
 * 2. Create an EIP-3009 USDC transfer authorization
 * 3. Sign it with EIP-712
 * 4. Upload a file with x402 payment
 *
 * Requirements:
 * - Node.js v18+
 * - ethers v6
 * - axios
 * - arweave
 *
 * Install: npm install ethers@6 axios arweave
 */

const { ethers } = require('ethers');
const axios = require('axios');
const Arweave = require('arweave');
const fs = require('fs');

// Configuration
const CONFIG = {
  // Upload service URL
  uploadServiceUrl: process.env.UPLOAD_SERVICE_URL || 'http://localhost:3000',

  // Payment service URL
  paymentServiceUrl: process.env.PAYMENT_SERVICE_URL || 'http://localhost:4000',

  // Network configuration (Base Sepolia testnet for testing)
  network: 'base-sepolia',
  chainId: 84532,

  // USDC contract address on Base Sepolia
  usdcAddress: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',

  // Your Ethereum wallet private key (NEVER commit this!)
  privateKey: process.env.ETH_PRIVATE_KEY || 'YOUR_PRIVATE_KEY_HERE',

  // RPC URL for Base Sepolia
  rpcUrl: process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org',
};

// EIP-712 Domain for USDC transferWithAuthorization
const EIP712_DOMAIN = {
  name: 'USD Coin',
  version: '2',
  chainId: CONFIG.chainId,
  verifyingContract: CONFIG.usdcAddress,
};

// EIP-712 Types for transferWithAuthorization
const EIP712_TYPES = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
};

/**
 * Step 1: Get price quote from payment service
 */
async function getPriceQuote(filePath, signatureType = 1) {
  const fileSize = fs.statSync(filePath).size;

  // For demo, using a placeholder address - in production, derive from your Arweave key
  const arweaveAddress = 'YOUR_ARWEAVE_ADDRESS_HERE';

  console.log(`📊 Getting price quote for ${fileSize} bytes...`);

  try {
    const response = await axios.get(
      `${CONFIG.paymentServiceUrl}/v1/x402/price/${signatureType}/${arweaveAddress}`,
      {
        params: { bytes: fileSize },
        validateStatus: (status) => status === 402, // x402 returns 402
      }
    );

    console.log('✅ Price quote received');
    console.log(`   Networks available: ${response.data.accepts.map(a => a.network).join(', ')}`);

    return response.data;
  } catch (error) {
    console.error('❌ Failed to get price quote:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Step 2: Create and sign x402 payment authorization
 */
async function createX402Payment(priceQuote) {
  // Find the payment requirements for our configured network
  const requirements = priceQuote.accepts.find(a => a.network === CONFIG.network);

  if (!requirements) {
    throw new Error(`Network ${CONFIG.network} not available. Available: ${priceQuote.accepts.map(a => a.network).join(', ')}`);
  }

  console.log(`💰 Creating payment authorization for ${requirements.network}...`);
  console.log(`   Amount required: ${ethers.formatUnits(requirements.maxAmountRequired, 6)} USDC`);
  console.log(`   Recipient: ${requirements.payTo}`);

  // Create wallet from private key
  const wallet = new ethers.Wallet(CONFIG.privateKey);

  // Create authorization parameters
  const validAfter = Math.floor(Date.now() / 1000) - 3600; // Valid from 1 hour ago
  const validBefore = Math.floor(Date.now() / 1000) + 3600; // Valid for 1 hour
  const nonce = ethers.hexlify(ethers.randomBytes(32));

  const authorization = {
    from: wallet.address,
    to: requirements.payTo,
    value: requirements.maxAmountRequired,
    validAfter,
    validBefore,
    nonce,
  };

  // Sign with EIP-712
  console.log('✍️  Signing authorization with EIP-712...');

  const signature = await wallet.signTypedData(
    EIP712_DOMAIN,
    EIP712_TYPES,
    authorization
  );

  // Create x402 payment payload
  const paymentPayload = {
    x402Version: 1,
    scheme: 'eip-3009',
    network: CONFIG.network,
    payload: {
      signature,
      authorization,
    },
  };

  // Encode as base64
  const paymentHeader = Buffer.from(JSON.stringify(paymentPayload)).toString('base64');

  console.log('✅ Payment authorization created and signed');

  return {
    paymentHeader,
    authorization,
    requirements,
  };
}

/**
 * Step 3: Upload file with x402 payment
 */
async function uploadWithX402(filePath, paymentHeader) {
  const fileBuffer = fs.readFileSync(filePath);
  const fileSize = fileBuffer.length;

  console.log(`📤 Uploading file (${fileSize} bytes) with x402 payment...`);

  try {
    const response = await axios.post(
      `${CONFIG.uploadServiceUrl}/v1/tx`,
      fileBuffer,
      {
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Length': fileSize.toString(),
          'X-PAYMENT': paymentHeader,
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      }
    );

    console.log('✅ Upload successful!');
    console.log('   Receipt:', JSON.stringify(response.data, null, 2));

    return response.data;
  } catch (error) {
    console.error('❌ Upload failed:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Alternative: Upload with Arweave signed data item
 */
async function uploadDataItemWithX402(filePath, arweaveJWK, paymentHeader) {
  const arweave = Arweave.init({});
  const data = fs.readFileSync(filePath);

  // Create and sign data item
  const DataItem = require('arbundles').DataItem;
  const dataItem = new DataItem(data);
  await dataItem.sign(arweaveJWK);

  const dataItemBuffer = dataItem.getRaw();

  console.log(`📤 Uploading Arweave data item (${dataItemBuffer.length} bytes) with x402 payment...`);

  try {
    const response = await axios.post(
      `${CONFIG.uploadServiceUrl}/v1/tx`,
      dataItemBuffer,
      {
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Length': dataItemBuffer.length.toString(),
          'X-PAYMENT': paymentHeader,
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      }
    );

    console.log('✅ Upload successful!');
    console.log('   Data Item ID:', response.data.id);
    console.log('   x402 Payment:', response.data.x402Payment);

    return response.data;
  } catch (error) {
    console.error('❌ Upload failed:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Helper: Check if you have USDC balance
 */
async function checkUSDCBalance() {
  const provider = new ethers.JsonRpcProvider(CONFIG.rpcUrl);
  const wallet = new ethers.Wallet(CONFIG.privateKey, provider);

  const usdcContract = new ethers.Contract(
    CONFIG.usdcAddress,
    ['function balanceOf(address) view returns (uint256)'],
    provider
  );

  const balance = await usdcContract.balanceOf(wallet.address);
  const balanceFormatted = ethers.formatUnits(balance, 6);

  console.log(`💵 USDC Balance: ${balanceFormatted} USDC`);

  return balance;
}

/**
 * Main execution
 */
async function main() {
  const filePath = process.argv[2];

  if (!filePath) {
    console.error('Usage: node x402-upload-example.js <file-path>');
    console.error('Example: node x402-upload-example.js ./my-file.txt');
    process.exit(1);
  }

  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  console.log('🚀 AR.IO x402 Upload Example\n');

  try {
    // Check USDC balance
    await checkUSDCBalance();

    // Step 1: Get price quote
    const priceQuote = await getPriceQuote(filePath);

    // Step 2: Create and sign payment
    const { paymentHeader } = await createX402Payment(priceQuote);

    // Step 3: Upload file
    const receipt = await uploadWithX402(filePath, paymentHeader);

    console.log('\n✨ Success! Your file has been uploaded and paid for with USDC.');
    console.log(`   View on Arweave: https://arweave.net/${receipt.id}`);

  } catch (error) {
    console.error('\n💥 Error:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

// Export for use as library
module.exports = {
  getPriceQuote,
  createX402Payment,
  uploadWithX402,
  uploadDataItemWithX402,
  checkUSDCBalance,
  CONFIG,
};
