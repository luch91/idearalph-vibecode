import { SecurityFinding, AnalysisResult, PullRequestFile } from '../types';
import { SYSTEM_PROMPT, buildAnalysisPrompt } from '../prompts/security';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';

export async function analyzeFile(file: PullRequestFile): Promise<SecurityFinding[]> {
  if (!file.patch) {
    return [];
  }

  const prompt = buildAnalysisPrompt(file.filename, file.patch);

  try {
    const response = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama3',
        system: SYSTEM_PROMPT,
        prompt,
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as { response: string };
    const text = data.response;

    console.log(`Ollama response for ${file.filename}:`, text.slice(0, 500));

    // Extract JSON from response (LLM may wrap in markdown code blocks)
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.log(`No JSON array found in response for ${file.filename}`);
      return [];
    }

    const findings = JSON.parse(jsonMatch[0]) as SecurityFinding[];

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
