# Setup Notes

This repository follows the Zenon Red template conventions.

## Required Tooling

- Bun `>=1.0.0`
- Node.js `>=20`
- Docker (optional, for managed SearXNG)
- uv (optional, alternative SearXNG path)

## Local Development

```bash
bun install
bun run lint
bun run typecheck
bun run build
bun test
```

## Git Hooks

Husky hooks are configured in `.husky/`:

- `pre-commit`: runs `lint-staged`
- `pre-push`: runs lint, typecheck, build, and tests
- `commit-msg`: validates conventional commit message format

If hooks are missing after clone, run:

```bash
bun run prepare
```

## GitHub Automation

- `ci` workflow runs lint, typecheck, build, test.
- `labeler` workflow auto-labels PRs based on changed files.
- `stale-issues-prs` marks inactive issues/PRs.
- `dependabot` opens dependency update PRs weekly.
