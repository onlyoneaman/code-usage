# code-usage

See how much your AI coding actually costs.

`code-usage` is a local CLI that analyzes and compares usage across AI coding agents:

- **Claude Code**
- **Codex CLI**

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

- Combined **All / Claude / Codex** views
- Daily + weekly usage charts
- Per-model cost breakdown
- Sessions, messages, output tokens
- Usage streak tracking
- Local JSON snapshots for debugging

Generated files:

```
~/.code-usage/current/code-usage-dashboard.html
~/.code-usage/current/claude.json
~/.code-usage/current/codex.json
```

## Privacy

All processing is local.

`code-usage` only reads standard local session files:

Claude:

```
~/.claude/stats-cache.json
~/.claude/usage-data/session-meta/*.json
~/.claude/projects/**/*.jsonl
```

Codex:

```
~/.codex/sessions/**/*.jsonl
~/.codex/archived_sessions/**/*.jsonl
```

No `.env` required.
No data leaves your machine.

## Cost Estimates

Costs are API-equivalent estimates based on pricing tables:

- `src/pricing/claude.js`
- `src/pricing/codex.js`

If you're on subscription plans (Claude Max, Codex Pro), billed cost may differ.

## Requirements

- Node.js `>=18`
- Local Claude and/or Codex session files available

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
