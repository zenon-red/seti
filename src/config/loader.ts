/**
 * Configuration loader with layered config support
 *
 * Config sources (in priority order):
 * 1. Environment variables (SETI_*) - highest priority
 * 2. Config files: seti.config.js > seti.config.json > .config/seti/seti.json
 * 3. Hardcoded defaults - src/config/defaults.ts
 */

import { loadConfig as loadUnconfig } from 'unconfig';
import type { SETIConfig, ProviderRoutingStrategy } from '../types/index.js';
import { DEFAULT_CONFIG, DEFAULT_PROVIDERS } from './defaults.js';

interface ConfigFile {
  providers?: Record<string, { enabled?: boolean }>;
  providerRouting?: {
    strategy?: ProviderRoutingStrategy;
    maxRetries?: number;
    enableCircuitBreaker?: boolean;
    circuitBreakerThreshold?: number;
    circuitBreakerResetMs?: number;
  };
  cache?: {
    enabled?: boolean;
    ttlSeconds?: number;
    maxSize?: number;
  };
  logging?: {
    level?: 'debug' | 'info' | 'warn' | 'error';
    logUsage?: boolean;
    timestamps?: boolean;
  };
  defaultNumResults?: number;
  maxNumResults?: number;
  requestTimeoutMs?: number;
}

/**
 * Load configuration from config files and environment
 */
export async function loadConfigAsync(): Promise<SETIConfig> {
  const { config: fileConfig } = await loadUnconfig({
    sources: [
      { files: 'seti.config' },
      { files: '.config/seti/config' },
    ],
    defaults: {},
  });

  return buildConfig(fileConfig || {});
}

/**
 * Synchronous config loader (uses defaults only, no file loading)
 */
export function loadConfig(): SETIConfig {
  return buildConfig({});
}

/**
 * Build final config from file config and environment
 */
function buildConfig(fileConfig: ConfigFile): SETIConfig {
  const providers = DEFAULT_PROVIDERS.map((p) => {
    const fileProvider = fileConfig.providers?.[p.name];
    const enabled = getEnvBool(
      `SETI_${p.name.toUpperCase()}_ENABLED`,
      fileProvider?.enabled ?? p.enabled
    );

    return {
      ...p,
      enabled,
      endpoints: {
        ...p.endpoints,
        ...(p.name === 'searxng' && {
          search: getSearXNGSearchEndpoint(p.endpoints.search),
        }),
      },
    };
  });

  return {
    providers,
    providerRouting: {
      strategy: getEnvStrategy(
        'SETI_PROVIDER_ROUTING_STRATEGY',
        fileConfig.providerRouting?.strategy ?? DEFAULT_CONFIG.providerRouting.strategy
      ),
      trackResponseTimes: DEFAULT_CONFIG.providerRouting.trackResponseTimes,
      maxRetries: getEnvInt(
        'SETI_MAX_RETRIES',
        fileConfig.providerRouting?.maxRetries ?? DEFAULT_CONFIG.providerRouting.maxRetries
      ),
      enableCircuitBreaker: getEnvBool(
        'SETI_ENABLE_CIRCUIT_BREAKER',
        fileConfig.providerRouting?.enableCircuitBreaker ??
          DEFAULT_CONFIG.providerRouting.enableCircuitBreaker
      ),
      circuitBreakerThreshold: getEnvInt(
        'SETI_CIRCUIT_BREAKER_THRESHOLD',
        fileConfig.providerRouting?.circuitBreakerThreshold ??
          DEFAULT_CONFIG.providerRouting.circuitBreakerThreshold
      ),
      circuitBreakerResetMs: getEnvInt(
        'SETI_CIRCUIT_BREAKER_RESET_MS',
        fileConfig.providerRouting?.circuitBreakerResetMs ??
          DEFAULT_CONFIG.providerRouting.circuitBreakerResetMs
      ),
    },
    cache: {
      enabled: getEnvBool(
        'SETI_CACHE_ENABLED',
        fileConfig.cache?.enabled ?? DEFAULT_CONFIG.cache.enabled
      ),
      ttlSeconds: getEnvInt(
        'SETI_CACHE_TTL',
        fileConfig.cache?.ttlSeconds ?? DEFAULT_CONFIG.cache.ttlSeconds
      ),
      maxSize: getEnvInt(
        'SETI_CACHE_MAX_SIZE',
        fileConfig.cache?.maxSize ?? DEFAULT_CONFIG.cache.maxSize
      ),
    },
    logging: {
      level: getEnvLogLevel(
        'SETI_LOG_LEVEL',
        fileConfig.logging?.level ?? DEFAULT_CONFIG.logging.level
      ),
      logUsage: getEnvBool(
        'SETI_LOG_USAGE',
        fileConfig.logging?.logUsage ?? DEFAULT_CONFIG.logging.logUsage
      ),
      timestamps: getEnvBool(
        'SETI_LOG_TIMESTAMPS',
        fileConfig.logging?.timestamps ?? DEFAULT_CONFIG.logging.timestamps
      ),
    },
    defaultNumResults: getEnvInt(
      'SETI_DEFAULT_RESULTS',
      fileConfig.defaultNumResults ?? DEFAULT_CONFIG.defaultNumResults
    ),
    maxNumResults: getEnvInt(
      'SETI_MAX_RESULTS',
      fileConfig.maxNumResults ?? DEFAULT_CONFIG.maxNumResults
    ),
    requestTimeoutMs: getEnvInt(
      'SETI_TIMEOUT_MS',
      fileConfig.requestTimeoutMs ?? DEFAULT_CONFIG.requestTimeoutMs
    ),
  };
}

