/**
 * Upload Statistics Query Functions
 *
 * Queries the upload_service database for:
 * - Total uploads (all time, today, this week)
 * - Unique uploaders
 * - Signature type distribution
 * - Top uploaders
 * - Recent uploads
 */

const uploadServicePath = require('path').join(__dirname, '../../../upload-service');
const { tableNames, columnNames } = require(uploadServicePath + '/lib/arch/db/dbConstants');

/**
 * Get comprehensive upload statistics
 * @param {object} db - Knex database connection (reader)
 * @returns {Promise<object>} Upload statistics
 */
async function getUploadStats(db) {
  try {
    // Run queries in parallel for performance
    const [allTimeStats, todayStats, weekStats, signatureTypeStats, topUploaders, recentUploads] =
      await Promise.all([
        getAllTimeStats(db),
        getTodayStats(db),
        getWeekStats(db),
        getSignatureTypeStats(db),
        getTopUploaders(db),
        getRecentUploads(db)
      ]);

    return {
      allTime: allTimeStats,
      today: todayStats,
      thisWeek: weekStats,
      bySignatureType: signatureTypeStats,
      topUploaders: topUploaders,
      recentUploads: recentUploads
    };
  } catch (error) {
    console.error('Failed to get upload stats:', error);
    throw error;
  }
}

/**
 * Get all-time upload statistics
 */
async function getAllTimeStats(db) {
  // Query planned_data_item for successfully processed uploads
  const result = await db(tableNames.plannedDataItem)
    .select(
      db.raw('COUNT(*) as total_uploads'),
      db.raw('COALESCE(SUM(CAST(byte_count AS BIGINT)), 0) as total_bytes'),
      db.raw('COUNT(DISTINCT owner_public_address) as unique_uploaders'),
      db.raw('COALESCE(AVG(CAST(byte_count AS BIGINT)), 0) as average_size')
    )
    .first();

  return {
    totalUploads: parseInt(result.total_uploads),
    totalBytes: result.total_bytes,
    totalBytesFormatted: formatBytes(result.total_bytes),
    uniqueUploaders: parseInt(result.unique_uploaders),
    averageSize: Math.round(result.average_size),
    averageSizeFormatted: formatBytes(Math.round(result.average_size))
  };
}

/**
 * Get today's upload statistics
 */
async function getTodayStats(db) {
  // Check both new_data_item (pending) and planned_data_item (today's completed)
  const [newResults, plannedResults] = await Promise.all([
    db(tableNames.newDataItem)
      .where(db.raw('DATE(uploaded_date)'), '=', db.raw('CURRENT_DATE'))
      .select(
        db.raw('COUNT(*) as total_uploads'),
        db.raw('COALESCE(SUM(CAST(byte_count AS BIGINT)), 0) as total_bytes'),
        db.raw('COUNT(DISTINCT owner_public_address) as unique_uploaders')
      )
      .first(),

    db(tableNames.plannedDataItem)
      .where(db.raw('DATE(planned_date)'), '=', db.raw('CURRENT_DATE'))
      .select(
        db.raw('COUNT(*) as total_uploads'),
        db.raw('COALESCE(SUM(CAST(byte_count AS BIGINT)), 0) as total_bytes'),
        db.raw('COUNT(DISTINCT owner_public_address) as unique_uploaders')
      )
      .first()
  ]);

  const totalUploads = parseInt(newResults.total_uploads) + parseInt(plannedResults.total_uploads);
  const totalBytes = BigInt(newResults.total_bytes) + BigInt(plannedResults.total_bytes);
  const uniqueUploaders = Math.max(
    parseInt(newResults.unique_uploaders),
    parseInt(plannedResults.unique_uploaders)
  );

  return {
    totalUploads,
    totalBytes: totalBytes.toString(),
    totalBytesFormatted: formatBytes(totalBytes.toString()),
    uniqueUploaders
  };
}

/**
 * Get this week's upload statistics
 */
async function getWeekStats(db) {
  const [newResults, plannedResults] = await Promise.all([
    db(tableNames.newDataItem)
      .where('uploaded_date', '>=', db.raw("CURRENT_DATE - INTERVAL '7 days'"))
      .select(
        db.raw('COUNT(*) as total_uploads'),
        db.raw('COALESCE(SUM(CAST(byte_count AS BIGINT)), 0) as total_bytes'),
        db.raw('COUNT(DISTINCT owner_public_address) as unique_uploaders')
      )
      .first(),

    db(tableNames.plannedDataItem)
      .where('planned_date', '>=', db.raw("CURRENT_DATE - INTERVAL '7 days'"))
      .select(
        db.raw('COUNT(*) as total_uploads'),
        db.raw('COALESCE(SUM(CAST(byte_count AS BIGINT)), 0) as total_bytes'),
        db.raw('COUNT(DISTINCT owner_public_address) as unique_uploaders')
      )
      .first()
  ]);

  const totalUploads = parseInt(newResults.total_uploads) + parseInt(plannedResults.total_uploads);
  const totalBytes = BigInt(newResults.total_bytes) + BigInt(plannedResults.total_bytes);
  const uniqueUploaders = Math.max(
    parseInt(newResults.unique_uploaders),
    parseInt(plannedResults.unique_uploaders)
  );

  return {
    totalUploads,
    totalBytes: totalBytes.toString(),
    totalBytesFormatted: formatBytes(totalBytes.toString()),
    uniqueUploaders
  };
}

