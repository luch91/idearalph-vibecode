import { Router } from 'express';
import { getStats, listScans, getScanById, getNotableFindings, getRepos } from '../services/storage';

const router = Router();

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

export default router;
