# AR.IO Bundler Fee Configuration - Quick Start

## Current Status

Your bundler pricing is currently configured as follows:

### Base Pricing
- **Local Gateway Price** (1MB): 2,666,015,245 Winston
- **Payment Service Quote** (1MB): 2,534,751,407 Winston
- **Effective Rate**: ~95% of gateway price

### Current Fees in Database

Run this to see your current fee configuration:

```bash
docker exec ar-io-bundler-postgres psql -U turbo_admin -d payment_service -c \
  "SELECT adjustment_name, operator, operator_magnitude, 
   to_char(adjustment_start_date, 'YYYY-MM-DD') as start_date,
   to_char(adjustment_end_date, 'YYYY-MM-DD') as end_date
   FROM payment_adjustment_catalog 
   WHERE adjustment_end_date IS NULL 
   ORDER BY adjustment_start_date DESC;"
```

**Current Active Fees:**
- Turbo Infrastructure Fee: `multiply 0.766` (users pay 76.6% of cost) ❌ **YOU LOSE MONEY**
- Kyve Infrastructure Fee: `multiply 0.5` (users pay 50% for KYVE tokens)

## ⚠️ Important: You're Currently Operating at a Loss

With `multiply 0.766`, you're subsidizing uploads:
- **You collect**: 76.6% of the cost from users
- **You pay**: 100% of the cost to Arweave
- **Your loss**: 23.4% on every upload

**This is NOT sustainable for a self-hosted bundler!**

## Recommended: Set Profitable Fees

### Option 1: Quick Fix (15% Profit)

```bash
docker exec -i ar-io-bundler-postgres psql -U turbo_admin -d payment_service << 'SQL'
-- Disable old fees
UPDATE payment_adjustment_catalog
SET adjustment_end_date = NOW()
WHERE adjustment_end_date IS NULL;

-- Add profitable fee
INSERT INTO payment_adjustment_catalog (
  catalog_id,
  adjustment_name,
  adjustment_description,
  operator,
  operator_magnitude,
  adjustment_exclusivity,
  adjustment_priority,
  adjustment_start_date
) VALUES (
  gen_random_uuid(),
  'AR.IO Bundler Service Fee',
  'Infrastructure and operational costs (15% markup)',
  'multiply',
  '1.15',
  'inclusive',
  500,
  NOW()
);
SQL
```

After applying, **restart services**:
```bash
./scripts/restart.sh
```

### Option 2: Break-Even (No Profit/Loss)

```bash
docker exec -i ar-io-bundler-postgres psql -U turbo_admin -d payment_service << 'SQL'
UPDATE payment_adjustment_catalog
SET adjustment_end_date = NOW()
WHERE adjustment_end_date IS NULL;

INSERT INTO payment_adjustment_catalog (
  catalog_id,
  adjustment_name,
  adjustment_description,
  operator,
  operator_magnitude,
  adjustment_exclusivity,
  adjustment_priority,
  adjustment_start_date
) VALUES (
  gen_random_uuid(),
  'AR.IO Bundler Pass-Through',
  'Pass-through pricing at network cost',
  'multiply',
  '1.00',
  'inclusive',
  500,
  NOW()
);
SQL
```

## How Fees Work

### Fee Application

Fees are applied to:
- ✅ Credit card payments (Stripe top-ups)
- ✅ Cryptocurrency payments (AR, ETH, SOL, etc.)
- ✅ x402 USDC payments
- ✅ Balance-based uploads

### Fee Structure

The `payment_adjustment_catalog` table stores fee configurations:

| Field | Purpose |
|-------|---------|
| `adjustment_name` | Display name for the fee |
| `operator` | How to apply: `multiply`, `add`, or `subtract` |
| `operator_magnitude` | Amount/multiplier |
| `adjustment_exclusivity` | `inclusive` (in price) or `exclusive` (added on top) |
| `adjustment_start_date` | When fee becomes active |
| `adjustment_end_date` | When fee expires (NULL = active) |

### Operator Examples

