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
import { DataItem } from "@dha-team/arbundles";
import { Readable } from "stream";

import { enqueue } from "../arch/queues";
import { InMemoryDataItem } from "../bundles/streamingDataItem";
import { dataCaches, fastFinalityIndexes, jobLabels } from "../constants";
import { KoaContext } from "../server";
import { W } from "../types/winston";
import { fromB64Url, jwkToPublicArweaveAddress } from "../utils/base64";
import { errorResponse } from "../utils/common";
import { createDataItemFromRaw } from "../utils/createDataItem";
import { putDataItemRaw } from "../utils/objectStoreUtils";
import {
  encodeTagsForOptical,
  signDataItemHeader,
} from "../utils/opticalUtils";
import { parseRawDataRequest, validateRawData } from "../utils/rawDataUtils";
import { signReceipt } from "../utils/signReceipt";

const rawDataUploadsEnabled = process.env.RAW_DATA_UPLOADS_ENABLED === "true";
const opticalBridgingEnabled = process.env.OPTICAL_BRIDGING_ENABLED !== "false";

/**
 * Handle raw data upload with x402 payment
 * This is a simpler flow for AI agents that don't want to create ANS-104 data items
 */
export async function handleRawDataUpload(ctx: KoaContext, rawBody: Buffer): Promise<void> {
  const { logger } = ctx.state;

  // Check if raw data uploads are enabled
  if (!rawDataUploadsEnabled) {
    return errorResponse(ctx, {
      errorMessage: "Raw data uploads are not enabled on this bundler",
      status: 403,
    });
  }

  logger.info("Processing raw data upload request");

  // Parse the request (supports both binary + headers and JSON envelope)
  const contentType = ctx.req.headers?.["content-type"];
  const parsedRequest = parseRawDataRequest(rawBody, contentType, ctx.req.headers);

  // Validate raw data
  const maxSize = 10 * 1024 * 1024 * 1024; // 10 GB
  const validation = validateRawData(parsedRequest.data, maxSize);
  if (!validation.valid) {
    return errorResponse(ctx, {
      errorMessage: validation.error || "Invalid data",
      status: 400,
    });
  }

  // Extract payer address from x402 payment header if provided
  let payerAddress: string | undefined;
  const paymentHeaderValue = ctx.headers["x-payment"] as string | undefined;
  if (paymentHeaderValue) {
    try {
      const paymentPayload = JSON.parse(Buffer.from(paymentHeaderValue, "base64").toString("utf8"));
      payerAddress = paymentPayload.payload?.authorization?.from;
    } catch (error) {
      logger.warn("Failed to parse payment header for payer address", { error });
    }
  }

  // Create the data item server-side using the RAW DATA ITEM WALLET
  // This wallet is whitelisted and doesn't require credits
  let dataItem: DataItem;
  let rawDataItemWallet;
  try {
    rawDataItemWallet = await ctx.state.getRawDataItemWallet();
    dataItem = await createDataItemFromRaw(
      {
        data: parsedRequest.data,
        tags: parsedRequest.tags,
        contentType: parsedRequest.contentType,
        payerAddress, // Track who actually paid for this upload
      },
      rawDataItemWallet
    );

    logger.info("Created and signed data item with raw data item wallet", {
      dataItemId: dataItem.id,
      size: dataItem.getRaw().length,
      payerAddress,
    });
  } catch (error) {
    logger.error("Failed to create data item", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return errorResponse(ctx, {
      errorMessage: "Failed to create data item from raw data",
      status: 500,
    });
  }

  const dataItemBuffer = dataItem.getRaw();
  const byteCount = dataItemBuffer.length;

  // Parse the signed data item to extract signature and payload information
  const inMemoryDataItem = new InMemoryDataItem(dataItemBuffer);

  const signatureB64Url = await inMemoryDataItem.getSignature();
  const signature = fromB64Url(signatureB64Url); // Convert to Buffer for database
  const target = await inMemoryDataItem.getTarget();
  const anchor = await inMemoryDataItem.getAnchor();
  const numTagsBytes = await inMemoryDataItem.getNumTagsBytes();

  // Calculate payload data start based on ANS-104 structure
  // Structure: signatureType(2) + signature(512) + owner(512) + target(1/33) + anchor(1/33) + tags
  const signatureTypeLength = 2;
  const signatureLength = 512; // Arweave signature
  const ownerLength = 512; // Arweave public key
  const targetLength = target ? 33 : 1;
  const anchorLength = anchor ? 33 : 1;

  const payloadDataStart =
    signatureTypeLength +
    signatureLength +
    ownerLength +
    targetLength +
    anchorLength +
    16 + // tags count (8 bytes) + tags bytes length (8 bytes)
    numTagsBytes;

  const payloadContentType = parsedRequest.contentType || "application/octet-stream";

  // Check for x402 payment header
  const contentLengthHeader = ctx.headers["content-length"];

  if (!paymentHeaderValue) {
    // No payment provided - return 402 Payment Required
    return send402PaymentRequired(ctx, byteCount, parsedRequest.contentType);
  }

  if (!contentLengthHeader) {
    return errorResponse(ctx, {
      errorMessage: "Content-Length header is required when providing payment",
      status: 400,
    });
  }

  logger.info("Verifying x402 payment", {
    dataItemId: dataItem.id,
    byteCount,
    payerAddress,
  });

  // Verify and settle x402 payment
  // Note: Payment is verified against the PAYER's address (who provided the payment)
  // NOT the raw data item wallet (which is just the signer and is whitelisted)
  let paymentResult;
  try {
    if (!payerAddress) {
      throw new Error("Payer address not found in payment header");
    }

    paymentResult = await ctx.state.paymentService.verifyAndSettleX402Payment({
      paymentHeader: paymentHeaderValue,
      dataItemId: dataItem.id,
      byteCount,
      nativeAddress: payerAddress, // Use the payer's address, not the signer's
      signatureType: 3, // Ethereum signature type (payer signs with their Ethereum wallet)
      mode: "hybrid", // Default to hybrid mode
    });

    if (!paymentResult.success) {
      throw new Error(paymentResult.error || "Payment verification failed");
    }

    logger.info("X402 payment verified and settled", {
      paymentId: paymentResult.paymentId,
      txHash: paymentResult.txHash,
      mode: paymentResult.mode,
    });
  } catch (error) {
    logger.error("X402 payment verification failed", { error });
    return errorResponse(ctx, {
      errorMessage: error instanceof Error ? error.message : "Payment verification failed",
      status: 402,
    });
  }

  // Store the data item (same flow as signed uploads)
  try {
    // Store to object store with proper prefix for AR.IO gateway access
    const dataStream = Readable.from(dataItemBuffer);
    await putDataItemRaw(
      ctx.state.objectStore,
      dataItem.id,
      dataStream,
      payloadContentType,
      payloadDataStart
    );

    // Get assessed winston price (either paid or reserved)
    const assessedWinstonPrice = paymentResult.wincPaid || paymentResult.wincReserved || W("0");

    // Owner is the raw data item wallet (whitelisted, no credits required)
    const ownerPublicAddress = jwkToPublicArweaveAddress(rawDataItemWallet);

    // Insert into database
    await ctx.state.database.insertNewDataItem({
      dataItemId: dataItem.id,
      ownerPublicAddress, // Raw data item wallet address (whitelisted)
      byteCount,
      assessedWinstonPrice,
      payloadDataStart,
      payloadContentType,
      uploadedDate: new Date().toISOString(),
      signatureType: 1, // Arweave signature type (data item is signed with Arweave wallet)
      deadlineHeight: await ctx.state.arweaveGateway.getCurrentBlockHeight() + 50,
      failedBundles: [],
      premiumFeatureType: "default",
      signature,
    });

    // Enqueue for bundling
    await enqueue(jobLabels.newDataItem, {
      dataItemId: dataItem.id,
      byteCount,
      ownerPublicAddress, // Raw data item wallet address (whitelisted)
      assessedWinstonPrice,
      payloadDataStart,
      payloadContentType,
      uploadedDate: new Date().toISOString(),
      signatureType: 1, // Arweave signature type (data item is signed with Arweave wallet)
      deadlineHeight: await ctx.state.arweaveGateway.getCurrentBlockHeight() + 50,
      failedBundles: [],
      premiumFeatureType: "default",
      signature: signatureB64Url, // Queue expects string
    });

    logger.info("Data item stored and enqueued", {
      dataItemId: dataItem.id,
      queueJob: jobLabels.newDataItem,
    });

    // Enqueue data item for optical bridging
    if (opticalBridgingEnabled) {
      try {
        logger.debug("Enqueuing raw data item for optical posting...");
        const uploadTimestamp = Date.now();

        const signedDataItemHeader = await signDataItemHeader(
          encodeTagsForOptical({
            id: dataItem.id,
            signature: signatureB64Url,
            owner: dataItem.owner,
            owner_address: ownerPublicAddress,
            target: dataItem.target || "",
            content_type: payloadContentType || "application/octet-stream",
            data_size: byteCount,
            tags: dataItem.tags,
          })
        );

        await enqueue(jobLabels.opticalPost, {
          ...signedDataItemHeader,
          uploaded_at: uploadTimestamp,
        });

        logger.info("Raw data item enqueued for optical posting", {
          dataItemId: dataItem.id,
        });
      } catch (opticalError) {
        // Soft error, just log
        logger.error("Error while attempting to enqueue for optical bridging!", {
          error: opticalError,
          dataItemId: dataItem.id,
        });
      }
    } else {
      logger.debug("Optical bridging disabled - skipping optical post");
    }
  } catch (error) {
    logger.error("Failed to store data item", { error });
    return errorResponse(ctx, {
      errorMessage: "Failed to store data item",
      status: 500,
    });
  }

  // Build receipt
  const unsignedReceipt = {
    id: dataItem.id,
    timestamp: Date.now(),
    version: "0.2.0",
    deadlineHeight: await ctx.state.arweaveGateway.getCurrentBlockHeight() + 50,
    dataCaches,
    fastFinalityIndexes,
    winc: (paymentResult.wincPaid || paymentResult.wincReserved || W("0")).toString(),
  };

  // Sign receipt with raw data item wallet (the actual signer of the data item)
  const signedReceipt = await signReceipt(unsignedReceipt, rawDataItemWallet);

  // Build x402 payment response header
  const x402PaymentResponse = {
    paymentId: paymentResult.paymentId,
    transactionHash: paymentResult.txHash,
    network: paymentResult.network,
    mode: paymentResult.mode,
  };

  // Return success response
  ctx.status = 201;
  ctx.set("X-Payment-Response", Buffer.from(JSON.stringify(x402PaymentResponse)).toString("base64"));
  ctx.body = {
    id: dataItem.id,
    owner: jwkToPublicArweaveAddress(rawDataItemWallet), // Raw data item wallet address
    payer: payerAddress, // The actual payer (tracked in Payer-Address tag)
    dataCaches: unsignedReceipt.dataCaches,
    fastFinalityIndexes: unsignedReceipt.fastFinalityIndexes,
    receipt: signedReceipt,
    x402Payment: x402PaymentResponse,
  };

  logger.info("Raw data upload completed successfully", {
    dataItemId: dataItem.id,
    paymentId: paymentResult.paymentId,
  });
}

/**
 * Send 402 Payment Required response with x402 payment requirements
 */
function send402PaymentRequired(
  ctx: KoaContext,
  byteCount: number,
  mimeType?: string
): void {
  const { logger } = ctx.state;

  logger.info("Sending 402 Payment Required", { byteCount, mimeType });

  // Build absolute URL for the resource (required by x402 facilitator)
  const protocol = ctx.request.protocol || "https";
  const host = ctx.request.host || ctx.request.hostname || "localhost:3001";
  const resourceUrl = `${protocol}://${host}/v1/tx`;

  // Get x402 payment requirements
  const paymentRequirements = {
    scheme: "exact",
    network: process.env.X402_NETWORK || "base-sepolia",
    maxAmountRequired: calculateUSDCAmount(byteCount),
    resource: resourceUrl,
    description: `Upload ${byteCount} bytes to Arweave via AR.IO Bundler`,
    mimeType: mimeType || "application/octet-stream",
    payTo: process.env.ETHEREUM_ADDRESS || process.env.BASE_ETH_ADDRESS || "",
    maxTimeoutSeconds: 3600,
    asset: process.env.USDC_CONTRACT_ADDRESS || "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // Base Sepolia USDC
    extra: {
      name: "USD Coin",
      version: "2",
    },
  };

  ctx.status = 402;
  ctx.set("X-Payment-Required", "x402-1");
  ctx.body = {
    x402Version: 1,
    accepts: [paymentRequirements],
    error: "Payment required to upload data",
  };
}

/**
 * Calculate USDC amount for byte count
 * TODO: This should call the payment service for accurate pricing
 */
function calculateUSDCAmount(byteCount: number): string {
  // Rough estimate: $0.01 per MB
  const mb = byteCount / (1024 * 1024);
  const usdCents = Math.max(1, Math.ceil(mb)); // Minimum 1 cent
  const usdcAtomicUnits = usdCents * 10000; // 6 decimals, so 0.01 USD = 10000
  return usdcAtomicUnits.toString();
}
