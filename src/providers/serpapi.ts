/**
 * SerpAPI provider
 *
 * API documentation: https://serpapi.com/search-api
 * Free tier: 250 searches/month
 */

import type { SearchOptions, RawSearchResult, ProviderConfig } from '../types/index.js';
import { BaseProvider } from './base.js';
import { ProviderErrorClass } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

/** SerpAPI response structure */
interface SerpAPIResponse {
  search_metadata?: {
    status: string;
    total_time_taken: number;
  };
  organic_results?: Array<{
    title: string;
    link: string;
    snippet?: string;
    date?: string;
  }>;
  error?: string;
}

/** SerpAPI provider implementation */
export class SerpAPIProvider extends BaseProvider {
  readonly name = 'serpapi';

  constructor(public readonly config: ProviderConfig) {
    super();
  }

  /**
   * Perform search using SerpAPI
   */
  async search(query: string, options: SearchOptions): Promise<RawSearchResult[]> {
    this.validateAvailability();

    const apiKey = this.getApiKey()!;
    const url = this.buildUrl(this.config.endpoints.search, {
      q: query,
      api_key: apiKey,
      engine: 'google',
      num: Math.min(options.numResults, 20),
      ...(options.safeSearch !== undefined && { safe: options.safeSearch ? 'active' : 'off' }),
      ...(options.timeFilter && { tbs: this.mapTimeFilter(options.timeFilter) }),
    });

    logger.debug(`Searching SerpAPI`, { query: query.substring(0, 50), num: options.numResults });

    const response = await this.fetchWithTimeout(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      await this.handleErrorResponse(response);
    }

    const data = (await this.parseJson(response)) as SerpAPIResponse;

    if (data.error) {
      throw new ProviderErrorClass(this.name, 'provider_error', data.error, false);
    }

    const results = this.transformResults(data);

    logger.debug(`SerpAPI returned ${results.length} results`);

    return results;
  }

  /**
   * Map time filter to SerpAPI tbs parameter
   */
  private mapTimeFilter(filter: 'day' | 'week' | 'month' | 'year'): string {
    const mapping: Record<string, string> = {
      day: 'qdr:d',
      week: 'qdr:w',
      month: 'qdr:m',
      year: 'qdr:y',
    };
    return mapping[filter] || '';
  }

  /**
   * Transform SerpAPI response to raw results
   */
  private transformResults(data: SerpAPIResponse): RawSearchResult[] {
    if (!data.organic_results) {
      return [];
    }

    return data.organic_results.map((item) => ({
      title: item.title || 'Untitled',
      url: item.link || '',
      snippet: item.snippet || '',
      publishedDate: item.date,
      source: this.name,
    }));
  }

  /**
   * Handle error responses from SerpAPI
   */
  private async handleErrorResponse(response: Response): Promise<never> {
    const status = response.status;
    let message = `HTTP ${status}: ${response.statusText}`;
    let errorType: 'auth' | 'rate_limit' | 'quota_exceeded' | 'provider_error' = 'provider_error';
    let retryable = false;

    try {
      const errorData = (await response.json()) as { error?: string };
      if (errorData.error) {
        message = errorData.error;
      }
    } catch {}

    const lowerMessage = message.toLowerCase();
    if (lowerMessage.includes('credits') || lowerMessage.includes('plan')) {
      errorType = 'quota_exceeded';
      retryable = false;
    } else if (lowerMessage.includes('rate limit')) {
      errorType = 'rate_limit';
      retryable = true;
    }

    switch (status) {
      case 401:
      case 403:
        errorType = 'auth';
        retryable = false;
        break;
      case 429:
        if (errorType !== 'rate_limit') {
          errorType = 'rate_limit';
          retryable = true;
        }
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
