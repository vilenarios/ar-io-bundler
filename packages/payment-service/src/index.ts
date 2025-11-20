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
// Load .env file from repository root BEFORE importing anything else that uses process.env
import { config } from "dotenv";
import * as path from "path";
config({ path: path.join(__dirname, "../../../.env") });

import globalLogger from "./logger";
import { createServer } from "./server";

// Here is our server 🙌
createServer({}).catch((e) => {
  globalLogger.error(`Exiting with error: ${e}`);
  process.exit(1);
});
