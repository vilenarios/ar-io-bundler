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
import axios from "axios";
import * as crypto from "crypto";
import { ethers } from "ethers";

import { cdpApiKeyId, cdpApiKeySecret, X402NetworkConfig } from "../constants";
import logger from "../logger";

// x402 Protocol Types
export interface X402PaymentRequirements {
  scheme: string;
  network: string;
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  outputSchema?: object;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string;
  extra?: { name: string; version: string };
}

export interface X402PaymentPayload {
  x402Version: number;
  scheme: string;
  network: string;
  payload: {
    signature: string;
    authorization: {
      from: string;
      to: string;
      value: string;
      validAfter: number;
      validBefore: number;
      nonce: string;
    };
  };
}

export interface X402VerificationResult {
  isValid: boolean;
  invalidReason?: string;
}

export interface X402SettlementResult {
  success: boolean;
  transactionHash?: string;
  network?: string;
  error?: string;
}

export interface X402PaymentRequiredResponse {
  x402Version: number;
  accepts: X402PaymentRequirements[];
  error?: string;
}

export class X402Service {
  private providers: Map<string, ethers.JsonRpcProvider> = new Map();

  constructor(private networks: Record<string, X402NetworkConfig>) {
    // Initialize providers for enabled networks
    for (const [networkName, config] of Object.entries(networks)) {
      if (config.enabled) {
        this.providers.set(
          networkName,
          new ethers.JsonRpcProvider(config.rpcUrl)
        );
      }
    }
  }

