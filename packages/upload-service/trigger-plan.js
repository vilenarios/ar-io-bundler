#!/usr/bin/env node
/**
 * Cron script to trigger bundle planning
 * Run this periodically to process queued data items
 */

require('dotenv').config();
const { enqueue } = require('./lib/arch/queues');
const { jobLabels } = require('./lib/constants');

(async () => {
  try {
    await enqueue(jobLabels.planBundle, { planId: `cron-${Date.now()}` });
    console.log(`[${new Date().toISOString()}] ✅ Plan job enqueued`);
    setTimeout(() => process.exit(0), 1000);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] ❌ Error:`, error.message);
    process.exit(1);
  }
})();
