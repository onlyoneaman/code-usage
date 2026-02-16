# code-usage

`code-usage` is a local CLI that compares usage and estimated API-equivalent cost across coding agents, currently:
- Claude Code
- Codex CLI

It reads your local session data, builds a single HTML dashboard, and opens it in your browser.

## Install

```bash
npm install -g code-usage
```

## Run

```bash
code-usage
```

If the browser does not open automatically, the CLI prints a local file URL to open manually.

## What You Get

- Combined **All / Claude / Codex** views
- Daily and weekly usage trends
- Per-model cost breakdown
- Sessions, messages, output tokens, streaks
- Local JSON snapshots for inspection/debugging

## Data Sources

`code-usage` only reads local files from standard tool directories:

- Claude Code:
  - `~/.claude/stats-cache.json`
  - `~/.claude/usage-data/session-meta/*.json`
  - `~/.claude/projects/**/*.jsonl` (for active/recent sessions)
- Codex CLI:
  - `~/.codex/sessions/**/*.jsonl`
  - `~/.codex/archived_sessions/**/*.jsonl`

## Output Files

Generated artifacts are stored at:

- `~/.code-usage/current/code-usage-dashboard.html`
- `~/.code-usage/current/claude.json` (when Claude data exists)
- `~/.code-usage/current/codex.json` (when Codex data exists)

## Privacy

- Processing is local on your machine.
- This package does not require your `.env` for normal usage.
- Do not commit secrets; keep `.env*` ignored.

## Cost Estimate Notes

Costs are estimated using model pricing tables in:

- `src/pricing/claude.js`
- `src/pricing/codex.js`

These are API-equivalent estimates. If you are on subscription plans (for example, Claude Max or Codex Pro), your billed cost may differ.

## Requirements

- Node.js `>=18`
- Local Claude and/or Codex session files available

## Troubleshooting

- `No usage data for Claude or Codex found`
  - Use Claude Code and/or Codex CLI first, then rerun.
- Dashboard didn’t open
  - Open the printed `file://.../code-usage-dashboard.html` path manually.

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
