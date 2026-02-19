# code-usage

[![npm version](https://img.shields.io/npm/v/code-usage)](https://www.npmjs.com/package/code-usage)
[![npm downloads](https://img.shields.io/npm/dm/code-usage)](https://www.npmjs.com/package/code-usage)
[![license](https://img.shields.io/npm/l/code-usage)](https://github.com/onlyoneaman/code-usage/blob/main/LICENSE)
[![node](https://img.shields.io/node/v/code-usage)](https://nodejs.org)

See how much your AI coding actually costs.

`code-usage` is a local CLI that analyzes and compares usage across AI coding agents:

- **Claude Code**
- **Codex CLI**
- **OpenCode**

It builds a single, clean HTML dashboard showing:

- Token usage
- Sessions & messages
- Daily & weekly trends
- Per-model cost estimates
- Streaks
- Combined + per-agent views

Everything runs locally. No APIs. No tracking. No uploads.

If you use multiple AI coding tools, this answers one question:

**Where is my time and money actually going?**

![code-usage dashboard](screenshot.png)

## Why This Exists

When you experiment with multiple coding agents, it's hard to know:

- Which one you use more
- Which models cost the most
- Whether you're burning tokens unintentionally
- How usage trends week over week

`code-usage` gives you clarity in seconds.

Think of it as:

> GitHub contributions graph — but for AI coding.

## Install

```bash
npm install -g code-usage
```

## Run

```bash
code-usage
```

Opens a local dashboard in your browser.

If it doesn't auto-open, the CLI prints the local file path.

## What You See

- Combined **All / Claude / Codex / OpenCode** views
- Daily + weekly usage charts
- Per-model cost breakdown
- Per-project usage donut chart
- Sessions, messages, output tokens
- Usage streak tracking
- Local JSON snapshots for debugging

Generated files:

```
~/.code-usage/current/code-usage-dashboard.html
~/.code-usage/current/openusage-data.json
```

## Privacy

All processing is local.

`code-usage` only reads standard local session files:

Claude:

```
~/.config/claude/projects/**/*.jsonl
~/.claude/projects/**/*.jsonl
~/.claude/usage-data/session-meta/*.json
```

Codex:

```
~/.codex/sessions/**/*.jsonl
~/.codex/archived_sessions/**/*.jsonl
```

OpenCode:

```
~/.local/share/opencode/opencode.db (SQLite)
~/.cache/opencode/models.json (pricing)
```

No `.env` required.
No data leaves your machine.

## Cost Estimates

Costs are API-equivalent estimates based on pricing tables:

- `src/pricing/claude.js`
- `src/pricing/codex.js`
- `src/pricing/opencode.js` (dynamic from `~/.cache/opencode/models.json`)

Fallback pricing powered by [LiteLLM](https://github.com/BerriAI/litellm).

If you're on subscription plans (Claude Max, Codex Pro), billed cost may differ.

## Requirements

- Node.js `>=18`
- Local Claude, Codex, and/or OpenCode session files available

## Development

```bash
npm install
npm run pack:check
node bin/code-usage.js
```

## Links

- npm: https://www.npmjs.com/package/code-usage
- GitHub: https://github.com/onlyoneaman/code-usage
- Author: https://x.com/onlyoneaman

## License

MIT
