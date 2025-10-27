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
import { ArweaveSigner, createData } from "@dha-team/arbundles";
import axios from "axios";
import { expect } from "chai";
import { Server } from "http";
import { stub, restore } from "sinon";
import { ethers } from "ethers";

import { TurboPaymentService } from "../src/arch/payment";
import { octetStreamContentType } from "../src/constants";
import logger from "../src/logger";
import { createServer } from "../src/server";
import { W } from "../src/types/winston";
import { localTestUrl, testArweaveJWK } from "./test_helpers";

describe("x402 Upload Integration Tests", function () {
  // Increase timeout for integration tests
  this.timeout(10000);

  let server: Server;
  let paymentService: TurboPaymentService;
  let validPaymentHeader: string;

  before(async () => {
    paymentService = new TurboPaymentService({
      url: "http://localhost:4000", // Mock payment service URL
    });

    server = await createServer({
      getArweaveWallet: () => Promise.resolve(testArweaveJWK),
      paymentService,
    });

    // Create a valid x402 payment header
    const validBefore = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
    const paymentPayload = {
      x402Version: 1,
      scheme: "eip-3009",
      network: "base-mainnet",
      payload: {
        signature: "0x" + "1234567890abcdef".repeat(8) + "12",
        authorization: {
          from: "0x" + "abcd".repeat(10),
          to: "0x" + "1234".repeat(10),
          value: "1000000", // 1 USDC
          validAfter: Math.floor(Date.now() / 1000) - 3600,
          validBefore,
          nonce: ethers.hexlify(ethers.randomBytes(32)),
        },
      },
    };

    validPaymentHeader = Buffer.from(
      JSON.stringify(paymentPayload)
    ).toString("base64");
  });

  after(() => {
    if (server) {
      server.close();
      logger.info("Test server closed!");
    }
    restore();
  });

  describe("POST /v1/tx with X-PAYMENT header", () => {
    it("rejects upload without Content-Length when X-PAYMENT header is present", async () => {
      const signer = new ArweaveSigner(testArweaveJWK);
      const dataItem = createData("test data", signer);
      await dataItem.sign(signer);
      const dataItemBuffer = dataItem.getRaw();

      try {
        await axios.post(`${localTestUrl}/v1/tx`, dataItemBuffer, {
          headers: {
            "Content-Type": octetStreamContentType,
            "X-PAYMENT": validPaymentHeader,
            // Intentionally omitting Content-Length
          },
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
        });
        expect.fail("Should have rejected upload without Content-Length");
      } catch (error: any) {
        // Should reject due to missing Content-Length with x402
        expect(error.response.status).to.be.oneOf([400, 402]);
      }
    });

    it("processes X-PAYMENT header when present with Content-Length", async () => {
      // Stub payment service methods
      const verifyStub = stub(
        paymentService,
        "verifyAndSettleX402Payment"
      ).resolves({
        success: false, // Will fail but we verify it's called
        error: "Mock verification failed (expected in test)",
      });

      const signer = new ArweaveSigner(testArweaveJWK);
      const dataItem = createData("test data for x402", signer);
      await dataItem.sign(signer);
      const dataItemBuffer = dataItem.getRaw();

      try {
        await axios.post(`${localTestUrl}/v1/tx`, dataItemBuffer, {
          headers: {
            "Content-Type": octetStreamContentType,
            "Content-Length": dataItemBuffer.length.toString(),
            "X-PAYMENT": validPaymentHeader,
          },
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
        });
      } catch (error: any) {
        // Expected to fail due to mock verification returning false
        expect(error.response.status).to.equal(402);
      }

      // Verify that x402 payment verification was attempted
      expect(verifyStub.called).to.be.true;

      verifyStub.restore();
    });

    it("includes x402 payment info in receipt on successful upload", async () => {
      // Stub successful x402 payment
      const verifyStub = stub(
        paymentService,
        "verifyAndSettleX402Payment"
      ).resolves({
        success: true,
        paymentId: "test-payment-id",
        txHash: "0xabcd1234",
        network: "base-mainnet",
        mode: "hybrid",
        wincReserved: "1000000",
      });

      const finalizeStub = stub(
        paymentService,
        "finalizeX402Payment"
      ).resolves({
        success: true,
        status: "confirmed",
      });

      // Stub balance reservation to avoid payment service calls
      stub(paymentService, "reserveBalanceForData").resolves({
        isReserved: true,
        costOfDataItem: W(0),
        walletExists: true,
      });

      const signer = new ArweaveSigner(testArweaveJWK);
      const dataItem = createData("test data for receipt", signer);
      await dataItem.sign(signer);
      const dataItemBuffer = dataItem.getRaw();

      try {
        const response = await axios.post(`${localTestUrl}/v1/tx`, dataItemBuffer, {
          headers: {
            "Content-Type": octetStreamContentType,
            "Content-Length": dataItemBuffer.length.toString(),
            "X-PAYMENT": validPaymentHeader,
          },
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
        });

        // Should succeed with x402 payment
        expect(response.status).to.equal(200);
        expect(response.data).to.have.property("id");
        expect(response.data).to.have.property("x402Payment");

        const x402Payment = response.data.x402Payment;
        expect(x402Payment).to.have.property("paymentId", "test-payment-id");
        expect(x402Payment).to.have.property("txHash", "0xabcd1234");
        expect(x402Payment).to.have.property("network", "base-mainnet");
        expect(x402Payment).to.have.property("mode", "hybrid");
      } catch (error: any) {
        // Log error for debugging
        logger.error("Test failed", { error: error.response?.data || error.message });
        throw error;
      } finally {
        verifyStub.restore();
        finalizeStub.restore();
      }
    });

    it("falls back to traditional balance check when X-PAYMENT header is not present", async () => {
      const checkBalanceStub = stub(
        paymentService,
        "checkBalanceForData"
      ).resolves({
        userHasSufficientBalance: false, // Will fail but we verify it's called
        bytesCostInWinc: "100000",
        userBalanceInWinc: "0",
        userAddress: "test-address",
      });

      const signer = new ArweaveSigner(testArweaveJWK);
      const dataItem = createData("test data without x402", signer);
      await dataItem.sign(signer);
      const dataItemBuffer = dataItem.getRaw();

      try {
        await axios.post(`${localTestUrl}/v1/tx`, dataItemBuffer, {
          headers: {
            "Content-Type": octetStreamContentType,
            "Content-Length": dataItemBuffer.length.toString(),
            // No X-PAYMENT header
          },
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
        });
      } catch (error: any) {
        // Expected to fail due to insufficient balance
        expect(error.response.status).to.equal(402);
      }

      // Verify traditional balance check was used, not x402
      expect(checkBalanceStub.called).to.be.true;

      checkBalanceStub.restore();
    });
  });

  describe("Fraud detection in x402 finalization", () => {
    it("rejects upload when declared size significantly differs from actual size", async () => {
      // Stub x402 verification to succeed
      const verifyStub = stub(
        paymentService,
        "verifyAndSettleX402Payment"
      ).resolves({
        success: true,
        paymentId: "fraud-test-payment",
        txHash: "0xabcd1234",
        network: "base-mainnet",
        mode: "hybrid",
      });

      // Stub finalization to detect fraud
      const finalizeStub = stub(
        paymentService,
        "finalizeX402Payment"
      ).resolves({
        success: true,
        status: "fraud_penalty", // Fraud detected!
      });

      const signer = new ArweaveSigner(testArweaveJWK);
      const dataItem = createData("actual upload data", signer);
      await dataItem.sign(signer);
      const dataItemBuffer = dataItem.getRaw();

      try {
        await axios.post(`${localTestUrl}/v1/tx`, dataItemBuffer, {
          headers: {
            "Content-Type": octetStreamContentType,
            "Content-Length": "100", // Declared 100 bytes
            "X-PAYMENT": validPaymentHeader,
          },
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
        });
        expect.fail("Should have rejected fraudulent upload");
      } catch (error: any) {
        expect(error.response.status).to.equal(402);
        expect(error.response.data.error).to.include("fraud");
      } finally {
        verifyStub.restore();
        finalizeStub.restore();
      }
    });
  });
});
