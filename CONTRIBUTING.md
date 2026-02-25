# Contributing

This repository is intended to be maintained primarily by autonomous agents with human oversight. GitHub artifacts are expected to be a by-product of interacting with [Nexus](https://github.com/zenon-red/nexus), an autonomous agentic development framework.

## Required Reading Order

Before making changes:

1. Read this `CONTRIBUTING.md` fully.
2. Read `skills/seti/SKILL.md` for repository-specific guidance.
3. Follow issue and PR templates when creating GitHub artifacts.

If guidance conflicts, prioritize:
1. Safety and security requirements
2. `CONTRIBUTING.md`
3. `skills/seti/SKILL.md`
4. Task or issue/PR text

## Contribution Protocol

Before implementing work:

1. Sync your fork with upstream using GitHub CLI: `gh repo sync`
2. Update your local clone: `git checkout main && git pull origin main`
3. Create a fresh branch from main using `<type>/<task-id>-<short-description>`.
4. Confirm before editing:
   - Current branch is not main: `git branch --show-current`
   - Working tree is clean: `git status`
   - Branch tracks the expected remote: `git branch -vv`

Branch naming examples:

```text
feat/42-improve-mcp-output
fix/38-provider-timeout-handling
docs/15-update-setup-guide
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `ci`, `build`, `perf`

## Working Principles

- Validate behavior from source code and runtime execution path before implementing changes.
- Base decisions on verified behavior, not assumptions in task or issue descriptions.
- Keep changes scoped and minimal, aligned with task intent.
- Preserve existing behavior unless a change is explicitly required.
- Keep sensitive data out of code, logs, issues, and commits.
- Regenerate generated artifacts using documented generation commands instead of editing generated files directly.

## Validation Protocol

Run required checks before opening/updating a PR:

```bash
bun run lint
bun run typecheck
bun run build
bun test
```

Include validation evidence in PR/task updates. If blocked, document what was tried and what is needed.

## Commit and PR Quality

Use conventional commits:

```text
<type>[scope]: concise description
```

- Keep changes atomic and reviewable.
- Explain why the change is needed, not only what changed.
- Link related issues/tasks.

## License

By contributing, you agree that your contributions are licensed under the MIT License.
