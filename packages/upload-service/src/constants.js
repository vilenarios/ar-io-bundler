"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.arioDedicatedBundlesPremiumFeatureType = exports.arDriveDedicatedBundlesPremiumFeatureType = exports.kyveDedicatedBundlesPremiumFeatureType = exports.aoDedicatedBundlesPremiumFeatureType = exports.firstBatchDedicatedBundlesPremiumFeatureType = exports.redstoneOracleDedicatedBundlesPremiumFeatureType = exports.warpDedicatedBundlesPremiumFeatureType = exports.skipOpticalPostAddresses = exports.antRegistryTestnetProcesses = exports.antRegistryMainnetProcesses = exports.arioTestnetProcesses = exports.arioMainnetProcesses = exports.aoAddresses = exports.firstBatchAddresses = exports.redstoneOracleAddresses = exports.warpWalletAddresses = exports.defaultPremiumFeatureType = exports.anchorLength = exports.emptyAnchorLength = exports.targetLength = exports.emptyTargetLength = exports.signatureTypeLength = exports.msPerMinute = exports.failedReasons = exports.octetStreamContentType = exports.testPrivateRouteSecret = exports.defaultMaxConcurrentChunks = exports.failedBundleCSVColumnLength = exports.retryLimitForFailedDataItems = exports.rePostDataItemThresholdNumberOfBlocks = exports.dropBundleTxThresholdNumberOfBlocks = exports.txConfirmationThreshold = exports.txPermanentThreshold = exports.FATAL_CHUNK_UPLOAD_ERRORS = exports.INITIAL_ERROR_DELAY = exports.fastFinalityIndexes = exports.dataCaches = exports.publicAccessGatewayUrl = exports.gatewayUrl = exports.allowArFSData = exports.freeUploadLimitBytes = exports.maxSingleDataItemByteCount = exports.maxBundleDataItemsByteCount = exports.maxDataItemsPerBundle = exports.otelSampleRate = exports.migrateOnStartup = exports.allowListPublicAddresses = exports.deadlineHeightIncrement = exports.receiptVersion = exports.port = void 0;
exports.DataItemOffsets = exports.sigNameToSigInfo = exports.signatureTypeInfo = exports.multipartDefaultChunkSize = exports.multipartChunkMaxSize = exports.multipartChunkMinSize = exports.revokeDelegatePaymentApprovalTagName = exports.approvalExpiresBySecondsTagName = exports.approvalAmountTagName = exports.createDelegatedPaymentApprovalTagName = exports.jobLabels = exports.allowListedSignatureTypes = exports.turboLocalJwk = exports.blocklistedAddresses = exports.defaultOverdueThresholdMs = exports.payloadContentTypeS3MetaDataTag = exports.payloadDataStartS3MetaDataTag = exports.batchingSize = exports.maxSignatureLength = exports.dedicatedBundleTypes = exports.arioProcesses = exports.allFeatureTypes = exports.premiumPaidFeatureTypes = void 0;
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
const fs = __importStar(require("fs"));
const types_1 = require("./types/types");
exports.port = process.env.PORT ? +process.env.PORT : 3000;
exports.receiptVersion = "0.2.0";
exports.deadlineHeightIncrement = 200;
// Wallets added via environment var as a comma separated list // cspell:disable
// e.g: ALLOW_LISTED_ADDRESSES="QWERTYUIOP,ASDFGHJKL,ZXCVBNM" // cspell:enable
const injectedAllowListAddresses = process.env.ALLOW_LISTED_ADDRESSES
    ? process.env.ALLOW_LISTED_ADDRESSES.split(",")
    : [];
exports.allowListPublicAddresses = injectedAllowListAddresses;
exports.migrateOnStartup = process.env.MIGRATE_ON_STARTUP === "true";
exports.otelSampleRate = process.env.OTEL_SAMPLE_RATE
    ? +process.env.OTEL_SAMPLE_RATE
    : 200;
