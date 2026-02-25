---
name: seti
description: SETI MCP search server guidance for autonomous contributors
---

# SETI

## Overview

SETI is a self-hosted web search MCP server. It uses SearXNG as the primary backend and can fall back to API providers for reliability. Search and enrichment responses are emitted in TOON format for LLM efficiency.

## Tech Stack

- Language: TypeScript
- Runtime: Bun
- Protocol: Model Context Protocol (MCP)
- Validation: Zod
- Lint/format: oxlint + oxfmt

## Architecture

```text
src/
├── mcp/          # MCP server and tool handlers
├── balancer/     # provider strategy, fallback, breaker, quota tracker
├── providers/    # provider-specific adapters
├── cache/        # in-memory cache
├── config/       # defaults + layered config loading
├── setup/        # setup and verify CLIs
└── utils/        # logging, validation, normalization helpers
```

## Development Commands

```bash
bun install
bun run lint
bun run typecheck
bun run build
bun test
bun run smoke:mcp
```

## Key Files

| File | Purpose |
|------|---------|
| `src/mcp/server.ts` | Registers and handles MCP tools |
| `src/balancer/index.ts` | ProviderRouter orchestration |
| `src/providers/registry.ts` | Provider registration + construction |
| `src/setup/index.ts` | Interactive/non-interactive setup |
| `src/setup/verify.ts` | Health and search verification |

## Agent Guidelines

- Keep output format stable for MCP tools (`web_search`, `enrich_content`).
- Preserve fallback and quota semantics unless explicitly requested to change them.
- Validate provider-specific API parameter changes against upstream docs before implementation.
- Keep setup flows idempotent and non-destructive.
- Run lint, typecheck, build, and tests before finalizing changes.
