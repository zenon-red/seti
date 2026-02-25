/**
 * Jina AI provider
 *
 * API documentation: https://jina.ai/reader/
 * Free tier: 10M tokens
 * Uses s.jina.ai for search
 */

import type { SearchOptions, RawSearchResult, ProviderConfig } from '../types/index.js';
import { BaseProvider } from './base.js';
import { ProviderErrorClass } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

/** Jina search response structure */
interface JinaResponse {
  code: number;
  status: number;
  data: Array<{
    title: string;
    description: string;
    url: string;
  }>;
}

/** Jina provider implementation */
export class JinaProvider extends BaseProvider {
  readonly name = 'jina';

  constructor(public readonly config: ProviderConfig) {
    super();
  }

  /**
   * Perform search using Jina AI Search API
   */
  async search(query: string, options: SearchOptions): Promise<RawSearchResult[]> {
    this.validateAvailability();

    const apiKey = this.getApiKey();
    const url = `${this.config.endpoints.search}/${encodeURIComponent(query)}`;

    logger.debug(`Searching Jina`, { query: query.substring(0, 50) });

    const headers: Record<string, string> = {
      Accept: 'application/json',
    };

    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const response = await this.fetchWithTimeout(url, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      await this.handleErrorResponse(response);
    }

    const data = (await this.parseJson(response)) as JinaResponse;
    const results = this.transformResults(data);

    logger.debug(`Jina returned ${results.length} results`);

    return results.slice(0, options.numResults);
  }

  /**
   * Transform Jina response to raw results
   */
  private transformResults(data: JinaResponse): RawSearchResult[] {
    if (!Array.isArray(data.data)) {
      return [];
    }

    return data.data.map((item) => ({
      title: item.title || 'Untitled',
      url: item.url || '',
      snippet: item.description || '',
      source: this.name,
    }));
  }

  /**
   * Handle error responses from Jina API
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
