#!/usr/bin/env node

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { collectClaude } from '../src/collectors/claude.js';
import { collectCodex } from '../src/collectors/codex.js';
import { buildAndOpen } from '../src/dashboard.js';

const home = homedir();

const hasClaude = existsSync(join(home, '.claude', 'stats-cache.json'));

let hasCodex = false;
const codexSessionsDir = join(home, '.codex', 'sessions');
if (existsSync(codexSessionsDir)) {
  // Recursively check for any .jsonl files
  const findJsonl = (dir) => {
    try {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isFile() && entry.name.endsWith('.jsonl')) return true;
        if (entry.isDirectory()) {
          if (findJsonl(join(dir, entry.name))) return true;
        }
      }
    } catch { /* skip unreadable dirs */ }
    return false;
  };
  hasCodex = findJsonl(codexSessionsDir);
}

if (!hasClaude && !hasCodex) {
  console.log('No usage data for Claude or Codex found.\n');
  console.log('  Claude Code: https://docs.anthropic.com/en/docs/claude-code');
  console.log('  Codex CLI:   https://github.com/openai/codex\n');
  console.log('Install and use either tool, then run `code-usage` again.');
  process.exit(0);
}

const claudeData = hasClaude ? collectClaude() : null;
const codexData = hasCodex ? collectCodex() : null;

let defaultTab = 'all';
if (!hasClaude) defaultTab = 'codex';
else if (!hasCodex) defaultTab = 'claude';

await buildAndOpen({ claudeData, codexData, defaultTab });

const claudeSessions = claudeData?.stats?.totalSessions ?? 0;
const codexSessions = codexData?.totalSessions ?? 0;
console.log('Dashboard opened.');
if (hasClaude) console.log(`  Claude: ${claudeSessions} sessions`);
if (hasCodex) console.log(`  Codex:  ${codexSessions} sessions`);
