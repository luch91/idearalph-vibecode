import { Octokit } from '@octokit/rest';
import { SecureShipConfig } from '../types';

const DEFAULT_CONFIG: SecureShipConfig = {
  severityThreshold: 'low',
  ignorePaths: ['node_modules/**', 'vendor/**', 'dist/**', '**/*.test.*', '**/*.spec.*'],
  customRules: [],
};

export async function loadConfig(
  octokit: Octokit,
  owner: string,
  repo: string,
  ref: string
): Promise<SecureShipConfig> {
  try {
    const { data } = await octokit.repos.getContent({
      owner,
      repo,
      path: '.secureship.yml',
      ref,
    });

    if ('content' in data) {
      const content = Buffer.from(data.content, 'base64').toString('utf-8');
      return parseConfig(content);
    }
  } catch (error: any) {
    if (error.status !== 404) {
      console.error('Error loading config:', error);
    }
  }

  return DEFAULT_CONFIG;
}

function parseConfig(yamlContent: string): SecureShipConfig {
  // Simple YAML parser for our config format
  const config = { ...DEFAULT_CONFIG };

  const lines = yamlContent.split('\n');
  let currentKey = '';

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('#') || trimmed === '') {
      continue;
    }

    if (trimmed.startsWith('severity_threshold:')) {
      const value = trimmed.split(':')[1].trim().toLowerCase();
      if (['critical', 'high', 'medium', 'low'].includes(value)) {
        config.severityThreshold = value as SecureShipConfig['severityThreshold'];
      }
    }

    if (trimmed === 'ignore_paths:') {
      currentKey = 'ignore_paths';
      config.ignorePaths = [];
      continue;
    }

    if (trimmed === 'custom_rules:') {
      currentKey = 'custom_rules';
      config.customRules = [];
      continue;
    }

    if (currentKey === 'ignore_paths' && trimmed.startsWith('-')) {
      const path = trimmed.slice(1).trim();
      config.ignorePaths.push(path);
    }

    if (currentKey === 'custom_rules' && trimmed.startsWith('- pattern:')) {
      const pattern = trimmed.split('pattern:')[1].trim().replace(/"/g, '');
      // Look for next lines for message and severity
      const rule = { pattern, message: '', severity: 'medium' as const };
      config.customRules.push(rule);
    }
  }

  return config;
}

export function shouldIgnoreFile(filename: string, ignorePaths: string[]): boolean {
  for (const pattern of ignorePaths) {
    if (matchGlob(filename, pattern)) {
      return true;
    }
  }
  return false;
}

function matchGlob(filename: string, pattern: string): boolean {
  // Convert glob pattern to regex
  const regex = pattern
    .replace(/\*\*/g, '{{GLOBSTAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/\{\{GLOBSTAR\}\}/g, '.*')
    .replace(/\?/g, '.');

  return new RegExp(`^${regex}$`).test(filename);
}
