# Architecture

SETI is a Bun + TypeScript MCP server with provider routing and fallback.

## Core Components

- `src/mcp/server.ts` - MCP tool registration and request handling
- `src/balancer/` - Provider selection, fallback, circuit breaker, and quota tracking
- `src/providers/` - Provider adapters (SearXNG, Tavily, Exa, Brave, Google, Firecrawl, SerpAPI, Jina, DuckDuckGo)
- `src/config/` - Defaults and layered config loading
- `src/cache/` - In-memory LRU+TTL cache
- `src/setup/` - Interactive/non-interactive setup and verification CLIs

## Request Flow

1. `web_search` receives query and optional result count.
2. Cache lookup runs first.
3. `ProviderRouter` builds provider order based on configured strategy.
4. `FallbackManager` attempts providers until one succeeds or retries are exhausted.
5. Results are standardized and encoded as TOON.
6. Successful result is cached.

## State and Persistence

- Runtime cache is in-memory only.
- Provider usage/quota data persists at `~/.config/seti/usage.json`.
- User setup values persist at `~/.config/seti/.env`.
