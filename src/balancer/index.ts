import type { ProviderConfig, SearchOptions, ProviderRoutingStrategy } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { classifyError } from '../utils/errors.js';
import { CircuitBreakerManager } from './circuit-breaker.js';
import { UsageTracker } from './tracker.js';
import { getStrategy, rotateArray, type StrategyContext } from './strategies.js';
import { FallbackManager, type FallbackResult } from './fallback.js';
import type { ISearchProvider } from '../types/index.js';

interface ResponseTimeEntry {
  timeMs: number;
  timestamp: Date;
}

interface BalancerConfig {
  strategy: ProviderRoutingStrategy;
  maxRetries: number;
  enableCircuitBreaker: boolean;
  circuitBreakerThreshold: number;
  circuitBreakerResetMs: number;
}

export class ProviderRouter {
  private providers = new Map<string, ISearchProvider>();
  private providerConfigs = new Map<string, ProviderConfig>();
  private tracker: UsageTracker;
  private circuitBreakers?: CircuitBreakerManager;
  private responseTimes = new Map<string, ResponseTimeEntry[]>();
  private strategyContext: StrategyContext;
  private usageFilePath?: string;
  private roundRobinIndex = 0;

  constructor(
    private config: BalancerConfig,
    usageFilePath?: string
  ) {
    this.usageFilePath = usageFilePath;
    this.tracker = new UsageTracker([], usageFilePath);
    this.strategyContext = {
      providers: this.providerConfigs,
      budgets: new Map(),
      responseTimes: new Map(),
      lastIndex: 0,
    };

    if (config.enableCircuitBreaker) {
      this.circuitBreakers = new CircuitBreakerManager([], {
        threshold: config.circuitBreakerThreshold,
        resetTimeoutMs: config.circuitBreakerResetMs,
      });
    }
  }

  registerProvider(provider: ISearchProvider): void {
    const config = provider.config;
    const name = config.name;

    this.providers.set(name, provider);
    this.providerConfigs.set(name, config);

    logger.debug(`Registered provider: ${name}`, {
      provider: name,
      priority: config.basePriority,
      quota: config.monthlyQuota,
    });
  }

  async initialize(): Promise<void> {
    const configs = Array.from(this.providerConfigs.values());
    this.tracker = new UsageTracker(configs, this.usageFilePath);
    await this.tracker.initialize();

    if (this.config.enableCircuitBreaker) {
      const names = Array.from(this.providers.keys());
      this.circuitBreakers = new CircuitBreakerManager(names, {
        threshold: this.config.circuitBreakerThreshold,
        resetTimeoutMs: this.config.circuitBreakerResetMs,
      });
    }

    logger.info('Provider router initialized', {
      providers: Array.from(this.providers.keys()),
      strategy: this.config.strategy,
    });
  }

  async search(query: string, options: SearchOptions): Promise<FallbackResult> {
    const startTime = Date.now();

    const providerOrder = this.buildProviderOrder(options.provider);

    if (providerOrder.length === 0) {
      return {
        attempts: [],
        success: false,
        totalTimeMs: Date.now() - startTime,
        error: 'No providers available',
      };
    }

    logger.info('Starting search with fallback', {
      query: query.substring(0, 50),
      providerOrder,
    });

    const fallback = new FallbackManager(this.config.maxRetries, providerOrder);

    const result = await fallback.execute(async (providerName) => {
      const provider = this.providers.get(providerName)!;

      try {
        const searchStart = Date.now();
        const results = await provider.search(query, options);
        const searchTime = Date.now() - searchStart;

        this.recordSuccess(providerName, searchTime);

        return results;
      } catch (error) {
        this.recordFailure(providerName, error);
        throw error;
      }
    });

    if (result.success && result.successfulProvider) {
      this.tracker.recordUsage(result.successfulProvider);
    }

    return result;
  }

