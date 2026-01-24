export interface SecurityFinding {
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  file: string;
  line: number;
  description: string;
  suggestion: string;
  cweId?: string;
  owaspCategory?: string;
  confidence: number;
}

export interface AnalysisResult {
  findings: SecurityFinding[];
  summary: string;
  overallRisk: 'critical' | 'high' | 'medium' | 'low' | 'none';
}

export interface PullRequestFile {
  filename: string;
  status: string;
  patch?: string;
  additions: number;
  deletions: number;
}

export interface PullRequestContext {
  owner: string;
  repo: string;
  pullNumber: number;
  headSha: string;
  files: PullRequestFile[];
}

export interface SecureShipConfig {
  severityThreshold: 'critical' | 'high' | 'medium' | 'low';
  ignorePaths: string[];
  customRules: CustomRule[];
}

export interface CustomRule {
  pattern: string;
  message: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
}
