import type {
  ProviderConfig,
  SearchOptions,
  RawSearchResult,
  StandardizedSearchResult,
  ProviderStatus,
  ISearchProvider,
} from '../types/index.js';
import { classifyError, ProviderErrorClass } from '../utils/errors.js';
import { standardizeResults } from '../utils/standardize.js';
import { logger } from '../utils/logger.js';

export abstract class BaseProvider implements ISearchProvider {
  abstract readonly name: string;
  abstract readonly config: ProviderConfig;

  protected getApiKey(): string | undefined {
    if (!this.config.apiKeyEnvVar) return undefined;
    return process.env[this.config.apiKeyEnvVar];
  }

  isAvailable(): boolean {
    if (!this.config.enabled) return false;
    if (!this.config.requiresApiKey) return true;
    return !!this.getApiKey();
  }

  getRemainingQuota(): number | null {
    if (this.config.monthlyQuota === null) return null;
    return this.config.monthlyQuota;
  }

  getStatus(): ProviderStatus {
    return {
      name: this.name,
      enabled: this.config.enabled,
      hasApiKey: this.isAvailable(),
      health: this.isAvailable() ? 'healthy' : 'unhealthy',
      quota: this.config.monthlyQuota,
      usedThisMonth: 0,
      remaining: this.getRemainingQuota(),
      circuitBreakerOpen: false,
    };
  }

  abstract search(query: string, options: SearchOptions): Promise<RawSearchResult[]>;

  standardize(raw: RawSearchResult[]): StandardizedSearchResult[] {
    return standardizeResults(raw, this.name);
  }

  protected async fetchWithTimeout(
    url: string,
    options: RequestInit & { timeoutMs?: number }
  ): Promise<Response> {
    const timeoutMs = options.timeoutMs ?? this.config.timeoutMs;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      return response;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ProviderErrorClass(
          this.name,
          'timeout',
          `Request timed out after ${timeoutMs}ms`,
          true
        );
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  protected handleError(error: unknown): ProviderErrorClass {
    const classified = classifyError(this.name, error);
    logger.debug(`Provider ${this.name} error classified`, {
      provider: this.name,
      type: classified.type,
      retryable: classified.retryable,
    });
    return classified as ProviderErrorClass;
  }

  protected validateAvailability(): void {
    if (!this.isAvailable()) {
      throw new ProviderErrorClass(
        this.name,
        'auth',
        `Provider ${this.name} is not available - check API key and enabled status`,
        false
      );
    }
  }

  protected buildUrl(baseUrl: string, params: Record<string, string | number | boolean>): string {
    const url = new URL(baseUrl);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }

  protected async parseJson(response: Response): Promise<unknown> {
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch (error) {
      throw new ProviderErrorClass(
        this.name,
        'parsing_error',
        `Failed to parse JSON response: ${error instanceof Error ? error.message : String(error)}`,
        false
      );
    }
  }
}