const oneGiB = 1073741824;
const twoGiB = oneGiB * 2;
const fourGiB = oneGiB * 4;
const oneKiB = 1024;
exports.maxDataItemsPerBundle = process.env.MAX_DATA_ITEM_LIMIT
    ? +process.env.MAX_DATA_ITEM_LIMIT
    : 10000;
/** Target max size for bundle packing. If data item is larger than this, it will bundle by itself */
exports.maxBundleDataItemsByteCount = process.env.MAX_BUNDLE_SIZE
    ? +process.env.MAX_BUNDLE_SIZE
    : twoGiB;
/** Max allowed data item limit on data post ingest */
exports.maxSingleDataItemByteCount = process.env.MAX_DATA_ITEM_SIZE
    ? +process.env.MAX_DATA_ITEM_SIZE
    : fourGiB;
exports.freeUploadLimitBytes = +(process.env.FREE_UPLOAD_LIMIT ?? oneKiB * 505); // Extra to account for the header sizes
exports.allowArFSData = process.env.ALLOW_ARFS_DATA === "true";
exports.gatewayUrl = new URL(process.env.ARWEAVE_GATEWAY || "https://arweave.net:443");
exports.publicAccessGatewayUrl = new URL(process.env.PUBLIC_ACCESS_GATEWAY || "https://arweave.net:443");
exports.dataCaches = process.env.DATA_CACHES?.split(",") ?? [
    exports.publicAccessGatewayUrl.host,
];
exports.fastFinalityIndexes = process.env.FAST_FINALITY_INDEXES?.split(",") ?? [exports.publicAccessGatewayUrl.host];
/**
 * Error delay for the first failed request for a transaction header post or chunk upload
 * Subsequent requests will delay longer with an exponential back off strategy
 */
exports.INITIAL_ERROR_DELAY = 500; // 500ms
/**
 *  These are errors from the `/chunk` endpoint on an Arweave
 *  node that we should never try to continue on
 */
exports.FATAL_CHUNK_UPLOAD_ERRORS = [
    "invalid_json",
    "chunk_too_big",
    "data_path_too_big",
    "offset_too_big",
    "data_size_too_big",
    "chunk_proof_ratio_not_attractive",
    "invalid_proof",
];
exports.txPermanentThreshold = 18;
exports.txConfirmationThreshold = 1;
exports.dropBundleTxThresholdNumberOfBlocks = 50;
exports.rePostDataItemThresholdNumberOfBlocks = 125;
exports.retryLimitForFailedDataItems = 10;
const txIdLength = 43;
exports.failedBundleCSVColumnLength = (txIdLength + 1) * 20; // Allow up to 20 failed bundles in the schema
exports.defaultMaxConcurrentChunks = 32;
exports.testPrivateRouteSecret = "test-secret";
exports.octetStreamContentType = "application/octet-stream";
exports.failedReasons = {
    failedToPost: "failed_to_post",
    notFound: "not_found",
};
exports.msPerMinute = 60000;
exports.signatureTypeLength = 2;
exports.emptyTargetLength = 1;
exports.targetLength = 33;
exports.emptyAnchorLength = 1;
exports.anchorLength = 33;
exports.defaultPremiumFeatureType = "default";
exports.warpWalletAddresses = process.env.WARP_ADDRESSES?.split(",") ?? [
    // cspell:disable
    "jnioZFibZSCcV8o-HkBXYPYEYNib4tqfexP0kCBXX_M",
];
exports.redstoneOracleAddresses = process.env.REDSTONE_ORACLE_ADDRESSES?.split(",") ?? [
    "I-5rWUehEv-MjdK9gFw09RxfSLQX9DIHxG614Wf8qo0", // cspell:enable
];
exports.firstBatchAddresses = process.env.FIRST_BATCH_ADDRESSES?.split("," // cspell:disable
) ?? ["8NyeR4GiwbneFMNfCNz2Q84Xbd2ks9QrlAD85QabQrw"]; // cspell:enable
exports.aoAddresses = process.env.AO_ADDRESSES?.split("," // cspell:disable
) ?? ["fcoN_xJeisVsPXA-trzVAuIiqO3ydLQxM-L4XbrQKzY"]; // cspell:enable
const kyveAddresses = process.env.KYVE_ADDRESSES?.split(",") ?? [];
exports.arioMainnetProcesses = process.env.ARIO_MAINNET_PROCESSES?.split(",") ?? ["qNvAoz0TgcH7DMg8BCVn8jF32QH5L6T29VjHxhHqqGE"];
exports.arioTestnetProcesses = process.env.ARIO_TESTNET_PROCESSES?.split(",") ?? [
    "agYcCFJtrMG6cqMuZfskIkFTGvUPddICmtQSBIoPdiA",
    "GaQrvEMKBpkjofgnBi_B3IgIDmY_XYelVLB6GcRGrHc", // devnet
];
exports.antRegistryMainnetProcesses = process.env.ANT_REGISTRY_MAINNET_PROCESSES?.split(",") ?? [
    "i_le_yKKPVstLTDSmkHRqf-wYphMnwB9OhleiTgMkWc",
];
exports.antRegistryTestnetProcesses = process.env.ANT_REGISTRY_TESTNET_PROCESSES?.split(",") ?? [
    "RR0vheYqtsKuJCWh6xj0beE35tjaEug5cejMw9n2aa8",
];
exports.skipOpticalPostAddresses = process.env.SKIP_OPTICAL_POST_ADDRESSES?.split(",") ??
    exports.redstoneOracleAddresses;
