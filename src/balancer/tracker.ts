/**
 * Usage tracking and quota management
 *
 * Tracks per-provider usage counters with persistent storage.
 * Supports mixed quota types: monthly, daily, credit-based, unlimited.
 */

import { mkdir, readFile, writeFile, rename } from 'fs/promises';
import { dirname } from 'path';
import type { ProviderUsage, ProviderConfig } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { getUsageFilePath } from '../utils/paths.js';

/** Budget type for quota representation */
export type BudgetType =
  | 'monthly_count'
  | 'daily_count'
  | 'credit'
  | 'token'
  | 'unlimited'
  | 'unknown';

/** Budget information for a provider */
export interface BudgetInfo {
  budgetType: BudgetType;
  limit: number | null;
  used: number;
  remaining: number | null;
  resetAt: Date | null;
  confidence: 'exact' | 'estimated';
}

/** Usage data for a single provider */
interface ProviderUsageData {
  used: number;
  lastUsed: string;
  dailyUsed?: number; // For daily quota tracking
  lastResetDay?: string; // Track last daily reset
}

/** Serialized usage data format */
interface UsageDataFile {
  version: number;
  providers: Record<string, ProviderUsageData>;
  lastUpdated: string;
  monthYear: string; // Track which month this data is for
}

/** Usage tracker with persistent storage */
export class UsageTracker {
  private data: Map<string, ProviderUsageData> = new Map();
  private providers: Map<string, ProviderConfig> = new Map();
  private filePath: string;
  private currentMonthYear: string;

  constructor(providerConfigs: ProviderConfig[], filePath: string = getUsageFilePath()) {
    this.filePath = filePath;
    this.currentMonthYear = this.getMonthYear();

    for (const config of providerConfigs) {
      this.providers.set(config.name, config);
      this.data.set(config.name, {
        used: 0,
        lastUsed: new Date().toISOString(),
        dailyUsed: 0,
        lastResetDay: new Date().toISOString().split('T')[0],
      });
    }
  }

  /**
   * Initialize by loading persisted data
   */
  async initialize(): Promise<void> {
    try {
      await this.load();
      logger.info('Usage tracker initialized', { filePath: this.filePath });
    } catch (error) {
      logger.warn('Failed to load usage data, starting fresh', { error: String(error) });
    }
  }

  /**
   * Record usage for a provider
   */
  recordUsage(providerName: string, count: number = 1): void {
    const config = this.providers.get(providerName);
    if (!config) {
      logger.warn(`Unknown provider: ${providerName}`);
      return;
    }

    const data = this.data.get(providerName)!;

    const today = new Date().toISOString().split('T')[0];
    if (data.lastResetDay !== today) {
      data.dailyUsed = 0;
      data.lastResetDay = today;
    }

    data.used += count;
    data.dailyUsed = (data.dailyUsed || 0) + count;
    data.lastUsed = new Date().toISOString();

    this.save().catch((err) => {
      logger.error('Failed to persist usage data', { error: String(err) });
    });

    logger.debug(`Recorded usage for ${providerName}`, {
      provider: providerName,
      added: count,
      total: data.used,
    });
  }

  /**
   * Check and reset daily counters if day has changed
   */
  private checkDailyReset(data: ProviderUsageData): void {
    const today = new Date().toISOString().split('T')[0];
    if (data.lastResetDay !== today) {
      data.dailyUsed = 0;
      data.lastResetDay = today;
    }
  }

  /**
   * Get budget information for a provider
   */
  getBudget(providerName: string): BudgetInfo | undefined {
    const config = this.providers.get(providerName);
    if (!config) return undefined;

    const data = this.data.get(providerName)!;
    this.checkDailyReset(data);

    const quota = config.monthlyQuota;

    let budgetType: BudgetType = 'unknown';
    if (quota === null) {
      budgetType = 'unlimited';
    } else if (providerName === 'google') {
      budgetType = 'daily_count';
    } else {
      budgetType = 'monthly_count';
    }

    let remaining: number | null = null;
    if (quota !== null) {
      if (budgetType === 'daily_count') {
        remaining = Math.max(0, quota - (data.dailyUsed || 0));
      } else {
        remaining = Math.max(0, quota - data.used);
      }
    }

    let resetAt: Date | null = null;
    if (budgetType === 'monthly_count') {
      resetAt = this.getNextMonthReset();
    } else if (budgetType === 'daily_count') {
      resetAt = this.getTomorrow();
    }

    return {
      budgetType,
      limit: quota,
      used: data.used,
      remaining,
      resetAt,
      confidence:
        budgetType === 'monthly_count' || budgetType === 'daily_count' ? 'exact' : 'estimated',
    };
  }

  /**
   * Get usage report for all providers
   */
  getUsageReport(): {
    providers: ProviderUsage[];
    totalUsed: number;
    totalQuota: number | null;
    generatedAt: Date;
  } {
    const providers: ProviderUsage[] = [];
    let totalUsed = 0;
    let hasUnlimited = false;
    let totalQuotaValue = 0;

    for (const [name, config] of this.providers) {
      const data = this.data.get(name)!;
      const budget = this.getBudget(name)!;

      providers.push({
        provider: name,
        usedThisMonth: data.used,
        quota: config.monthlyQuota,
        remaining: budget.remaining,
        quotaExceeded: budget.remaining === 0,
        lastUsed: new Date(data.lastUsed),
      });

      totalUsed += data.used;

      if (config.monthlyQuota === null) {
        hasUnlimited = true;
      } else {
        totalQuotaValue += config.monthlyQuota;
      }
    }

    return {
      providers,
      totalUsed,
      totalQuota: hasUnlimited ? null : totalQuotaValue,
      generatedAt: new Date(),
    };
  }

  /**
   * Check if provider has remaining quota
   */
  hasRemainingQuota(providerName: string): boolean {
    const budget = this.getBudget(providerName);
    if (!budget) return false;
    if (budget.budgetType === 'unlimited') return true;
    return (budget.remaining ?? 0) > 0;
  }

  /**
   * Get current month/year string
   */
  private getMonthYear(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  /**
   * Get date for next month reset
   */
  private getNextMonthReset(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 1);
  }

  /**
   * Get tomorrow's date
   */
  private getTomorrow(): Date {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    return tomorrow;
  }

  /**
   * Load usage data from file
   */
  private async load(): Promise<void> {
    try {
      const content = await readFile(this.filePath, 'utf-8');
      const fileData: UsageDataFile = JSON.parse(content);

      if (fileData.monthYear !== this.currentMonthYear) {
        logger.info('New month detected, resetting usage counters', {
          oldMonth: fileData.monthYear,
          newMonth: this.currentMonthYear,
        });
        return; // Keep default zeros
      }

      for (const [name, data] of Object.entries(fileData.providers)) {
        if (this.data.has(name)) {
          this.data.set(name, data);
        }
      }

      logger.info('Loaded usage data', { month: fileData.monthYear });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  /**
   * Save usage data to file (atomic write)
   */
  private async save(): Promise<void> {
    const dir = dirname(this.filePath);
    const tempPath = `${this.filePath}.tmp`;

    try {
      await mkdir(dir, { recursive: true });
    } catch {}

    const fileData: UsageDataFile = {
      version: 1,
      providers: Object.fromEntries(this.data),
      lastUpdated: new Date().toISOString(),
      monthYear: this.currentMonthYear,
    };

    await writeFile(tempPath, JSON.stringify(fileData, null, 2), 'utf-8');
    await rename(tempPath, this.filePath);
  }
}
