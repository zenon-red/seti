import type { RawSearchResult, StandardizedSearchResult } from '../types/index.js';

export function standardizeResults(
  raw: RawSearchResult[],
  providerName: string
): StandardizedSearchResult[] {
  return raw.map((item) => standardizeSingleResult(item, providerName));
}

function standardizeSingleResult(
  raw: RawSearchResult,
  providerName: string
): StandardizedSearchResult {
  return {
    title: sanitizeString(raw.title) || 'Untitled',
    link: normalizeUrl(raw.url) || '',
    snippet: sanitizeString(raw.snippet) || '',
    content: raw.content ? sanitizeString(raw.content) : undefined,
    provider: providerName,
    publishedDate: normalizeDate(raw.publishedDate),
    score: typeof raw.score === 'number' ? raw.score : undefined,
  };
}

function normalizeUrl(url: unknown): string {
  if (typeof url !== 'string') return '';

  const trimmed = url.trim();
  if (!trimmed) return '';

  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    return `https://${trimmed}`;
  }

  return trimmed;
}

function sanitizeString(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function normalizeDate(date: unknown): string | undefined {
  if (typeof date !== 'string') return undefined;

  const trimmed = date.trim();
  if (!trimmed) return undefined;

  try {
    const parsed = new Date(trimmed);
    if (isNaN(parsed.getTime())) return undefined;
    return parsed.toISOString();
  } catch {
    return undefined;
  }
}
