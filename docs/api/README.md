# API Reference

AR.IO Bundler exposes two REST APIs for data uploads and payment processing.

## API Endpoints

### Upload Service
**Base URL**: `http://localhost:3001`

The Upload Service handles data item uploads and bundle management.

#### Quick Reference

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/v1/tx` | POST | Upload signed data item |
| `/v1/tx/:id` | POST | Upload unsigned data item with signature |
| `/v1/tx/:id/status` | GET | Check data item status |
| `/v1/tx/:id/offset` | GET | Get data item offset information |
| `/v1/upload` | POST | Create multipart upload |
| `/v1/upload/:id/:chunk` | PUT | Upload chunk |
| `/v1/upload/:id` | POST | Finalize multipart upload |
| `/v1/upload/:id` | DELETE | Abort multipart upload |
| `/v1/upload/:id` | GET | Get upload status |
| `/v1/info` | GET | Service info and health |
| `/swagger` | GET | Swagger API documentation |

### Payment Service
**Base URL**: `http://localhost:4001`

The Payment Service manages user balances and payment processing.

#### Quick Reference

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/v1/balance` | GET | Get user balance |
| `/v1/balance/:token` | POST | Add pending crypto payment |
| `/v1/reserve-balance` | POST | Reserve balance for operation |
| `/v1/refund-balance` | POST | Refund reserved balance |
| `/v1/top-up/:currency` | POST | Create Stripe payment |
| `/v1/stripe-webhook` | POST | Stripe webhook handler |
| `/v1/redeem` | POST | Redeem promotional code |
| `/v1/price/:currency/:amount` | GET | Calculate storage price |
| `/v1/arns/price/:intent/:name` | GET | Get ArNS name price |
| `/v1/arns/purchase/:intent/:name` | POST | Purchase ArNS name |
| `/v1/arns/purchase/:nonce` | GET | Check purchase status |
| `/v1/account/approvals` | POST | Create payment approval |
| `/v1/account/approvals` | GET | List approvals |
| `/v1/account/approvals/:id` | DELETE | Revoke approval |
| `/v1/rates` | GET | Get conversion rates |
| `/v1/currencies` | GET | List supported currencies |
| `/v1/info` | GET | Service info and health |

## Detailed Documentation

For complete API documentation including request/response examples, authentication methods, and error handling, see:

**[Architecture Documentation - API Reference Section](../architecture/ARCHITECTURE.md#api-reference)**

## Interactive API Documentation

Both services provide Swagger UI for interactive API exploration:

- **Upload Service**: http://localhost:3001/swagger
- **Payment Service**: http://localhost:4001/swagger (if configured)

## Authentication

### Upload Service
- **Signature-based**: Data items must be signed with Arweave/Ethereum/Solana keys
- **JWT Tokens**: For internal service communication

### Payment Service
- **JWT Tokens**: User authentication
- **Signature Verification**: For crypto payment submissions
- **Stripe Webhooks**: HMAC signature verification

## Example Usage

### Upload a Data Item

```bash
# Using ArDrive CLI or similar tool
curl -X POST http://localhost:3001/v1/tx \
  -H "Content-Type: application/octet-stream" \
  --data-binary @data-item.bin
```

### Check Balance

```bash
curl http://localhost:4001/v1/balance \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Get Price Quote

```bash
curl "http://localhost:4001/v1/price/usd/1048576"
# Returns price for 1 MiB of storage
```

## Client Libraries

Compatible with Arweave ecosystem tools:
- **arbundles** - ANS-104 data item creation
- **@ardrive/turbo-sdk** - Upload client
- **arweave-js** - Arweave interactions

## Rate Limits

Currently no rate limits enforced. For production deployments, consider:
- Reverse proxy rate limiting (nginx/Caddy)
- API gateway integration
- Balance-based throttling

## Error Codes

Standard HTTP status codes:
- `200 OK` - Success
- `202 Accepted` - Async operation initiated
- `400 Bad Request` - Invalid request
- `401 Unauthorized` - Authentication required
- `402 Payment Required` - Insufficient balance
- `404 Not Found` - Resource not found
- `413 Payload Too Large` - Data item exceeds size limit
- `500 Internal Server Error` - Server error

## Support

For issues or questions:
- [Main Documentation](../README.md)
- [Architecture Guide](../architecture/ARCHITECTURE.md)
- [GitHub Issues](https://github.com/vilenarios/ar-io-bundler/issues)
