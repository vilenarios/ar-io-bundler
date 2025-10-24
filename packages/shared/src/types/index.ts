/**
 * Common types used across AR.IO Bundler services
 */

// Data item identifier (base64url, 43 characters)
export type DataItemId = string;

// User address (can be Arweave, Ethereum, Solana, etc.)
export type UserAddress = string;

// Destination address types
export type DestinationAddressType =
  | 'arweave'
  | 'ethereum'
  | 'solana'
  | 'ed25519'
  | 'kyve'
  | 'matic'
  | 'pol'
  | 'base-eth'
  | 'ario'
  | 'email';

// Payment token types
export type TokenType =
  | 'arweave'
  | 'ethereum'
  | 'solana'
  | 'kyve'
  | 'matic'
  | 'pol'
  | 'base-eth'
  | 'ario';

// JWT payload for inter-service communication
export interface ServiceJWTPayload {
  address: UserAddress;
  addressType?: DestinationAddressType;
  iat?: number;
  exp?: number;
}

// Common response types
export interface ErrorResponse {
  error: string;
  message: string;
  statusCode?: number;
}

export interface SuccessResponse<T = any> {
  success: true;
  data: T;
}

// Health check response
export interface HealthCheckResponse {
  status: 'ok' | 'degraded' | 'down';
  timestamp: number;
  uptime: number;
  version?: string;
}
