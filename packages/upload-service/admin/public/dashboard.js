/**
 * AR.IO Bundler Admin Dashboard - Client-Side Logic
 *
 * Handles:
 * - Fetching stats from /admin/stats API
 * - Updating UI with fresh data
 * - Creating Chart.js visualizations
 * - Manual refresh (no auto-refresh per user request)
 */

// Chart instances (global to allow updates)
let signatureChart = null;
let paymentModeChart = null;
let networkChart = null;

/**
 * Fetch stats from API and update dashboard
 */
async function fetchStats() {
  const refreshBtn = document.getElementById('refresh-btn');
  const refreshIcon = document.getElementById('refresh-icon');
  const loading = document.getElementById('loading');
  const error = document.getElementById('error');
  const dashboard = document.getElementById('dashboard');

  // Show loading state
  refreshBtn.classList.add('loading');
  refreshBtn.disabled = true;
  if (dashboard.style.display === 'none') {
    loading.style.display = 'block';
  }
  error.style.display = 'none';

  try {
    const response = await fetch('/admin/stats');

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const stats = await response.json();

    // Hide loading, show dashboard
    loading.style.display = 'none';
    dashboard.style.display = 'block';

    // Update all dashboard sections
    updateSystemHealth(stats.system);
    updateOverviewCards(stats);
    updateCharts(stats);
    updateQueueStatus(stats.system.queues);
    updateTopUploaders(stats.uploads.topUploaders);
    updateRecentUploads(stats.uploads.recentUploads);
    updateRecentPayments(stats.payments.recentPayments);

    // Update last refresh time
    updateLastRefresh(stats.timestamp, stats._cached, stats._cacheAge);

  } catch (err) {
    console.error('Failed to fetch stats:', err);

    // Show error banner
    loading.style.display = 'none';
    error.style.display = 'flex';
    document.getElementById('error-message').textContent = err.message;

  } finally {
    // Reset button state
    refreshBtn.classList.remove('loading');
    refreshBtn.disabled = false;
  }
}

/**
 * Update system health indicators
 */
function updateSystemHealth(health) {
  const grid = document.getElementById('health-grid');
  grid.innerHTML = '';

  // Services
  Object.entries(health.services || {}).forEach(([name, data]) => {
    const el = document.createElement('div');
    el.className = `health-item ${data.status}`;
    el.innerHTML = `
      <span class="health-icon">${data.status === 'healthy' ? '✅' : '❌'}</span>
      <div>
        <div class="health-name">${formatServiceName(name)}</div>
        <div class="health-meta">${data.uptime || 'Unknown'} | ${data.memory || '--'}</div>
      </div>
    `;
    grid.appendChild(el);
  });

  // Infrastructure
  Object.entries(health.infrastructure || {}).forEach(([name, data]) => {
    const el = document.createElement('div');
    el.className = `health-item ${data.status}`;
    el.innerHTML = `
      <span class="health-icon">${data.status === 'healthy' ? '✅' : '❌'}</span>
      <div>
        <div class="health-name">${formatServiceName(name)}</div>
        <div class="health-meta">${data.memoryUsed || data.connections ? `${data.connections || ''} ${data.memoryUsed || ''}`.trim() : 'Active'}</div>
      </div>
    `;
    grid.appendChild(el);
  });
}

/**
 * Update overview stat cards
 */
function updateOverviewCards(stats) {
  // Today's uploads
  document.getElementById('today-uploads').textContent =
    stats.uploads.today.totalUploads.toLocaleString();
  document.getElementById('today-bytes').textContent =
    stats.uploads.today.totalBytesFormatted;

  // All time uploads
  document.getElementById('total-uploads').textContent =
    stats.uploads.allTime.totalUploads.toLocaleString();
  document.getElementById('total-bytes').textContent =
    stats.uploads.allTime.totalBytesFormatted;

  // Unique users
  document.getElementById('unique-users').textContent =
    stats.uploads.allTime.uniqueUploaders.toLocaleString();
  document.getElementById('users-today').textContent =
    `${stats.uploads.today.uniqueUploaders} today`;

  // x402 payments
  document.getElementById('x402-total').textContent =
    `$${parseFloat(stats.payments.x402Payments.totalUSDC).toLocaleString()}`;
  document.getElementById('x402-count').textContent =
    `${stats.payments.x402Payments.totalCount.toLocaleString()} payments`;
}

/**
 * Update all Chart.js visualizations
 */
function updateCharts(stats) {
  updateSignatureChart(stats.uploads.bySignatureType);
  updatePaymentModeChart(stats.payments.x402Payments.byMode);
  updateNetworkChart(stats.payments.x402Payments.byNetwork);
}

/**
 * Update signature type distribution chart (Doughnut)
 */
