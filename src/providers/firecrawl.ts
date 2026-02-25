/**
 * Firecrawl provider
 *
 * API documentation: https://docs.firecrawl.dev/features/search
 * Free tier: 500 credits lifetime (not monthly), plus 5 daily runs free
 * Endpoint: /v1/search
 */

import type { SearchOptions, RawSearchResult, ProviderConfig } from '../types/index.js';
import { BaseProvider } from './base.js';
import { ProviderErrorClass } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

/** Firecrawl search response structure */
interface FirecrawlResponse {
  success: boolean;
  data: Array<{
    title?: string;
    url: string;
    markdown?: string;
    description?: string;
  }>;
  error?: string;
}

/** Firecrawl provider implementation */
export class FirecrawlProvider extends BaseProvider {
  readonly name = 'firecrawl';

  constructor(public readonly config: ProviderConfig) {
    super();
  }

  /**
   * Perform search using Firecrawl API
   */
  async search(query: string, options: SearchOptions): Promise<RawSearchResult[]> {
    this.validateAvailability();

    const apiKey = this.getApiKey()!;
    const url = this.config.endpoints.search;

    const requestBody = {
      query,
      limit: options.numResults,
      lang: 'en',
      ...(options.timeFilter && { scrapeOptions: { formats: ['markdown'] } }),
    };

    logger.debug(`Searching Firecrawl`, {
      query: query.substring(0, 50),
      limit: options.numResults,
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

    const data = (await this.parseJson(response)) as FirecrawlResponse;

    if (!data.success && data.error) {
      throw new ProviderErrorClass(this.name, 'provider_error', data.error, false);
    }

    const results = this.transformResults(data);

    logger.debug(`Firecrawl returned ${results.length} results`);

    return results;
  }

  /**
   * Transform Firecrawl response to raw results
   */
  private transformResults(data: FirecrawlResponse): RawSearchResult[] {
    if (!Array.isArray(data.data)) {
      return [];
    }

    return data.data.map((item) => ({
      title: item.title || 'Untitled',
      url: item.url || '',
      snippet: item.description || item.markdown?.substring(0, 200) || '',
      content: item.markdown,
      source: this.name,
    }));
  }

  /**
   * Handle error responses from Firecrawl API
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
        if (message.toLowerCase().includes('credit') || message.toLowerCase().includes('quota')) {
          errorType = 'quota_exceeded';
          retryable = false;
        } else {
          errorType = 'rate_limit';
          retryable = true;
        }
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
