/**
 * Bull Board Monitoring Dashboard
 *
 * Run with: node bull-board-server.js
 * Access at: http://localhost:3002/admin/queues
 */
const { createBullBoard } = require("@bull-board/api");
const { BullMQAdapter } = require("@bull-board/api/bullMQAdapter");
const { KoaAdapter } = require("@bull-board/koa");
const Koa = require("koa");
const mount = require("koa-mount");

const { jobLabels } = require("./lib/constants");
const { getQueue } = require("./lib/arch/queues/config");

const app = new Koa();

const serverAdapter = new KoaAdapter();
serverAdapter.setBasePath("/admin/queues");

const queues = [
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
║  • plan-bundle        • prepare-bundle                    ║
║  • post-bundle        • seed-bundle                       ║
║  • verify-bundle      • put-offsets                       ║
║  • new-data-item      • optical-post                      ║
║  • unbundle-bdi       • finalize-upload                   ║
║  • cleanup-fs                                             ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
  `);
});
