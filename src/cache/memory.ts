/**
 * In-memory LRU cache with TTL support
 *
 * Implements a Least Recently Used (LRU) cache with Time-To-Live (TTL)
 * expiration for search results.
 */

import type { SearchResponse, CachedResult } from '../types/index.js';
import { logger } from '../utils/logger.js';

/** Cache entry with metadata */
interface CacheEntry {
  /** Cached data */
  data: SearchResponse;
  /** When entry was created */
  createdAt: number;
  /** TTL in milliseconds */
  ttlMs: number;
  /** Last access time */
  lastAccessed: number;
}

type CacheSearchOptions = {
  numResults: number;
  provider?: string;
  timeFilter?: string;
  safeSearch?: boolean;
};

/** LRU Cache with TTL */
export class MemoryCache {
  private cache = new Map<string, CacheEntry>();

  constructor(
    private maxSize: number,
    private defaultTtlMs: number
  ) {}

  /**
   * Generate cache key from query and options
   */
  generateKey(query: string, options: CacheSearchOptions): string {
    const normalizedQuery = query.toLowerCase().trim().replace(/\s+/g, ' ');
    const keyParts = [normalizedQuery, `n:${options.numResults}`];
    if (options.provider) {
      keyParts.push(`p:${options.provider}`);
    }
    if (options.timeFilter) {
      keyParts.push(`t:${options.timeFilter}`);
    }
    if (options.safeSearch !== undefined) {
      keyParts.push(`s:${options.safeSearch}`);
    }
    return keyParts.join('|');
  }

  /**
   * Get cached response if available and not expired
   */
  get(query: string, options: CacheSearchOptions): CachedResult | undefined {
    const key = this.generateKey(query, options);
    const entry = this.cache.get(key);

    if (!entry) {
      return undefined;
    }

    const now = Date.now();
    if (now - entry.createdAt > entry.ttlMs) {
      this.cache.delete(key);
      logger.debug('Cache entry expired', { key: key.substring(0, 50) });
      return undefined;
    }

    entry.lastAccessed = now;

    logger.debug('Cache hit', { key: key.substring(0, 50) });

    return {
      response: entry.data,
      cachedAt: new Date(entry.createdAt),
      ttlSeconds: Math.floor(entry.ttlMs / 1000),
    };
  }

  /**
   * Store response in cache
   */
  set(
    query: string,
    options: CacheSearchOptions,
    response: SearchResponse,
    ttlSeconds?: number
  ): void {
    const key = this.generateKey(query, options);
    const ttlMs = ttlSeconds ? ttlSeconds * 1000 : this.defaultTtlMs;

    while (this.cache.size >= this.maxSize) {
      this.evictLRU();
    }

    const now = Date.now();
    this.cache.set(key, {
      data: response,
      createdAt: now,
      ttlMs,
      lastAccessed: now,
    });

    logger.debug('Cache stored', {
      key: key.substring(0, 50),
      ttlSeconds: Math.floor(ttlMs / 1000),
    });
  }

  /**
   * Check if cache has valid entry
   */
  has(query: string, options: CacheSearchOptions): boolean {
    const key = this.generateKey(query, options);
    const entry = this.cache.get(key);

    if (!entry) return false;

    if (Date.now() - entry.createdAt > entry.ttlMs) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Invalidate a specific cache entry
   */
  invalidate(query: string, options: CacheSearchOptions): boolean {
    const key = this.generateKey(query, options);
    return this.cache.delete(key);
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    logger.info('Cache cleared', { entriesRemoved: size });
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    maxSize: number;
    defaultTtlSeconds: number;
  } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      defaultTtlSeconds: Math.floor(this.defaultTtlMs / 1000),
    };
  }

  /**
   * Clean up expired entries
   */
  cleanup(): number {
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.cache) {
      if (now - entry.createdAt > entry.ttlMs) {
        this.cache.delete(key);
        removed++;
      }
    }

    if (removed > 0) {
      logger.debug('Cache cleanup completed', { removed });
    }

    return removed;
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    let lruKey: string | undefined;
    let lruTime = Infinity;

    for (const [key, entry] of this.cache) {
      if (entry.lastAccessed < lruTime) {
        lruTime = entry.lastAccessed;
        lruKey = key;
      }
    }

    if (lruKey) {
      this.cache.delete(lruKey);
      logger.debug('Evicted LRU cache entry', { key: lruKey.substring(0, 50) });
    }
  }
}
