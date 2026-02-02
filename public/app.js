let currentPage = 1;
const limit = 20;

// On-demand PR scan
async function scanPR() {
  const repoInput = document.getElementById('repoInput');
  const prInput = document.getElementById('prInput');
  const statusDiv = document.getElementById('scanFormStatus');
  const scanBtn = document.getElementById('scanBtn');

  const repo = repoInput.value.trim();
  const pr = parseInt(prInput.value);

  if (!repo || !repo.includes('/')) {
    statusDiv.textContent = 'Please enter a valid repository (owner/repo)';
    statusDiv.className = 'form-status error';
    return;
  }

  if (!pr || pr < 1) {
    statusDiv.textContent = 'Please enter a valid PR number';
    statusDiv.className = 'form-status error';
    return;
  }

  // Disable button and show loading
  scanBtn.disabled = true;
  statusDiv.textContent = `Scanning ${repo} PR #${pr}... This may take a moment.`;
  statusDiv.className = 'form-status loading';

  try {
    const response = await fetch('/api/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo, pr }),
    });

    const data = await response.json();

    if (!response.ok) {
      statusDiv.textContent = data.error || 'Scan failed';
      statusDiv.className = 'form-status error';
      return;
    }

    // Success
    const findings = data.scan.findings.length;
    const risk = data.scan.overallRisk;
    statusDiv.textContent = `Scan complete! Found ${findings} issue(s). Risk: ${risk.toUpperCase()}`;
    statusDiv.className = 'form-status success';

    // Refresh stats and scans
    loadStats();
    loadScans(1);

    // Clear inputs
    repoInput.value = '';
    prInput.value = '';

  } catch (err) {
    console.error('Scan error:', err);
    statusDiv.textContent = 'Network error. Please try again.';
    statusDiv.className = 'form-status error';
  } finally {
    scanBtn.disabled = false;
  }
}

async function loadStats() {
  try {
    const response = await fetch('/api/stats');
    const stats = await response.json();

    document.getElementById('totalScans').textContent = stats.totalScans;
    document.getElementById('totalFindings').textContent = stats.totalFindings;
    document.getElementById('criticalHigh').textContent =
      stats.bySeverity.critical + stats.bySeverity.high;

    if (stats.lastScanAt) {
      const date = new Date(stats.lastScanAt);
      document.getElementById('lastScan').textContent = formatTimeAgo(date);
    } else {
      document.getElementById('lastScan').textContent = 'Never';
    }

    document.getElementById('criticalCount').textContent = stats.bySeverity.critical;
    document.getElementById('highCount').textContent = stats.bySeverity.high;
    document.getElementById('mediumCount').textContent = stats.bySeverity.medium;
    document.getElementById('lowCount').textContent = stats.bySeverity.low;
  } catch (err) {
    console.error('Error loading stats:', err);
  }
}

async function loadScans(page = 1) {
  currentPage = page;

  try {
    const response = await fetch(`/api/scans?page=${page}&limit=${limit}`);
    const data = await response.json();

    const tbody = document.getElementById('scanTableBody');

    if (data.scans.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="loading">No scans yet. Install the GitHub App to start scanning PRs.</td></tr>';
      return;
    }

    tbody.innerHTML = data.scans.map(scan => `
      <tr onclick="showScanDetail('${scan.id}')">
        <td class="repo-cell">
          <a href="https://github.com/${scan.owner}/${scan.repo}" target="_blank" onclick="event.stopPropagation()">
            ${scan.owner}/${scan.repo}
          </a>
        </td>
        <td>
          <a href="https://github.com/${scan.owner}/${scan.repo}/pull/${scan.pullNumber}" target="_blank" class="pr-number" onclick="event.stopPropagation()">
            #${scan.pullNumber}
          </a>
        </td>
        <td><span class="risk-badge risk-${scan.overallRisk}">${scan.overallRisk.toUpperCase()}</span></td>
        <td>${scan.findings.length}</td>
        <td>${scan.filesScanned}</td>
        <td>${formatTimeAgo(new Date(scan.scannedAt))}</td>
      </tr>
    `).join('');

    renderPagination(data.totalPages, page);
  } catch (err) {
    console.error('Error loading scans:', err);
    document.getElementById('scanTableBody').innerHTML =
      '<tr><td colspan="6" class="loading">Error loading scans</td></tr>';
  }
}

function renderPagination(totalPages, currentPage) {
  const container = document.getElementById('pagination');
  if (totalPages <= 1) {
    container.innerHTML = '';
    return;
  }

  let html = '';
  for (let i = 1; i <= totalPages; i++) {
    html += `<button class="${i === currentPage ? 'active' : ''}" onclick="loadScans(${i})">${i}</button>`;
  }
  container.innerHTML = html;
}

async function showScanDetail(id) {
  try {
    const response = await fetch(`/api/scans/${id}`);
    const scan = await response.json();

    const detail = document.getElementById('scanDetail');
    detail.innerHTML = `
      <div class="detail-header">
        <h2>${scan.owner}/${scan.repo} #${scan.pullNumber}</h2>
        <div class="detail-meta">
          <div><strong>Commit:</strong> ${scan.headSha.slice(0, 7)}</div>
          <div><strong>Risk:</strong> <span class="risk-badge risk-${scan.overallRisk}">${scan.overallRisk.toUpperCase()}</span></div>
          <div><strong>Files Scanned:</strong> ${scan.filesScanned}</div>
          <div><strong>Scanned:</strong> ${new Date(scan.scannedAt).toLocaleString()}</div>
        </div>
      </div>
      <div class="detail-findings">
        <h3>Findings (${scan.findings.length})</h3>
        ${scan.findings.length === 0 ? '<p style="color: #3fb950;">No security issues found!</p>' : ''}
        ${scan.findings.map(f => `
          <div class="finding-card">
            <div class="finding-card-header">
              <span class="finding-type">${escapeHtml(f.type)}</span>
              <span class="severity-badge ${f.severity}">${f.severity.toUpperCase()}</span>
            </div>
            <div class="finding-description">${escapeHtml(f.description)}</div>
            ${f.suggestion ? `<div class="finding-suggestion">${escapeHtml(f.suggestion)}</div>` : ''}
            <div class="finding-meta">
              ${f.file}:${f.line} | Confidence: ${Math.round(f.confidence * 100)}%
              ${f.cweId ? ` | ${f.cweId}` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    `;

    document.getElementById('scanModal').classList.add('active');
  } catch (err) {
    console.error('Error loading scan detail:', err);
  }
}

function closeModal() {
  document.getElementById('scanModal').classList.remove('active');
}

function formatTimeAgo(date) {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;

  return date.toLocaleDateString();
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Close modal on escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});

// Close modal on backdrop click
document.getElementById('scanModal').addEventListener('click', (e) => {
  if (e.target.id === 'scanModal') closeModal();
});

// Initial load
loadStats();
loadScans();

// Refresh every 30 seconds
setInterval(() => {
  loadStats();
  loadScans(currentPage);
}, 30000);
