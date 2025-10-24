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
import { Queue } from "bullmq";

import { DestinationAddressType } from "../database/dbTypes";
import globalLogger from "../logger";
import { defaultQueueOptions } from "./config";

let pendingTxQueue: Queue | null = null;
let adminCreditQueue: Queue | null = null;

export function getPendingTxQueue(): Queue {
  if (!pendingTxQueue) {
    pendingTxQueue = new Queue("payment-pending-tx", defaultQueueOptions);
  }
  return pendingTxQueue;
}

export function getAdminCreditQueue(): Queue {
  if (!adminCreditQueue) {
    adminCreditQueue = new Queue("payment-admin-credit", defaultQueueOptions);
  }
  return adminCreditQueue;
}

export async function schedulePendingTxCheck(): Promise<void> {
  const queue = getPendingTxQueue();

  await queue.add(
    "check-pending-tx",
    {}, // Empty data - handler will fetch all pending tx from database
    {
      repeat: {
        pattern: "*/60 * * * * *", // Every 60 seconds
      },
      jobId: "pending-tx-cron", // Prevents duplicate cron jobs
    }
  );

  globalLogger.info("Pending TX cron job scheduled");
}

export interface AdminCreditJobData {
  addresses: string[];
  creditAmount: number;
  addressType?: DestinationAddressType;
  giftMessage?: string;
}

export async function enqueueAdminCredit(
  data: AdminCreditJobData
): Promise<string> {
  const queue = getAdminCreditQueue();

  const job = await queue.add("admin-credit", data, {
    priority: 1, // High priority
    attempts: 5, // More retries for admin operations
  });

  globalLogger.info("Admin credit job enqueued", { jobId: job.id });

  return job.id!;
}

// Graceful shutdown
export async function closeQueues(): Promise<void> {
  const queues = [pendingTxQueue, adminCreditQueue].filter((q) => q !== null);

  await Promise.all(queues.map((q) => q!.close()));

  globalLogger.info("All queues closed");
}
