#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { collectClaude } from '../src/collectors/claude.js';
import { collectCodex } from '../src/collectors/codex.js';
import { collectOpencode } from '../src/collectors/opencode.js';
import { buildAndOpen } from '../src/dashboard.js';
import { APP_CONFIG } from '../src/config.js';

const home = homedir();
const __dirname = dirname(fileURLToPath(import.meta.url));

const pkgPath = join(__dirname, '..', 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const appMeta = {
  name: pkg.name || 'code-usage',
  version: pkg.version || '0.0.0',
  authorName: APP_CONFIG.authorName,
  authorUrl: APP_CONFIG.authorUrl,
  repoUrl: APP_CONFIG.repoUrl,
  packageUrl: APP_CONFIG.packageUrl || `https://www.npmjs.com/package/${encodeURIComponent(pkg.name || 'code-usage')}`,
  assetBase: join(__dirname, '..', 'templates', 'assets'),
};

const hasClaude = existsSync(join(home, '.claude', 'stats-cache.json'));

let hasCodex = false;
const codexSessionsDir = join(home, '.codex', 'sessions');
if (existsSync(codexSessionsDir)) {
  const findJsonl = (dir) => {
    try {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isFile() && entry.name.endsWith('.jsonl')) return true;
        if (entry.isDirectory() && findJsonl(join(dir, entry.name))) return true;
      }
    } catch { /* skip */ }
    return false;
  };
  hasCodex = findJsonl(codexSessionsDir);
}

const hasOpencode = existsSync(join(home, '.local', 'share', 'opencode', 'opencode.db'));

if (!hasClaude && !hasCodex && !hasOpencode) {
  console.log('No usage data for Claude, Codex, or OpenCode found.\n');
  console.log('  Claude Code: https://code.claude.com/docs/en/overview');
  console.log('  Codex CLI:   https://developers.openai.com/codex/cli/');
  console.log('  OpenCode:    https://opencode.ai\n');
  console.log('Install and use any of these tools, then run `code-usage` again.');
  process.exit(0);
}

let claudeData = null;
if (hasClaude) {
  process.stdout.write('Collecting Claude data... ');
  claudeData = collectClaude();
  console.log(`${claudeData.summary.totalSessions} sessions`);
}

let codexData = null;
if (hasCodex) {
  process.stdout.write('Collecting Codex data...  ');
  codexData = collectCodex();
  console.log(`${codexData.summary.totalSessions} sessions`);
}

let opencodeData = null;
if (hasOpencode) {
  process.stdout.write('Collecting OpenCode data... ');
  opencodeData = collectOpencode();
  console.log(`${opencodeData.summary.totalSessions} sessions`);
}

let defaultTab = 'all';
const providerCount = [hasClaude, hasCodex, hasOpencode].filter(Boolean).length;
if (providerCount === 1) {
  if (hasClaude) defaultTab = 'claude';
  else if (hasCodex) defaultTab = 'codex';
  else if (hasOpencode) defaultTab = 'opencode';
}

process.stdout.write('Building dashboard... ');
await buildAndOpen({ claudeData, codexData, opencodeData, defaultTab, appMeta });
console.log('done');

const dashPath = join(home, '.code-usage', 'current', 'code-usage-dashboard.html');
console.log(`\nIf the dashboard didn't open, visit:\n  file://${dashPath}`);
