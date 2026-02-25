import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { encode } from '@toon-format/toon';
import { loadConfigAsync, SERVER_CONFIG } from '../config/index.js';
import { configureLogger, logger } from '../utils/logger.js';
import { ProviderRouter } from '../balancer/index.js';
import { createAllProviders } from '../providers/registry.js';
import { initializeCache, getCache } from '../cache/index.js';
import { standardizeResults } from '../utils/standardize.js';
import { enrichUrl } from '../utils/enrich.js';
import type { StandardizedSearchResult } from '../types/index.js';
import type { SETIConfig } from '../types/index.js';
import { getUsageFilePath } from '../utils/paths.js';

let providerRouter: ProviderRouter | null = null;

function textResult(text: string, isError: boolean) {
  return {
    content: [
      {
        type: 'text' as const,
        text,
      },
    ],
    isError,
  };
}

/**
 * Format search results as TOON (Token-Oriented Object Notation)
 * Optimized for LLM consumption with minimal tokens
 */
function formatResultsAsTOON(results: StandardizedSearchResult[]): string {
  const data = {
    results: results.map((r) => ({
      title: r.title,
      url: r.link,
      description: r.snippet,
    })),
  };

  return encode(data);
}

/**
 * Initialize the server components
 */
async function initializeServer(config: SETIConfig): Promise<void> {
  initializeCache(config.cache.enabled, config.cache.ttlSeconds, config.cache.maxSize);

  providerRouter = new ProviderRouter(
    {
      strategy: config.providerRouting.strategy,
      maxRetries: config.providerRouting.maxRetries,
      enableCircuitBreaker: config.providerRouting.enableCircuitBreaker,
      circuitBreakerThreshold: config.providerRouting.circuitBreakerThreshold,
      circuitBreakerResetMs: config.providerRouting.circuitBreakerResetMs,
    },
    getUsageFilePath()
  );

  const providers = createAllProviders();
  for (const provider of providers) {
    providerRouter.registerProvider(provider);
  }

  await providerRouter.initialize();

  logger.info('Server initialized', {
    providers: providers.map((p) => p.name),
    strategy: config.providerRouting.strategy,
    cacheEnabled: config.cache.enabled,
  });
}

