# MCP Reference

SETI provides an MCP server for AI agent integration.

## Tools

### `web_search`

Search the web and return TOON-formatted results.

**Input:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | Yes | Search query (1-500 chars) |
| `num_results` | number | No | Results to return (1-100, default: 20) |

**Example:**

```json
{
  "query": "TypeScript best practices",
  "num_results": 20
}
```

**Broader sweep example:**

```json
{
  "query": "latest MCP ecosystem tools",
  "num_results": 50
}
```

**Output:**

TOON-formatted search results:

```
results[3]{title,url,description}:
  Understanding TypeScript,https://example.com/ts,A comprehensive guide...
  TypeScript Handbook,https://example.com/handbook,Official documentation...
```

### `enrich_content`

Fetch full page content for URLs using Jina Reader.

**Input:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `urls` | string[] | Yes | URLs to enrich (1-10) |
| `max_chars` | number | No | Max chars per result (500-10000, default: 5000) |

**Example:**

```json
{
  "urls": ["https://example.com/article"],
  "max_chars": 5000
}
```

**Multi-URL example:**

```json
{
  "urls": [
    "https://modelcontextprotocol.io",
    "https://toonformat.dev"
  ],
  "max_chars": 6000
}
```

**Output:**

TOON-formatted content with title and extracted text.

## Configuration

Add SETI to your MCP client:

```json
{
  "mcpServers": {
    "seti": {
      "command": "seti"
    }
  }
}
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `SETI_SEARXNG_BASE_URL` | SearXNG instance URL |
| `SETI_PROVIDER_ROUTING_STRATEGY` | Routing: `priority`, `fastest`, `round_robin` |
| `SETI_DEFAULT_RESULTS` | Default number of results (default: 20) |
| `SETI_CACHE_ENABLED` | Enable result caching (default: true) |
| `SETI_LOG_LEVEL` | Log level: `debug`, `info`, `warn`, `error` |

### API Keys

| Variable | Provider |
|----------|----------|
| `TAVILY_API_KEY` | Tavily |
| `EXA_API_KEY` | Exa AI |
| `BRAVE_API_KEY` | Brave Search |
| `GOOGLE_API_KEY` | Google Custom Search |
| `GOOGLE_CX` | Google CX ID |
| `FIRECRAWL_API_KEY` | Firecrawl |
| `SERPAPI_API_KEY` | SerpAPI |
| `JINA_API_KEY` | Jina Reader (higher rate limits) |

## Provider Routing

SETI supports multiple routing strategies:

| Strategy | Description |
|----------|-------------|
| `priority` | Use providers by configured priority (default) |
| `fastest` | Route to provider with best response time |
| `round_robin` | Distribute requests evenly across providers |
| `weighted_random` | Weighted random selection |

## Workflow

1. **Wide search**: Start with default results (20)
2. **Broader sweep**: Request 50+ results for ambiguous topics
3. **Deep dive**: Use `enrich_content` on specific URLs
