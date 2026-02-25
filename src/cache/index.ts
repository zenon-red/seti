/**
 * Cache layer exports
 *
 * Provides caching functionality for search results.
 */

import { MemoryCache } from './memory.js';

export * from './memory.js';

/** Global cache instance */
let globalCache: MemoryCache | null = null;

/**
 * Initialize the cache with configuration
 */
export function initializeCache(
  enabled: boolean,
  ttlSeconds: number,
  maxSize: number
): MemoryCache | null {
  if (!enabled) {
    globalCache = null;
    return null;
  }

  globalCache = new MemoryCache(maxSize, ttlSeconds * 1000);
  return globalCache;
}

/**
 * Get the global cache instance
 */
export function getCache(): MemoryCache | null {
  return globalCache;
}

/**
 * Clear the global cache
 */
export function clearCache(): void {
  globalCache?.clear();
}
