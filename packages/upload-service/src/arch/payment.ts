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
import { AxiosInstance } from "axios";
import { sign } from "jsonwebtoken";
import winston from "winston";

import { signatureTypeInfo } from "../constants";
import {
  allowArFSData,
  allowListPublicAddresses,
  allowListedSignatureTypes,
  freeUploadLimitBytes,
  testPrivateRouteSecret,
} from "../constants";
import defaultLogger from "../logger";
import { MetricRegistry } from "../metricRegistry";
import {
  ByteCount,
  DataItemId,
  NativeAddress,
  TransactionId,
  W,
  Winston,
} from "../types/types";
import { PaymentServiceReturnedError } from "../utils/errors";
import { createAxiosInstance } from "./axiosClient";

// TODO: Payment service response API
export interface ReserveBalanceResponse {
  walletExists: boolean;
  isReserved: boolean;
  costOfDataItem: Winston;
}

export interface CheckBalanceResponse {
  userHasSufficientBalance: boolean;
  bytesCostInWinc: Winston;
  userBalanceInWinc?: Winston;
}

export interface DelegatedPaymentApproval {
  approvalDataItemId: DataItemId;
  approvedAddress: NativeAddress;
  payingAddress: NativeAddress;
  approvedWincAmount: string;
  usedWincAmount: string;
  creationDate: string;
  expirationDate: string;
}
export type CreateDelegatedPaymentApprovalResponse =
  | string // error message or the approval created
  | DelegatedPaymentApproval;

interface PaymentServiceCheckBalanceResponse {
  userHasSufficientBalance: boolean;
  bytesCostInWinc: Winston;
  userBalanceInWinc: Winston;
  adjustments: Record<string, unknown>[];
}

interface CheckBalanceParams {
  size: ByteCount;
  nativeAddress: NativeAddress;
  signatureType: number;
  paidBy?: NativeAddress[];
}

interface CreateDelegatedPaymentApprovalParams {
  dataItemId: TransactionId;
  winc: string;
  payingAddress: NativeAddress;
  approvedAddress: NativeAddress;
  expiresInSeconds?: string;
}

interface RevokeDelegatedPaymentApprovalsParams {
  dataItemId: DataItemId;
  revokedAddress: NativeAddress;
  payingAddress: NativeAddress;
}

interface ReserveBalanceParams extends CheckBalanceParams {
  dataItemId: TransactionId;
}

export interface RefundBalanceResponse {
  walletExists: boolean;
}

// x402 Payment Types
export interface X402PaymentRequirements {
  scheme: string;
  network: string;
  maxAmountRequired: string;
  asset: string;
  payTo: string;
  timeout: { validBefore: number };
  extra?: { name: string; version: string };
}

export interface X402PaymentRequiredResponse {
  x402Version: number;
  accepts: X402PaymentRequirements[];
  error?: string;
}

export interface X402PaymentResult {
  success: boolean;
  paymentId?: string;
  txHash?: string;
  network?: string;
  wincPaid?: Winston;
  wincReserved?: Winston;
  wincCredited?: Winston;
  mode?: string;
  error?: string;
}

export interface X402FinalizeResult {
  success: boolean;
  status?: string;
  actualByteCount?: number;
  refundWinc?: Winston;
  error?: string;
}

interface GetX402PriceQuoteParams {
  byteCount: ByteCount;
  nativeAddress: NativeAddress;
  signatureType: number;
}

interface VerifyAndSettleX402PaymentParams {
  paymentHeader: string;
  dataItemId: TransactionId;
  byteCount: ByteCount;
  nativeAddress: NativeAddress;
  signatureType: number;
  mode?: "payg" | "topup" | "hybrid";
}

interface FinalizeX402PaymentParams {
  dataItemId: TransactionId;
  actualByteCount: ByteCount;
}

interface RefundBalanceParams {
  winston: Winston;
  nativeAddress: NativeAddress;
  dataItemId: TransactionId;
  signatureType: number;
}

