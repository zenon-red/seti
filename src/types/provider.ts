/**
 * Provider-related type definitions
 */

import type {
  ProviderConfig,
  RawSearchResult,
  StandardizedSearchResult,
  SearchOptions,
} from './index.js';

/** Provider health status */
export type ProviderHealth = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

/** Provider status information */
export interface ProviderStatus {
  /** Provider name */
  name: string;
  /** Whether provider is enabled */
  enabled: boolean;
  /** Whether API key is configured */
  hasApiKey: boolean;
  /** Current health status */
  health: ProviderHealth;
  /** Monthly quota */
  quota: number | null;
  /** Used this month */
  usedThisMonth: number;
  /** Remaining quota */
  remaining: number | null;
  /** Whether circuit breaker is open */
  circuitBreakerOpen: boolean;
  /** Last error message if any */
  lastError?: string;
  /** Average response time */
  avgResponseTimeMs?: number;
}

/** Circuit breaker state */
export interface CircuitBreakerState {
  /** Number of consecutive failures */
  failures: number;
  /** Whether circuit is open */
  isOpen: boolean;
  /** Last failure timestamp */
  lastFailure?: Date;
  /** When circuit will close (if open) */
  nextRetry?: Date;
}

/** Response time tracking entry */
export interface ResponseTimeEntry {
  /** Provider name */
  provider: string;
  /** Response time in milliseconds */
  timeMs: number;
  /** Timestamp */
  timestamp: Date;
  /** Whether request succeeded */
  success: boolean;
}

/** Error classification */
export type ErrorType =
  | 'network' // Network connectivity issues
  | 'timeout' // Request timeout
  | 'rate_limit' // Rate limit exceeded
  | 'auth' // Authentication error
  | 'quota_exceeded' // Monthly quota exceeded
  | 'invalid_request' // Invalid request parameters
  | 'provider_error' // Provider returned error
  | 'parsing_error' // Failed to parse response
  | 'unknown'; // Unknown error

/** Classified error */
export interface ProviderError {
  /** Error type */
  type: ErrorType;
  /** Error message */
  message: string;
  /** Original error if any */
  originalError?: Error;
  /** Whether error is retryable */
  retryable: boolean;
  /** Provider that threw the error */
  provider: string;
  /** Timestamp */
  timestamp: Date;
}

/** Abstract provider interface */
export interface ISearchProvider {
  /** Provider name */
  readonly name: string;
  /** Provider configuration */
  readonly config: ProviderConfig;

  /**
   * Perform a search
   * @param query Search query
   * @param options Search options
   * @returns Raw search results
   */
  search(query: string, options: SearchOptions): Promise<RawSearchResult[]>;

  /**
   * Check if provider is available (has API key, not disabled)
   */
  isAvailable(): boolean;

  /**
   * Get remaining quota for this month
   */
  getRemainingQuota(): number | null;

  /**
   * Get current status
   */
  getStatus(): ProviderStatus;

  /**
   * Standardize raw results to common format
   * @param raw Raw results from this provider
   * @returns Standardized results
   */
  standardize(raw: RawSearchResult[]): StandardizedSearchResult[];
}

/** Constructor type for providers */
export type ProviderConstructor = new () => ISearchProvider;

/** Provider registry entry */
export interface ProviderRegistryEntry {
  /** Provider name */
  name: string;
  /** Provider constructor */
  constructor: ProviderConstructor;
  /** Default configuration */
  defaultConfig: ProviderConfig;
}
