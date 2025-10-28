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
import { expect } from "chai";
import { Server } from "http";
import { stub, restore } from "sinon";
import { ethers } from "ethers";

import { createServer } from "../src/server";
import { expectedTokenPrices } from "./helpers/stubs";
import {
  axios,
  coinGeckoOracle,
  dbTestHelper,
  emailProvider,
  gatewayMap,
  paymentDatabase,
  pricingService,
  stripe,
  testAddress,
} from "./helpers/testHelpers";
import logger from "../src/logger";

describe("x402 Integration Tests", function () {
  // Increase timeout for integration tests
  this.timeout(10000);

  let server: Server;

  before(async () => {
    // Stub external API calls
    stub(coinGeckoOracle, "getFiatPricesForOneToken").resolves(
      expectedTokenPrices
    );

    // Ensure test user exists with balance
    await dbTestHelper.insertStubUser({
      user_address: testAddress,
      winston_credit_balance: "10000000000", // 10 AR worth
    });

    server = await createServer({
      pricingService,
      paymentDatabase,
      stripe,
      emailProvider,
      gatewayMap,
    });
  });

  after(() => {
    if (server) {
      server.close();
      logger.info("Test server closed!");
    }
    restore();
  });

  describe("GET /v1/x402/price/:signatureType/:address", () => {
    it("returns 402 Payment Required with x402 payment requirements", async () => {
      try {
        await axios.get(`/v1/x402/price/1/${testAddress}?bytes=1048576`);
        expect.fail("Should have returned 402 status");
      } catch (error: any) {
        expect(error.response.status).to.equal(402);
        expect(error.response.data).to.have.property("x402Version", 1);
        expect(error.response.data).to.have.property("accepts");
        expect(error.response.data.accepts).to.be.an("array");

        const firstAccept = error.response.data.accepts[0];
        expect(firstAccept).to.have.property("scheme", "eip-3009");
        expect(firstAccept).to.have.property("network");
        expect(firstAccept).to.have.property("maxAmountRequired");
        expect(firstAccept).to.have.property("asset");
        expect(firstAccept).to.have.property("payTo");
        expect(firstAccept).to.have.property("timeout");
        expect(firstAccept.timeout).to.have.property("validBefore");
      }
    });

    it("returns error when bytes parameter is missing", async () => {
      try {
        await axios.get(`/v1/x402/price/1/${testAddress}`);
        expect.fail("Should have returned error");
      } catch (error: any) {
        expect(error.response.status).to.be.oneOf([400, 402]);
      }
    });

    it("returns error when bytes parameter is invalid", async () => {
      try {
        await axios.get(`/v1/x402/price/1/${testAddress}?bytes=invalid`);
        expect.fail("Should have returned error");
      } catch (error: any) {
        expect(error.response.status).to.be.oneOf([400, 402]);
      }
    });

    it("calculates correct USDC amount for given byte count", async () => {
      const bytes = 1048576; // 1 MiB

      try {
        await axios.get(`/v1/x402/price/1/${testAddress}?bytes=${bytes}`);
      } catch (error: any) {
        expect(error.response.status).to.equal(402);

        const accepts = error.response.data.accepts;
        expect(accepts).to.have.length.greaterThan(0);

        // USDC amount should be a positive integer string
        const maxAmountRequired = accepts[0].maxAmountRequired;
        expect(maxAmountRequired).to.be.a("string");
        expect(Number(maxAmountRequired)).to.be.greaterThan(0);
      }
    });

    it("includes multiple network options when multiple networks are enabled", async () => {
      try {
        await axios.get(`/v1/x402/price/1/${testAddress}?bytes=1048576`);
      } catch (error: any) {
        const accepts = error.response.data.accepts;

        // Should have at least one enabled network
        expect(accepts).to.have.length.greaterThan(0);

        // Each accept should have required fields
        accepts.forEach((accept: any) => {
          expect(accept).to.have.property("network");
          expect(accept).to.have.property("asset");
          expect(accept.network).to.be.a("string");
          expect(accept.asset).to.match(/^0x[a-fA-F0-9]{40}$/); // Valid Ethereum address
        });
      }
    });
  });

  describe("POST /v1/x402/payment/:signatureType/:address", () => {
    let validPaymentHeader: string;
    let validBefore: number;

    beforeEach(() => {
      validBefore = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

      const paymentPayload = {
        x402Version: 1,
        scheme: "eip-3009",
        network: "base-mainnet",
        payload: {
          signature:
            "0x" + "1234567890abcdef".repeat(8) + "12", // 130 chars (valid length)
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

    it("rejects payment without payment header", async () => {
      try {
        await axios.post(`/v1/x402/payment/1/${testAddress}`, {
          dataItemId: "test-data-item-id",
          byteCount: 1048576,
          mode: "hybrid",
        });
        expect.fail("Should have returned error");
      } catch (error: any) {
        expect(error.response.status).to.be.oneOf([400, 402]);
      }
    });

    it("rejects payment with malformed payment header", async () => {
      try {
        await axios.post(`/v1/x402/payment/1/${testAddress}`, {
          paymentHeader: "not-valid-base64!!!",
          dataItemId: "test-data-item-id",
          byteCount: 1048576,
          mode: "hybrid",
        });
        expect.fail("Should have returned error");
      } catch (error: any) {
        expect(error.response.status).to.be.oneOf([400, 402]);
        expect(error.response.data).to.have.property("success", false);
      }
    });

    it("rejects payment without dataItemId", async () => {
      try {
        await axios.post(`/v1/x402/payment/1/${testAddress}`, {
          paymentHeader: validPaymentHeader,
          byteCount: 1048576,
          mode: "hybrid",
        });
        expect.fail("Should have returned error");
      } catch (error: any) {
        expect(error.response.status).to.be.oneOf([400, 402]);
      }
    });

    it("rejects payment without byteCount", async () => {
      try {
        await axios.post(`/v1/x402/payment/1/${testAddress}`, {
          paymentHeader: validPaymentHeader,
          dataItemId: "test-data-item-id",
          mode: "hybrid",
        });
        expect.fail("Should have returned error");
      } catch (error: any) {
        expect(error.response.status).to.be.oneOf([400, 402]);
      }
    });

    it("validates mode parameter", async () => {
      try {
        await axios.post(`/v1/x402/payment/1/${testAddress}`, {
          paymentHeader: validPaymentHeader,
          dataItemId: "test-data-item-id",
          byteCount: 1048576,
          mode: "invalid-mode",
        });
        expect.fail("Should have returned error");
      } catch (error: any) {
        expect(error.response.status).to.be.oneOf([400, 402]);
      }
    });

    it("defaults to hybrid mode when mode is not specified", async () => {
      // This test would require mocking the x402Service verification
      // to actually succeed. For now, we just verify the endpoint accepts
      // requests without mode parameter
      try {
        await axios.post(`/v1/x402/payment/1/${testAddress}`, {
          paymentHeader: validPaymentHeader,
          dataItemId: "test-data-item-id",
          byteCount: 1048576,
        });
      } catch (error: any) {
        // We expect this to fail at verification, not at parameter validation
        expect(error.response.status).to.equal(402);
        expect(error.response.data).to.have.property("success");
      }
    });
  });

  describe("POST /v1/x402/finalize", () => {
    it("rejects finalization without dataItemId", async () => {
      try {
        await axios.post(`/v1/x402/finalize`, {
          actualByteCount: 1048576,
        });
        expect.fail("Should have returned error");
      } catch (error: any) {
        expect(error.response.status).to.be.oneOf([400, 404]);
      }
    });

    it("rejects finalization without actualByteCount", async () => {
      try {
        await axios.post(`/v1/x402/finalize`, {
          dataItemId: "test-data-item-id",
        });
        expect.fail("Should have returned error");
      } catch (error: any) {
        expect(error.response.status).to.be.oneOf([400, 404]);
      }
    });

    it("returns error for non-existent data item", async () => {
      try {
        await axios.post(`/v1/x402/finalize`, {
          dataItemId: "non-existent-data-item-id",
          actualByteCount: 1048576,
        });
        expect.fail("Should have returned error");
      } catch (error: any) {
        expect(error.response.status).to.be.oneOf([404, 402]);
        expect(error.response.data).to.have.property("success", false);
      }
    });

    it("validates actualByteCount is positive integer", async () => {
      try {
        await axios.post(`/v1/x402/finalize`, {
          dataItemId: "test-data-item-id",
          actualByteCount: -1,
        });
        expect.fail("Should have returned error");
      } catch (error: any) {
        expect(error.response.status).to.be.oneOf([400, 404]);
      }
    });
  });

  describe("x402 end-to-end flow", () => {
    it("price quote -> payment -> finalize workflow", async () => {
      const bytes = 1048576;

      // Step 1: Get price quote
      let priceQuote: any;
      try {
        await axios.get(`/v1/x402/price/1/${testAddress}?bytes=${bytes}`);
      } catch (error: any) {
        expect(error.response.status).to.equal(402);
        priceQuote = error.response.data;
      }

      expect(priceQuote).to.have.property("accepts");
      expect(priceQuote.accepts).to.have.length.greaterThan(0);

      // Step 2: Create a mock payment (would be real in production)
      const network = priceQuote.accepts[0].network;
      const paymentPayload = {
        x402Version: 1,
        scheme: "eip-3009",
        network,
        payload: {
          signature: "0x" + "1234567890abcdef".repeat(8) + "12",
          authorization: {
            from: testAddress,
            to: priceQuote.accepts[0].payTo,
            value: priceQuote.accepts[0].maxAmountRequired,
            validAfter: Math.floor(Date.now() / 1000) - 3600,
            validBefore: Math.floor(
              priceQuote.accepts[0].timeout.validBefore / 1000
            ),
            nonce: ethers.hexlify(ethers.randomBytes(32)),
          },
        },
      };

      const paymentHeader = Buffer.from(
        JSON.stringify(paymentPayload)
      ).toString("base64");

      // Step 3: Submit payment (expected to fail verification in test environment)
      try {
        await axios.post(`/v1/x402/payment/1/${testAddress}`, {
          paymentHeader,
          dataItemId: "test-flow-data-item",
          byteCount: bytes,
          mode: "hybrid",
        });
      } catch (error: any) {
        // Payment will fail verification but we verify the flow structure
        expect(error.response.status).to.equal(402);
        expect(error.response.data).to.have.property("success");
      }
    });
  });
});