export interface PaymentService {
  checkBalanceForData(
    params: CheckBalanceParams
  ): Promise<CheckBalanceResponse>;
  reserveBalanceForData(
    params: ReserveBalanceParams
  ): Promise<ReserveBalanceResponse>;
  refundBalanceForData(params: RefundBalanceParams): Promise<void>;
  getFiatToARConversionRate(currency: "usd"): Promise<number>; // TODO: create type for currency
  paymentServiceURL: string | undefined;
  createDelegatedPaymentApproval(
    params: CreateDelegatedPaymentApprovalParams
  ): Promise<DelegatedPaymentApproval>;
  revokeDelegatedPaymentApprovals(
    params: RevokeDelegatedPaymentApprovalsParams
  ): Promise<DelegatedPaymentApproval[]>;

  // x402 Payment Methods
  getX402PriceQuote(
    params: GetX402PriceQuoteParams
  ): Promise<X402PaymentRequiredResponse | null>;
  verifyAndSettleX402Payment(
    params: VerifyAndSettleX402PaymentParams
  ): Promise<X402PaymentResult>;
  finalizeX402Payment(
    params: FinalizeX402PaymentParams
  ): Promise<X402FinalizeResult>;
}

const allowedReserveBalanceResponse: ReserveBalanceResponse = {
  walletExists: true,
  costOfDataItem: W(0),
  isReserved: true,
};

const secret = process.env.PRIVATE_ROUTE_SECRET ?? testPrivateRouteSecret;
export class TurboPaymentService implements PaymentService {
  constructor(
    private readonly shouldAllowArFSData: boolean = allowArFSData,
    // TODO: create a client config with base url pointing at the base url of the payment service
    private readonly axios: AxiosInstance = createAxiosInstance({}),
    private readonly logger: winston.Logger = defaultLogger,
    readonly paymentServiceURL: string | undefined = process.env
      .PAYMENT_SERVICE_BASE_URL,
    paymentServiceProtocol: string = process.env.PAYMENT_SERVICE_PROTOCOL ??
      "https"
  ) {
    this.logger = logger.child({
      class: this.constructor.name,
      paymentServiceURL,
      shouldAllowArFSData,
    });
    this.axios = axios;
    this.paymentServiceURL = paymentServiceURL
      ? `${paymentServiceProtocol}://${paymentServiceURL}`
      : undefined;
  }

  public async checkBalanceForData({
    size,
    nativeAddress,
    signatureType,
    paidBy = [],
  }: CheckBalanceParams): Promise<CheckBalanceResponse> {
    const logger = this.logger.child({ nativeAddress, size });

    logger.debug("Checking balance for wallet.");

    const allowedCheckBalanceResponse: CheckBalanceResponse = {
      userHasSufficientBalance: true,
      bytesCostInWinc: W(0),
    };
    if (
      await this.checkBalanceForDataInternal({
        size,
        nativeAddress,
        signatureType,
      })
    ) {
      logger.debug(
        "Data was allowed via internal upload service business logic. Not calling payment service to check balance..."
      );
      return allowedCheckBalanceResponse;
    }

    if (allowListedSignatureTypes.has(signatureType)) {
      return allowedCheckBalanceResponse;
    }

    if (!this.paymentServiceURL) {
      logger.debug(
        "No payment service URL supplied. Simulating no balance at payment service..."
      );

      return {
        userHasSufficientBalance: false,
        bytesCostInWinc: W(0),
      };
    }

    logger.debug("Calling payment service to check balance...");

    const token = sign({}, secret, {
      expiresIn: "1h",
    });

    const url = new URL(
      `${this.paymentServiceURL}/v1/check-balance/${signatureTypeInfo[signatureType].name}/${nativeAddress}`
    );
    url.searchParams.append("byteCount", size.toString());
    for (const address of paidBy) {
      url.searchParams.append("paidBy", address);
    }

    const { status, statusText, data } = await this.axios.get<
      PaymentServiceCheckBalanceResponse | string
    >(url.href, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      validateStatus: (status) => {
        if (status >= 500) {
          throw new Error(`Payment service unavailable. Status: ${status}`);
        }
        return true;
      },
    });

