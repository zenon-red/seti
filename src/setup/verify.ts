#!/usr/bin/env node

/**
 * SETI Verify - Health check and search verification for SearXNG
 *
 * Usage:
 *   seti verify              # Interactive verification
 *   seti verify --silent     # Non-interactive, machine-parseable output
 */

import process from 'node:process';
import { Writable } from 'node:stream';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as prompts from '@clack/prompts';
import { resolveCliVersion } from '../utils/version.js';

// =============================================================================
// Exit Codes
// =============================================================================

const EXIT_CODES = {
  SUCCESS: 0,
  HEALTH_FAILED: 1,
  SEARCH_FAILED: 2,
  INVALID_ARGS: 3,
} as const;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CLI_VERSION = resolveCliVersion(__dirname);

// =============================================================================
// Types
// =============================================================================

type SearchResponse = {
  results?: Array<{ title?: string; url?: string; content?: string }>;
};

interface VerifyOptions {
  silent: boolean;
  baseUrl?: string;
}

interface VerifyResult {
  success: boolean;
  healthOk: boolean;
  searchOk: boolean;
  resultsCount: number;
  message: string;
}

// =============================================================================
// CLI Parsing
// =============================================================================

const VALID_VERIFY_FLAGS = new Set([
  '--silent',
  '-s',
  '--url',
  '-u',
  '--version',
  '-v',
  '--help',
  '-h',
]);

function parseArgs(): VerifyOptions {
  const args = process.argv.slice(2);
  const options: VerifyOptions = {
    silent: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    // Reject unknown flags
    if (arg.startsWith('-') && !VALID_VERIFY_FLAGS.has(arg)) {
      console.error(`Error: Unknown flag: ${arg}`);
      console.error('Run "seti verify --help" for usage.');
      process.exit(EXIT_CODES.INVALID_ARGS);
    }

    switch (arg) {
      case '--silent':
      case '-s':
        options.silent = true;
        break;
      case '--url':
      case '-u':
        if (i + 1 >= args.length || args[i + 1]?.startsWith('-')) {
          console.error('Error: --url requires a value');
          console.error('Run "seti verify --help" for usage.');
          process.exit(EXIT_CODES.INVALID_ARGS);
        }
        options.baseUrl = args[++i];
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(EXIT_CODES.SUCCESS);
        break;
      case '--version':
      case '-v':
        console.log(CLI_VERSION);
        process.exit(EXIT_CODES.SUCCESS);
        break;
    }
  }

  return options;
}

function printHelp(): void {
  console.log(`
SETI Verify - Check SearXNG health and search functionality

Usage: seti verify [options]

Options:
  -h, --help       Show this help message
  -s, --silent     Non-interactive mode (for scripts/agents)
  -u, --url URL    SearXNG base URL (default: from env or http://127.0.0.1:8888)
  -v, --version    Show CLI version

Examples:
  seti verify              # Interactive verification
  seti verify -s           # Silent mode, exits with code on failure
  seti verify -s -u http://localhost:8888  # Check specific URL

Exit Codes:
  0  All checks passed
  1  Health check failed
  2  Search probe failed
  3  Invalid arguments
`);
}

// =============================================================================
// Verification Logic
// =============================================================================

const DEFAULT_SEARXNG_URL = 'http://127.0.0.1:8888';

function normalizeBaseUrl(value: string): string {
  const raw = value.trim();
  if (!raw) return DEFAULT_SEARXNG_URL;
  try {
    return new URL(raw).origin;
  } catch {
    throw new Error(`Invalid URL format: ${raw}`);
  }
}

