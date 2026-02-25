/**
 * Google Custom Search Engine (CSE) provider
 *
 * API documentation: https://developers.google.com/custom-search/v1/using_rest
 * Free tier: 100 searches/day (3,000/month)
 */

import type { SearchOptions, RawSearchResult, ProviderConfig } from '../types/index.js';
import { BaseProvider } from './base.js';
import { ProviderErrorClass } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

/** Google CSE response structure */
interface GoogleResponse {
  items?: Array<{
    title: string;
    link: string;
    snippet?: string;
    pagemap?: {
      metatags?: Array<{
        'article:published_time'?: string;
      }>;
    };
  }>;
  queries?: {
    request?: Array<{ totalResults?: string }>;
  };
  error?: {
    code: number;
    message: string;
  };
}

/** Google provider implementation */
export class GoogleProvider extends BaseProvider {
  readonly name = 'google';

  constructor(public readonly config: ProviderConfig) {
    super();
  }

  /**
   * Perform search using Google CSE API
   */
  async search(query: string, options: SearchOptions): Promise<RawSearchResult[]> {
    this.validateAvailability();

    const apiKey = this.getApiKey()!;
    const cx = process.env.GOOGLE_CX;

    if (!cx) {
      throw new ProviderErrorClass(
        this.name,
        'auth',
        'GOOGLE_CX environment variable is required',
        false
      );
    }

    const url = this.buildUrl(this.config.endpoints.search, {
      key: apiKey,
      cx: cx,
      q: query,
      num: Math.min(options.numResults, 10), // Google max is 10 per request
      ...(options.safeSearch !== undefined && { safe: options.safeSearch ? 'active' : 'off' }),
      ...(options.timeFilter && { dateRestrict: this.mapTimeFilter(options.timeFilter) }),
    });

    logger.debug(`Searching Google CSE`, {
      query: query.substring(0, 50),
      num: options.numResults,
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

    const data = (await this.parseJson(response)) as GoogleResponse;

    if (data.error) {
      throw new ProviderErrorClass(
        this.name,
        'provider_error',
        `Google API error: ${data.error.message}`,
        false
      );
    }

    const results = this.transformResults(data);

    logger.debug(`Google returned ${results.length} results`);

    return results;
  }

  /**
   * Map time filter to Google's dateRestrict parameter
   */
  private mapTimeFilter(filter: 'day' | 'week' | 'month' | 'year'): string {
    const mapping: Record<string, string> = {
      day: 'd1',
      week: 'w1',
      month: 'm1',
      year: 'y1',
    };
    return mapping[filter] || 'y1';
  }

  /**
   * Transform Google response to raw results
   */
  private transformResults(data: GoogleResponse): RawSearchResult[] {
    if (!data.items) {
      return [];
    }

    return data.items.map((item) => ({
      title: item.title || 'Untitled',
      url: item.link || '',
      snippet: item.snippet || '',
      publishedDate: item.pagemap?.metatags?.[0]?.['article:published_time'],
      source: this.name,
    }));
  }

  /**
   * Handle error responses from Google API
   */
  private async handleErrorResponse(response: Response): Promise<never> {
    const status = response.status;
    let message = `HTTP ${status}: ${response.statusText}`;
    let errorType: 'auth' | 'rate_limit' | 'quota_exceeded' | 'provider_error' = 'provider_error';
    let retryable = false;

    try {
      const errorData = (await response.json()) as {
        error?: { message?: string; errors?: Array<{ reason?: string }> };
      };
      if (errorData.error?.message) {
        message = errorData.error.message;

        const reason = errorData.error.errors?.[0]?.reason;
        if (reason === 'dailyLimitExceeded' || reason === 'quotaExceeded') {
          errorType = 'quota_exceeded';
          retryable = false;
        } else if (reason === 'keyInvalid' || reason === 'authError') {
          errorType = 'auth';
          retryable = false;
        }
      }
    } catch {}

    switch (status) {
      case 400:
        errorType = 'provider_error';
        retryable = false;
        break;
      case 401:
      case 403:
        if (!message.includes('quota') && !message.includes('limit')) {
          errorType = 'auth';
          retryable = false;
        }
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