    logger.debug("Payment service response.", {
      status,
      statusText,
      data,
    });

    if (typeof data === "string") {
      throw new Error(
        `Payment service returned a string instead of a json object. Body: ${data} | Status: ${status} | StatusText: ${statusText}`
      );
    }

    return data;
  }

  private async checkBalanceForDataInternal({
    size,
    nativeAddress,
  }: CheckBalanceParams): Promise<boolean> {
    const logger = this.logger.child({ nativeAddress, size });

    logger.debug("Checking balance for wallet.");

    if (allowListPublicAddresses.includes(nativeAddress)) {
      logger.debug(
        "The owner's address is on the arweave public address allow list. Allowing data item to be bundled by the service..."
      );
      return true;
    }

    if (this.shouldAllowArFSData && size <= freeUploadLimitBytes) {
      // TODO: Add limitations PE-2603
      logger.debug(
        "This data item is under the free ArFS data limit. Allowing data item to be bundled by the service..."
      );

      return true;
    }

    return false;
  }

  public async reserveBalanceForData({
    size,
    nativeAddress,
    dataItemId,
    signatureType,
    paidBy = [],
  }: ReserveBalanceParams): Promise<ReserveBalanceResponse> {
    const logger = this.logger.child({ nativeAddress, size });

    logger.debug("Reserving balance for wallet.");

    if (
      await this.checkBalanceForDataInternal({
        size,
        nativeAddress,
        signatureType,
      })
    ) {
      logger.debug(
        "Data was allowed via internal upload service business logic. Not calling payment service to reserve balance..."
      );
      return allowedReserveBalanceResponse;
    }

    if (!this.paymentServiceURL) {
      logger.debug(
        "No payment service URL supplied. Simulating unsuccessful balance reservation at payment service..."
      );

      return {
        walletExists: false,
        costOfDataItem: W(0),
        isReserved: false,
      };
    }

    logger.debug("Calling payment service to reserve balance...");

    const token = sign({}, secret, {
      expiresIn: "1h",
    });
    const url = new URL(
      `${this.paymentServiceURL}/v1/reserve-balance/${signatureTypeInfo[signatureType].name}/${nativeAddress}`
    );
    url.searchParams.append("byteCount", size.toString());
    url.searchParams.append("dataItemId", dataItemId);
    for (const address of paidBy) {
      url.searchParams.append("paidBy", address);
    }

    const { status, statusText, data } = await this.axios.get(url.href, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      validateStatus: (status) => {
        if (status >= 500) {
          throw new Error(`Payment service unavailable. Status: ${status}`);
        }
        return true;
      },
    });

    logger.debug("Payment service response.", {
      status,
      statusText,
      data,
    });

    const walletExists = +status !== 404;
    const costOfDataItem = +status === 200 ? W(+data) : W(0);
    const isReserved = +status === 200;

    // Allowed signature types can reserve balance if they have balance, else they may upload for free
    if (!isReserved) {
      if (allowListedSignatureTypes.has(signatureType)) {
        logger.info(
          "Allow listed signature detected. Allowing data item to be bundled by the service...",
          { signatureType }
        );
        return allowedReserveBalanceResponse;
      }
    }

    return {
      walletExists,
      costOfDataItem,
      isReserved,
    };
  }

  public async refundBalanceForData(
    params: RefundBalanceParams
  ): Promise<void> {
    const logger = this.logger.child({ ...params });
    const { nativeAddress, winston, dataItemId, signatureType } = params;

    logger.debug("Refunding balance for wallet.", {
      nativeAddress,
      winston,
    });

    if (allowListPublicAddresses.includes(nativeAddress)) {
      logger.info(
        "The owner's address is on the arweave public address allow list. Not calling payment service to refund balance..."
      );
      return;
    }

    const token = sign({}, secret, {
      expiresIn: "1h",
    });

    try {
      await this.axios.get(
        `${this.paymentServiceURL}/v1/refund-balance/${signatureTypeInfo[signatureType].name}/${nativeAddress}?winstonCredits=${winston}&dataItemId=${dataItemId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      logger.debug("Successfully refunded balance for wallet.");
    } catch (error) {
      // TODO: add prometheus metric for when this fails - we may need to manually intervene to distribute the refund
      MetricRegistry.refundBalanceFail.inc();
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error("Unable to issue refund!", {
        error: message,
      });
    }
  }

  public async getFiatToARConversionRate(
    currency: "usd" = "usd"
  ): Promise<number> {
    const { data: fiatToArRate } = await this.axios.get(
      `${this.paymentServiceURL}/v1/rates/${currency}`
    );
    return +fiatToArRate.rate;
  }

  public async createDelegatedPaymentApproval({
    approvedAddress,
    dataItemId,
    payingAddress,
    winc,
    expiresInSeconds,
  }: CreateDelegatedPaymentApprovalParams): Promise<DelegatedPaymentApproval> {
    const token = sign({}, secret, {
      expiresIn: "1h",
    });

    const { status, statusText, data } =
      await this.axios.get<CreateDelegatedPaymentApprovalResponse>(
        `${
          this.paymentServiceURL
        }/v1/account/approvals/create?dataItemId=${dataItemId}&winc=${winc}&payingAddress=${payingAddress}&approvedAddress=${approvedAddress}${
          expiresInSeconds ? `&expiresInSeconds=${expiresInSeconds}` : ""
        }`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          validateStatus: (status) => status < 500,
        }
      );

    if (typeof data === "string") {
      throw new PaymentServiceReturnedError(data);
    }

    if (status !== 200) {
      throw new Error(
        `Failed to create delegated payment approval. Status: ${status} | StatusText: ${statusText} | Body ${data}`
      );
    }

    return data;
  }

  public async revokeDelegatedPaymentApprovals({
    revokedAddress,
    dataItemId,
    payingAddress,
  }: RevokeDelegatedPaymentApprovalsParams): Promise<
    DelegatedPaymentApproval[]
  > {
    const token = sign({}, secret, {
      expiresIn: "1h",
    });

    const { status, statusText, data } = await this.axios.get<
      DelegatedPaymentApproval[]
    >(
      `${this.paymentServiceURL}/v1/account/approvals/revoke?dataItemId=${dataItemId}&payingAddress=${payingAddress}&approvedAddress=${revokedAddress}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (typeof data === "string") {
      throw new PaymentServiceReturnedError(data);
    }

    if (status !== 200) {
      throw new Error(
        `Failed to revoke delegated payment approval. Status: ${status} | StatusText: ${statusText} | Body ${data}`
      );
    }

    return data;
  }

  // x402 Payment Methods

  public async getX402PriceQuote({
    byteCount,
    nativeAddress,
    signatureType,
  }: GetX402PriceQuoteParams): Promise<X402PaymentRequiredResponse | null> {
    const logger = this.logger.child({ nativeAddress, byteCount });

    if (!this.paymentServiceURL) {
      logger.debug("No payment service URL supplied. Cannot get x402 price quote.");
      return null;
    }

    logger.debug("Getting x402 price quote from payment service...");

    const url = new URL(
      `${this.paymentServiceURL}/v1/x402/price/${signatureType}/${nativeAddress}`
    );
    url.searchParams.append("bytes", byteCount.toString());

    const { status, statusText, data } = await this.axios.get<
      X402PaymentRequiredResponse | string
    >(url.href, {
      validateStatus: (status) => {
        if (status >= 500) {
          throw new Error(`Payment service unavailable. Status: ${status}`);
        }
        return true;
      },
    });

    logger.debug("Payment service x402 price response.", {
      status,
      statusText,
    });

    if (typeof data === "string") {
      throw new Error(
        `Payment service returned a string instead of a json object. Body: ${data} | Status: ${status} | StatusText: ${statusText}`
      );
    }

    if (status !== 200) {
      logger.warn("Failed to get x402 price quote", { status, statusText, data });
      return null;
    }

    return data;
  }

  public async verifyAndSettleX402Payment({
    paymentHeader,
    dataItemId,
    byteCount,
    nativeAddress,
    signatureType,
    mode = "hybrid",
  }: VerifyAndSettleX402PaymentParams): Promise<X402PaymentResult> {
    const logger = this.logger.child({
      nativeAddress,
      dataItemId,
      byteCount,
      mode,
    });

    if (!this.paymentServiceURL) {
      logger.error("No payment service URL supplied. Cannot verify x402 payment.");
      return {
        success: false,
        error: "Payment service not configured",
      };
    }

    logger.info("Verifying and settling x402 payment...");

    try {
      const { status, statusText, data } = await this.axios.post<
        X402PaymentResult | string
      >(
        `${this.paymentServiceURL}/v1/x402/payment/${signatureType}/${nativeAddress}`,
        {
          paymentHeader,
          dataItemId,
          byteCount,
          mode,
        },
        {
          validateStatus: (status) => {
            if (status >= 500) {
              throw new Error(`Payment service unavailable. Status: ${status}`);
            }
            return true;
          },
        }
      );

      logger.debug("Payment service x402 payment response.", {
        status,
        statusText,
      });

      if (typeof data === "string") {
        throw new Error(
          `Payment service returned a string instead of a json object. Body: ${data} | Status: ${status} | StatusText: ${statusText}`
        );
      }

      if (status === 402) {
        // Payment required - signature verification failed
        logger.warn("X402 payment verification failed", { data });
        return {
          success: false,
          error: (data as any).error || "Payment verification failed",
        };
      }

      if (status !== 200) {
        logger.error("X402 payment failed", { status, statusText, data });
        return {
          success: false,
          error: (data as any).error || `Payment failed: ${statusText}`,
        };
      }

      logger.info("X402 payment successful", {
        paymentId: (data as X402PaymentResult).paymentId,
        txHash: (data as X402PaymentResult).txHash,
      });

      return data as X402PaymentResult;
    } catch (error) {
      logger.error("X402 payment error", { error });
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  public async finalizeX402Payment({
    dataItemId,
    actualByteCount,
  }: FinalizeX402PaymentParams): Promise<X402FinalizeResult> {
    const logger = this.logger.child({ dataItemId, actualByteCount });

    if (!this.paymentServiceURL) {
      logger.debug("No payment service URL supplied. Skipping x402 finalization.");
      return { success: true }; // Not an error if payment service not configured
    }

    logger.debug("Finalizing x402 payment...");

    try {
      const { status, statusText, data } = await this.axios.post<
        X402FinalizeResult | string
      >(
        `${this.paymentServiceURL}/v1/x402/finalize`,
        {
          dataItemId,
          actualByteCount,
        },
        {
          validateStatus: (status) => {
            if (status >= 500) {
              throw new Error(`Payment service unavailable. Status: ${status}`);
            }
            return true;
          },
        }
      );

      logger.debug("Payment service x402 finalize response.", {
        status,
        statusText,
      });

      if (typeof data === "string") {
        throw new Error(
          `Payment service returned a string instead of a json object. Body: ${data} | Status: ${status} | StatusText: ${statusText}`
        );
      }

      if (status !== 200) {
        logger.error("X402 finalization failed", { status, statusText, data });
        return {
          success: false,
          error: (data as any).error || `Finalization failed: ${statusText}`,
        };
      }

      logger.info("X402 payment finalized", { data });

      return data as X402FinalizeResult;
    } catch (error) {
      logger.error("X402 finalization error", { error });
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}