export function createServer(config: SETIConfig): McpServer {
  const WebSearchSchema = z.object({
    query: z.string().min(1).max(500).describe('Search query string'),
    num_results: z
      .number()
      .min(1)
      .max(config.maxNumResults)
      .optional()
      .describe(
        `Number of results to return (1-${config.maxNumResults}, default: ${config.defaultNumResults})`
      ),
  });

  const server = new McpServer(
    {
      name: SERVER_CONFIG.name,
      version: SERVER_CONFIG.version,
    },
    {
      capabilities: {
        tools: {},
        logging: {},
      },
      instructions: `SETI provides multi-provider web search with intelligent provider routing.

Results are returned in TOON format (Token-Oriented Object Notation) for optimal LLM consumption.

TOON format structure:
results[N]{title,url,description}:
  Title text,https://example.com/,Description text
  Title text,https://example.com/,Description text

The header declares: [N] = number of results, {fields} = field names.
Each row is a comma-separated value matching the field order.

Recommended workflow:
1. Wide search: Just pass query (gets ${config.defaultNumResults} results by default)
2. Broader sweep: Add num_results=50 for ambiguous topics
3. Deep dive: Use the returned URLs with a separate enrichment tool if needed`,
    }
  );

  const runSearchTool = async (args: z.infer<typeof WebSearchSchema>) => {
    const startTime = Date.now();

    logger.info('web_search called', {
      query: args.query.substring(0, 50),
      numResults: args.num_results,
    });

    if (!providerRouter) {
      return textResult('Error: Server not initialized', true);
    }

    const numResults = args.num_results ?? config.defaultNumResults;

    const cache = getCache();
    const cached = cache?.get(args.query, {
      numResults,
    });

    if (cached) {
      logger.info('Returning cached results', {
        query: args.query.substring(0, 50),
        cachedAt: cached.cachedAt,
      });

      return textResult(formatResultsAsTOON(cached.response.results), false);
    }

    try {
      const result = await providerRouter.search(args.query, {
        query: args.query,
        numResults,
      });

      if (!result.success) {
        const errors = result.attempts
          .filter((a) => !a.success && a.error)
          .map((a) => `${a.provider}: ${a.error!.message}`);

        logger.error('Search failed', {
          query: args.query.substring(0, 50),
          error: result.error,
          providersAttempted: result.attempts.map((a) => a.provider),
        });

        const errorText = errors.length > 0 ? `\nErrors: ${errors.join(', ')}` : '';
        return textResult(
          `Search failed: ${result.error || 'All providers failed'}${errorText}`,
          true
        );
      }

      const standardizedResults = standardizeResults(
        result.results || [],
        result.successfulProvider || 'unknown'
      );

      const response = {
        results: standardizedResults,
        metadata: {
          fallbackTriggered: result.attempts.length > 1,
          providersAttempted: result.attempts.map((a) => a.provider),
          successfulProvider: result.successfulProvider || 'unknown',
          resultCount: standardizedResults.length,
          responseTimeMs: Date.now() - startTime,
          query: args.query,
        },
      };

      cache?.set(
        args.query,
        {
          numResults,
        },
        response
      );

      logger.info('Search completed', {
        query: args.query.substring(0, 50),
        provider: result.successfulProvider,
        results: standardizedResults.length,
        responseTimeMs: response.metadata.responseTimeMs,
        fallbackTriggered: response.metadata.fallbackTriggered,
      });

      return textResult(formatResultsAsTOON(standardizedResults), false);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error('Unexpected error in web_search', {
        query: args.query.substring(0, 50),
        error: errorMessage,
      });

      return textResult(`Error: ${errorMessage}`, true);
    }
  };

  server.registerTool(
    'web_search',
    {
      title: 'Web Search',
      description: 'Search the web via SETI. Results returned in TOON format.',
      inputSchema: WebSearchSchema,
    },
    runSearchTool
  );

  const EnrichContentSchema = z.object({
    urls: z.array(z.string().url()).min(1).max(10).describe('URLs to enrich (1-10)'),
    max_chars: z
      .number()
      .min(500)
      .max(10000)
      .optional()
      .describe('Max characters per result (default: 5000)'),
  });

  const runEnrichTool = async (args: z.infer<typeof EnrichContentSchema>) => {
    const maxChars = args.max_chars ?? 5000;

    logger.info('enrich_content called', {
      urlCount: args.urls.length,
      maxChars,
    });

    const results: Array<{
      url: string;
      success: boolean;
      content?: string;
      title?: string;
      error?: string;
    }> = [];

    for (const url of args.urls) {
      try {
        const result = await enrichUrl(url, maxChars, 15000);
        results.push({
          url,
          success: result.success,
          content: result.content ?? undefined,
          title: result.title ?? undefined,
          error: result.error ?? undefined,
        });
      } catch (error) {
        results.push({
          url,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    const output = {
      results: results.map((r) => {
        const item: { url: string; title?: string; content?: string; error?: string } = {
          url: r.url,
        };
        if (r.title) item.title = r.title;
        if (r.content) item.content = r.content;
        if (r.error) item.error = r.error;
        return item;
      }),
    };

    return textResult(encode(output), false);
  };

  server.registerTool(
    'enrich_content',
    {
      title: 'Enrich Content',
      description:
        'Fetch full page content from URLs using Jina AI Reader. Use after web_search to get detailed content from specific results.',
      inputSchema: EnrichContentSchema,
    },
    runEnrichTool
  );

  return server;
}

export async function startServer(): Promise<void> {
  const config = await loadConfigAsync();
  configureLogger(config.logging);
  await initializeServer(config);

  const server = createServer(config);
  const transport = new StdioServerTransport();

  logger.info('Starting SETI server...', {
    name: SERVER_CONFIG.name,
    version: SERVER_CONFIG.version,
  });

  await server.connect(transport);

  logger.info('MCP server connected and ready');
}
