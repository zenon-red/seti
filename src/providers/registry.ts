/**
 * Provider registry
 *
 * Manages provider registration and factory creation.
 */

import type { ISearchProvider, ProviderConfig } from '../types/index.js';
import { DEFAULT_PROVIDERS } from '../config/defaults.js';
import { DuckDuckGoProvider } from './duckduckgo.js';
import { TavilyProvider } from './tavily.js';
import { ExaProvider } from './exa.js';
import { JinaProvider } from './jina.js';
import { BraveProvider } from './brave.js';
import { GoogleProvider } from './google.js';
import { FirecrawlProvider } from './firecrawl.js';
import { SerpAPIProvider } from './serpapi.js';
import { SearXNGProvider } from './searxng.js';

/** Provider constructor type */
type ProviderConstructor = new (config: ProviderConfig) => ISearchProvider;

/** Registry of provider constructors */
const providerRegistry = new Map<string, ProviderConstructor>([
  ['searxng', SearXNGProvider],
  ['duckduckgo', DuckDuckGoProvider],
  ['tavily', TavilyProvider],
  ['exa', ExaProvider],
  ['jina', JinaProvider],
  ['brave', BraveProvider],
  ['google', GoogleProvider],
  ['firecrawl', FirecrawlProvider],
  ['serpapi', SerpAPIProvider],
]);

/** Create a provider instance by name */
export function createProvider(name: string, config?: ProviderConfig): ISearchProvider | undefined {
  const Constructor = providerRegistry.get(name);
  if (!Constructor) return undefined;

  const providerConfig = config ?? getProviderConfig(name);
  if (!providerConfig) return undefined;

  return new Constructor(providerConfig);
}

/** Get provider configuration by name */
export function getProviderConfig(name: string): ProviderConfig | undefined {
  return DEFAULT_PROVIDERS.find((p) => p.name === name);
}

/** Get all registered provider names */
export function getRegisteredProviderNames(): string[] {
  return Array.from(providerRegistry.keys());
}

/** Get all available providers (have configs) */
export function getAllProviderConfigs(): ProviderConfig[] {
  return DEFAULT_PROVIDERS;
}

/** Create all enabled providers */
export function createAllProviders(): ISearchProvider[] {
  const providers: ISearchProvider[] = [];

  for (const config of DEFAULT_PROVIDERS) {
    if (config.enabled) {
      const provider = createProvider(config.name, config);
      if (provider) {
        providers.push(provider);
      }
    }
  }

  return providers;
}

/** Check if a provider is registered */
export function isProviderRegistered(name: string): boolean {
  return providerRegistry.has(name);
}
