import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getStats, listScans, getScanById, getNotableFindings, getRepos, saveScan, ScanReport } from '../services/storage';
import { analyzeFiles } from '../services/analyzer';
import { PullRequestFile } from '../types';

const router = Router();

// Fetch PR files from GitHub public API (no auth needed for public repos)
async function fetchPRFiles(owner: string, repo: string, prNumber: number): Promise<{
  files: PullRequestFile[];
  headSha: string;
} | null> {
  try {
    // Get PR info
    const prResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`,
      {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'SecureShip-Scanner',
        },
      }
    );

    if (!prResponse.ok) {
      console.error(`GitHub API error: ${prResponse.status} ${prResponse.statusText}`);
      return null;
    }

    const prData = await prResponse.json() as { head: { sha: string } };
    const headSha = prData.head.sha;

    // Get PR files
    const filesResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/files`,
      {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'SecureShip-Scanner',
        },
      }
    );

    if (!filesResponse.ok) {
      console.error(`GitHub API error: ${filesResponse.status} ${filesResponse.statusText}`);
      return null;
    }

    const filesData = await filesResponse.json() as Array<{
      filename: string;
      status: string;
      patch?: string;
      additions: number;
      deletions: number;
    }>;

    const files: PullRequestFile[] = filesData.map(f => ({
      filename: f.filename,
      status: f.status,
      patch: f.patch,
      additions: f.additions,
      deletions: f.deletions,
    }));

    return { files, headSha };
  } catch (error) {
    console.error('Error fetching PR files:', error);
    return null;
  }
}

// Health check
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'secureship' });
});

// Dashboard statistics
router.get('/stats', (_req, res) => {
  const stats = getStats();
  res.json(stats);
});

// List scans (paginated)
router.get('/scans', (req, res) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
  const repo = req.query.repo as string | undefined;
  const sortBy = req.query.sortBy as string || 'scannedAt';
  const order = req.query.order as string || 'desc';

  const result = listScans({ page, limit, repo, sortBy, order });

  res.json({
    scans: result.scans,
    total: result.total,
    page,
    limit,
    totalPages: Math.ceil(result.total / limit),
  });
});

// Get single scan by ID
router.get('/scans/:id', (req, res) => {
  const scan = getScanById(req.params.id);
  if (!scan) {
    res.status(404).json({ error: 'Scan not found' });
    return;
  }
  res.json(scan);
});

// Notable findings (critical and high severity)
router.get('/notable', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
  const notable = getNotableFindings(limit);

  const formatted = notable.map(({ scan, finding }) => ({
    scanId: scan.id,
    owner: scan.owner,
    repo: scan.repo,
    pullNumber: scan.pullNumber,
    scannedAt: scan.scannedAt,
    finding: {
      type: finding.type,
      severity: finding.severity,
      file: finding.file,
      line: finding.line,
      description: finding.description,
      suggestion: finding.suggestion,
      confidence: finding.confidence,
      cweId: finding.cweId,
    }
  }));

  res.json({
    total: notable.length,
    findings: formatted,
  });
});

// Get list of repos
router.get('/repos', (_req, res) => {
  const repos = getRepos();
  res.json({ repos });
});

// On-demand PR scan (public repos only)
router.post('/scan', async (req, res) => {
  const { repo, pr } = req.body;

  // Validate input
  if (!repo || typeof repo !== 'string') {
    res.status(400).json({ error: 'Missing or invalid "repo" (format: owner/repo)' });
    return;
  }

  if (!pr || typeof pr !== 'number') {
    res.status(400).json({ error: 'Missing or invalid "pr" (PR number)' });
    return;
  }

  // Parse owner/repo
  const repoParts = repo.split('/');
  if (repoParts.length !== 2) {
    res.status(400).json({ error: 'Invalid repo format. Use: owner/repo' });
    return;
  }

  const [owner, repoName] = repoParts;

  console.log(`[On-demand] Scanning PR #${pr} in ${owner}/${repoName}...`);

  // Fetch PR files from GitHub
  const prData = await fetchPRFiles(owner, repoName, pr);

  if (!prData) {
    res.status(404).json({
      error: 'Could not fetch PR',
      suggestion: 'Make sure the repository is public and the PR number is correct',
    });
    return;
  }

  console.log(`[On-demand] Found ${prData.files.length} files to analyze`);

  if (prData.files.length === 0) {
    res.status(400).json({ error: 'No files found in this PR' });
    return;
  }

  try {
    // Analyze files
    const result = await analyzeFiles(prData.files);

    console.log(`[On-demand] Analysis complete: ${result.findings.length} findings`);

    // Save scan
    const scanReport: ScanReport = {
      id: uuidv4(),
      owner,
      repo: repoName,
      pullNumber: pr,
      headSha: prData.headSha,
      scannedAt: Date.now(),
      filesScanned: prData.files.length,
      findings: result.findings,
      summary: result.summary,
      overallRisk: result.overallRisk,
    };
    saveScan(scanReport);

    res.json({
      status: 'success',
      message: `Scan complete for ${owner}/${repoName} PR #${pr}`,
      scan: scanReport,
    });
  } catch (error) {
    console.error('[On-demand] Analysis error:', error);
    res.status(500).json({
      error: 'Analysis failed',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
