/**
 * Bull Board Monitoring Dashboard
 *
 * Monitors ALL BullMQ queues for both payment and upload services
 *
 * Run with: node bull-board-server.js
 * Access at: http://localhost:3002/admin/queues
 */
const { createBullBoard } = require("@bull-board/api");
const { BullMQAdapter } = require("@bull-board/api/bullMQAdapter");
const { KoaAdapter } = require("@bull-board/koa");
const { Queue } = require("bullmq");
const Koa = require("koa");
const mount = require("koa-mount");

const { jobLabels } = require("./lib/constants");
const { getQueue } = require("./lib/arch/queues/config");

const app = new Koa();

const serverAdapter = new KoaAdapter();
serverAdapter.setBasePath("/admin/queues");

// Upload service queues (11 queues)
const uploadQueues = [
  jobLabels.planBundle,
  jobLabels.prepareBundle,
  jobLabels.postBundle,
  jobLabels.seedBundle,
  jobLabels.verifyBundle,
  jobLabels.putOffsets,
  jobLabels.newDataItem,
  jobLabels.opticalPost,
  jobLabels.unbundleBdi,
  jobLabels.finalizeUpload,
  jobLabels.cleanupFs,
].map((label) => new BullMQAdapter(getQueue(label)));

// Payment service queues (2 queues) - using same Redis connection
const paymentRedisConfig = {
  host: process.env.REDIS_QUEUE_HOST || "localhost",
  port: parseInt(process.env.REDIS_QUEUE_PORT || "6381"),
  maxRetriesPerRequest: null,
};

const paymentQueues = [
  new BullMQAdapter(new Queue("payment-pending-tx", { connection: paymentRedisConfig })),
  new BullMQAdapter(new Queue("payment-admin-credit", { connection: paymentRedisConfig })),
];

// Combine all queues
const queues = [...uploadQueues, ...paymentQueues];

createBullBoard({
  queues,
  serverAdapter,
});

app.use(mount(serverAdapter.registerPlugin()));

const PORT = process.env.BULL_BOARD_PORT || 3002;

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║          Bull Board Monitoring Dashboard                  ║
╠═══════════════════════════════════════════════════════════╣
║                                                           ║
║  📊 Dashboard URL: http://localhost:${PORT}/admin/queues      ║
║                                                           ║
║  Monitoring ${queues.length} BullMQ queues:                         ║
║                                                           ║
║  📦 Upload Service (11 queues):                           ║
║  • plan-bundle        • prepare-bundle                    ║
║  • post-bundle        • seed-bundle                       ║
║  • verify-bundle      • put-offsets                       ║
║  • new-data-item      • optical-post                      ║
║  • unbundle-bdi       • finalize-upload                   ║
║  • cleanup-fs                                             ║
║                                                           ║
║  💳 Payment Service (2 queues):                           ║
║  • payment-pending-tx                                     ║
║  • payment-admin-credit                                   ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
  `);
});