  /**
   * Generate CDP authentication headers for Coinbase API requests
   * Uses CDP API Key to create JWT token
   */
  private getCdpAuthHeaders(
    method: string,
    path: string
  ): Record<string, string> {
    if (!cdpApiKeyId || !cdpApiKeySecret) {
      logger.warn("CDP credentials not configured - facilitator calls will fail");
      return {};
    }

    try {
      // Create JWT header
      const header = {
        alg: "ES256",
        typ: "JWT",
        kid: cdpApiKeyId,
      };

      // Create JWT payload
      const now = Math.floor(Date.now() / 1000);
      const payload = {
        sub: cdpApiKeyId,
        iss: "cdp",
        nbf: now,
        exp: now + 60, // Token valid for 60 seconds
        aud: ["cdp_service"],
      };

      // Encode header and payload
      const encodedHeader = Buffer.from(JSON.stringify(header))
        .toString("base64url");
      const encodedPayload = Buffer.from(JSON.stringify(payload))
        .toString("base64url");

      // Create signature using ES256 (ECDSA with P-256 and SHA-256)
      const message = `${encodedHeader}.${encodedPayload}`;

      // Prepare the private key in PEM format
      let privateKeyPem = cdpApiKeySecret;

      // If the key doesn't start with PEM headers, it might be base64-encoded
      // Try to decode and wrap in PEM format
      if (!privateKeyPem.includes("-----BEGIN")) {
        try {
          // First, try to decode as base64 in case it's a base64-encoded PEM
          const decoded = Buffer.from(cdpApiKeySecret, "base64").toString("utf8");
          if (decoded.includes("-----BEGIN")) {
            // It was a base64-encoded PEM, use the decoded version
            privateKeyPem = decoded;
            logger.debug("Decoded base64-encoded PEM key");
          } else {
            // It's raw key bytes, wrap in PEM format
            // For EC P-256 private key, wrap in SEC1 format
            privateKeyPem = `-----BEGIN EC PRIVATE KEY-----\n${cdpApiKeySecret}\n-----END EC PRIVATE KEY-----`;
            logger.debug("Wrapped raw key in PEM format");
          }
        } catch (decodeError) {
          // If decode fails, try wrapping as-is
          privateKeyPem = `-----BEGIN EC PRIVATE KEY-----\n${cdpApiKeySecret}\n-----END EC PRIVATE KEY-----`;
          logger.debug("Failed to decode, wrapping as-is in PEM format");
        }
      }

      // Create signature
      const sign = crypto.createSign("SHA256");
      sign.update(message);
      sign.end();

      // Sign with the CDP API secret (PEM-formatted EC private key)
      const signature = sign.sign(
        {
          key: privateKeyPem,
          format: "pem",
          type: "sec1",
        },
        "base64url"
      );

      const jwt = `${message}.${signature}`;

      logger.debug("Generated CDP JWT token for facilitator auth", {
        keyId: cdpApiKeyId,
        method,
        path,
      });

      return {
        Authorization: `Bearer ${jwt}`,
      };
    } catch (error) {
      logger.error("Failed to generate CDP auth headers", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      return {};
    }
  }

  /**
   * Verify an x402 payment without settling it
   */
  async verifyPayment(
    paymentHeader: string,
    requirements: X402PaymentRequirements
  ): Promise<X402VerificationResult> {
    try {
      // Decode base64 payment header
      const paymentPayload: X402PaymentPayload = JSON.parse(
        Buffer.from(paymentHeader, "base64").toString("utf-8")
      );

      // Validate x402 version
      if (paymentPayload.x402Version !== 1) {
        return {
          isValid: false,
          invalidReason: `Unsupported x402 version: ${paymentPayload.x402Version}`,
        };
      }

      // Validate scheme
      if (paymentPayload.scheme !== requirements.scheme) {
        return {
          isValid: false,
          invalidReason: `Scheme mismatch: expected ${requirements.scheme}, got ${paymentPayload.scheme}`,
        };
      }

      // Validate network
      if (paymentPayload.network !== requirements.network) {
        return {
          isValid: false,
          invalidReason: `Network mismatch: expected ${requirements.network}, got ${paymentPayload.network}`,
        };
      }

      const { authorization, signature } = paymentPayload.payload;

      // Validate amount
      if (BigInt(authorization.value) < BigInt(requirements.maxAmountRequired)) {
        return {
          isValid: false,
          invalidReason: `Insufficient amount: ${authorization.value} < ${requirements.maxAmountRequired}`,
        };
      }

      // Validate recipient
      if (authorization.to.toLowerCase() !== requirements.payTo.toLowerCase()) {
        return {
          isValid: false,
          invalidReason: `Incorrect recipient: expected ${requirements.payTo}, got ${authorization.to}`,
        };
      }

      // Validate timeout
      const maxValidTime = Date.now() / 1000 + requirements.maxTimeoutSeconds;
      if (authorization.validBefore < maxValidTime) {
        return {
          isValid: false,
          invalidReason: "Payment authorization expires too soon",
        };
      }

      if (authorization.validBefore * 1000 < Date.now()) {
        return {
          isValid: false,
          invalidReason: "Payment authorization expired",
        };
      }

      // Verify EIP-712 signature
      const isValidSignature = await this.verifyEIP712Signature(
        authorization,
        signature,
        requirements
      );

      if (!isValidSignature) {
        return {
          isValid: false,
          invalidReason: "Invalid EIP-712 signature",
        };
      }

      // If facilitator URL provided, use it for additional verification
      const networkConfig = this.networks[paymentPayload.network];
      if (networkConfig?.facilitatorUrl) {
        const facilitatorResult = await this.verifyWithFacilitator(
          paymentHeader,
          requirements,
          networkConfig.facilitatorUrl
        );

        if (!facilitatorResult.isValid) {
          return facilitatorResult;
        }
      }

      logger.info("X402 payment verification successful", {
        network: paymentPayload.network,
        amount: authorization.value,
        from: authorization.from,
        to: authorization.to,
      });

      return { isValid: true };
    } catch (error) {
      logger.error("X402 payment verification failed", { error });
      return {
        isValid: false,
        invalidReason: error instanceof Error ? error.message : "Verification error",
      };
    }
  }

  /**
   * Settle an x402 payment on-chain
   */
  async settlePayment(
    paymentHeader: string,
    requirements: X402PaymentRequirements
  ): Promise<X402SettlementResult> {
    try {
      const paymentPayload: X402PaymentPayload = JSON.parse(
        Buffer.from(paymentHeader, "base64").toString("utf-8")
      );

      const networkConfig = this.networks[paymentPayload.network];

      if (!networkConfig) {
        return {
          success: false,
          error: `Unsupported network: ${paymentPayload.network}`,
        };
      }

      // If facilitator URL provided, use it for settlement
      if (networkConfig.facilitatorUrl) {
        logger.info("Settling x402 payment via facilitator", {
          network: paymentPayload.network,
          facilitator: networkConfig.facilitatorUrl,
        });

        // Ensure validAfter and validBefore are strings (facilitator expects strings)
        if (paymentPayload.payload?.authorization) {
          const auth = paymentPayload.payload.authorization as any;
          if (typeof auth.validAfter === "number") {
            auth.validAfter = auth.validAfter.toString();
          }
          if (typeof auth.validBefore === "number") {
            auth.validBefore = auth.validBefore.toString();
          }
        }

        // Generate CDP authentication headers if using Coinbase facilitator
        const cdpAuthHeaders = this.getCdpAuthHeaders("POST", "/settle");

        const response = await axios.post(
          `${networkConfig.facilitatorUrl}/settle`,
          {
            x402Version: 1,
            paymentPayload, // Send decoded and corrected payload
            paymentRequirements: requirements,
          },
          {
            headers: {
              "Content-Type": "application/json",
              ...cdpAuthHeaders,
            },
            timeout: 30000, // 30 second timeout
          }
        );

        if (response.status !== 200) {
          const error = response.data?.error || response.statusText;
          logger.error("Facilitator settlement failed", {
            status: response.status,
            error,
          });
          return { success: false, error };
        }

        const result = response.data;

        // Facilitator returns "transaction" field, not "transactionHash"
        const txHash = result.transaction || result.transactionHash;

        logger.info("X402 payment settled via facilitator", {
          txHash,
          network: paymentPayload.network,
        });

        // Check if transaction hash is present
        if (!txHash) {
          logger.warn("Facilitator did not return transaction hash", { result });
          return {
            success: false,
            error: "Facilitator settlement succeeded but did not return transaction hash",
          };
        }

        return {
          success: true,
          transactionHash: txHash,
          network: paymentPayload.network,
        };
      }

      // Otherwise, settle locally (requires wallet setup)
      logger.warn(
        "Local settlement not implemented - facilitator URL required",
        { network: paymentPayload.network }
      );
      return {
        success: false,
        error: "Local settlement not implemented - facilitator URL required",
      };
    } catch (error) {
      logger.error("X402 payment settlement failed", { error });
      return {
        success: false,
        error: error instanceof Error ? error.message : "Settlement error",
      };
    }
  }

  /**
   * Verify EIP-712 signature
   */
  private async verifyEIP712Signature(
    authorization: X402PaymentPayload["payload"]["authorization"],
    signature: string,
    requirements: X402PaymentRequirements
  ): Promise<boolean> {
    try {
      const networkConfig = this.networks[requirements.network];
      if (!networkConfig) {
        logger.error("Unknown network for signature verification", {
          network: requirements.network,
        });
        return false;
      }

      // EIP-712 domain for EIP-3009 transferWithAuthorization
      const domain = {
        name: requirements.extra?.name || "USD Coin",
        version: requirements.extra?.version || "2",
        chainId: networkConfig.chainId,
        verifyingContract: requirements.asset,
      };

      // EIP-712 types for transferWithAuthorization
      const types = {
        TransferWithAuthorization: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "value", type: "uint256" },
          { name: "validAfter", type: "uint256" },
          { name: "validBefore", type: "uint256" },
          { name: "nonce", type: "bytes32" },
        ],
      };

      // Recover signer from signature
      const recoveredAddress = ethers.verifyTypedData(
        domain,
        types,
        authorization,
        signature
      );

      // Check signer matches 'from' address
      const isValid =
        recoveredAddress.toLowerCase() === authorization.from.toLowerCase();

      logger.debug("EIP-712 signature verification", {
        authorization,
        signature,
        recoveredAddress,
        isValid,
      });

      return isValid;
    } catch (error) {
      logger.error("EIP-712 signature verification failed", { error });
      return false;
    }
  }

  /**
   * Verify payment using facilitator service
   */
  private async verifyWithFacilitator(
    paymentHeader: string,
    requirements: X402PaymentRequirements,
    facilitatorUrl: string
  ): Promise<X402VerificationResult> {
    try {
      // Decode the payment header to get the payload
      const paymentPayload = JSON.parse(
        Buffer.from(paymentHeader, "base64").toString("utf8")
      );

      // Ensure validAfter and validBefore are strings (facilitator expects strings)
      if (paymentPayload.payload?.authorization) {
        const auth = paymentPayload.payload.authorization as any;
        if (typeof auth.validAfter === "number") {
          auth.validAfter = auth.validAfter.toString();
        }
        if (typeof auth.validBefore === "number") {
          auth.validBefore = auth.validBefore.toString();
        }
      }

      // Generate CDP authentication headers if using Coinbase facilitator
      const cdpAuthHeaders = this.getCdpAuthHeaders("POST", "/verify");

      const response = await axios.post(
        `${facilitatorUrl}/verify`,
        {
          x402Version: 1,
          paymentPayload,
          paymentRequirements: requirements,
        },
        {
          headers: {
            "Content-Type": "application/json",
            ...cdpAuthHeaders,
          },
          timeout: 10000, // 10 second timeout
        }
      );

      if (response.status !== 200) {
        return {
          isValid: false,
          invalidReason: `Facilitator verification failed: ${response.statusText}`,
        };
      }

      return response.data;
    } catch (error) {
      // Log full error including response body for debugging
      const errorDetails: any = { error };
      if (error && typeof error === "object" && "response" in error) {
        const axiosError = error as any;
        errorDetails.responseStatus = axiosError.response?.status;
        errorDetails.responseData = axiosError.response?.data;
        errorDetails.responseHeaders = axiosError.response?.headers;
      }
      logger.error("Facilitator verification failed", errorDetails);

      return {
        isValid: false,
        invalidReason:
          error instanceof Error ? error.message : "Facilitator error",
      };
    }
  }

  /**
   * Get chain ID for a network
   */
  getChainId(network: string): number | undefined {
    return this.networks[network]?.chainId;
  }

  /**
   * Check if a network is enabled
   */
  isNetworkEnabled(network: string): boolean {
    return this.networks[network]?.enabled || false;
  }

  /**
   * Get all enabled networks
   */
  getEnabledNetworks(): string[] {
    return Object.entries(this.networks)
      .filter(([, config]) => config.enabled)
      .map(([name]) => name);
  }

  /**
   * Get network configuration
   */
  getNetworkConfig(network: string): X402NetworkConfig | undefined {
    return this.networks[network];
  }
}
