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
import { X402NetworkConfig, x402Networks } from "../arch/x402Service";

/**
 * Parse a token string into currency, network, and network config
 *
 * Token format: {currency}-{network}
 * Examples: "usdc-base", "usdc-base-sepolia", "sol-mainnet" (future)
 *
 * @param token - Token string to parse (e.g., "usdc-base")
 * @returns Parsed token info or null if invalid
 */
export function parseToken(token: string): {
  currency: string;
  network: string;
  networkConfig: X402NetworkConfig;
} | null {
  // Validate input
  if (!token || typeof token !== "string" || token.trim().length === 0) {
    return null;
  }

  const [currency, ...networkParts] = token.split("-");
  const network = networkParts.join("-");

  // Validate currency and network are non-empty
  if (!currency || currency.trim().length === 0) {
    return null;
  }

  if (!network || network.trim().length === 0) {
    return null;
  }

  // Only support USDC on x402 networks for now
  if (currency !== "usdc") {
    return null; // Future: support "sol", "ar", etc.
  }

  const networkConfig = x402Networks[network];
  if (!networkConfig || !networkConfig.enabled) {
    return null;
  }

  return { currency, network, networkConfig };
}

/**
 * Get list of valid tokens for error messages
 */
export function getValidTokens(): string[] {
  return Object.keys(x402Networks)
    .filter((network) => x402Networks[network].enabled)
    .map((network) => `usdc-${network}`); // Future: add other currencies
}
