import 'dotenv/config';
import express from 'express';
import path from 'path';
import webhookRouter from './routes/webhook';
import apiRouter from './routes/api';
import { loadScans } from './services/storage';

const app = express();
const PORT = process.env.PORT || 3000;

// Load existing scans
loadScans();

// Parse JSON bodies
app.use(express.json());

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));

// Mount routes
app.use(webhookRouter);
app.use('/api', apiRouter);

app.listen(PORT, () => {
  console.log(`
🛡️  SecureShip is running on port ${PORT}

Dashboard:  http://localhost:${PORT}
API:        http://localhost:${PORT}/api

Endpoints:
  GET  /              - Dashboard
  GET  /notable.html  - Notable findings
  POST /webhook       - GitHub webhook receiver
  GET  /api/health    - Health check
  GET  /api/stats     - Statistics
  GET  /api/scans     - List scans
  GET  /api/notable   - Notable findings

To test locally:
  1. Use smee.io or ngrok to tunnel webhooks
  2. Create a GitHub App pointing to your tunnel URL
  3. Install the app on a test repository
  4. Open a PR with a security vulnerability

Environment variables needed:
  - GITHUB_APP_ID
  - GITHUB_PRIVATE_KEY
  - GITHUB_WEBHOOK_SECRET
`);
});
