#!/usr/bin/env node
/**
 * SETI - Main entry point
 *
 * Commands:
 *   seti              Start the MCP server (default)
 *   seti setup        Run setup wizard
 *   seti verify       Verify SearXNG health
 *   seti <query>      Search directly (CLI mode)
 *   seti --help       Show help
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { encode } from '@toon-format/toon';
import { loadConfigAsync } from './config/index.js';
import { configureLogger, logger } from './utils/logger.js';
import { resolveCliVersion } from './utils/version.js';
import { ProviderRouter } from './balancer/index.js';
import { createAllProviders } from './providers/registry.js';
import { initializeCache, getCache } from './cache/index.js';
import { standardizeResults } from './utils/standardize.js';
import { startServer } from './mcp/server.js';
import { loadCentralizedEnv } from './utils/paths.js';
import type { StandardizedSearchResult } from './types/index.js';

loadCentralizedEnv();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CLI_VERSION = resolveCliVersion(__dirname);

function printHelp(): void {
  console.log(`
${pc.green('SETI')} - Multi-provider web search MCP server

${pc.yellow('Usage:')} seti [command] [options]

${pc.green('Commands:')}
  (no command)    Start the MCP server
  <query>         Search directly from CLI (e.g., 'seti "rust tutorial" 10')
  setup           Run setup wizard (interactive or --non-interactive)
  verify          Verify SearXNG health and search functionality
  --help, -h      Show this help message
  --version, -v   Show CLI version

${pc.green('Setup Options:')}
  -n, --non-interactive   Run without prompts (for agents)
  -d, --docker            Force Docker mode
  -u, --uv                Force uv mode

${pc.green('Verify Options:')}
  -s, --silent            Machine-parseable output
  --url <url>             Check specific URL

${pc.green('CLI Search Examples:')}
  seti "TypeScript best practices"         ${pc.dim('# Search with default 20 results')}
  seti "rust vs go" 10                     ${pc.dim('# Search with 10 results')}
  seti "machine learning" --results 50     ${pc.dim('# Search with 50 results')}

${pc.green('Examples:')}
  seti                           ${pc.dim('# Start MCP server')}
  seti setup                     ${pc.dim('# Interactive setup')}
  seti setup --non-interactive   ${pc.dim('# Auto-setup for agents')}
  seti verify --silent           ${pc.dim('# Check health (scriptable)')}

For more help: ${pc.green('https://github.com/zenon-red/seti')}
`);
}

async function runSubcommand(command: string, args: string[]): Promise<void> {
  const scriptPath = path.join(
    __dirname,
    'setup',
    command === 'setup' ? 'index.js' : `${command}.js`
  );

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      stdio: 'inherit',
      shell: false,
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        process.exitCode = code ?? 1;
        resolve();
      }
    });

    child.on('error', (err) => {
      reject(new Error(`Failed to run ${command}: ${err.message}`));
    });
  });
}

/**
 * Format CLI output header using picocolors and clack prompts
 */
function formatCLIHeader(
  query: string,
  provider: string,
  resultsCount: number,
  responseTimeMs?: number
): void {
  const lines: string[] = [];
  lines.push(`  ${pc.green('●')} Query: ${pc.white(query)}`);
  lines.push(`  ${pc.green('●')} Provider: ${pc.white(provider)}`);
  lines.push(`  ${pc.green('●')} Results: ${pc.white(String(resultsCount))}`);
  if (responseTimeMs) {
    lines.push(`  ${pc.green('●')} Response Time: ${pc.white(`${responseTimeMs}ms`)}`);
  }

  p.note(lines.join('\n'), pc.green('Search Results'));
}

/**
 * Format TOON section with blue background box
 */
function formatTOONBox(toonOutput: string): void {
  // Create the TOON header with blue bg and white text
  const toonHeader = `${pc.bgGreen(pc.black(' TOON '))}`;

  // Add spacing and header
  p.log.message('');
  p.log.info(pc.dim('Output format: ') + toonHeader);
  p.log.message('');

  // Display TOON output in its own box using p.note
  // Trim the output to avoid extra newlines at start/end
  const trimmedOutput = toonOutput.trim();
  p.note(trimmedOutput, toonHeader);
}

