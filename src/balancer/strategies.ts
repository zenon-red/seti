/**
 * Provider routing strategies
 *
 * Provides multiple strategies for selecting providers:
 * - priority: Select by base priority order
 * - weighted_random: Weighted by remaining budget
 * - round_robin: Cycle through providers
 * - fastest: Select based on response time history
 */

import type { ProviderConfig } from '../types/index.js';
import type { BudgetInfo } from './tracker.js';
import { logger } from '../utils/logger.js';

/** Strategy selection context */
export interface StrategyContext {
  /** Available providers with their configs */
  providers: Map<string, ProviderConfig>;
  /** Budget info for each provider */
  budgets: Map<string, BudgetInfo>;
  /** Response time history (provider -> avg ms) */
  responseTimes: Map<string, number>;
  /** Last selection index (for round_robin) */
  lastIndex: number;
}

/** Strategy function type */
export type SelectionStrategy = (
  availableProviders: string[],
  context: StrategyContext
) => string | undefined;

/** Priority strategy - select by base priority (lowest first) */
export const priorityStrategy: SelectionStrategy = (available, context) => {
  let selected: string | undefined;
  let lowestPriority = Infinity;

  for (const name of available) {
    const config = context.providers.get(name);
    if (!config) continue;

    if (config.basePriority < lowestPriority) {
      lowestPriority = config.basePriority;
      selected = name;
    }
  }

  return selected;
};

/** Weighted random strategy - weight by remaining budget */
export const weightedRandomStrategy: SelectionStrategy = (available, context) => {
  const weights = new Map<string, number>();
  let totalWeight = 0;

  for (const name of available) {
    const budget = context.budgets.get(name);
    const config = context.providers.get(name);
    if (!config) continue;

    let weight: number;

    if (!budget || budget.budgetType === 'unlimited') {
      weight = 10;
    } else if (budget.remaining === null || budget.remaining === undefined) {
      weight = 5;
    } else {
      weight = Math.max(1, budget.remaining / 100);
    }

    weights.set(name, weight);
    totalWeight += weight;
  }

  if (totalWeight === 0) {
    return available[0];
  }

  let random = Math.random() * totalWeight;

  for (const [name, weight] of weights) {
    random -= weight;
    if (random <= 0) {
      return name;
    }
  }

  return available[available.length - 1];
};

/** Round robin strategy - cycle through providers
 *
 * IMPORTANT: This function is called once per search request to select
 * the starting provider. It should NOT be called in a loop to build
 * provider ordering - use rotateArray() for that.
 */
export const roundRobinStrategy: SelectionStrategy = (available, context) => {
  if (available.length === 0) return undefined;

  // eslint-disable-next-line unicorn/no-array-sort
  const sorted = Array.from(available).sort();

  const startIndex = context.lastIndex % sorted.length;
  context.lastIndex = startIndex + 1;

  return sorted[startIndex];
};

/** Rotate array starting from given index
 * Used to build provider order for fallback without consuming extra state
 */
export function rotateArray<T>(arr: T[], startIndex: number): T[] {
  if (arr.length === 0) return [];
  const normalizedIndex = startIndex % arr.length;
  return [...arr.slice(normalizedIndex), ...arr.slice(0, normalizedIndex)];
}

/** Fastest strategy - select based on response times */
export const fastestStrategy: SelectionStrategy = (available, context) => {
  let selected: string | undefined;
  let fastestTime = Infinity;

  for (const name of available) {
    const avgTime = context.responseTimes.get(name);

    if (avgTime === undefined) {
      if (selected === undefined) {
        selected = name;
      }
      continue;
    }

    if (avgTime < fastestTime) {
      fastestTime = avgTime;
      selected = name;
    }
  }

  return selected;
};

/** Get strategy by name */
export function getStrategy(name: string): SelectionStrategy {
  switch (name) {
    case 'priority':
      return priorityStrategy;
    case 'weighted_random':
      return weightedRandomStrategy;
    case 'round_robin':
      return roundRobinStrategy;
    case 'fastest':
      return fastestStrategy;
    default:
      logger.warn(`Unknown strategy: ${name}, using weighted_random`);
      return weightedRandomStrategy;
  }
}