exports.warpDedicatedBundlesPremiumFeatureType = "warp_dedicated_bundles";
exports.redstoneOracleDedicatedBundlesPremiumFeatureType = "redstone_oracle_dedicated_bundles";
exports.firstBatchDedicatedBundlesPremiumFeatureType = "first_batch_dedicated_bundles";
exports.aoDedicatedBundlesPremiumFeatureType = "ao_dedicated_bundles";
exports.kyveDedicatedBundlesPremiumFeatureType = "kyve_dedicated_bundles";
exports.arDriveDedicatedBundlesPremiumFeatureType = "ardrive_dedicated_bundles";
exports.arioDedicatedBundlesPremiumFeatureType = "ario_dedicated_bundles";
exports.premiumPaidFeatureTypes = [
    exports.warpDedicatedBundlesPremiumFeatureType,
    exports.redstoneOracleDedicatedBundlesPremiumFeatureType,
    exports.firstBatchDedicatedBundlesPremiumFeatureType,
    exports.aoDedicatedBundlesPremiumFeatureType,
    exports.kyveDedicatedBundlesPremiumFeatureType,
    exports.arDriveDedicatedBundlesPremiumFeatureType,
    exports.arioDedicatedBundlesPremiumFeatureType,
];
exports.allFeatureTypes = [
    ...exports.premiumPaidFeatureTypes,
    exports.defaultPremiumFeatureType,
];
exports.arioProcesses = [
    ...exports.arioMainnetProcesses,
    ...exports.arioTestnetProcesses,
    ...exports.antRegistryMainnetProcesses,
    ...exports.antRegistryTestnetProcesses,
];
exports.dedicatedBundleTypes = {
    [exports.warpDedicatedBundlesPremiumFeatureType]: {
        allowedWallets: exports.warpWalletAddresses,
        bundlerAppName: "Warp",
    },
    [exports.redstoneOracleDedicatedBundlesPremiumFeatureType]: {
        allowedWallets: exports.redstoneOracleAddresses,
        bundlerAppName: "Redstone",
    },
    [exports.firstBatchDedicatedBundlesPremiumFeatureType]: {
        allowedWallets: exports.firstBatchAddresses,
        bundlerAppName: "FirstBatch",
    },
    [exports.aoDedicatedBundlesPremiumFeatureType]: {
        allowedWallets: exports.aoAddresses,
        bundlerAppName: "AO",
    },
    [exports.kyveDedicatedBundlesPremiumFeatureType]: {
        allowedWallets: kyveAddresses,
        bundlerAppName: "KYVE",
    },
    [exports.arDriveDedicatedBundlesPremiumFeatureType]: {
        allowedWallets: [],
        bundlerAppName: "ArDrive",
    },
    [exports.arioDedicatedBundlesPremiumFeatureType]: {
        allowedWallets: [],
        bundlerAppName: "AR.IO Network",
        allowedProcesses: exports.arioProcesses,
    },
};
/**
 * This is the limit of `signature` on `new_data_item` and `planned_data_item`
 * If this value needs to be changed, a migration will be required to update the column type
 */
