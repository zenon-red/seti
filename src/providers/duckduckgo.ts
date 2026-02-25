/**
 * DuckDuckGo provider (scraper-based)
 *
 * Uses DuckDuckGo HTML interface for unlimited free searches.
 * This is a best-effort scraper that may break if DuckDuckGo changes their HTML.
 */

import type { SearchOptions, RawSearchResult, ProviderConfig } from '../types/index.js';
import { BaseProvider } from './base.js';
import { logger } from '../utils/logger.js';

/** DuckDuckGo provider implementation */
export class DuckDuckGoProvider extends BaseProvider {
  readonly name = 'duckduckgo';

  constructor(public readonly config: ProviderConfig) {
    super();
  }

  /**
   * Perform search using DuckDuckGo HTML interface
   */
  async search(query: string, options: SearchOptions): Promise<RawSearchResult[]> {
    this.validateAvailability();

    const url = this.buildUrl(this.config.endpoints.search, {
      q: query,
    });

    logger.debug(`Searching DuckDuckGo`, { query: query.substring(0, 50) });

    const response = await this.fetchWithTimeout(url, {
      method: 'GET',
      headers: {
        Accept: 'text/html',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.0',
      },
    });

    if (!response.ok) {
      throw this.handleError(new Error(`HTTP ${response.status}: ${response.statusText}`));
    }

    const html = await response.text();
    const results = this.parseHtmlResults(html);

    logger.debug(`DuckDuckGo returned ${results.length} results`);

    return results.slice(0, options.numResults);
  }

  /**
   * Parse HTML results from DuckDuckGo
   * This is a basic parser that extracts results from the HTML response
   */
  private parseHtmlResults(html: string): RawSearchResult[] {
    const results: RawSearchResult[] = [];

    const resultRegex =
      /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
    const snippetRegex = /<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;

    const links: Array<{ url: string; title: string }> = [];
    let match;

    while ((match = resultRegex.exec(html)) !== null) {
      let url = match[1];
      const titleHtml = match[2];

      const title = this.stripHtml(titleHtml);

      if (url.startsWith('//')) {
        url = 'https:' + url;
      } else if (url.startsWith('/')) {
        url = 'https://duckduckgo.com' + url;
      }

      links.push({ url, title });
    }

    const snippets: string[] = [];
    while ((match = snippetRegex.exec(html)) !== null) {
      const snippetHtml = match[1];
      const snippet = this.stripHtml(snippetHtml);
      snippets.push(snippet);
    }

    for (let i = 0; i < links.length; i++) {
      const link = links[i];
      if (link.url.includes('duckduckgo.com')) continue;

      results.push({
        title: link.title,
        url: link.url,
        snippet: snippets[i] || '',
        source: this.name,
      });
    }

    if (results.length === 0) {
      return this.parseAlternative(html);
    }

    return results;
  }

  /**
   * Alternative HTML parsing for different DuckDuckGo layouts
   */
  private parseAlternative(html: string): RawSearchResult[] {
    const results: RawSearchResult[] = [];

    const linkRegex = /<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>([^<]+)<\/a>/gi;
    let match;

    while ((match = linkRegex.exec(html)) !== null) {
      const url = match[1];
      const title = this.stripHtml(match[2]).trim();

      if (
        url.includes('duckduckgo.com') ||
        url.includes('javascript:') ||
        title.length < 5 ||
        title.length > 200
      ) {
        continue;
      }

      results.push({
        title,
        url,
        snippet: '',
        source: this.name,
      });
    }

    return results;
  }

  /**
   * Strip HTML tags from text
   */
  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]*>/g, ' ') // Remove HTML tags
      .replace(/&nbsp;/g, ' ') // Replace &nbsp;
      .replace(/&amp;/g, '&') // Replace &amp;
      .replace(/&lt;/g, '<') // Replace &lt;
      .replace(/&gt;/g, '>') // Replace &gt;
      .replace(/&quot;/g, '"') // Replace &quot;
      .replace(/&#39;/g, "'") // Replace &#39;
      .replace(/\s+/g, ' ') // Collapse whitespace
      .trim();
  }
}
