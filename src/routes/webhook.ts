import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import {
  initializeOctokit,
  getPullRequestFiles,
  postReviewComments,
  postSummaryComment,
  updateCommitStatus,
} from '../services/github';
import { analyzeFiles } from '../services/analyzer';
import { PullRequestContext } from '../types';

const router = Router();

// Verify webhook signature from GitHub
function verifySignature(payload: string, signature: string | undefined): boolean {
  if (!signature) {
    return false;
  }

  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) {
    console.warn('GITHUB_WEBHOOK_SECRET not set, skipping signature verification');
    return true;
  }

  const hmac = crypto.createHmac('sha256', secret);
  const digest = 'sha256=' + hmac.update(payload).digest('hex');

  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
}

router.post('/webhook', async (req: Request, res: Response) => {
  const event = req.headers['x-github-event'] as string;
  const signature = req.headers['x-hub-signature-256'] as string;
  const deliveryId = req.headers['x-github-delivery'] as string;

  console.log(`Received webhook: ${event} (${deliveryId})`);

  // Verify signature
  const payload = JSON.stringify(req.body);
  if (!verifySignature(payload, signature)) {
    console.error('Invalid webhook signature');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // Only handle pull_request events
  if (event !== 'pull_request') {
    return res.status(200).json({ message: 'Event ignored' });
  }

  const { action, pull_request, repository, installation } = req.body;

  // Only scan on opened, synchronize (new commits), or reopened
  if (!['opened', 'synchronize', 'reopened'].includes(action)) {
    return res.status(200).json({ message: 'Action ignored' });
  }

  // Respond immediately to avoid timeout
  res.status(202).json({ message: 'Processing' });

  try {
    // Initialize Octokit with installation credentials
    initializeOctokit(installation.id);

    const context: PullRequestContext = {
      owner: repository.owner.login,
      repo: repository.name,
      pullNumber: pull_request.number,
      headSha: pull_request.head.sha,
      files: [],
    };

    console.log(`Analyzing PR #${context.pullNumber} in ${context.owner}/${context.repo}`);

    // Get PR files
    context.files = await getPullRequestFiles(
      context.owner,
      context.repo,
      context.pullNumber
    );

    console.log(`Found ${context.files.length} files to analyze`);

    // Analyze files for security issues
    const result = await analyzeFiles(context.files);

    console.log(`Analysis complete: ${result.findings.length} findings`);

    // Post results to GitHub
    await Promise.all([
      postReviewComments(context, result.findings),
      postSummaryComment(context, result),
      updateCommitStatus(context, result),
    ]);

    console.log(`Posted results to PR #${context.pullNumber}`);
  } catch (error) {
    console.error('Error processing webhook:', error);
  }
});

// Health check endpoint
router.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'secureship' });
});

export default router;
