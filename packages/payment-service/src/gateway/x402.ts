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
import BigNumber from "bignumber.js";
import { ethers } from "ethers";

import { X402NetworkConfig } from "../constants";
import { PaymentTransactionNotFound } from "../database/errors";
import logger from "../logger";
import { TransactionId } from "../types";
import {
  Gateway,
  GatewayParams,
  TransactionInfo,
  TransactionStatus,
} from "./gateway";

/**
 * Gateway for x402 payments on EVM networks
 * Handles transaction verification for USDC transfers via EIP-3009
 */
export class X402Gateway extends Gateway {
  public endpoint: URL;
  private provider: ethers.JsonRpcProvider;
  private networkConfig: X402NetworkConfig;

  constructor(
    networkConfig: X402NetworkConfig,
    {
      paymentTxPollingWaitTimeMs,
      pendingTxMaxAttempts,
      minConfirmations,
    }: GatewayParams = {}
  ) {
    super({
      paymentTxPollingWaitTimeMs,
      pendingTxMaxAttempts,
      minConfirmations: minConfirmations || networkConfig.minConfirmations,
    });
    this.networkConfig = networkConfig;
    this.endpoint = new URL(networkConfig.rpcUrl);
    this.provider = new ethers.JsonRpcProvider(networkConfig.rpcUrl);
  }

  /**
   * Get transaction status from the blockchain
   */
  public async getTransactionStatus(
    transactionId: TransactionId
  ): Promise<TransactionStatus> {
    logger.debug("Getting x402 transaction status", {
      transactionId,
      network: this.networkConfig,
    });

    const receipt = await this.provider.getTransactionReceipt(transactionId);

    if (receipt === null) {
      logger.debug("X402 transaction not found", {
        transactionId,
        network: this.networkConfig,
      });
      return { status: "not found" };
    }

    const confirmations = await receipt.confirmations();

    if (confirmations >= this.minConfirmations) {
      logger.debug("X402 transaction confirmed", {
        transactionId,
        confirmations,
        blockHeight: receipt.blockNumber,
      });
      return {
        status: "confirmed",
        blockHeight: receipt.blockNumber,
      };
    }

    logger.debug("X402 transaction pending", {
      transactionId,
      confirmations,
      required: this.minConfirmations,
    });
    return { status: "pending" };
  }

  /**
   * Get transaction details from the blockchain
   */
  public async getTransaction(
    transactionId: TransactionId
  ): Promise<TransactionInfo> {
    return this.pollGatewayForTx(async () => {
      logger.debug("Getting x402 transaction", {
        transactionId,
        network: this.networkConfig,
      });

      const txResponse = await this.provider.getTransaction(transactionId);

      if (txResponse === null) {
        throw new PaymentTransactionNotFound(transactionId);
      }

      // For x402, we care about EIP-3009 transferWithAuthorization transactions
      // The value transferred is encoded in the transaction data, not the ETH value
      // For now, we return the basic transaction info
      const tx: TransactionInfo = {
        transactionQuantity: BigNumber(0), // x402 payments don't transfer ETH
        transactionSenderAddress: txResponse.from,
        transactionRecipientAddress: txResponse.to ?? "",
      };

      logger.debug("X402 transaction retrieved", {
        transactionId,
        from: tx.transactionSenderAddress,
        to: tx.transactionRecipientAddress,
      });

      return tx;
    }, transactionId);
  }

  /**
   * Get the network configuration
   */
  public getNetworkConfig(): X402NetworkConfig {
    return this.networkConfig;
  }

  /**
   * Get the chain ID
   */
  public getChainId(): number {
    return this.networkConfig.chainId;
  }

  /**
   * Check if this gateway is enabled
   */
  public isEnabled(): boolean {
    return this.networkConfig.enabled;
  }
}
