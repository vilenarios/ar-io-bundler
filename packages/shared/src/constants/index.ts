/**
 * Common constants used across services
 */

// Time constants
export const MS_PER_SECOND = 1000;
export const MS_PER_MINUTE = 60 * MS_PER_SECOND;
export const MS_PER_HOUR = 60 * MS_PER_MINUTE;
export const MS_PER_DAY = 24 * MS_PER_HOUR;

// Data item constants
export const DATA_ITEM_ID_LENGTH = 43;
export const MAX_DATA_ITEM_SIZE = 10 * 1024 * 1024 * 1024; // 10GB default

// HTTP status codes
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  INTERNAL_SERVER_ERROR: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
} as const;

// Service names
export const SERVICE_NAMES = {
  PAYMENT: 'payment-service',
  UPLOAD: 'upload-service',
} as const;

// Environment types
export type NodeEnv = 'development' | 'test' | 'production';

export const NODE_ENVS: Record<string, NodeEnv> = {
  DEVELOPMENT: 'development',
  TEST: 'test',
  PRODUCTION: 'production',
} as const;
