/**
 * Fallback manager for provider retries
 *
 * Manages retry attempts across multiple providers when a search fails.
 * Tracks attempted providers and error summaries.
 */

import type { ProviderError, RawSearchResult } from '../types/index.js';
import { logger } from '../utils/logger.js';

/** Result of a fallback attempt */
export interface FallbackAttempt {
  /** Provider name */
  provider: string;
  /** Whether attempt succeeded */
  success: boolean;
  /** Error details if failed */
  error?: ProviderError;
  /** Response time in ms */
  responseTimeMs: number;
}

/** Final fallback result */
export interface FallbackResult {
  /** Results if successful */
  results?: RawSearchResult[];
  /** Successful provider name */
  successfulProvider?: string;
  /** All attempts made */
  attempts: FallbackAttempt[];
  /** Whether any attempt succeeded */
  success: boolean;
  /** Total time spent in ms */
  totalTimeMs: number;
  /** Error message if all failed */
  error?: string;
}

/** Function to attempt search with a provider */
export type SearchFunction = (provider: string) => Promise<RawSearchResult[]>;

/** Fallback manager */
export class FallbackManager {
  private attempts: FallbackAttempt[] = [];
  private startTime: number;

  constructor(
    private maxRetries: number,
    private providerOrder: string[]
  ) {
    this.startTime = Date.now();
  }

  /**
   * Execute search with fallback across providers
   */
  async execute(searchFn: SearchFunction): Promise<FallbackResult> {
    const providerQueue = [...this.providerOrder];

    while (providerQueue.length > 0 && this.attempts.length < this.maxRetries) {
      const provider = providerQueue.shift()!;

      const attemptStart = Date.now();

      try {
        logger.debug(`Attempting search with ${provider}`, { provider });

        // eslint-disable-next-line no-await-in-loop
        const results = await searchFn(provider);

        const responseTimeMs = Date.now() - attemptStart;

        this.attempts.push({
          provider,
          success: true,
          responseTimeMs,
        });

        logger.info(`Search successful with ${provider}`, {
          provider,
          responseTimeMs,
          results: results.length,
        });

        return {
          results,
          successfulProvider: provider,
          attempts: this.attempts,
          success: true,
          totalTimeMs: Date.now() - this.startTime,
        };
      } catch (error) {
        const responseTimeMs = Date.now() - attemptStart;
        const providerError = error as ProviderError;

        this.attempts.push({
          provider,
          success: false,
          error: providerError,
          responseTimeMs,
        });

        logger.warn(`Search failed with ${provider}`, {
          provider,
          errorType: providerError?.type || 'unknown',
          errorMessage: providerError?.message || String(error),
          retryable: providerError?.retryable ?? false,
        });

        if (providerError?.retryable === false) {
          logger.debug(`${provider} failed with non-retryable error, trying next provider`);
        }
      }
    }

    const lastError = this.attempts[this.attempts.length - 1]?.error;

    logger.error('All fallback attempts failed', {
      attempts: this.attempts.length,
      providersTried: this.attempts.map((a) => a.provider),
    });

    return {
      attempts: this.attempts,
      success: false,
      totalTimeMs: Date.now() - this.startTime,
      error: lastError?.message || 'All providers failed',
    };
  }

  /**
   * Get attempted providers
   */
  getAttemptedProviders(): string[] {
    return this.attempts.map((a) => a.provider);
  }

  /**
   * Get error summaries
   */
  getErrorSummaries(): string[] {
    return this.attempts
      .filter((a) => !a.success && a.error)
      .map((a) => `${a.provider}: ${a.error!.type} - ${a.error!.message}`);
  }
}
