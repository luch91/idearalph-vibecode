import 'dotenv/config';
import express from 'express';
import webhookRouter from './routes/webhook';

const app = express();
const PORT = process.env.PORT || 3000;

// Parse JSON bodies
app.use(express.json());

// Mount routes
app.use(webhookRouter);

// Root endpoint
app.get('/', (_req, res) => {
  res.json({
    name: 'SecureShip',
    description: 'AI-powered security code review for GitHub PRs',
    version: '1.0.0',
    endpoints: {
      webhook: 'POST /webhook',
      health: 'GET /health',
    },
  });
});

app.listen(PORT, () => {
  console.log(`
🛡️  SecureShip is running on port ${PORT}

Endpoints:
  POST /webhook  - GitHub webhook receiver
  GET  /health   - Health check
  GET  /         - Service info

To test locally:
  1. Use smee.io or ngrok to tunnel webhooks
  2. Create a GitHub App pointing to your tunnel URL
  3. Install the app on a test repository
  4. Open a PR with a security vulnerability

Environment variables needed:
  - GITHUB_APP_ID
  - GITHUB_PRIVATE_KEY
  - GITHUB_WEBHOOK_SECRET
  - ANTHROPIC_API_KEY
`);
});