function updateSignatureChart(byType) {
  const ctx = document.getElementById('signature-chart').getContext('2d');

  const data = Object.entries(byType).map(([type, data]) => ({
    label: type,
    value: data.count
  }));

  const chartData = {
    labels: data.map(d => d.label),
    datasets: [{
      data: data.map(d => d.value),
      backgroundColor: [
        '#3b82f6', // Blue (Ethereum)
        '#10b981', // Green (Arweave)
        '#f59e0b', // Amber (Solana)
        '#8b5cf6', // Purple
        '#ec4899', // Pink
      ],
      borderWidth: 2,
      borderColor: '#ffffff'
    }]
  };

  const config = {
    type: 'doughnut',
    data: chartData,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            padding: 16,
            font: { size: 13 }
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const label = context.label || '';
              const value = context.parsed || 0;
              const total = context.dataset.data.reduce((a, b) => a + b, 0);
              const percentage = ((value / total) * 100).toFixed(1);
              return `${label}: ${value.toLocaleString()} (${percentage}%)`;
            }
          }
        }
      }
    }
  };

  if (signatureChart) {
    signatureChart.destroy();
  }
  signatureChart = new Chart(ctx, config);
}

/**
 * Update payment mode distribution chart (Pie)
 */
function updatePaymentModeChart(byMode) {
  const ctx = document.getElementById('payment-mode-chart').getContext('2d');

  const data = Object.entries(byMode).map(([mode, data]) => ({
    label: mode.toUpperCase(),
    value: data.count
  }));

  if (data.length === 0) {
    data.push({ label: 'No Data', value: 1 });
  }

  const chartData = {
    labels: data.map(d => d.label),
    datasets: [{
      data: data.map(d => d.value),
      backgroundColor: [
        '#06b6d4', // Cyan (PAYG)
        '#8b5cf6', // Purple (TopUp)
        '#10b981', // Green (Hybrid)
      ],
      borderWidth: 2,
      borderColor: '#ffffff'
    }]
  };

  const config = {
    type: 'pie',
    data: chartData,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            padding: 16,
            font: { size: 13 }
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const label = context.label || '';
              const value = context.parsed || 0;
              return `${label}: ${value.toLocaleString()} payments`;
            }
          }
        }
      }
    }
  };

  if (paymentModeChart) {
    paymentModeChart.destroy();
  }
  paymentModeChart = new Chart(ctx, config);
}

/**
 * Update network distribution chart (Bar)
 */
function updateNetworkChart(byNetwork) {
  const ctx = document.getElementById('network-chart').getContext('2d');

  const data = Object.entries(byNetwork).map(([network, data]) => ({
    label: formatNetworkName(network),
    count: data.count,
    amount: parseFloat(data.amount)
  }));

  const chartData = {
    labels: data.map(d => d.label),
    datasets: [
      {
        label: 'Payment Count',
        data: data.map(d => d.count),
        backgroundColor: '#3b82f6',
        borderRadius: 6,
        yAxisID: 'y'
      },
      {
        label: 'Total USDC',
        data: data.map(d => d.amount),
        backgroundColor: '#10b981',
        borderRadius: 6,
        yAxisID: 'y1'
      }
    ]
  };

  const config = {
    type: 'bar',
    data: chartData,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          position: 'top',
          labels: {
            padding: 16,
            font: { size: 13 }
          }
        }
      },
      scales: {
        y: {
          type: 'linear',
          display: true,
          position: 'left',
          title: {
            display: true,
            text: 'Payment Count'
          }
        },
        y1: {
          type: 'linear',
          display: true,
          position: 'right',
          title: {
            display: true,
            text: 'Total USDC'
          },
          grid: {
            drawOnChartArea: false
          }
        }
      }
    }
  };

  if (networkChart) {
    networkChart.destroy();
  }
  networkChart = new Chart(ctx, config);
}

/**
 * Update queue status summary and grid
 */
function updateQueueStatus(queues) {
  // Summary
  const summary = document.getElementById('queue-summary');
  summary.innerHTML = `
    <div class="queue-stat">
      <div class="queue-stat-value">${queues.totalActive || 0}</div>
      <div class="queue-stat-label">Active</div>
    </div>
    <div class="queue-stat">
      <div class="queue-stat-value">${queues.totalWaiting || 0}</div>
      <div class="queue-stat-label">Waiting</div>
    </div>
    <div class="queue-stat">
      <div class="queue-stat-value">${queues.totalFailed || 0}</div>
      <div class="queue-stat-label">Failed</div>
    </div>
    <div class="queue-stat">
      <div class="queue-stat-value">${queues.totalDelayed || 0}</div>
      <div class="queue-stat-label">Delayed</div>
    </div>
  `;

  // Grid
  const grid = document.getElementById('queue-grid');
  grid.innerHTML = '';

  (queues.byQueue || []).forEach(q => {
    const el = document.createElement('div');
    el.className = 'queue-card';
    el.innerHTML = `
      <div class="queue-name">${q.name}</div>
      <div class="queue-stats">
        <span>
          <div class="value">${q.active}</div>
          <div class="label">Active</div>
        </span>
        <span>
          <div class="value">${q.waiting}</div>
          <div class="label">Waiting</div>
        </span>
        <span>
          <div class="value ${q.failed > 0 ? 'text-danger' : ''}">${q.failed}</div>
          <div class="label">Failed</div>
        </span>
      </div>
    `;
    grid.appendChild(el);
  });
}

