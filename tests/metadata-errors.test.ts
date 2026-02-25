/**
 * Tests for metadata.errors field behavior
 *
 * Verifies that errors is only included in metadata when there were
 * failed attempts during fallback, not on clean success.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import type { SearchMetadata } from '../src/types/search.js';
import type { FallbackResult } from '../src/balancer/fallback.js';

/**
 * Simulates the metadata construction logic from src/mcp/server.ts
 */
function buildMetadata(
  result: FallbackResult,
  standardizedResults: unknown[],
  startTime: number,
  query: string
): SearchMetadata {
  const errors = result.attempts
    .filter((a) => !a.success && a.error)
    .map((a) => `${a.provider}: ${a.error!.message}`);

  return {
    fallbackTriggered: result.attempts.length > 1,
    providersAttempted: result.attempts.map((a) => a.provider),
    successfulProvider: result.successfulProvider || 'unknown',
    resultCount: standardizedResults.length,
    responseTimeMs: Date.now() - startTime,
    query,
    ...(errors.length > 0 ? { errors } : {}),
  };
}

describe('metadata.errors field', () => {
  const startTime = Date.now();
  const query = 'test query';

  it('should omit errors field when there are no failed attempts (clean success)', () => {
    const mockResult: FallbackResult = {
      success: true,
      successfulProvider: 'google',
      attempts: [
        {
          provider: 'google',
          success: true,
          responseTimeMs: 150,
        },
      ],
      totalTimeMs: 150,
    };

    const metadata = buildMetadata(mockResult, [{ title: 'Result 1' }], startTime, query);

    // errors field should not exist at all
    assert.strictEqual('errors' in metadata, false, 'errors field should not exist');
    assert.strictEqual(Object.hasOwn(metadata, 'errors'), false, 'errors should not be own property');

    // Other fields should be present
    assert.strictEqual(metadata.fallbackTriggered, false);
    assert.deepStrictEqual(metadata.providersAttempted, ['google']);
    assert.strictEqual(metadata.successfulProvider, 'google');
    assert.strictEqual(metadata.resultCount, 1);
    assert.strictEqual(metadata.query, query);
  });

  it('should include errors field when fallback had failures before success', () => {
    const mockResult: FallbackResult = {
      success: true,
      successfulProvider: 'bing',
      attempts: [
        {
          provider: 'google',
          success: false,
          responseTimeMs: 100,
          error: {
            type: 'rate_limit',
            message: 'Quota exceeded',
            retryable: true,
            provider: 'google',
            timestamp: new Date(),
          },
        },
        {
          provider: 'bing',
          success: true,
          responseTimeMs: 200,
        },
      ],
      totalTimeMs: 300,
    };

    const metadata = buildMetadata(mockResult, [{ title: 'Result 1' }], startTime, query);

    // errors field should exist with the failure message
    assert.strictEqual('errors' in metadata, true, 'errors field should exist');
    assert.deepStrictEqual(metadata.errors, ['google: Quota exceeded']);

    // Other fields should reflect the fallback
    assert.strictEqual(metadata.fallbackTriggered, true);
    assert.deepStrictEqual(metadata.providersAttempted, ['google', 'bing']);
    assert.strictEqual(metadata.successfulProvider, 'bing');
  });

  it('should include errors field when all providers fail', () => {
    const mockResult: FallbackResult = {
      success: false,
      attempts: [
        {
          provider: 'google',
          success: false,
          responseTimeMs: 100,
          error: {
            type: 'rate_limit',
            message: 'Quota exceeded',
            retryable: true,
            provider: 'google',
            timestamp: new Date(),
          },
        },
        {
          provider: 'bing',
          success: false,
          responseTimeMs: 150,
          error: {
            type: 'auth',
            message: 'Invalid API key',
            retryable: false,
            provider: 'bing',
            timestamp: new Date(),
          },
        },
      ],
      totalTimeMs: 250,
      error: 'All providers failed',
    };

    const metadata = buildMetadata(mockResult, [], startTime, query);

    // errors field should have both failure messages
    assert.strictEqual('errors' in metadata, true, 'errors field should exist');
    assert.deepStrictEqual(metadata.errors, ['google: Quota exceeded', 'bing: Invalid API key']);

    assert.strictEqual(metadata.fallbackTriggered, true);
    assert.deepStrictEqual(metadata.providersAttempted, ['google', 'bing']);
    assert.strictEqual(metadata.successfulProvider, 'unknown');
  });

  it('should handle single failure with no success (edge case)', () => {
    const mockResult: FallbackResult = {
      success: false,
      attempts: [
        {
          provider: 'google',
          success: false,
          responseTimeMs: 100,
          error: {
            type: 'network',
            message: 'Connection timeout',
            retryable: true,
            provider: 'google',
            timestamp: new Date(),
          },
        },
      ],
      totalTimeMs: 100,
      error: 'All providers failed',
    };

    const metadata = buildMetadata(mockResult, [], startTime, query);

    assert.strictEqual('errors' in metadata, true, 'errors field should exist');
    assert.deepStrictEqual(metadata.errors, ['google: Connection timeout']);
    assert.strictEqual(metadata.fallbackTriggered, false); // Only one attempt
  });

  it('should handle multiple failures before one success', () => {
    const mockResult: FallbackResult = {
      success: true,
      successfulProvider: 'serper',
      attempts: [
        {
          provider: 'google',
          success: false,
          responseTimeMs: 100,
          error: {
            type: 'rate_limit',
            message: 'Quota exceeded',
            retryable: true,
            provider: 'google',
            timestamp: new Date(),
          },
        },
        {
          provider: 'bing',
          success: false,
          responseTimeMs: 200,
          error: {
            type: 'timeout',
            message: 'Request timed out after 30s',
            retryable: true,
            provider: 'bing',
            timestamp: new Date(),
          },
        },
        {
          provider: 'serper',
          success: true,
          responseTimeMs: 300,
        },
      ],
      totalTimeMs: 600,
    };

    const metadata = buildMetadata(mockResult, [{}, {}, {}], startTime, query);

    assert.deepStrictEqual(metadata.errors, [
      'google: Quota exceeded',
      'bing: Request timed out after 30s',
    ]);
    assert.strictEqual(metadata.fallbackTriggered, true);
    assert.deepStrictEqual(metadata.providersAttempted, ['google', 'bing', 'serper']);
    assert.strictEqual(metadata.successfulProvider, 'serper');
  });
});
