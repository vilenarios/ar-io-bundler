#!/usr/bin/env node
/**
 * Cron script to trigger filesystem cleanup
 * Run this periodically to clean up old backup files
 */

require('dotenv').config();
const { enqueue } = require('./lib/arch/queues');
const { jobLabels } = require('./lib/constants');

(async () => {
  try {
    await enqueue(jobLabels.cleanupFs, {});
    console.log(`[${new Date().toISOString()}] ✅ Cleanup job enqueued`);
    setTimeout(() => process.exit(0), 1000);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] ❌ Error:`, error.message);
    process.exit(1);
  }
})();
