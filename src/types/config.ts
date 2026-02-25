/**
 * Configuration types for SETI
 */

export interface ProviderFeatures {
  /** Supports semantic/neural search */
  semanticSearch: boolean;
  /** Can extract full page content */
  contentExtraction: boolean;
  /** Provides source citations */
  citations: boolean;
  /** Supports time-based filtering */
  timeFilter: boolean;
  /** Supports safe search filtering */
  safeSearch: boolean;
}

export interface ProviderEndpoints {
  /** Search endpoint URL */
  search: string;
  /** Content extraction endpoint (if supported) */
  extract?: string;
}

export interface ProviderConfig {
  /** Provider identifier */
  name: string;
  /** Whether this provider is enabled */
  enabled: boolean;
  /** Whether this provider requires an API key */
  requiresApiKey: boolean;
  /** Environment variable name for API key */
  apiKeyEnvVar?: string;
  /** Monthly quota limit (null for unlimited) */
  monthlyQuota: number | null;
  /** Base priority (lower = higher priority) */
  basePriority: number;
  /** Provider capabilities */
  features: ProviderFeatures;
  /** API endpoints */
  endpoints: ProviderEndpoints;
  /** Default timeout in milliseconds */
  timeoutMs: number;
}

export type ProviderRoutingStrategy = 'priority' | 'weighted_random' | 'round_robin' | 'fastest';

export interface ProviderRoutingConfig {
  /** Selection strategy */
  strategy: ProviderRoutingStrategy;
  /** Whether to track and use response times for 'fastest' strategy */
  trackResponseTimes: boolean;
  /** Number of retries on failure */
  maxRetries: number;
  /** Whether to enable circuit breaker pattern */
  enableCircuitBreaker: boolean;
  /** Circuit breaker failure threshold */
  circuitBreakerThreshold: number;
  /** Circuit breaker reset timeout (ms) */
  circuitBreakerResetMs: number;
}

export interface CacheConfig {
  /** Whether caching is enabled */
  enabled: boolean;
  /** Cache TTL in seconds */
  ttlSeconds: number;
  /** Maximum cache size (number of entries) */
  maxSize: number;
}

export interface LogConfig {
  /** Log level */
  level: 'debug' | 'info' | 'warn' | 'error';
  /** Whether to log provider usage */
  logUsage: boolean;
  /** Whether to include timestamps */
  timestamps: boolean;
}

export interface SETIConfig {
  /** Provider configurations */
  providers: ProviderConfig[];
  /** Provider routing configuration */
  providerRouting: ProviderRoutingConfig;
  /** Cache configuration */
  cache: CacheConfig;
  /** Logging configuration */
  logging: LogConfig;
  /** Default number of results per search */
  defaultNumResults: number;
  /** Maximum number of results allowed */
  maxNumResults: number;
  /** Request timeout in milliseconds */
  requestTimeoutMs: number;
}

/** MCP Server configuration */
export interface MCPServerConfig {
  name: string;
  version: string;
}