function getSearXNGSearchEndpoint(fallback: string): string {
  const value = process.env.SETI_SEARXNG_BASE_URL;
  if (!value) return fallback;

  try {
    const parsed = new URL(value);
    if (parsed.pathname.endsWith('/search')) {
      return parsed.toString();
    }
    return new URL('/search', parsed).toString();
  } catch {
    return fallback;
  }
}

function getEnvBool(key: string, fallback: boolean): boolean {
  const value = process.env[key];
  if (value === undefined) return fallback;
  return value.toLowerCase() === 'true' || value === '1';
}

function getEnvInt(key: string, fallback: number): number {
  const value = process.env[key];
  if (value === undefined) return fallback;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? fallback : parsed;
}

function getEnvStrategy(key: string, fallback: ProviderRoutingStrategy): ProviderRoutingStrategy {
  const value = process.env[key];
  if (value === undefined) return fallback;

  const valid: ProviderRoutingStrategy[] = [
    'priority',
    'weighted_random',
    'round_robin',
    'fastest',
  ];
  return valid.includes(value as ProviderRoutingStrategy)
    ? (value as ProviderRoutingStrategy)
    : fallback;
}

function getEnvLogLevel(
  key: string,
  fallback: SETIConfig['logging']['level']
): SETIConfig['logging']['level'] {
  const value = process.env[key];
  if (value === undefined) return fallback;

  const valid: SETIConfig['logging']['level'][] = ['debug', 'info', 'warn', 'error'];
  return valid.includes(value as SETIConfig['logging']['level'])
    ? (value as SETIConfig['logging']['level'])
    : fallback;
}

export function getApiKey(providerName: string): string | undefined {
  const provider = DEFAULT_PROVIDERS.find((p) => p.name === providerName);
  if (!provider?.apiKeyEnvVar) return undefined;
  return process.env[provider.apiKeyEnvVar];
}

export function hasApiKey(providerName: string): boolean {
  const provider = DEFAULT_PROVIDERS.find((p) => p.name === providerName);
  if (!provider) return false;
  if (!provider.requiresApiKey) return true;
  return !!getApiKey(providerName);
}

export function getGoogleCX(): string | undefined {
  return process.env.GOOGLE_CX;
}