/**
 * Perform a direct CLI search
 */
async function performCLISearch(query: string, numResults: number): Promise<void> {
  try {
    const config = await loadConfigAsync();
    configureLogger(config.logging);
    logger.level = 1; // Only show errors

    // Initialize cache
    initializeCache(config.cache.enabled, config.cache.ttlSeconds, config.cache.maxSize);

    // Create router with balancer config
    const router = new ProviderRouter({
      strategy: config.providerRouting.strategy,
      maxRetries: config.providerRouting.maxRetries,
      enableCircuitBreaker: config.providerRouting.enableCircuitBreaker,
      circuitBreakerThreshold: config.providerRouting.circuitBreakerThreshold,
      circuitBreakerResetMs: config.providerRouting.circuitBreakerResetMs,
    });

    // Register all enabled providers
    const providers = createAllProviders();
    for (const provider of providers) {
      router.registerProvider(provider);
    }

    // Initialize router
    await router.initialize();

    const cache = getCache();

    // Check cache
    const cached = cache?.get(query, { numResults });
    if (cached) {
      const provider = cached.response.metadata?.successfulProvider || 'unknown';
      const resultsCount = cached.response.results.length;
      formatCLIHeader(query, provider, resultsCount);
      formatTOONBox(formatResultsAsTOON(cached.response.results));
      return;
    }

    // Perform search
    const result = await router.search(query, { query, numResults });

    if (!result.success) {
      console.error(`Search failed: ${result.error}`);
      process.exit(1);
    }

    const standardizedResults = standardizeResults(
      result.results || [],
      result.successfulProvider || 'unknown'
    );

    // Cache the result
    const searchResponse = {
      results: standardizedResults,
      metadata: {
        fallbackTriggered: result.attempts.length > 1,
        providersAttempted: result.attempts.map((a) => a.provider),
        successfulProvider: result.successfulProvider || '',
        resultCount: standardizedResults.length,
        responseTimeMs: result.totalTimeMs,
        query: query,
      },
    };
    cache?.set(query, { numResults }, searchResponse);

    // Output header and TOON format
    formatCLIHeader(
      query,
      result.successfulProvider || 'unknown',
      standardizedResults.length,
      result.totalTimeMs
    );
    formatTOONBox(formatResultsAsTOON(standardizedResults));
  } catch (error) {
    logger.error('CLI search error', {
      error: error instanceof Error ? error.message : String(error),
    });
    console.error(`Search error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

/**
 * Format search results as TOON (Token-Oriented Object Notation)
 */
function formatResultsAsTOON(results: StandardizedSearchResult[]): string {
  const data = {
    results: results.map((r) => ({
      title: r.title,
      url: r.link,
      description: r.snippet,
    })),
  };

  return encode(data);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Handle subcommands first (before top-level help)
  if (args.length > 0) {
    const command = args[0];

    if (command === 'setup' || command === 'verify') {
      await runSubcommand(command, args.slice(1));
      return;
    }

    // Handle top-level help (only if not a subcommand)
    if (command === '--help' || command === '-h') {
      printHelp();
      process.exit(0);
    }

    if (command === '--version' || command === '-v') {
      console.log(CLI_VERSION);
      process.exit(0);
    }

    // Check if this is a search query (doesn't start with - and not a known command)
    if (!command.startsWith('-')) {
      // Parse query and optional numResults
      const query = command;
      let numResults = 20; // default

      // Check if second arg is a number (numResults)
      if (args.length > 1 && !isNaN(parseInt(args[1]))) {
        numResults = parseInt(args[1]);
      }

      await performCLISearch(query, numResults);
      return;
    }

    // Unknown command
    console.error(`Unknown command: ${command}`);
    console.error('Run "seti --help" for usage.');
    process.exit(1);
  }

  // Handle help with no subcommand
  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  if (args.includes('--version') || args.includes('-v')) {
    console.log(CLI_VERSION);
    process.exit(0);
  }

  // Default: start MCP server
  try {
    await startServer();
  } catch (error) {
    logger.error('Fatal error starting server', {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