exports.maxSignatureLength = 2055; // 2052 is MULTIAPTOS signature length
exports.batchingSize = 100;
exports.payloadDataStartS3MetaDataTag = "payload-data-start";
exports.payloadContentTypeS3MetaDataTag = "payload-content-type";
exports.defaultOverdueThresholdMs = +((process.env.OVERDUE_DATA_ITEM_THRESHOLD_MS ?? 5 * 60 * 1000) // 5 minutes
);
exports.blocklistedAddresses = process.env.BLOCKLISTED_ADDRESSES?.split(",") ?? [];
// allows providing a local JWK for testing purposes
exports.turboLocalJwk = process.env.TURBO_JWK_FILE
    ? JSON.parse(fs.readFileSync(process.env.TURBO_JWK_FILE, "utf-8"))
    : undefined;
exports.allowListedSignatureTypes = process.env
    .ALLOW_LISTED_SIGNATURE_TYPES
    ? new Set(process.env.ALLOW_LISTED_SIGNATURE_TYPES.split(",").map((s) => +s))
    : new Set([]);
exports.jobLabels = {
    finalizeUpload: "finalize-upload",
    opticalPost: "optical-post",
    unbundleBdi: "unbundle-bdi",
    newDataItem: "new-data-item",
    planBundle: "plan-bundle",
    prepareBundle: "prepare-bundle",
    postBundle: "post-bundle",
    seedBundle: "seed-bundle",
    verifyBundle: "verify-bundle",
    cleanupFs: "cleanup-fs",
    putOffsets: "put-offsets",
};
exports.createDelegatedPaymentApprovalTagName = "x-approve-payment";
exports.approvalAmountTagName = "x-amount";
exports.approvalExpiresBySecondsTagName = "x-expires-seconds";
exports.revokeDelegatePaymentApprovalTagName = "x-delete-payment-approval";
exports.multipartChunkMinSize = 1024 * 1024 * 5; // 5MiB - AWS minimum
exports.multipartChunkMaxSize = 1024 * 1024 * 500; // 500MiB // NOTE: AWS supports upto 5GiB
exports.multipartDefaultChunkSize = 25000000; // 25MB
exports.signatureTypeInfo = {
    [types_1.SignatureConfig.ARWEAVE]: {
        signatureLength: 512,
        pubkeyLength: 512,
        name: "arweave",
    },
    [types_1.SignatureConfig.ED25519]: {
        signatureLength: 64,
        pubkeyLength: 32,
        name: "ed25519",
    },
    [types_1.SignatureConfig.ETHEREUM]: {
        signatureLength: 65,
        pubkeyLength: 65,
        name: "ethereum",
    },
    [types_1.SignatureConfig.SOLANA]: {
        signatureLength: 64,
        pubkeyLength: 32,
        name: "solana",
    },
    [types_1.SignatureConfig.INJECTEDAPTOS]: {
        signatureLength: 64,
        pubkeyLength: 32,
        name: "injectedAptos",
    },
    [types_1.SignatureConfig.MULTIAPTOS]: {
        signatureLength: 64 * 32 + 4,
        pubkeyLength: 32 * 32 + 1,
        name: "multiAptos",
    },
    [types_1.SignatureConfig.TYPEDETHEREUM]: {
        signatureLength: 65,
        pubkeyLength: 42,
        name: "typedEthereum",
    },
    [types_1.SignatureConfig.KYVE]: {
        signatureLength: 65,
        pubkeyLength: 65,
        name: "kyve",
    },
};
exports.sigNameToSigInfo = Object.values(exports.signatureTypeInfo).reduce((acc, info) => {
    acc[info.name] = info;
    return acc;
}, {});
exports.DataItemOffsets = {
    signatureTypeStart: 0,
    signatureTypeEnd: 1,
    signatureStart: 2,
    signatureEnd: (signatureType) => exports.DataItemOffsets.signatureStart +
        exports.signatureTypeInfo[signatureType].signatureLength -
        1,
    ownerStart: (signatureType) => exports.DataItemOffsets.signatureEnd(signatureType) + 1,
    ownerEnd: (signatureType) => exports.DataItemOffsets.ownerStart(signatureType) +
        exports.signatureTypeInfo[signatureType].pubkeyLength -
        1,
    targetFlagStart: (signatureType) => exports.DataItemOffsets.ownerEnd(signatureType) + 1,
    targetFlagEnd: (signatureType) => exports.DataItemOffsets.targetFlagStart(signatureType),
    targetStart: (signatureType, haveTarget) => haveTarget ? exports.DataItemOffsets.targetFlagEnd(signatureType) + 1 : undefined,
    targetEnd: (signatureType, haveTarget) => haveTarget
        ? // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            exports.DataItemOffsets.targetStart(signatureType, haveTarget) + 31 // 32 bytes for target
        : undefined,
    anchorFlagStart: (signatureType, haveTarget) => haveTarget
        ? // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            exports.DataItemOffsets.targetEnd(signatureType, haveTarget) + 1
        : exports.DataItemOffsets.targetFlagEnd(signatureType) + 1,
    anchorFlagEnd: (signatureType, haveTarget) => exports.DataItemOffsets.anchorFlagStart(signatureType, haveTarget),
    anchorStart: (signatureType, haveTarget, haveAnchor) => haveAnchor
        ? // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            exports.DataItemOffsets.anchorFlagEnd(signatureType, haveTarget) + 1
        : undefined,
    anchorEnd: (signatureType, haveTarget, haveAnchor) => haveAnchor
        ? // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            exports.DataItemOffsets.anchorStart(signatureType, haveTarget, haveAnchor) + 31 // 32 bytes for anchor
        : undefined,
    numTagsStart: (signatureType, haveTarget, haveAnchor
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    ) => exports.DataItemOffsets.anchorEnd(signatureType, haveTarget, haveAnchor) + 1,
    numTagsEnd: (signatureType, haveTarget, haveAnchor) => exports.DataItemOffsets.numTagsStart(signatureType, haveTarget, haveAnchor) + 7,
    numTagsBytesStart: (signatureType, haveTarget, haveAnchor) => exports.DataItemOffsets.numTagsEnd(signatureType, haveTarget, haveAnchor) + 1,
    numTagsBytesEnd: (signatureType, haveTarget, haveAnchor) => exports.DataItemOffsets.numTagsBytesStart(signatureType, haveTarget, haveAnchor) +
        7,
    tagsStart: (signatureType, haveTarget, haveAnchor, numTagsBytes) => numTagsBytes > 0
        ? exports.DataItemOffsets.numTagsBytesEnd(signatureType, haveTarget, haveAnchor) +
            1
        : undefined,
    tagsEnd: (signatureType, haveTarget, haveAnchor, numTagsBytes) => numTagsBytes > 0
        ? // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            exports.DataItemOffsets.tagsStart(signatureType, haveTarget, haveAnchor, numTagsBytes) + numTagsBytes
        : undefined,
    payloadStart: (signatureType, haveTarget, haveAnchor, numTagsBytes, payloadSize) => payloadSize > 0
        ? numTagsBytes > 0
            ? // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                exports.DataItemOffsets.tagsEnd(signatureType, haveTarget, haveAnchor, numTagsBytes) + 1
            : exports.DataItemOffsets.numTagsBytesEnd(signatureType, haveTarget, haveAnchor) + 1
        : undefined,
    payloadEnd: (signatureType, haveTarget, haveAnchor, numTagsBytes, payloadSize) => payloadSize > 0
        ? // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            exports.DataItemOffsets.payloadStart(signatureType, haveTarget, haveAnchor, numTagsBytes, payloadSize) +
                payloadSize -
                1
        : undefined,
};