async function checkHealth(baseUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl}/healthz`, { signal: AbortSignal.timeout(5000) });
    return response.status >= 200 && response.status < 300;
  } catch {
    return false;
  }
}

async function probeSearch(baseUrl: string): Promise<{ ok: boolean; count: number }> {
  try {
    const response = await fetch(`${baseUrl}/search?q=seti&format=json`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return { ok: false, count: 0 };
    const data = (await response.json()) as SearchResponse;
    const count = data.results?.length ?? 0;
    return { ok: count > 0, count };
  } catch {
    return { ok: false, count: 0 };
  }
}

async function runVerification(baseUrl: string): Promise<VerifyResult> {
  const healthOk = await checkHealth(baseUrl);

  if (!healthOk) {
    return {
      success: false,
      healthOk: false,
      searchOk: false,
      resultsCount: 0,
      message: `Health check failed at ${baseUrl}/healthz`,
    };
  }

  const searchResult = await probeSearch(baseUrl);

  if (!searchResult.ok) {
    return {
      success: false,
      healthOk: true,
      searchOk: false,
      resultsCount: searchResult.count,
      message: `Search probe failed at ${baseUrl}`,
    };
  }

  return {
    success: true,
    healthOk: true,
    searchOk: true,
    resultsCount: searchResult.count,
    message: `SearXNG healthy with ${searchResult.count} search results`,
  };
}

// =============================================================================
// Output Formatters
// =============================================================================

function printSilentResult(result: VerifyResult, baseUrl: string): void {
  console.log(`url=${baseUrl}`);
  console.log(`health=${result.healthOk ? 'ok' : 'failed'}`);
  console.log(`search=${result.searchOk ? 'ok' : 'failed'}`);
  console.log(`results=${result.resultsCount}`);
  console.log(`status=${result.success ? 'success' : 'failed'}`);
  if (!result.success) {
    console.log(`error=${result.message}`);
  }
}

// =============================================================================
// Interactive Mode
// =============================================================================

class NeonBlueOutput extends Writable {
  constructor(private readonly target: NodeJS.WriteStream) {
    super();
  }

  override _write(
    chunk: unknown,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void
  ): void {
    const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
    const patched = text
      .replaceAll('\u001B[32m', '\u001B[38;5;45m')
      .replaceAll('\u001B[92m', '\u001B[38;5;45m');
    this.target.write(patched);
    callback();
  }
}

const PROMPT_IO = { output: new NeonBlueOutput(process.stdout) };

function cancelIfNeeded<T>(value: T): Exclude<T, symbol> {
  if (prompts.isCancel(value)) {
    prompts.cancel('Cancelled');
    process.exit(EXIT_CODES.SUCCESS);
  }
  return value as Exclude<T, symbol>;
}

async function runInteractive(baseUrl: string): Promise<number> {
  prompts.intro('\x1b[90mVerify SearXNG...\x1b[0m', PROMPT_IO);

  const baseInput = cancelIfNeeded(
    await prompts.text({
      message: 'SearXNG base URL',
      defaultValue: baseUrl,
      placeholder: DEFAULT_SEARXNG_URL,
      ...PROMPT_IO,
    })
  );

  let url: string;
  try {
    url = normalizeBaseUrl(baseInput);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    prompts.log.error(message);
    prompts.outro('Verification failed');
    return EXIT_CODES.INVALID_ARGS;
  }

  const spinner = prompts.spinner(PROMPT_IO);

  // Health check
  spinner.start('Checking health endpoint...');
  const healthOk = await checkHealth(url);
  spinner.stop(`Health check: ${healthOk ? 'OK' : 'FAILED'}`);

  if (!healthOk) {
    prompts.log.error(`Could not reach SearXNG health endpoint at ${url}/healthz`);
    prompts.outro('Verification failed');
    return EXIT_CODES.HEALTH_FAILED;
  }

  // Search probe
  spinner.start('Running search probe...');
  const searchResult = await probeSearch(url);
  spinner.stop(`Search probe: ${searchResult.ok ? 'OK' : 'FAILED'}`);

  if (!searchResult.ok) {
    prompts.log.error('Search request failed or returned no results.');
    prompts.outro('Verification failed');
    return EXIT_CODES.SEARCH_FAILED;
  }

  prompts.log.success(`SearXNG is healthy and responding`);
  prompts.log.info(`Results returned: ${searchResult.count}`);

  // Optional: show sample results
  if (searchResult.count > 0) {
    const showResults = cancelIfNeeded(
      await prompts.confirm({
        message: 'Show sample results?',
        initialValue: false,
        ...PROMPT_IO,
      })
    );

    if (showResults) {
      try {
        const response = await fetch(`${url}/search?q=seti&format=json`);
        const data = (await response.json()) as SearchResponse;
        const results = data.results?.slice(0, 3) ?? [];

        for (const result of results) {
          prompts.log.message(
            `${result.title ?? '(untitled)'}
${result.url ?? ''}`,
            {
              ...PROMPT_IO,
              symbol: '\x1b[38;5;45m◆\x1b[0m',
            }
          );
        }
      } catch {
        prompts.log.warn('Could not fetch sample results');
      }
    }
  }

  prompts.outro('Verification complete');
  return EXIT_CODES.SUCCESS;
}

// =============================================================================
// Main
// =============================================================================

async function main(): Promise<void> {
  const options = parseArgs();

  // Determine base URL
  let baseUrl: string;
  try {
    baseUrl = normalizeBaseUrl(
      options.baseUrl ?? process.env.SETI_SEARXNG_BASE_URL ?? DEFAULT_SEARXNG_URL
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (options.silent) {
      console.log(`status=failed`);
      console.log(`error=${message}`);
    } else {
      console.error(`Error: ${message}`);
    }
    process.exit(EXIT_CODES.INVALID_ARGS);
  }

  if (options.silent) {
    const result = await runVerification(baseUrl);
    printSilentResult(result, baseUrl);
    process.exit(
      result.success
        ? EXIT_CODES.SUCCESS
        : result.healthOk
          ? EXIT_CODES.SEARCH_FAILED
          : EXIT_CODES.HEALTH_FAILED
    );
  } else {
    const exitCode = await runInteractive(baseUrl);
    process.exit(exitCode);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error instanceof Error ? error.message : String(error));
  process.exit(EXIT_CODES.HEALTH_FAILED);
});
