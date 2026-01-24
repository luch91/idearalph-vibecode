import Anthropic from '@anthropic-ai/sdk';
import { SecurityFinding, AnalysisResult, PullRequestFile } from '../types';
import { SYSTEM_PROMPT, buildAnalysisPrompt } from '../prompts/security';

const anthropic = new Anthropic();

export async function analyzeFile(file: PullRequestFile): Promise<SecurityFinding[]> {
  if (!file.patch) {
    return [];
  }

  const prompt = buildAnalysisPrompt(file.filename, file.patch);

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      return [];
    }

    const findings = JSON.parse(content.text) as SecurityFinding[];

    // Add filename to each finding and filter by confidence
    return findings
      .filter(f => f.confidence >= 0.7)
      .map(f => ({
        ...f,
        file: file.filename,
      }));
  } catch (error) {
    console.error(`Error analyzing ${file.filename}:`, error);
    return [];
  }
}

export async function analyzeFiles(files: PullRequestFile[]): Promise<AnalysisResult> {
  // Filter out non-code files
  const codeFiles = files.filter(f => isCodeFile(f.filename));

  // Analyze files in parallel (with concurrency limit)
  const findings: SecurityFinding[] = [];
  const batchSize = 5;

  for (let i = 0; i < codeFiles.length; i += batchSize) {
    const batch = codeFiles.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(analyzeFile));
    findings.push(...batchResults.flat());
  }

  // Determine overall risk
  const overallRisk = determineOverallRisk(findings);

  // Generate summary
  const summary = generateSummary(findings);

  return {
    findings,
    summary,
    overallRisk,
  };
}

function isCodeFile(filename: string): boolean {
  const codeExtensions = [
    '.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.java',
    '.rb', '.php', '.cs', '.cpp', '.c', '.rs', '.swift', '.kt',
  ];
  return codeExtensions.some(ext => filename.endsWith(ext));
}

function determineOverallRisk(findings: SecurityFinding[]): AnalysisResult['overallRisk'] {
  if (findings.some(f => f.severity === 'critical')) return 'critical';
  if (findings.some(f => f.severity === 'high')) return 'high';
  if (findings.some(f => f.severity === 'medium')) return 'medium';
  if (findings.some(f => f.severity === 'low')) return 'low';
  return 'none';
}

function generateSummary(findings: SecurityFinding[]): string {
  if (findings.length === 0) {
    return '✅ No security issues found in this PR.';
  }

  const critical = findings.filter(f => f.severity === 'critical').length;
  const high = findings.filter(f => f.severity === 'high').length;
  const medium = findings.filter(f => f.severity === 'medium').length;
  const low = findings.filter(f => f.severity === 'low').length;

  const parts = [];
  if (critical > 0) parts.push(`🔴 ${critical} critical`);
  if (high > 0) parts.push(`🟠 ${high} high`);
  if (medium > 0) parts.push(`🟡 ${medium} medium`);
  if (low > 0) parts.push(`🟢 ${low} low`);

  return `Found ${findings.length} security issue(s): ${parts.join(', ')}`;
}
