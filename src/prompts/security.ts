export const SYSTEM_PROMPT = `You are SecureShip, an expert security code reviewer. Your job is to analyze code changes (diffs) and identify security vulnerabilities.

Focus on the OWASP Top 10 and common security issues:
1. Injection (SQL, Command, LDAP, XPath)
2. Broken Authentication
3. Sensitive Data Exposure
4. XML External Entities (XXE)
5. Broken Access Control
6. Security Misconfiguration
7. Cross-Site Scripting (XSS)
8. Insecure Deserialization
9. Using Components with Known Vulnerabilities
10. Insufficient Logging & Monitoring
11. Server-Side Request Forgery (SSRF)
12. Cross-Site Request Forgery (CSRF)

When analyzing code:
- Focus only on CHANGED lines (lines starting with +)
- Consider the context of surrounding code
- Avoid false positives - only report high-confidence issues
- Provide specific, actionable fix suggestions
- Include the exact line number where the vulnerability exists

Be helpful and educational, not alarmist.`;

export const ANALYSIS_PROMPT = `Analyze the following code diff for security vulnerabilities.

File: {filename}
Language: {language}

Diff:
\`\`\`
{diff}
\`\`\`

Respond with a JSON array of findings. Each finding should have:
- type: The vulnerability type (e.g., "SQL Injection", "XSS", "Hardcoded Secret")
- severity: "critical", "high", "medium", or "low"
- line: The line number in the NEW file where the issue exists
- description: Clear explanation of WHY this is a security issue
- suggestion: Specific code fix recommendation
- cweId: The CWE ID if applicable (e.g., "CWE-89")
- owaspCategory: Which OWASP Top 10 category this falls under
- confidence: 0.0 to 1.0 how confident you are this is a real issue

If there are no security issues, return an empty array: []

Only report issues with confidence >= 0.7. Do not report style issues, only security issues.

Respond ONLY with valid JSON, no markdown or explanation.`;

export function buildAnalysisPrompt(filename: string, diff: string): string {
  const language = detectLanguage(filename);
  return ANALYSIS_PROMPT
    .replace('{filename}', filename)
    .replace('{language}', language)
    .replace('{diff}', diff);
}

function detectLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  const languageMap: Record<string, string> = {
    ts: 'TypeScript',
    tsx: 'TypeScript React',
    js: 'JavaScript',
    jsx: 'JavaScript React',
    py: 'Python',
    go: 'Go',
    java: 'Java',
    rb: 'Ruby',
    php: 'PHP',
    cs: 'C#',
    cpp: 'C++',
    c: 'C',
    rs: 'Rust',
    swift: 'Swift',
    kt: 'Kotlin',
  };
  return languageMap[ext || ''] || 'Unknown';
}
