# CLI Reference

SETI provides a command-line interface for direct web searches.

## Commands

| Command | Description |
|---------|-------------|
| `seti` | Start MCP server mode (default) |
| `seti <query> [num]` | Search directly from CLI |
| `seti setup` | Run setup wizard |
| `seti verify` | Check SearXNG health |
| `seti --version` | Show CLI version |
| `seti --help` | Show help |

## Search

```bash
seti "TypeScript best practices"
seti "rust vs go" 10
```

Output is TOON-formatted for easy reading and processing.

## Setup

```bash
seti setup
```

Interactive setup wizard for configuring SearXNG and API providers.

`uv` mode installs SearXNG persistently with `uv tool install searxng` and runs it with `uv tool run searxng`.

### Setup Flags

| Flag | Description |
|------|-------------|
| `-n, --non-interactive` | Run without prompts (for agents) |
| `-d, --docker` | Force Docker mode |
| `-u, --uv` | Force uv mode |
| `-h, --help` | Show setup help |
| `-v, --version` | Show CLI version |

## Verify

```bash
seti verify
seti verify --silent
seti verify --url http://localhost:8888
```

Check SearXNG health and search functionality.

### Verify Flags

| Flag | Description |
|------|-------------|
| `-s, --silent` | Machine-parseable output |
| `-u, --url <url>` | Check specific URL |
| `-v, --version` | Show CLI version |
| `-h, --help` | Show verify help |

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | All checks passed |
| 1 | Health check failed |
| 2 | Search probe failed |
| 3 | Invalid arguments |

## Examples

```bash
seti "machine learning tutorials" 5
seti setup --non-interactive --docker
seti setup --non-interactive --uv
seti verify -s
```
