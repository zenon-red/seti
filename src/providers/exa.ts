/**
 * Exa provider
 *
 * API documentation: https://docs.exa.ai/reference/search
 * Free tier: ~2,000 searches/month ($10 credits)
 */

import type { SearchOptions, RawSearchResult, ProviderConfig } from '../types/index.js';
import { BaseProvider } from './base.js';
import { ProviderErrorClass } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

/** Exa API response structure */
interface ExaResponse {
  results: Array<{
    title?: string;
    url: string;
    text?: string;
    publishedDate?: string;
    author?: string;
    score?: number;
  }>;
  requestId?: string;
}

/** Exa provider implementation */
export class ExaProvider extends BaseProvider {
  readonly name = 'exa';

  constructor(public readonly config: ProviderConfig) {
    super();
  }

  /**
   * Perform search using Exa API
   */
  async search(query: string, options: SearchOptions): Promise<RawSearchResult[]> {
    this.validateAvailability();

    const apiKey = this.getApiKey()!;
    const url = this.config.endpoints.search;

    const requestBody: Record<string, unknown> = {
      query,
      numResults: options.numResults,
      type: 'keyword',
      contents: {
        text: true,
      },
    };

    if (options.timeFilter) {
      const dateFilter = this.mapTimeFilter(options.timeFilter);
      if (dateFilter) {
        requestBody.startPublishedDate = dateFilter;
      }
    }

    logger.debug(`Searching Exa`, {
      query: query.substring(0, 50),
      maxResults: options.numResults,
    });

    const response = await this.fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      await this.handleErrorResponse(response);
    }

    const data = (await this.parseJson(response)) as ExaResponse;
    const results = this.transformResults(data);

    logger.debug(`Exa returned ${results.length} results`);

    return results;
  }

  /**
   * Map time filter to date string
   */
  private mapTimeFilter(filter: 'day' | 'week' | 'month' | 'year'): string | undefined {
    const now = new Date();
    switch (filter) {
      case 'day':
        now.setDate(now.getDate() - 1);
        break;
      case 'week':
        now.setDate(now.getDate() - 7);
        break;
      case 'month':
        now.setMonth(now.getMonth() - 1);
        break;
      case 'year':
        now.setFullYear(now.getFullYear() - 1);
        break;
    }
    return now.toISOString().split('T')[0];
  }

  /**
   * Transform Exa response to raw results
   */
  private transformResults(data: ExaResponse): RawSearchResult[] {
    if (!Array.isArray(data.results)) {
      return [];
    }

    return data.results.map((item) => ({
      title: item.title || 'Untitled',
      url: item.url || '',
      snippet: item.text || '',
      content: item.text,
      publishedDate: item.publishedDate,
      score: item.score,
      source: this.name,
    }));
  }

  /**
   * Handle error responses from Exa API
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
      case 400:
        if (message.toLowerCase().includes('credit') || message.toLowerCase().includes('quota')) {
          errorType = 'quota_exceeded';
          retryable = false;
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
