/**
 * Example: Upload a file to AR.IO Bundler using Coinbase x402 payment protocol
 *
 * This example demonstrates the programmatic x402 payment flow:
 * 1. Get a price quote for an upload (200 OK with payment requirements)
 * 2. Create an EIP-3009 USDC transfer authorization
 * 3. Sign it with EIP-712
 * 4. Upload a file with x402 payment (X-PAYMENT header)
 *
 * Alternative: Browser Paywall
 * If you prefer a visual interface to buy USDC and authorize payment:
 * 1. Open the price quote URL in your browser (see --help for URL format)
 * 2. Connect MetaMask wallet
 * 3. Use Coinbase Onramp to buy USDC if needed
 * 4. Authorize payment with one click
 *
 * Requirements:
 * - Node.js v18+
 * - ethers v6
 * - axios
 * - arweave
 * - USDC on Base (mainnet or Sepolia testnet)
 * - Ethereum wallet with Base network configured
 *
 * Install: npm install ethers@6 axios arweave
 *
 * Usage:
 *   export ETH_PRIVATE_KEY=your_private_key
 *   export X402_NETWORK=base-mainnet  # or base-sepolia for testing
 *   node x402-upload-example.js ./my-file.txt
 */

const { ethers } = require('ethers');
const axios = require('axios');
const Arweave = require('arweave');
const fs = require('fs');

// Configuration
const CONFIG = {
  // Upload service URL
  uploadServiceUrl: process.env.UPLOAD_SERVICE_URL || 'http://localhost:3001',

  // Payment service URL
  paymentServiceUrl: process.env.PAYMENT_SERVICE_URL || 'http://localhost:4001',

  // Network configuration
  // Use 'base-mainnet' for production (requires real USDC)
  // Use 'base-sepolia' for testing (testnet USDC)
  network: process.env.X402_NETWORK || 'base-mainnet',
  chainId: process.env.X402_NETWORK === 'base-sepolia' ? 84532 : 8453,

  // USDC contract address (auto-selected based on network)
  usdcAddress: process.env.X402_NETWORK === 'base-sepolia'
    ? '0x036CbD53842c5426634e7929541eC2318f3dCF7e'  // Base Sepolia testnet
    : '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // Base mainnet

  // Your Ethereum wallet private key (NEVER commit this!)
  privateKey: process.env.ETH_PRIVATE_KEY || 'YOUR_PRIVATE_KEY_HERE',

  // RPC URL (auto-selected based on network)
  rpcUrl: process.env.BASE_RPC_URL || (
    process.env.X402_NETWORK === 'base-sepolia'
      ? 'https://sepolia.base.org'
      : 'https://mainnet.base.org'
  ),
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
 *
 * Per x402 standard: Price quote endpoints return 200 OK with payment requirements.
 * The 402 response only happens when you actually try to upload without payment.
 */
async function getPriceQuote(filePath, userAddress, signatureType = 3) {
  const fileSize = fs.statSync(filePath).size;

  console.log(`📊 Getting price quote for ${fileSize} bytes...`);
  console.log(`   User address: ${userAddress}`);

  try {
    const response = await axios.get(
      `${CONFIG.paymentServiceUrl}/v1/x402/price/${signatureType}/${userAddress}`,
      {
        params: { bytes: fileSize },
        validateStatus: (status) => status === 200, // Price quotes return 200 OK
      }
    );

    console.log('✅ Price quote received');
    console.log(`   Networks available: ${response.data.accepts.map(a => a.network).join(', ')}`);

    // Show pricing for each network
    response.data.accepts.forEach(req => {
      const usdcAmount = ethers.formatUnits(req.maxAmountRequired, 6);
      console.log(`   ${req.network}: ${usdcAmount} USDC`);
    });

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

  // Create x402 payment payload per standard
  const paymentPayload = {
    scheme: requirements.scheme,
    network: requirements.network,
    authorization: {
      from: authorization.from,
      to: authorization.to,
      value: authorization.value.toString(),
      validAfter: authorization.validAfter.toString(),
      validBefore: authorization.validBefore.toString(),
      nonce: authorization.nonce,
      signature: signature,
    },
    asset: requirements.asset,
  };

  // Encode as base64 for X-PAYMENT header
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
    console.error('\nEnvironment Variables:');
    console.error('  ETH_PRIVATE_KEY      - Your Ethereum private key (required)');
    console.error('  X402_NETWORK         - Network: base-mainnet or base-sepolia (default: base-mainnet)');
    console.error('  UPLOAD_SERVICE_URL   - Upload service URL (default: http://localhost:3001)');
    console.error('  PAYMENT_SERVICE_URL  - Payment service URL (default: http://localhost:4001)');
    process.exit(1);
  }

  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  if (CONFIG.privateKey === 'YOUR_PRIVATE_KEY_HERE') {
    console.error('❌ Error: ETH_PRIVATE_KEY environment variable not set');
    console.error('   Set it with: export ETH_PRIVATE_KEY=your_private_key');
    process.exit(1);
  }

  console.log('🚀 AR.IO Bundler x402 Upload Example');
  console.log(`   Network: ${CONFIG.network}`);
  console.log(`   Chain ID: ${CONFIG.chainId}`);
  console.log(`   USDC Contract: ${CONFIG.usdcAddress}\n`);

  try {
    // Get wallet address
    const wallet = new ethers.Wallet(CONFIG.privateKey);
    console.log(`🔑 Wallet: ${wallet.address}\n`);

    // Check USDC balance
    const balance = await checkUSDCBalance();
    console.log();

    // Step 1: Get price quote (returns 200 OK per x402 standard)
    const priceQuote = await getPriceQuote(filePath, wallet.address);
    console.log();

    // Step 2: Create and sign payment authorization (EIP-712 + EIP-3009)
    const { paymentHeader, requirements } = await createX402Payment(priceQuote);
    console.log();

    // Check if we have enough USDC
    const requiredAmount = BigInt(requirements.maxAmountRequired);
    if (balance < requiredAmount) {
      const shortfall = ethers.formatUnits(requiredAmount - balance, 6);
      console.error(`❌ Insufficient USDC balance. Need ${shortfall} more USDC.`);
      console.error(`\n💡 Tip: You can use the browser paywall to buy USDC:`);
      console.error(`   Open: ${CONFIG.paymentServiceUrl}/v1/x402/price/3/${wallet.address}?bytes=${fs.statSync(filePath).size}`);
      console.error(`   in your browser and click "Don't have USDC? Buy some first"`);
      process.exit(1);
    }

    // Step 3: Upload file with x402 payment
    // If upload fails with 402, it means the payment wasn't accepted
    const receipt = await uploadWithX402(filePath, paymentHeader);

    console.log('\n✨ Success! Your file has been uploaded and paid for with USDC.');
    console.log(`   Data Item ID: ${receipt.id}`);
    console.log(`   View on Arweave: https://arweave.net/${receipt.id}`);

    if (receipt.x402Payment) {
      console.log(`\n💰 Payment Details:`);
      console.log(`   Payment ID: ${receipt.x402Payment.paymentId}`);
      console.log(`   Network: ${receipt.x402Payment.network}`);
      console.log(`   Mode: ${receipt.x402Payment.mode}`);
    }

  } catch (error) {
    console.error('\n💥 Error:', error.message);
    if (error.response?.status === 402) {
      console.error('\n📝 Note: Received 402 Payment Required. This means:');
      console.error('   - Your payment authorization was not accepted');
      console.error('   - You may need to approve USDC spending first');
      console.error('   - Or check that you have sufficient USDC balance');
    }
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
