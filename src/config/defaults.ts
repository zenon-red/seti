/**
 * Default configuration for SETI
 */

import type { SETIConfig, ProviderConfig, MCPServerConfig } from '../types/index.js';

export const SERVER_CONFIG: MCPServerConfig = {
  name: 'seti',
  version: '1.0.0',
};

/** Default provider configurations */
export const DEFAULT_PROVIDERS: ProviderConfig[] = [
  {
    name: 'searxng',
    enabled: true,
    requiresApiKey: false,
    monthlyQuota: null, // Self-hosted instance (no API quota)
    basePriority: 0,
    features: {
      semanticSearch: false,
      contentExtraction: false,
      citations: false,
      timeFilter: true,
      safeSearch: true,
    },
    endpoints: {
      search: 'http://127.0.0.1:8888/search',
    },
    timeoutMs: 10000,
  },
  {
    name: 'tavily',
    enabled: true,
    requiresApiKey: true,
    apiKeyEnvVar: 'TAVILY_API_KEY',
    monthlyQuota: 1000,
    basePriority: 1,
    features: {
      semanticSearch: true,
      contentExtraction: true,
      citations: false,
      timeFilter: false,
      safeSearch: false,
    },
    endpoints: {
      search: 'https://api.tavily.com/search',
    },
    timeoutMs: 15000,
  },
  {
    name: 'exa',
    enabled: true,
    requiresApiKey: true,
    apiKeyEnvVar: 'EXA_API_KEY',
    monthlyQuota: 2000, // Approximate with $10 free credits
    basePriority: 2,
    features: {
      semanticSearch: true,
      contentExtraction: true,
      citations: true,
      timeFilter: true,
      safeSearch: false,
    },
    endpoints: {
      search: 'https://api.exa.ai/search',
    },
    timeoutMs: 15000,
  },
  {
    name: 'jina',
    enabled: true,
    requiresApiKey: false,
    apiKeyEnvVar: 'JINA_API_KEY',
    monthlyQuota: 3000, // Approximate based on 100 RPM limit
    basePriority: 3,
    features: {
      semanticSearch: false,
      contentExtraction: true,
      citations: false,
      timeFilter: false,
      safeSearch: false,
    },
    endpoints: {
      search: 'https://s.jina.ai',
      extract: 'https://r.jina.ai',
    },
    timeoutMs: 10000,
  },
  {
    name: 'brave',
    enabled: true,
    requiresApiKey: true,
    apiKeyEnvVar: 'BRAVE_API_KEY',
    monthlyQuota: 2000,
    basePriority: 4,
    features: {
      semanticSearch: false,
      contentExtraction: false,
      citations: false,
      timeFilter: true,
      safeSearch: true,
    },
    endpoints: {
      search: 'https://api.search.brave.com/res/v1/web/search',
    },
    timeoutMs: 15000,
  },
  {
    name: 'google',
    enabled: true,
    requiresApiKey: true,
    apiKeyEnvVar: 'GOOGLE_API_KEY',
    monthlyQuota: 100, // 100 per day (treated as daily quota)
    basePriority: 5,
    features: {
      semanticSearch: false,
      contentExtraction: false,
      citations: false,
      timeFilter: true,
      safeSearch: true,
    },
    endpoints: {
      search: 'https://www.googleapis.com/customsearch/v1',
    },
    timeoutMs: 15000,
  },
  {
    name: 'firecrawl',
    enabled: true,
    requiresApiKey: true,
    apiKeyEnvVar: 'FIRECRAWL_API_KEY',
    monthlyQuota: 500, // 500 credits lifetime (not monthly), plus 5 daily runs
    basePriority: 6,
    features: {
      semanticSearch: false,
      contentExtraction: true,
      citations: false,
      timeFilter: true,
      safeSearch: false,
    },
    endpoints: {
      search: 'https://api.firecrawl.dev/v2/search',
    },
    timeoutMs: 20000,
  },
  {
    name: 'serpapi',
    enabled: true,
    requiresApiKey: true,
    apiKeyEnvVar: 'SERPAPI_API_KEY',
    monthlyQuota: 250,
    basePriority: 7,
    features: {
      semanticSearch: false,
      contentExtraction: false,
      citations: false,
      timeFilter: true,
      safeSearch: true,
    },
    endpoints: {
      search: 'https://serpapi.com/search',
    },
    timeoutMs: 15000,
  },
  {
    name: 'duckduckgo',
    enabled: false, // Disabled by default due to reliability concerns
    requiresApiKey: false,
    monthlyQuota: null, // Unlimited
    basePriority: 99, // Fallback only
    features: {
      semanticSearch: false,
      contentExtraction: false,
      citations: false,
      timeFilter: false,
      safeSearch: true,
    },
    endpoints: {
      search: 'https://html.duckduckgo.com/html',
    },
    timeoutMs: 15000,
  },
];

/** Default SETI configuration */
export const DEFAULT_CONFIG: SETIConfig = {
  providers: DEFAULT_PROVIDERS,
  providerRouting: {
    strategy: 'priority',
    trackResponseTimes: true,
    maxRetries: 3,
    enableCircuitBreaker: true,
    circuitBreakerThreshold: 5,
    circuitBreakerResetMs: 60000,
  },
  cache: {
    enabled: true,
    ttlSeconds: 300,
    maxSize: 1000,
  },
  logging: {
    level: 'info',
    logUsage: true,
    timestamps: true,
  },
  defaultNumResults: 20,
  maxNumResults: 100,
  requestTimeoutMs: 30000,
};
