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
// import cors from "@koa/cors"; // CORS handled by nginx
import Koa, { DefaultState, Next, ParameterizedContext } from "koa";
import bodyParser from "koa-bodyparser";
import jwt from "koa-jwt";
import Stripe from "stripe";
import { Logger } from "winston";

import { Architecture } from "./architecture";
import {
  TEST_PRIVATE_ROUTE_SECRET,
  defaultPort,
  isGiftingEnabled,
  migrateOnStartup,
  x402Networks,
} from "./constants";
import { PostgresDatabase } from "./database/postgres";
import { MandrillEmailProvider } from "./emailProvider";
import {
  ArweaveGateway,
  EthereumGateway,
  GatewayMap,
  KyveGateway,
  MaticGateway,
  SolanaGateway,
} from "./gateway";
import { ARIOGateway } from "./gateway/ario";
import { BaseEthGateway } from "./gateway/base-eth";
import logger from "./logger";
import { MetricRegistry } from "./metricRegistry";
import { architectureMiddleware, loggerMiddleware } from "./middleware";
import { TurboPricingService } from "./pricing/pricing";
import router from "./router";
import { JWKInterface } from "./types/jwkTypes";
import { loadSecretsToEnv } from "./utils/loadSecretsToEnv";
import { X402Service } from "./x402/x402Service";

type KoaState = DefaultState & Architecture & { logger: Logger };
export type KoaContext = ParameterizedContext<KoaState>;

logger.info(`Starting server with node environment ${process.env.NODE_ENV}...`);

process.on("uncaughtException", (error) => {
  MetricRegistry.uncaughtExceptionCounter.inc();
  logger.error("Uncaught exception:", error);
});

process.on("SIGTERM", () => {
  logger.info("SIGTERM received, exiting...");
  process.exit(0);
});

process.on("SIGINT", () => {
  logger.info("SIGINT received, exiting...");
  process.exit(0);
});

export async function createServer(
  arch: Partial<Architecture>,
  port: number = defaultPort
) {
  const app = new Koa();

  await loadSecretsToEnv();
  const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
  const MANDRILL_API_KEY = process.env.MANDRILL_API_KEY;
  const sharedSecret =
    process.env.PRIVATE_ROUTE_SECRET ?? TEST_PRIVATE_ROUTE_SECRET;

  if (!sharedSecret) {
    throw new Error("Shared secret not set");
  }
  if (!STRIPE_SECRET_KEY) {
    throw new Error("Stripe secret key or webhook secret not set");
  }

  app.use(loggerMiddleware);

  // CORS handled by nginx reverse proxy
  // app.use(cors({ allowMethods: ["GET", "POST"] }));

  // Middleware to fix Content-Type mismatch from turbo-sdk
  // SDK sometimes sends JSON body with form-urlencoded Content-Type
  // This must run BEFORE bodyParser
  app.use(async (ctx, next) => {
    const contentType = ctx.request.header['content-type'] || '';

    // Only intercept form-urlencoded requests
    if (contentType.includes('application/x-www-form-urlencoded') && ctx.method === 'POST') {
      try {
        const getRawBody = (await import('raw-body')).default;
        const rawBody = await getRawBody(ctx.req, {
          length: ctx.request.length,
          limit: '10mb',
          encoding: 'utf8',
        });

        // Check if body looks like JSON
        const trimmed = rawBody.trim();
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
          // Parse as JSON manually and set it on ctx.request
          try {
            (ctx.request as any).body = JSON.parse(trimmed);
            logger.debug('Fixed Content-Type mismatch: parsed JSON from form-urlencoded', {
              bodyPreview: trimmed.substring(0, 100)
            });
            // Skip bodyParser by setting body
            return await next();
          } catch (e) {
            // Not valid JSON, let bodyParser handle it
            logger.warn('Body looks like JSON but failed to parse', { error: e });
          }
        }

        // Not JSON, parse as form data using qs
        const qs = await import('qs');
        (ctx.request as any).body = qs.default.parse(trimmed);
        return await next();
      } catch (error) {
        logger.error('Error in Content-Type fix middleware', { error });
        // Fall through to bodyParser
      }
    }

    await next();
  });

  // Support both JSON and form-urlencoded request bodies
  app.use(bodyParser({
    enableTypes: ['json', 'form', 'text'],
    formLimit: '10mb',
    jsonLimit: '10mb',
    textLimit: '10mb',
  }));

  // NOTE: Middleware that use the JWT must handle ctx.state.user being undefined and throw
  // an error if the user is not authenticated
  app.use(jwt({ secret: sharedSecret, passthrough: true }));

  const pricingService = arch.pricingService ?? new TurboPricingService();
  const paymentDatabase =
    arch.paymentDatabase ?? new PostgresDatabase({ migrate: migrateOnStartup });
  const stripe =
    arch.stripe ?? new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2023-10-16" });

  const jwk: JWKInterface =
    process.env.ARIO_SIGNING_JWK !== undefined
      ? JSON.parse(process.env.ARIO_SIGNING_JWK)
      : undefined;

  const gatewayMap: GatewayMap = arch.gatewayMap ?? {
    arweave: new ArweaveGateway(),
    ario: new ARIOGateway({ jwk, logger }),
    ethereum: new EthereumGateway(),
    solana: new SolanaGateway(),
    ed25519: new SolanaGateway(),
    kyve: new KyveGateway(),
    matic: new MaticGateway(),
    pol: new MaticGateway(),
    "base-eth": new BaseEthGateway(),
  };

  const emailProvider = (() => {
    if (!isGiftingEnabled) {
      return undefined;
    }
    if (arch.emailProvider) {
      return arch.emailProvider;
    }
    if (!MANDRILL_API_KEY) {
      throw new Error(
        "MANDRILL_API_KEY environment variable is not set! Please set the key and restart the server or set GIFTING_ENABLED=false to disable gifting by email on top ups flow."
      );
    }
    return new MandrillEmailProvider(MANDRILL_API_KEY, logger);
  })();

  const x402Service = arch.x402Service ?? new X402Service(x402Networks);

  app.use((ctx: KoaContext, next: Next) =>
    architectureMiddleware(ctx, next, {
      pricingService,
      paymentDatabase,
      stripe,
      emailProvider,
      gatewayMap,
      x402Service,
    })
  );

  app.use(router.routes());

  // Bind to 0.0.0.0 to accept connections from nginx proxy on separate server
  const server = app.listen(port, '0.0.0.0');
  server.keepAliveTimeout = 120_000; // intentionally longer than the ALB timeout
  server.requestTimeout = 120_000; // no requests should take longer than 2 minutes

  logger.info(`Listening on port ${port}...`);
  return server;
}
