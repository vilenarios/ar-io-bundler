/**
 * Copyright (C) 2022-2024 Permanent Data Solutions, Inc. All Rights Reserved.
 *
 * Bull Board Monitoring Dashboard
 *
 * Run with: yarn ts-node bull-board-server.ts
 * Access at: http://localhost:3001/admin/queues
 */
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { KoaAdapter } from "@bull-board/koa";
import Koa from "koa";
import mount from "koa-mount";

import { jobLabels } from "./src/constants";
import { getQueue } from "./src/arch/queues/config";

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

app.use(mount(serverAdapter.getRouter()));

const PORT = process.env.BULL_BOARD_PORT || 3002; // Changed from 3001 to avoid conflict with Upload API

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