  getProviderStatus(): Array<{
    name: string;
    enabled: boolean;
    hasApiKey: boolean;
    health: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
    quota: number | null;
    usedThisMonth: number;
    remaining: number | null;
    circuitBreakerOpen: boolean;
  }> {
    return Array.from(this.providers.values()).map((provider) => {
      const config = provider.config;
      const budget = this.tracker.getBudget(config.name);
      const breakerState = this.circuitBreakers?.getState(config.name);

      let health: 'healthy' | 'degraded' | 'unhealthy' | 'unknown' = 'unknown';
      if (breakerState?.isOpen) {
        health = 'unhealthy';
      } else if (breakerState && breakerState.failures > 0) {
        health = 'degraded';
      } else if (provider.isAvailable()) {
        health = 'healthy';
      }

      return {
        name: config.name,
        enabled: config.enabled,
        hasApiKey: provider.isAvailable(),
        health,
        quota: config.monthlyQuota,
        usedThisMonth: budget?.used ?? 0,
        remaining: budget?.remaining ?? config.monthlyQuota,
        circuitBreakerOpen: breakerState?.isOpen ?? false,
      };
    });
  }

  getUsageReport(): ReturnType<UsageTracker['getUsageReport']> {
    return this.tracker.getUsageReport();
  }

  private isProviderAvailable(name: string): boolean {
    const provider = this.providers.get(name);
    if (!provider) return false;
    if (!provider.isAvailable()) return false;
    if (!this.tracker.hasRemainingQuota(name)) return false;
    if (this.circuitBreakers && !this.circuitBreakers.isClosed(name)) return false;
    return true;
  }

  private getAvailableProviders(): string[] {
    const available: string[] = [];

    for (const name of this.providers.keys()) {
      if (this.isProviderAvailable(name)) {
        available.push(name);
      }
    }

    return available;
  }

  private buildProviderOrder(preferred?: string): string[] {
    const order: string[] = [];

    if (preferred && this.isProviderAvailable(preferred)) {
      order.push(preferred);
    }

    const available = this.getAvailableProviders().filter((p) => p !== preferred);

    if (this.config.strategy === 'priority') {
      const withPriority = available.map((name) => ({
        name,
        priority: this.providerConfigs.get(name)?.basePriority ?? 999,
      }));
      withPriority.sort((a, b) => a.priority - b.priority);
      order.push(...withPriority.map((p) => p.name));
    } else if (this.config.strategy === 'round_robin') {
      this.updateStrategyContext();
      const strategy = getStrategy(this.config.strategy);
      const startProvider = strategy(available, this.strategyContext);

      if (startProvider) {
        this.roundRobinIndex = this.strategyContext.lastIndex;

        // eslint-disable-next-line unicorn/no-array-sort
        const sorted = Array.from(available).sort();
        const startIdx = sorted.indexOf(startProvider);
        order.push(...rotateArray(sorted, startIdx));
      }
    } else {
      this.updateStrategyContext();
      const strategy = getStrategy(this.config.strategy);

      const remaining = [...available];
      while (remaining.length > 0) {
        const selected = strategy(remaining, this.strategyContext);
        if (!selected) break;
        order.push(selected);
        const idx = remaining.indexOf(selected);
        if (idx >= 0) remaining.splice(idx, 1);
      }
    }

    return order;
  }

  private updateStrategyContext(): void {
    for (const name of this.providers.keys()) {
      const budget = this.tracker.getBudget(name);
      if (budget) {
        this.strategyContext.budgets.set(name, budget);
      }
    }

    for (const [name, entries] of this.responseTimes) {
      if (entries.length > 0) {
        const avg = entries.reduce((sum, e) => sum + e.timeMs, 0) / entries.length;
        this.strategyContext.responseTimes.set(name, avg);
      }
    }

    this.strategyContext.lastIndex = this.roundRobinIndex;
  }

  private recordSuccess(providerName: string, timeMs: number): void {
    this.circuitBreakers?.recordSuccess(providerName);

    if (!this.responseTimes.has(providerName)) {
      this.responseTimes.set(providerName, []);
    }
    const entries = this.responseTimes.get(providerName)!;
    entries.push({ timeMs, timestamp: new Date() });

    if (entries.length > 50) {
      entries.shift();
    }
  }

  private recordFailure(providerName: string, error: unknown): void {
    const classified = classifyError(providerName, error);
    this.circuitBreakers?.recordFailure(providerName);
    logger.debug(`Recorded failure for ${providerName}`, {
      provider: providerName,
      errorType: classified.type,
      retryable: classified.retryable,
    });
  }
}