| Operator | Magnitude | User Pays | Your Profit |
|----------|-----------|-----------|-------------|
| multiply | 1.50 | 150% of cost | +50% profit |
| multiply | 1.30 | 130% of cost | +30% profit |
| multiply | 1.20 | 120% of cost | +20% profit |
| multiply | 1.15 | 115% of cost | +15% profit ✅ |
| multiply | 1.00 | 100% of cost | Break-even |
| multiply | 0.80 | 80% of cost | -20% loss |
| multiply | 0.766 | 76.6% of cost | -23.4% loss ❌ |

## Subsidization (Optional)

Additionally, you can subsidize users via environment variable:

**File**: `.env` (both services)

```bash
# Winc Subsidization (optional, default: 0)
SUBSIDIZED_WINC_PERCENTAGE=0   # 0% discount
# SUBSIDIZED_WINC_PERCENTAGE=10  # 10% discount for users
# SUBSIDIZED_WINC_PERCENTAGE=50  # 50% discount (you pay half!)
```

**Note**: This provides a discount ON TOP of the database fees. Restart required after changing.

## Testing Your Fee Configuration

After changing fees:

```bash
# Restart services
./scripts/restart.sh

# Test pricing for 1MB upload
curl "http://localhost:4001/v1/price/bytes/1000000"

# Test crypto payment pricing
curl "http://localhost:4001/v1/price/arweave/1000000"

# Test x402 payment (shows USDC amount)
curl "http://localhost:4001/v1/x402/price/1/YOUR_ADDRESS?bytes=1000000"
```

## Financial Impact Examples

### Current (Losing Money)

**1GB upload:**
- Gateway base cost: 2,666,015 Winston
- User pays (multiply 0.766): 2,042,367 Winston
- Your loss: -623,648 Winston (-23.4%)

At $10/AR, you lose **$0.006** per GB. At 1TB/month, you lose **$6,000/month**!

### With 15% Fee (Profitable)

**1GB upload:**
- Gateway base cost: 2,666,015 Winston
- User pays (multiply 1.15): 3,065,917 Winston
- Your profit: +399,902 Winston (+15%)

At $10/AR, you profit **$0.004** per GB. At 1TB/month, you profit **$4,000/month**!

### Break-Even

**1GB upload:**
- Gateway base cost: 2,666,015 Winston
- User pays (multiply 1.00): 2,666,015 Winston
- Your profit/loss: 0 (break-even)

Cover only Arweave network costs, no profit on storage. Good for community services.

## Recommended Fee Tiers

### Community Bundler
- Fee: `multiply 1.00` (break-even)
- Subsidy: `SUBSIDIZED_WINC_PERCENTAGE=0`
- **Result**: Cover costs only

### Standard Bundler
- Fee: `multiply 1.10` (10% markup)
- Subsidy: `SUBSIDIZED_WINC_PERCENTAGE=0`
- **Result**: 10% profit to cover operations

### Professional Bundler
- Fee: `multiply 1.15` (15% markup)
- Subsidy: `SUBSIDIZED_WINC_PERCENTAGE=0`
- **Result**: 15% profit for service + support

### Premium Bundler
- Fee: `multiply 1.30` (30% markup)
- Subsidy: `SUBSIDIZED_WINC_PERCENTAGE=0`
- **Result**: 30% profit for SLA + priority support

## Next Steps

1. **Review current fees**: Run the SQL query above
2. **Choose your model**: Community, Standard, Professional, or Premium
3. **Update fees**: Run the appropriate SQL command
4. **Restart services**: `./scripts/restart.sh`
5. **Test pricing**: Verify fees are applied correctly
6. **Monitor revenue**: Track actual costs vs. revenue

## Full Documentation

For complete details, see [FEE_CONFIGURATION_GUIDE.md](./FEE_CONFIGURATION_GUIDE.md)

---

**Action Required**: Your current `multiply 0.766` configuration operates at a **23.4% loss**. Update to at least `multiply 1.00` (break-even) or `multiply 1.15` (15% profit) for sustainable operation.
