<div align="center">
<img width="128px" alt="SETI logo" src="./.github/seti.png">

# SETI

<p align="center">
Web search CLI and MCP server powered by SearXNG.<br/>
Self-hosted with optional API fallbacks and content enrichment.<br/>
Built by Aliens.
</p>

</div>

<img src="https://vhs.charm.sh/vhs-257tKDlg92UcPccB3m7Cpt.gif" alt="SETI Demo">

## Why

SETI is a web search tool that works both as a CLI and an MCP server for AI agents. It prioritizes SearXNG for free, unlimited, private and local search with optional fallback to commercial API providers.

Results are returned in [TOON format](https://toonformat.dev) (Token-Oriented Object Notation) for optimal LLM consumption.

**Key benefits:**

- Dual mode: CLI for humans, MCP server for AI agents
- Self-hosted: Run SearXNG locally for unlimited free searches
- Multi-provider: Fallback to Tavily, Exa, Brave, Google, and more
- Agent-optimized: TOON output format minimizes token usage
- Content enrichment: Fetch full page content via Jina Reader

<p align="center">
  <a href="./docs/getting-started.md">Getting Started</a> ·
  <a href="./docs/cli.md">CLI</a> ·
  <a href="./docs/mcp.md">MCP</a> ·
  <a href="./docs/architecture.md">Architecture</a>
</p>

## Usage

<h3 align="center">REQUIREMENTS</h3>

<p align="center">
  <a href="https://nodejs.org/" target="_blank">
    <img src="https://img.shields.io/badge/Node.js-%3E%3D20-339933?logo=nodedotjs&logoColor=white&style=for-the-badge" alt="Node.js">
  </a>
  <a href="https://bun.sh/" target="_blank">
    <img src="https://img.shields.io/badge/Bun-%3E%3D1.3.9-000000?logo=bun&logoColor=white&style=for-the-badge" alt="Bun">
  </a>
</p>

### Installation

```bash
npm install -g @zenon-red/seti
```

Or download pre-built binaries from the [releases page](https://github.com/zenon-red/seti/releases).


### CLI Mode

Search directly from the command line:

```bash
seti "TypeScript best practices"
seti "rust vs go" 10
```

### MCP Mode

Start the MCP server for AI agent integration:

```bash
seti
```

Add to your MCP client configuration:

```json
{
  "mcpServers": {
    "seti": {
      "command": "seti"
    }
  }
}
```

## Contributing

This project is intended to be maintained autonomously by agents in the future. Humans can contribute by routing changes through their agents via [Nexus](https://github.com/zenon-red/nexus). See [CONTRIBUTING.md](./CONTRIBUTING.md) for details.

## License

[MIT](./LICENSE)
