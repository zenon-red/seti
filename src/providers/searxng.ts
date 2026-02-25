/**
 * SearXNG provider
 *
 * Uses a self-hosted SearXNG instance as a privacy-respecting metasearch backend.
 */

import type { SearchOptions, RawSearchResult, ProviderConfig } from '../types/index.js';
import { BaseProvider } from './base.js';
import { ProviderErrorClass } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

interface SearXNGResponse {
  results?: Array<{
    title?: string;
    url?: string;
    content?: string;
    score?: number;
    publishedDate?: string;
  }>;
}

/** SearXNG provider implementation */
export class SearXNGProvider extends BaseProvider {
  readonly name = 'searxng';

  constructor(public readonly config: ProviderConfig) {
    super();
  }

  /**
   * Perform search using SearXNG API
   */
  async search(query: string, options: SearchOptions): Promise<RawSearchResult[]> {
    this.validateAvailability();

    const url = this.buildUrl(this.config.endpoints.search, {
      q: query,
      format: 'json',
      ...(options.timeFilter && { time_range: options.timeFilter }),
      ...(options.safeSearch !== undefined && { safesearch: options.safeSearch ? 2 : 0 }),
    });

    logger.debug('Searching SearXNG', {
      query: query.substring(0, 50),
      endpoint: this.config.endpoints.search,
    });

    const response = await this.fetchWithTimeout(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      await this.handleErrorResponse(response);
    }

    const data = (await this.parseJson(response)) as SearXNGResponse;
    const results = this.transformResults(data).slice(0, options.numResults);

    logger.debug(`SearXNG returned ${results.length} results`);

    return results;
  }

  /**
   * Transform SearXNG response to raw results
   */
  private transformResults(data: SearXNGResponse): RawSearchResult[] {
    if (!Array.isArray(data.results)) {
      return [];
    }

    return data.results
      .filter((item) => !!item.url)
      .map((item) => ({
        title: item.title || 'Untitled',
        url: item.url || '',
        snippet: item.content || '',
        score: item.score,
        publishedDate: item.publishedDate,
        source: this.name,
      }));
  }

  /**
   * Handle error responses from SearXNG
   */
  private async handleErrorResponse(response: Response): Promise<never> {
    const status = response.status;
    let message = `HTTP ${status}: ${response.statusText}`;
    let errorType: 'auth' | 'rate_limit' | 'provider_error' = 'provider_error';
    let retryable = false;

    try {
      const errorData = (await response.json()) as { error?: string; message?: string };
      if (errorData.error || errorData.message) {
        message = errorData.error || errorData.message || message;
      }
    } catch {}

    switch (status) {
      case 401:
      case 403:
        errorType = 'auth';
        retryable = false;
        break;
      case 429:
        errorType = 'rate_limit';
        retryable = true;
        break;
      case 500:
      case 502:
      case 503:
      case 504:
        retryable = true;
        break;
    }

    throw new ProviderErrorClass(this.name, errorType, message, retryable);
  }
}
