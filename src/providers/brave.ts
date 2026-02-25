/**
 * Brave Search provider
 *
 * API documentation: https://api-dashboard.search.brave.com/app/documentation/web-search/get-started
 * Free tier: 2,000 searches/month
 */

import type { SearchOptions, RawSearchResult, ProviderConfig } from '../types/index.js';
import { BaseProvider } from './base.js';
import { ProviderErrorClass } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

/** Brave Search response structure */
interface BraveResponse {
  web?: {
    results?: Array<{
      title: string;
      url: string;
      description: string;
      age?: string;
    }>;
  };
  query?: {
    query: string;
  };
}

/** Brave provider implementation */
export class BraveProvider extends BaseProvider {
  readonly name = 'brave';

  constructor(public readonly config: ProviderConfig) {
    super();
  }

  /**
   * Perform search using Brave Search API
   */
  async search(query: string, options: SearchOptions): Promise<RawSearchResult[]> {
    this.validateAvailability();

    const apiKey = this.getApiKey()!;
    const url = this.buildUrl(this.config.endpoints.search, {
      q: query,
      count: Math.min(options.numResults, 20),
      offset: 0,
      ...(options.timeFilter && { freshness: this.mapTimeFilter(options.timeFilter) }),
      ...(options.safeSearch !== undefined && {
        safesearch: options.safeSearch ? 'strict' : 'off',
      }),
    });

    logger.debug(`Searching Brave`, { query: query.substring(0, 50), count: options.numResults });

    const response = await this.fetchWithTimeout(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'X-Subscription-Token': apiKey,
      },
    });

    if (!response.ok) {
      await this.handleErrorResponse(response);
    }

    const data = (await this.parseJson(response)) as BraveResponse;
    const results = this.transformResults(data);

    logger.debug(`Brave returned ${results.length} results`);

    return results;
  }

  /**
   * Map time filter to Brave's freshness parameter
   */
  private mapTimeFilter(filter: 'day' | 'week' | 'month' | 'year'): string {
    const mapping: Record<string, string> = {
      day: 'pd',
      week: 'pw',
      month: 'pm',
      year: 'py',
    };
    return mapping[filter] || 'py';
  }

  /**
   * Transform Brave response to raw results
   */
  private transformResults(data: BraveResponse): RawSearchResult[] {
    if (!data.web?.results) {
      return [];
    }

    return data.web.results.map((item) => ({
      title: item.title || 'Untitled',
      url: item.url || '',
      snippet: item.description || '',
      publishedDate: item.age,
      source: this.name,
    }));
  }

  /**
   * Handle error responses from Brave API
   */
  private async handleErrorResponse(response: Response): Promise<never> {
    const status = response.status;
    let message = `HTTP ${status}: ${response.statusText}`;
    let errorType: 'auth' | 'rate_limit' | 'quota_exceeded' | 'provider_error' = 'provider_error';
    let retryable = false;

    try {
      const errorData = (await response.json()) as { message?: string; error?: string };
      if (errorData.message || errorData.error) {
        message = errorData.message || errorData.error || message;
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
      case 402:
        errorType = 'quota_exceeded';
        retryable = false;
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
