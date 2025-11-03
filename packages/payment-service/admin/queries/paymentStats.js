/**
 * Payment Statistics Query Functions
 *
 * Queries the payment_service database for:
 * - x402 payment statistics (USDC payments)
 * - Top-up statistics
 * - Free upload usage (allowlist)
 * - Recent payments
 */

const { tableNames, columnNames } = require('../../lib/database/dbConstants');

/**
 * Get comprehensive payment statistics
 * @param {object} db - Knex database connection
 * @returns {Promise<object>} Payment statistics
 */
async function getPaymentStats(db) {
  try {
    const [x402Stats, topUpStats, freeUploads, recentPayments] = await Promise.all([
      getX402PaymentStats(db),
      getTopUpStats(db),
      getFreeUploadStats(db),
      getRecentPayments(db)
    ]);

    return {
      x402Payments: x402Stats,
      topUps: topUpStats,
      freeUploads: freeUploads,
      recentPayments: recentPayments
    };
  } catch (error) {
    console.error('Failed to get payment stats:', error);
    throw error;
  }
}

/**
 * Get x402 payment statistics
 */
async function getX402PaymentStats(db) {
  // Check if table exists first
  const tableExists = await db.schema.hasTable(tableNames.x402PaymentTransaction);

  if (!tableExists) {
    return {
      totalCount: 0,
      totalUSDC: "0.00",
      averagePayment: "0.00",
      byNetwork: {},
      byMode: {}
    };
  }

  // Get total stats
  const totalStats = await db(tableNames.x402PaymentTransaction)
    .select(
      db.raw('COUNT(*) as total_count'),
      db.raw('COALESCE(SUM(CAST(usdc_amount AS NUMERIC)), 0) as total_usdc'),
      db.raw('COALESCE(AVG(CAST(usdc_amount AS NUMERIC)), 0) as average_payment')
    )
    .first();

  // Get stats by network
  const byNetworkResults = await db(tableNames.x402PaymentTransaction)
    .select(
      'network',
      db.raw('COUNT(*) as count'),
      db.raw('COALESCE(SUM(CAST(usdc_amount AS NUMERIC)), 0) as total_amount')
    )
    .groupBy('network')
    .orderBy('count', 'desc');

  const byNetwork = {};
  byNetworkResults.forEach(row => {
    byNetwork[row.network] = {
      count: parseInt(row.count),
      amount: parseFloat(row.total_amount).toFixed(2)
    };
  });

  // Get stats by mode
  const byModeResults = await db(tableNames.x402PaymentTransaction)
    .select(
      'mode',
      db.raw('COUNT(*) as count'),
      db.raw('COALESCE(SUM(CAST(usdc_amount AS NUMERIC)), 0) as total_amount')
    )
    .groupBy('mode')
    .orderBy('count', 'desc');

  const byMode = {};
  byModeResults.forEach(row => {
    byMode[row.mode] = {
      count: parseInt(row.count),
      amount: parseFloat(row.total_amount).toFixed(2)
    };
  });

  return {
    totalCount: parseInt(totalStats.total_count),
    totalUSDC: parseFloat(totalStats.total_usdc).toFixed(2),
    averagePayment: parseFloat(totalStats.average_payment).toFixed(2),
    byNetwork,
    byMode
  };
}

/**
 * Get top-up statistics (from x402 payments where mode is 'topup' or 'hybrid')
 */
async function getTopUpStats(db) {
  const tableExists = await db.schema.hasTable(tableNames.x402PaymentTransaction);

  if (!tableExists) {
    return {
      totalCount: 0,
      totalUSDC: "0.00",
      averageTopUp: "0.00"
    };
  }

  const result = await db(tableNames.x402PaymentTransaction)
    .select(
      db.raw('COUNT(*) as total_count'),
      db.raw('COALESCE(SUM(CAST(usdc_amount AS NUMERIC)), 0) as total_usdc'),
      db.raw('COALESCE(AVG(CAST(usdc_amount AS NUMERIC)), 0) as average_topup')
    )
    .whereIn('mode', ['topup', 'hybrid'])
    .first();

  return {
    totalCount: parseInt(result.total_count),
    totalUSDC: parseFloat(result.total_usdc).toFixed(2),
    averageTopUp: parseFloat(result.average_topup).toFixed(2)
  };
}

/**
 * Get free upload statistics (from upload-service allowlist)
 * Note: This data comes from upload-service, not payment-service
 * For now, return placeholder data
 */
async function getFreeUploadStats(db) {
  // Free uploads are tracked by ALLOW_LISTED_ADDRESSES in upload service
  // We don't have direct access to that data from payment service
  // This would need to be queried from the upload service database
  return {
    count: 0,
    byAddress: []
  };
}

/**
 * Get recent x402 payments (last 50)
 */
async function getRecentPayments(db, limit = 50) {
  const tableExists = await db.schema.hasTable(tableNames.x402PaymentTransaction);

  if (!tableExists) {
    return [];
  }

  const results = await db(tableNames.x402PaymentTransaction)
    .select(
      'payment_id',
      'network',
      'usdc_amount',
      'mode',
      'created_date'
    )
    .orderBy('created_date', 'desc')
    .limit(limit);

  return results.map(row => ({
    paymentId: row.payment_id,
    network: row.network,
    amount: `${parseFloat(row.usdc_amount).toFixed(2)} USDC`,
    mode: row.mode,
    timestamp: row.created_date
  }));
}

module.exports = {
  getPaymentStats,
  getX402PaymentStats,
  getTopUpStats,
  getFreeUploadStats,
  getRecentPayments
};
