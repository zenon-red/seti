/**
 * Circuit breaker pattern implementation
 *
 * Prevents cascading failures by temporarily disabling providers
 * that are experiencing repeated errors.
 */

import type { CircuitBreakerState } from '../types/index.js';
import { logger } from '../utils/logger.js';

/** Circuit breaker configuration */
interface CircuitBreakerConfig {
  /** Number of consecutive failures before opening circuit */
  threshold: number;
  /** Time to wait before attempting to close circuit (ms) */
  resetTimeoutMs: number;
}

/** Circuit breaker for a single provider */
class CircuitBreaker {
  private state: CircuitBreakerState = {
    failures: 0,
    isOpen: false,
  };
  private threshold: number;
  private resetTimeoutMs: number;

  constructor(
    private providerName: string,
    config: CircuitBreakerConfig
  ) {
    this.threshold = config.threshold;
    this.resetTimeoutMs = config.resetTimeoutMs;
  }

  /**
   * Check if circuit is closed (requests allowed)
   */
  isClosed(): boolean {
    if (!this.state.isOpen) {
      return true;
    }

    if (this.state.nextRetry && new Date() >= this.state.nextRetry) {
      logger.info(`Circuit breaker half-open for ${this.providerName}`, {
        provider: this.providerName,
      });
      this.state.isOpen = false;
      this.state.failures = 0;
      return true;
    }

    return false;
  }

  /**
   * Record a successful request
   */
  recordSuccess(): void {
    if (this.state.failures > 0) {
      logger.debug(`Resetting circuit breaker for ${this.providerName}`, {
        provider: this.providerName,
        previousFailures: this.state.failures,
      });
    }
    this.state.failures = 0;
    this.state.isOpen = false;
  }

  /**
   * Record a failed request
   */
  recordFailure(): void {
    this.state.failures++;
    this.state.lastFailure = new Date();

    logger.debug(`Recorded failure for ${this.providerName}`, {
      provider: this.providerName,
      failures: this.state.failures,
      threshold: this.threshold,
    });

    if (this.state.failures >= this.threshold) {
      this.open();
    }
  }

  /**
   * Open the circuit (block requests)
   */
  private open(): void {
    this.state.isOpen = true;
    this.state.nextRetry = new Date(Date.now() + this.resetTimeoutMs);

    logger.warn(`Circuit breaker opened for ${this.providerName}`, {
      provider: this.providerName,
      failures: this.state.failures,
      nextRetry: this.state.nextRetry.toISOString(),
    });
  }

  /**
   * Get current state
   */
  getState(): CircuitBreakerState {
    return { ...this.state };
  }
}

/** Circuit breaker manager for all providers */
export class CircuitBreakerManager {
  private breakers = new Map<string, CircuitBreaker>();

  constructor(providerNames: string[], config: CircuitBreakerConfig) {
    for (const name of providerNames) {
      this.breakers.set(name, new CircuitBreaker(name, config));
    }
  }

  /**
   * Check if a provider's circuit is closed
   */
  isClosed(providerName: string): boolean {
    const breaker = this.breakers.get(providerName);
    if (!breaker) return false;
    return breaker.isClosed();
  }

  /**
   * Record a successful request for a provider
   */
  recordSuccess(providerName: string): void {
    const breaker = this.breakers.get(providerName);
    if (breaker) {
      breaker.recordSuccess();
    }
  }

  /**
   * Record a failed request for a provider
   */
  recordFailure(providerName: string): void {
    const breaker = this.breakers.get(providerName);
    if (breaker) {
      breaker.recordFailure();
    }
  }

  /**
   * Get circuit breaker state for a provider
   */
  getState(providerName: string): CircuitBreakerState | undefined {
    const breaker = this.breakers.get(providerName);
    return breaker?.getState();
  }

  /**
   * Get all circuit breaker states
   */
  getAllStates(): Map<string, CircuitBreakerState> {
    const states = new Map<string, CircuitBreakerState>();
    for (const [name, breaker] of this.breakers) {
      states.set(name, breaker.getState());
    }
    return states;
  }
}
