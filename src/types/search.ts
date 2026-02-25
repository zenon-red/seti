export interface SearchOptions {
  query: string;
  numResults: number;
  provider?: string;
  timeFilter?: 'day' | 'week' | 'month' | 'year';
  safeSearch?: boolean;
  timeoutMs?: number;
}

export interface RawSearchResult {
  title: string;
  url: string;
  snippet?: string;
  content?: string;
  publishedDate?: string;
  source?: string;
  [key: string]: unknown;
}

export interface StandardizedSearchResult {
  title: string;
  link: string;
  snippet: string;
  content?: string;
  provider: string;
  publishedDate?: string;
  score?: number;
}

export interface SearchMetadata {
  fallbackTriggered: boolean;
  providersAttempted: string[];
  successfulProvider: string;
  resultCount: number;
  responseTimeMs: number;
  errors?: string[];
  query: string;
}

export interface SearchResponse {
  results: StandardizedSearchResult[];
  metadata: SearchMetadata;
}

export interface CachedResult {
  response: SearchResponse;
  cachedAt: Date;
  ttlSeconds: number;
}

export interface ProviderUsage {
  provider: string;
  usedThisMonth: number;
  quota: number | null;
  remaining: number | null;
  quotaExceeded: boolean;
  lastUsed?: Date;
  avgResponseTimeMs?: number;
}

export interface UsageReport {
  providers: ProviderUsage[];
  totalUsed: number;
  totalQuota: number | null;
  generatedAt: Date;
}
