# Providers

This directory contains search provider implementations.

## Base Interface

All providers must implement `ISearchProvider` from `src/types/provider.ts`.

## Implemented Providers

1. **SearXNG** - Self-hosted metasearch (no API key required)
2. **DuckDuckGo** - No API key required (web scraping)
3. **Tavily** - AI-optimized search (1,000/month free)
4. **EXA AI** - Neural semantic search (~2,000/month free)
5. **Jina AI** - Content extraction (10M tokens free, no key required)
6. **Brave** - Privacy-focused (2,000/month free)
7. **Google CSE** - Custom Search Engine (100/day free)
8. **Firecrawl** - Search + scrape (500 credits lifetime)
9. **SerpAPI** - Rich SERP data (250/month free)

## Implementation Status

All 9 providers are implemented. See individual provider files for details.
