# @ar-io-bundler/shared

Shared code and utilities for AR.IO Bundler services.

## Contents

### Types (`src/types/`)

Common TypeScript types used across both payment and upload services:

- `DataItemId` - Data item identifiers
- `UserAddress` - User addresses (various blockchain types)
- `DestinationAddressType` - Supported address types
- `TokenType` - Payment token types
- `ServiceJWTPayload` - JWT payload for inter-service communication
- Response types: `ErrorResponse`, `SuccessResponse`, `HealthCheckResponse`

### Utils (`src/utils/`)

Common utility functions:

- `sleep(ms)` - Async sleep helper
- `retryWithBackoff(fn, options)` - Retry with exponential backoff
- `isValidBase64Url(str, length)` - Validate base64url strings
- `isValidDataItemId(id)` - Validate data item IDs
- `formatBytes(bytes, decimals)` - Human-readable byte formatting
- `randomHex(length)` - Generate random hex strings

### Constants (`src/constants/`)

Shared constants:

- Time constants (`MS_PER_SECOND`, `MS_PER_MINUTE`, etc.)
- Data item constants (`DATA_ITEM_ID_LENGTH`, `MAX_DATA_ITEM_SIZE`)
- HTTP status codes (`HTTP_STATUS`)
- Service names (`SERVICE_NAMES`)
- Environment types (`NodeEnv`, `NODE_ENVS`)

## Usage

```typescript
import {
  DataItemId,
  UserAddress,
  isValidDataItemId,
  formatBytes,
  HTTP_STATUS,
  MS_PER_MINUTE,
} from '@ar-io-bundler/shared';

// Use types
const dataItemId: DataItemId = 'abc123...';

// Use utilities
if (isValidDataItemId(dataItemId)) {
  console.log('Valid data item ID');
}

const size = formatBytes(1024 * 1024); // "1 MB"

// Use constants
const cacheTimeout = 5 * MS_PER_MINUTE;
```

## Building

```bash
yarn build
```

## Development

```bash
yarn dev  # Watch mode
```
