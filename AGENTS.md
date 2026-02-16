# AGENTS.md

## Purpose
This repository tracks, compares, and visualizes usage across coding agents from local machine data.

Current agents:
- `claude-code`
- `codex`

## What This Repo Covers
- Collect usage/session data from each agent's local files.
- Normalize token and pricing data with shared output format.
- Build a single dashboard with `All`, `Claude`, and `Codex` views.
- Publish a CLI package (`code-usage`) to npm.

## Package And Release
- npm package: `https://www.npmjs.com/package/code-usage`
- repository: `https://github.com/onlyoneaman/code-usage`
- publish command: `npm run publish`

## Agent Docs
- Claude Code: `https://code.claude.com/docs/en/overview`
- Codex CLI: `https://developers.openai.com/codex/cli/`

## Conventions
- Keep processing local-first; do not depend on private `.env` secrets.
- Add new agents using the same collector + pricing module pattern.
