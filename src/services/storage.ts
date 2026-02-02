import { SecurityFinding } from '../types';
import fs from 'fs';
import path from 'path';

export interface ScanReport {
  id: string;
  owner: string;
  repo: string;
  pullNumber: number;
  headSha: string;
  scannedAt: number;
  filesScanned: number;
  findings: SecurityFinding[];
  summary: string;
  overallRisk: 'critical' | 'high' | 'medium' | 'low' | 'none';
}

interface Stats {
  totalScans: number;
  totalFindings: number;
  bySeverity: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  lastScanAt: number | null;
}

// In-memory storage
const scansById = new Map<string, ScanReport>();
const scansByRepo = new Map<string, string[]>(); // repo -> scan IDs

const DATA_DIR = process.env.DATA_DIR || './data';
const SCANS_FILE = path.join(DATA_DIR, 'scans.json');

// Load existing scans on startup
export function loadScans(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    if (fs.existsSync(SCANS_FILE)) {
      const data = fs.readFileSync(SCANS_FILE, 'utf-8');
      const scans = JSON.parse(data) as ScanReport[];

      for (const scan of scans) {
        scansById.set(scan.id, scan);
        const repoKey = `${scan.owner}/${scan.repo}`;
        const existing = scansByRepo.get(repoKey) || [];
        existing.push(scan.id);
        scansByRepo.set(repoKey, existing);
      }

      console.log(`Loaded ${scans.length} existing scan reports`);
    }
  } catch (err) {
    console.error('Error loading scans:', err);
  }
}

// Save scans to disk
function persistScans(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    const scans = Array.from(scansById.values());
    fs.writeFileSync(SCANS_FILE, JSON.stringify(scans, null, 2));
  } catch (err) {
    console.error('Error saving scans:', err);
  }
}

// Save a new scan
export function saveScan(scan: ScanReport): void {
  scansById.set(scan.id, scan);

  const repoKey = `${scan.owner}/${scan.repo}`;
  const existing = scansByRepo.get(repoKey) || [];
  existing.push(scan.id);
  scansByRepo.set(repoKey, existing);

  persistScans();
}

// Get scan by ID
export function getScanById(id: string): ScanReport | undefined {
  return scansById.get(id);
}

// List scans with pagination
export function listScans(options: {
  page?: number;
  limit?: number;
  repo?: string;
  sortBy?: string;
  order?: string;
}): { scans: ScanReport[]; total: number } {
  const { page = 1, limit = 20, repo, sortBy = 'scannedAt', order = 'desc' } = options;

  let scans = Array.from(scansById.values());

  // Filter by repo if specified
  if (repo) {
    scans = scans.filter(s => `${s.owner}/${s.repo}` === repo);
  }

  // Sort
  scans.sort((a, b) => {
    const aVal = (a as unknown as Record<string, unknown>)[sortBy];
    const bVal = (b as unknown as Record<string, unknown>)[sortBy];

    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return order === 'desc' ? bVal - aVal : aVal - bVal;
    }
    return 0;
  });

  const total = scans.length;
  const start = (page - 1) * limit;
  const paginated = scans.slice(start, start + limit);

  return { scans: paginated, total };
}

// Get statistics
export function getStats(): Stats {
  const scans = Array.from(scansById.values());

  const stats: Stats = {
    totalScans: scans.length,
    totalFindings: 0,
    bySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
    lastScanAt: null,
  };

  for (const scan of scans) {
    stats.totalFindings += scan.findings.length;

    for (const finding of scan.findings) {
      stats.bySeverity[finding.severity]++;
    }

    if (!stats.lastScanAt || scan.scannedAt > stats.lastScanAt) {
      stats.lastScanAt = scan.scannedAt;
    }
  }

  return stats;
}

// Get notable findings (critical and high)
export function getNotableFindings(limit: number = 50): Array<{
  scan: ScanReport;
  finding: SecurityFinding;
}> {
  const scans = Array.from(scansById.values());
  const notable: Array<{ scan: ScanReport; finding: SecurityFinding }> = [];

  for (const scan of scans) {
    for (const finding of scan.findings) {
      if (finding.severity === 'critical' || finding.severity === 'high') {
        notable.push({ scan, finding });
      }
    }
  }

  // Sort by severity (critical first), then by date (newest first)
  notable.sort((a, b) => {
    if (a.finding.severity === 'critical' && b.finding.severity !== 'critical') return -1;
    if (a.finding.severity !== 'critical' && b.finding.severity === 'critical') return 1;
    return b.scan.scannedAt - a.scan.scannedAt;
  });

  return notable.slice(0, limit);
}

// Get unique repos
export function getRepos(): string[] {
  return Array.from(scansByRepo.keys());
}
