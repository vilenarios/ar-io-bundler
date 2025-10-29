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
import { Tag } from "@dha-team/arbundles";
import { SignatureConfig } from "../types/types";

/**
 * Checks if a buffer contains a valid ANS-104 data item
 * ANS-104 data items start with a 2-byte little-endian signature type
 */
export function isANS104DataItem(buffer: Buffer): boolean {
  if (buffer.length < 2) {
    return false;
  }

  // Read signature type as 16-bit little-endian
  const signatureType = buffer.readUInt16LE(0);

  // Valid ANS-104 signature types (from SignatureConfig enum)
  const validSignatureTypes = [
    SignatureConfig.ARWEAVE,        // 1
    SignatureConfig.ED25519,        // 2
    SignatureConfig.ETHEREUM,       // 3
    SignatureConfig.SOLANA,         // 4
    SignatureConfig.INJECTEDAPTOS,  // 5
    SignatureConfig.MULTIAPTOS,     // 6
    SignatureConfig.TYPEDETHEREUM,  // 7
    SignatureConfig.KYVE,           // 8
  ];

  return validSignatureTypes.includes(signatureType);
}

/**
 * Extract tags from HTTP headers with X-Tag-* prefix
 * Example: X-Tag-App-Name: MyApp -> { name: "App-Name", value: "MyApp" }
 */
export function extractTagsFromHeaders(headers: Record<string, string | string[] | undefined>): Tag[] {
  const tags: Tag[] = [];

  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase();

    if (lowerKey.startsWith("x-tag-")) {
      const tagName = key.substring(6); // Remove 'x-tag-' prefix
      const tagValue = Array.isArray(value) ? value[0] : value;

      if (tagValue) {
        tags.push({ name: tagName, value: tagValue });
      }
    }
  }

  return tags;
}

/**
 * Parse raw data request body and headers
 * Supports both:
 * 1. Binary upload with X-Tag-* headers
 * 2. JSON envelope with data and tags
 */
export interface ParsedRawDataRequest {
  data: Buffer;
  tags: Tag[];
  contentType?: string;
}

export function parseRawDataRequest(
  rawBody: Buffer,
  contentType?: string,
  headers?: Record<string, string | string[] | undefined>
): ParsedRawDataRequest {
  // Try JSON envelope format first
  if (contentType?.includes("application/json")) {
    try {
      const json = JSON.parse(rawBody.toString("utf8"));

      if (json.data) {
        // JSON envelope format: { data: "base64...", tags: [...] }
        return {
          data: Buffer.from(json.data, "base64"),
          tags: json.tags || [],
          contentType: json.contentType,
        };
      }
    } catch (error) {
      // Not valid JSON or doesn't have expected structure
      // Fall through to binary handling
    }
  }

  // Binary upload with X-Tag-* headers
  return {
    data: rawBody,
    tags: headers ? extractTagsFromHeaders(headers) : [],
    contentType: contentType && contentType !== "application/octet-stream" ? contentType : undefined,
  };
}

/**
 * Validate that raw data meets requirements
 */
export function validateRawData(data: Buffer, maxSize: number): { valid: boolean; error?: string } {
  if (data.length === 0) {
    return { valid: false, error: "Data cannot be empty" };
  }

  if (data.length > maxSize) {
    return { valid: false, error: `Data size ${data.length} exceeds maximum of ${maxSize} bytes` };
  }

  return { valid: true };
}
