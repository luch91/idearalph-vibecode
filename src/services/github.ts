import { Octokit } from '@octokit/rest';
import { createAppAuth } from '@octokit/auth-app';
import { PullRequestFile, PullRequestContext, SecurityFinding, AnalysisResult } from '../types';

let octokit: Octokit | null = null;

export function initializeOctokit(installationId: number): Octokit {
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_PRIVATE_KEY;

  if (!appId || !privateKey) {
    throw new Error('Missing GITHUB_APP_ID or GITHUB_PRIVATE_KEY');
  }

  octokit = new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: parseInt(appId, 10),
      privateKey: privateKey.replace(/\\n/g, '\n'),
      installationId,
    },
  });

  return octokit;
}

export async function getPullRequestFiles(
  owner: string,
  repo: string,
  pullNumber: number
): Promise<PullRequestFile[]> {
  if (!octokit) {
    throw new Error('Octokit not initialized');
  }

  const { data: files } = await octokit.pulls.listFiles({
    owner,
    repo,
    pull_number: pullNumber,
  });

  return files.map(f => ({
    filename: f.filename,
    status: f.status,
    patch: f.patch,
    additions: f.additions,
    deletions: f.deletions,
  }));
}

export async function postReviewComments(
  context: PullRequestContext,
  findings: SecurityFinding[]
): Promise<void> {
  if (!octokit || findings.length === 0) {
    return;
  }

  const comments = findings.map(finding => ({
    path: finding.file,
    line: finding.line,
    body: formatFindingComment(finding),
  }));

  try {
    await octokit.pulls.createReview({
      owner: context.owner,
      repo: context.repo,
      pull_number: context.pullNumber,
      commit_id: context.headSha,
      event: 'COMMENT',
      comments,
    });
  } catch (error) {
    console.error('Error posting review comments:', error);
    // Fallback: post as individual issue comments
    for (const finding of findings) {
      await postIssueComment(context, finding);
    }
  }
}

async function postIssueComment(
  context: PullRequestContext,
  finding: SecurityFinding
): Promise<void> {
  if (!octokit) return;

  const body = `**Security Issue Found in \`${finding.file}:${finding.line}\`**\n\n${formatFindingComment(finding)}`;

  await octokit.issues.createComment({
    owner: context.owner,
    repo: context.repo,
    issue_number: context.pullNumber,
    body,
  });
}

export async function postSummaryComment(
  context: PullRequestContext,
  result: AnalysisResult
): Promise<void> {
  if (!octokit) return;

  const body = formatSummaryComment(result);

  await octokit.issues.createComment({
    owner: context.owner,
    repo: context.repo,
    issue_number: context.pullNumber,
    body,
  });
}

export async function updateCommitStatus(
  context: PullRequestContext,
  result: AnalysisResult
): Promise<void> {
  if (!octokit) return;

  const state = result.overallRisk === 'none' || result.overallRisk === 'low'
    ? 'success'
    : result.overallRisk === 'medium'
    ? 'success'
    : 'failure';

  await octokit.repos.createCommitStatus({
    owner: context.owner,
    repo: context.repo,
    sha: context.headSha,
    state,
    context: 'SecureShip Security Review',
    description: result.summary.slice(0, 140),
    target_url: undefined,
  });
}

function formatFindingComment(finding: SecurityFinding): string {
  const severityEmoji = {
    critical: '🔴',
    high: '🟠',
    medium: '🟡',
    low: '🟢',
  };

  let comment = `${severityEmoji[finding.severity]} **${finding.type}** (${finding.severity.toUpperCase()})\n\n`;
  comment += `${finding.description}\n\n`;
  comment += `**Suggested Fix:**\n\`\`\`\n${finding.suggestion}\n\`\`\`\n`;

  if (finding.cweId) {
    comment += `\n📚 [${finding.cweId}](https://cwe.mitre.org/data/definitions/${finding.cweId.replace('CWE-', '')}.html)`;
  }

  if (finding.owaspCategory) {
    comment += ` | OWASP: ${finding.owaspCategory}`;
  }

  return comment;
}

function formatSummaryComment(result: AnalysisResult): string {
  let comment = `## 🛡️ SecureShip Security Review\n\n`;
  comment += `${result.summary}\n\n`;

  if (result.findings.length > 0) {
    comment += `### Findings\n\n`;
    comment += `| Severity | Type | File | Line |\n`;
    comment += `|----------|------|------|------|\n`;

    for (const finding of result.findings) {
      const emoji = { critical: '🔴', high: '🟠', medium: '🟡', low: '🟢' };
      comment += `| ${emoji[finding.severity]} ${finding.severity} | ${finding.type} | \`${finding.file}\` | ${finding.line} |\n`;
    }

    comment += `\n---\n*Review the inline comments for fix suggestions.*`;
  }

  comment += `\n\n<sub>Powered by SecureShip 🚀</sub>`;

  return comment;
}
