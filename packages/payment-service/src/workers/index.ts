/**
 * Copyright (C) 2022-2024 Permanent Data Solutions, Inc. All Rights Reserved.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */
import globalLogger from "../logger";
import { loadSecretsToEnv } from "../utils/loadSecretsToEnv";
import { schedulePendingTxCheck } from "../queues/producers";
import { createAdminCreditWorker } from "./adminCreditTool.worker";
import { createPendingTxWorker } from "./creditPendingTx.worker";

async function main() {
  globalLogger.info("Starting payment service workers");

  // Load secrets from environment (AWS Secrets Manager, etc.)
  await loadSecretsToEnv();

  // Create workers
  const workers = [createAdminCreditWorker(), createPendingTxWorker()];

  globalLogger.info(`Started ${workers.length} workers`);

  // Schedule the recurring pending TX check job
  await schedulePendingTxCheck();

  // Graceful shutdown
  const shutdown = async () => {
    globalLogger.info("Shutting down workers gracefully");

    await Promise.all(workers.map((worker) => worker.close()));

    globalLogger.info("All workers closed");
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((error) => {
  globalLogger.error("Failed to start workers", { error });
  process.exit(1);
});