/**
 * Update top uploaders table
 */
function updateTopUploaders(uploaders) {
  const table = document.getElementById('top-uploaders-table');

  if (uploaders.length === 0) {
    table.innerHTML = '<tr><td colspan="3" style="text-align: center; padding: 40px; color: var(--text-secondary);">No data available</td></tr>';
    return;
  }

  table.innerHTML = `
    <thead>
      <tr>
        <th>Address</th>
        <th style="text-align: right;">Upload Count</th>
        <th style="text-align: right;">Total Size</th>
      </tr>
    </thead>
    <tbody>
      ${uploaders.map(u => `
        <tr>
          <td><code>${truncateAddress(u.address)}</code></td>
          <td style="text-align: right;">${u.uploadCount.toLocaleString()}</td>
          <td style="text-align: right;">${u.totalBytesFormatted}</td>
        </tr>
      `).join('')}
    </tbody>
  `;
}

/**
 * Update recent uploads table
 */
function updateRecentUploads(uploads) {
  const table = document.getElementById('recent-uploads-table');

  if (uploads.length === 0) {
    table.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 40px; color: var(--text-secondary);">No recent uploads</td></tr>';
    return;
  }

  table.innerHTML = `
    <thead>
      <tr>
        <th>Data Item ID</th>
        <th>Size</th>
        <th>Signature Type</th>
        <th>Owner</th>
        <th>Time</th>
      </tr>
    </thead>
    <tbody>
      ${uploads.map(u => `
        <tr>
          <td><code>${truncateId(u.id)}</code></td>
          <td>${u.sizeFormatted}</td>
          <td>${u.signatureType}</td>
          <td><code>${truncateAddress(u.owner)}</code></td>
          <td>${formatTime(u.timestamp)}</td>
        </tr>
      `).join('')}
    </tbody>
  `;
}

/**
 * Update recent payments table
 */
function updateRecentPayments(payments) {
  const table = document.getElementById('recent-payments-table');

  if (payments.length === 0) {
    table.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 40px; color: var(--text-secondary);">No recent payments</td></tr>';
    return;
  }

  table.innerHTML = `
    <thead>
      <tr>
        <th>Payment ID</th>
        <th>Network</th>
        <th style="text-align: right;">Amount</th>
        <th>Mode</th>
        <th>Time</th>
      </tr>
    </thead>
    <tbody>
      ${payments.map(p => `
        <tr>
          <td><code>${truncateId(p.paymentId)}</code></td>
          <td>${formatNetworkName(p.network)}</td>
          <td style="text-align: right;">${p.amount}</td>
          <td><span class="badge">${p.mode.toUpperCase()}</span></td>
          <td>${formatTime(p.timestamp)}</td>
        </tr>
      `).join('')}
    </tbody>
  `;
}

/**
 * Update last refresh indicator
 */
function updateLastRefresh(timestamp, cached, cacheAge) {
  const indicator = document.getElementById('last-refresh');
  const now = new Date();
  const time = now.toLocaleTimeString();

  if (cached) {
    indicator.textContent = `${time} (cached ${cacheAge}s ago)`;
  } else {
    indicator.textContent = time;
  }
}

/**
 * Helper: Format service name
 */
function formatServiceName(name) {
  const names = {
    'payment-service': 'Payment API',
    'upload-api': 'Upload API',
    'upload-workers': 'Upload Workers',
    'payment-workers': 'Payment Workers',
    'bull-board': 'Admin Dashboard',
    'postgresUpload': 'PostgreSQL (Upload)',
    'postgresPayment': 'PostgreSQL (Payment)',
    'redisCache': 'Redis Cache',
    'redisQueues': 'Redis Queues',
    'minio': 'MinIO Object Storage'
  };
  return names[name] || name;
}

/**
 * Helper: Format network name
 */
function formatNetworkName(network) {
  const names = {
    'base-mainnet': 'Base Mainnet',
    'base-sepolia': 'Base Sepolia (Testnet)',
    'ethereum-mainnet': 'Ethereum Mainnet',
    'polygon-mainnet': 'Polygon Mainnet'
  };
  return names[network] || network;
}

/**
 * Helper: Truncate address for display
 */
function truncateAddress(address) {
  if (!address || address.length < 16) return address;
  return `${address.substring(0, 8)}...${address.substring(address.length - 6)}`;
}

/**
 * Helper: Truncate ID for display
 */
function truncateId(id) {
  if (!id || id.length < 16) return id;
  return `${id.substring(0, 12)}...`;
}

/**
 * Helper: Format timestamp to relative time
 */
function formatTime(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return `${seconds}s ago`;
}

// Initial load
fetchStats();
