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
import { ConnectionOptions, QueueOptions } from "bullmq";

export function createRedisConnection(): ConnectionOptions {
  return {
    host: process.env.REDIS_QUEUE_HOST || "localhost",
    port: parseInt(process.env.REDIS_QUEUE_PORT || "6380"),
    maxRetriesPerRequest: null, // Required for BullMQ
    retryStrategy: (times: number) => {
      // Exponential backoff: 50ms, 100ms, 200ms, 400ms, ... max 2s
      return Math.min(times * 50, 2000);
    },
  };
}

export const defaultQueueOptions: QueueOptions = {
  connection: createRedisConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5000, // 5s, 25s, 125s
    },
    removeOnComplete: {
      age: 604800, // Keep completed jobs for 7 days
      count: 1000,
    },
    removeOnFail: {
      age: 1209600, // Keep failed jobs for 14 days
    },
  },
};
