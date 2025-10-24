/**
 * Quick test script to enqueue an admin credit job
 * Run with: node test-admin-credit.js
 */

const { Queue } = require('bullmq');

const queue = new Queue('payment-admin-credit', {
  connection: {
    host: 'localhost',
    port: 6380,
  }
});

async function testAdminCredit() {
  console.log('Enqueueing test admin credit job...');

  const job = await queue.add('admin-credit', {
    addresses: ['test-address-12345'],  // Fake address for testing
    creditAmount: 1000,                  // 1000 winc
    addressType: 'arweave',
    giftMessage: 'Test credit from BullMQ'
  });

  console.log(`✅ Job enqueued successfully!`);
  console.log(`Job ID: ${job.id}`);
  console.log(`\nWatch it process at: http://192.168.2.253:3002/`);
  console.log(`Or check logs: pm2 logs payment-service-workers`);

  // Wait a moment for job to be picked up
  console.log('\nWaiting for job to process...');

  try {
    await job.waitUntilFinished(queue.events, 30000); // 30 sec timeout
    console.log('✅ Job completed successfully!');
  } catch (error) {
    console.log('⚠️  Job failed or timed out - check Bull Board for details');
    console.error(error.message);
  }

  await queue.close();
  process.exit(0);
}

testAdminCredit().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});