/**
 * Get uploads by signature type with percentages
 */
async function getSignatureTypeStats(db) {
  const results = await db(tableNames.plannedDataItem)
    .select(
      'signature_type',
      db.raw('COUNT(*) as count'),
      db.raw('ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) as percentage')
    )
    .groupBy('signature_type')
    .orderBy('count', 'desc');

  // Map signature type numbers to readable names
  const signatureTypeNames = {
    1: 'Arweave',
    2: 'ED25519', // Solana
    3: 'Ethereum',
    4: 'Solana',
    5: 'Injective',
    6: 'Avalanche',
    7: 'BIP-137' // Bitcoin
  };

  const stats = {};
  results.forEach(row => {
    const typeName = signatureTypeNames[row.signature_type] || `Type ${row.signature_type}`;
    stats[typeName] = {
      count: parseInt(row.count),
      percentage: parseFloat(row.percentage),
      signatureType: row.signature_type
    };
  });

  return stats;
}

/**
 * Get top uploaders by upload count (last 30 days)
 */
async function getTopUploaders(db, limit = 10) {
  const results = await db(tableNames.plannedDataItem)
    .where('planned_date', '>=', db.raw("NOW() - INTERVAL '30 days'"))
    .select(
      'owner_public_address',
      db.raw('COUNT(*) as upload_count'),
      db.raw('COALESCE(SUM(CAST(byte_count AS BIGINT)), 0) as total_bytes')
    )
    .groupBy('owner_public_address')
    .orderBy('upload_count', 'desc')
    .limit(limit);

  return results.map(row => ({
    address: row.owner_public_address,
    uploadCount: parseInt(row.upload_count),
    totalBytes: row.total_bytes,
    totalBytesFormatted: formatBytes(row.total_bytes)
  }));
}

/**
 * Get recent uploads (last 50)
 */
async function getRecentUploads(db, limit = 50) {
  // Get from new_data_item (most recent, not yet bundled)
  const newUploads = await db(tableNames.newDataItem)
    .select(
      `${columnNames.dataItemId} as id`,
      'byte_count as size',
      'signature_type',
      'owner_public_address as owner',
      'uploaded_date as timestamp'
    )
    .orderBy('uploaded_date', 'desc')
    .limit(limit);

  // Also get recently planned items if we don't have enough
  const plannedUploads = newUploads.length < limit
    ? await db(tableNames.plannedDataItem)
        .select(
          `${columnNames.dataItemId} as id`,
          'byte_count as size',
          'signature_type',
          'owner_public_address as owner',
          'planned_date as timestamp'
        )
        .orderBy('planned_date', 'desc')
        .limit(limit - newUploads.length)
    : [];

  // Combine and sort by timestamp
  const combined = [...newUploads, ...plannedUploads]
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, limit);

  // Format results
  return combined.map(row => ({
    id: row.id,
    size: parseInt(row.size),
    sizeFormatted: formatBytes(row.size),
    signatureType: getSignatureTypeName(row.signature_type),
    owner: row.owner,
    timestamp: row.timestamp
  }));
}

/**
 * Helper: Get readable signature type name
 */
function getSignatureTypeName(type) {
  const names = {
    1: 'Arweave',
    2: 'Solana',
    3: 'Ethereum',
    4: 'Solana',
    5: 'Injective',
    6: 'Avalanche',
    7: 'Bitcoin'
  };
  return names[type] || `Type ${type}`;
}

/**
 * Helper: Format bytes to human-readable string
 */
function formatBytes(bytes) {
  const num = typeof bytes === 'string' ? parseFloat(bytes) : parseFloat(bytes || 0);
  if (num === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let value = num;

  while (value >= k && i < sizes.length - 1) {
    value = value / k;  // Regular number division preserves decimals
    i++;
  }

  return `${value.toFixed(2)} ${sizes[i]}`;
}

module.exports = {
  getUploadStats,
  getAllTimeStats,
  getTodayStats,
  getWeekStats,
  getSignatureTypeStats,
  getTopUploaders,
  getRecentUploads
};
