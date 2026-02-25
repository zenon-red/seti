/**
 * Tavily provider
 *
 * API documentation: https://docs.tavily.com/documentation/api-reference/endpoint/search
 * Free tier: 1,000 searches/month
 */

import type { SearchOptions, RawSearchResult, ProviderConfig } from '../types/index.js';
import { BaseProvider } from './base.js';
import { ProviderErrorClass } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

/** Tavily API response structure */
interface TavilyResponse {
  query: string;
  results: Array<{
    title: string;
    url: string;
    content: string;
    score?: number;
    raw_content?: string;
  }>;
  answer?: string;
  response_time?: number;
}

/** Tavily provider implementation */
export class TavilyProvider extends BaseProvider {
  readonly name = 'tavily';

  constructor(public readonly config: ProviderConfig) {
    super();
  }

  /**
   * Perform search using Tavily API
   */
  async search(query: string, options: SearchOptions): Promise<RawSearchResult[]> {
    this.validateAvailability();

    const apiKey = this.getApiKey()!;
    const url = this.config.endpoints.search;

    const requestBody = {
      query,
      api_key: apiKey,
      max_results: options.numResults,
      search_depth: 'basic',
      include_answer: false,
      include_raw_content: false,
    };

    logger.debug(`Searching Tavily`, {
      query: query.substring(0, 50),
      maxResults: options.numResults,
    });

    const response = await this.fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      await this.handleErrorResponse(response);
    }

    const data = (await this.parseJson(response)) as TavilyResponse;
    const results = this.transformResults(data);

    logger.debug(`Tavily returned ${results.length} results`, {
      responseTime: data.response_time,
    });

    return results;
  }

  /**
   * Transform Tavily response to raw results
   */
  private transformResults(data: TavilyResponse): RawSearchResult[] {
    if (!Array.isArray(data.results)) {
      return [];
    }

    return data.results.map((item) => ({
      title: item.title || 'Untitled',
      url: item.url || '',
      snippet: item.content || '',
      content: item.raw_content,
      score: item.score,
      source: this.name,
    }));
  }

  /**
   * Handle error responses from Tavily API
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
