# Getting Started

## Install

```bash
bun install -g @zenon-red/seti
```

## Configure

```bash
seti setup
```

For automated setup:

```bash
seti setup --non-interactive
```

## Run

Start MCP server mode:

```bash
seti
```

Run direct CLI search mode:

```bash
seti "TypeScript best practices"
seti "Rust async runtime" 10
```

## Verify Health

```bash
seti verify
seti verify --silent
```
