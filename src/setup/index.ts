#!/usr/bin/env node

/** SETI setup CLI */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { EOL } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { getEnvFilePath, getSearXNGManagedDir, loadCentralizedEnv } from '../utils/paths.js';
import { resolveCliVersion } from '../utils/version.js';

loadCentralizedEnv();

type SetupMode = 'docker' | 'uv' | 'existing' | 'api-only';

interface SetupOptions {
  nonInteractive: boolean;
  docker: boolean;
  uv: boolean;
}

interface SetupResult {
  success: boolean;
  mode?: SetupMode;
  searxngUrl?: string;
  envToPersist: Record<string, string>;
  message: string;
  dependencyMissing?: boolean;
}

const EXIT_CODES = {
  SUCCESS: 0,
  GENERIC_FAILURE: 1,
  INVALID_ARGS: 2,
  DEPENDENCY_MISSING: 3,
  HEALTH_VERIFICATION_FAILED: 4,
} as const;

const DEFAULT_SEARXNG_URL = 'http://127.0.0.1:8888';
const MANAGED_DIR = getSearXNGManagedDir();
const HEALTH_TIMEOUT_MS = 60000;
const HEALTH_POLL_INTERVAL_MS = 1000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CLI_VERSION = resolveCliVersion(__dirname);

const S_CHECK_ACTIVE = pc.green('✓');
const S_CHECK_INACTIVE = pc.dim('○');

const KEY_FIELDS = [
  { key: 'TAVILY_API_KEY', name: 'Tavily', enabledFlag: 'SETI_TAVILY_ENABLED' },
  { key: 'EXA_API_KEY', name: 'EXA AI', enabledFlag: 'SETI_EXA_ENABLED' },
  { key: 'JINA_API_KEY', name: 'Jina AI', enabledFlag: 'SETI_JINA_ENABLED' },
  { key: 'BRAVE_API_KEY', name: 'Brave', enabledFlag: 'SETI_BRAVE_ENABLED' },
  { key: 'GOOGLE_API_KEY', name: 'Google CSE', enabledFlag: 'SETI_GOOGLE_ENABLED' },
  { key: 'GOOGLE_CX', name: 'Google CX', enabledFlag: null },
  { key: 'FIRECRAWL_API_KEY', name: 'Firecrawl', enabledFlag: 'SETI_FIRECRAWL_ENABLED' },
  { key: 'SERPAPI_API_KEY', name: 'SerpAPI', enabledFlag: 'SETI_SERPAPI_ENABLED' },
];

const PROVIDER_FLAGS = [
  'SETI_TAVILY_ENABLED',
  'SETI_EXA_ENABLED',
  'SETI_JINA_ENABLED',
  'SETI_BRAVE_ENABLED',
  'SETI_GOOGLE_ENABLED',
  'SETI_FIRECRAWL_ENABLED',
  'SETI_SERPAPI_ENABLED',
  'SETI_DUCKDUCKGO_ENABLED',
];

const DOCKER_COMPOSE_YAML = `services:
  searxng:
    image: searxng/searxng:latest
    ports:
      - "8888:8080"
    volumes:
      - ./searxng:/etc/searxng
    environment:
      - SEARXNG_BASE_URL=http://localhost:8888/
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:8080/healthz"]
      interval: 10s
      timeout: 5s
      retries: 5
`;

const SEARXNG_SETTINGS_YAML = `use_default_settings: true
server:
  secret_key: "seti_generated_key_change_me"
  limiter: false
search:
  safe_search: 0
  autocomplete: duckduckgo
`;

// =============================================================================
// ASCII Logo with 6-level gray gradient (inspired by vercel-labs/skills)
// =============================================================================

const GLYPHS = {
  left: [
    '                      ',
    '█▀▀  █▀▀▀ ▀▀█▀▀ ▀█▀',
    '▀▀█  █▀▀▀   █    █ ',
    '▀▀▀  ▀▀▀▀   ▀   ▀▀▀ ',
    'SETI Web Search MCP   ',
    '                      ',
  ],
  right: [
    '              ',
    '      __^__   ',
    '       ~~~    ',
    '       ~     ',
    '    _~_    ',
    '              ',
  ],
};

function renderLogo(pad = '  '): string {
  const result: string[] = [];
  const reset = '\x1b[0m';

  // Color configs for left and right sides
  const left = {
    fg: '\x1b[38;5;254m', // Light gray for text
    shadow: '\x1b[38;5;235m', // Dark gray for shadow
    bg: '\x1b[48;5;235m', // Background color
  };

  const right = {
    fg: '\x1b[38;5;245m', // Medium gray for spaceship
    shadow: '\x1b[38;5;238m', // Darker gray for shadow
    bg: '\x1b[48;5;238m', // Background color
  };

  // Draw function that converts special chars to blocks
  const draw = (line: string, fg: string, shadow: string, bg: string): string => {
    const parts: string[] = [];
    for (const char of line) {
      if (char === '_') {
        // Background block
        parts.push(bg, ' ', reset);
        continue;
      }
      if (char === '^') {
        // Upper half block with fg and bg
        parts.push(fg, bg, '▀', reset);
        continue;
      }
      if (char === '~') {
        // Shadow half block
        parts.push(shadow, '▀', reset);
        continue;
      }
      if (char === ' ') {
        parts.push(' ');
        continue;
      }
      // Regular character with foreground color
      parts.push(fg, char, reset);
    }
    return parts.join('');
  };

  // Render each row
  for (let i = 0; i < GLYPHS.left.length; i++) {
    result.push(pad);
    result.push(draw(GLYPHS.left[i], left.fg, left.shadow, left.bg));
    result.push(' ');
    result.push(draw(GLYPHS.right[i] ?? '', right.fg, right.shadow, right.bg));
    result.push(EOL);
  }

  return result.join('');
}

// =============================================================================
// CLI Parsing
// =============================================================================

const VALID_SETUP_FLAGS = new Set([
  '--non-interactive',
  '-n',
  '--docker',
  '-d',
  '--uv',
  '-u',
  '--version',
  '-v',
  '--help',
  '-h',
]);

function parseArgs(): SetupOptions {
  const args = process.argv.slice(2);
  const options: SetupOptions = {
    nonInteractive: false,
    docker: false,
    uv: false,
  };

  for (const arg of args) {
    if (arg.startsWith('-') && !VALID_SETUP_FLAGS.has(arg)) {
      console.error(pc.red(`Error: Unknown flag: ${arg}`));
      console.error(pc.dim('Run "seti setup --help" for usage.'));
      process.exit(EXIT_CODES.INVALID_ARGS);
    }

    switch (arg) {
      case '--non-interactive':
      case '-n':
        options.nonInteractive = true;
        break;
      case '--docker':
      case '-d':
        options.docker = true;
        break;
      case '--uv':
      case '-u':
        options.uv = true;
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

  // Validate mutually exclusive flags
  if (options.docker && options.uv) {
    console.error(pc.red('Error: --docker and --uv are mutually exclusive'));
    process.exit(EXIT_CODES.INVALID_ARGS);
  }

  // Forced modes auto-enable non-interactive
  if ((options.docker || options.uv) && !options.nonInteractive) {
    options.nonInteractive = true;
  }

  return options;
}

function printHelp(): void {
  console.log(`
${pc.green('SETI Setup')} - Configure web search providers

${pc.dim('Usage:')} seti setup [options]

${pc.dim('Options:')}
  -h, --help              Show this help message
  -n, --non-interactive   Run without prompts (for agents)
  -d, --docker            Force Docker mode
  -u, --uv                Force uv mode
  -v, --version           Show CLI version

${pc.dim('Examples:')}
  seti setup                    ${pc.dim('# Interactive setup with TUI')}
  seti setup -n                 ${pc.dim('# Auto-setup mode')}
  seti setup -n -d              ${pc.dim('# Force Docker mode')}
  seti setup -n -u              ${pc.dim('# Force uv mode')}
`);
}

// =============================================================================
// Utility Functions
// =============================================================================

async function runCommand(
  cmd: string,
  args: string[],
  options?: { cwd?: string; timeout?: number }
): Promise<{ success: boolean; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd: options?.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    const timeout = setTimeout(() => {
      child.kill();
      resolve({ success: false, stdout, stderr: 'Command timed out' });
    }, options?.timeout ?? 30000);

    child.on('close', (code) => {
      clearTimeout(timeout);
      resolve({ success: code === 0, stdout, stderr });
    });

    child.on('error', () => {
      clearTimeout(timeout);
      resolve({ success: false, stdout, stderr: 'Failed to spawn command' });
    });
  });
}

async function isDockerAvailable(): Promise<boolean> {
  const result = await runCommand('docker', ['--version'], { timeout: 5000 });
  if (!result.success) return false;
  const composeResult = await runCommand('docker', ['compose', 'version'], { timeout: 5000 });
  return composeResult.success;
}

async function isUvAvailable(): Promise<boolean> {
  const result = await runCommand('uv', ['--version'], { timeout: 5000 });
  return result.success;
}

async function checkSearXNGHealth(baseUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl}/healthz`, { signal: AbortSignal.timeout(5000) });
    return response.status >= 200 && response.status < 300;
  } catch {
    return false;
  }
}

async function probeSearXNGSearch(baseUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl}/search?q=test&format=json`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return false;
    const data = (await response.json()) as { results?: unknown[] };
    return Array.isArray(data.results);
  } catch {
    return false;
  }
}

function cancelIfNeeded<T>(value: T): Exclude<T, symbol> {
  if (p.isCancel(value)) {
    p.cancel('Cancelled');
    process.exit(EXIT_CODES.SUCCESS);
  }
  return value as Exclude<T, symbol>;
}

// =============================================================================
// Setup Implementation
// =============================================================================

async function setupDockerSearxng(options: {
  nonInteractive: boolean;
  forced: boolean;
}): Promise<SetupResult> {
  if (!options.nonInteractive) {
    p.log.step('Checking Docker availability...');
  }

  const dockerAvailable = await isDockerAvailable();
  if (!dockerAvailable) {
    if (options.forced) {
      return {
        success: false,
        mode: 'docker',
        envToPersist: {},
        message: 'Docker is not available',
        dependencyMissing: true,
      };
    }
    return {
      success: false,
      mode: 'docker',
      envToPersist: {},
      message: 'Docker is not available',
    };
  }

  if (!options.nonInteractive) {
    p.log.success('Docker is available');
  }

  // Create managed directory
  try {
    await mkdir(MANAGED_DIR, { recursive: true });
  } catch {
    return {
      success: false,
      mode: 'docker',
      envToPersist: {},
      message: `Failed to create directory: ${MANAGED_DIR}`,
    };
  }

  // Write docker-compose.yml
  const composePath = path.join(MANAGED_DIR, 'docker-compose.yml');
  await writeFile(composePath, DOCKER_COMPOSE_YAML, 'utf-8');

  // Write SearXNG settings
  const searxngDir = path.join(MANAGED_DIR, 'searxng');
  await mkdir(searxngDir, { recursive: true });
  const settingsPath = path.join(searxngDir, 'settings.yml');
  await writeFile(settingsPath, SEARXNG_SETTINGS_YAML, 'utf-8');

  // Start containers
  const startResult = await runCommand('docker', ['compose', '-f', composePath, 'up', '-d'], {
    cwd: MANAGED_DIR,
    timeout: HEALTH_TIMEOUT_MS,
  });

  if (!startResult.success) {
    return {
      success: false,
      mode: 'docker',
      envToPersist: {},
      message: `Failed to start Docker containers: ${startResult.stderr}`,
    };
  }

  // Wait for health
  const spinner = p.spinner();
  if (!options.nonInteractive) {
    spinner.start('Waiting for SearXNG to be ready...');
  }

  const startTime = Date.now();
  let isHealthy = false;

  while (Date.now() - startTime < HEALTH_TIMEOUT_MS) {
    isHealthy = await checkSearXNGHealth(DEFAULT_SEARXNG_URL);
    if (isHealthy) break;
    await new Promise((r) => setTimeout(r, HEALTH_POLL_INTERVAL_MS));
  }

  if (!isHealthy) {
    if (!options.nonInteractive) {
      spinner.stop('SearXNG failed to start');
    }
    return {
      success: false,
      mode: 'docker',
      envToPersist: {},
      message: 'SearXNG health check timed out',
    };
  }

  if (!options.nonInteractive) {
    spinner.stop('SearXNG is ready');
  }

  // Verify search works
  if (!options.nonInteractive) {
    spinner.start('Verifying search functionality...');
  }

  const searchWorks = await probeSearXNGSearch(DEFAULT_SEARXNG_URL);

  if (!searchWorks) {
    if (!options.nonInteractive) {
      spinner.stop('Search verification failed');
    }
    return {
      success: false,
      mode: 'docker',
      envToPersist: {},
      message: 'SearXNG health check passed but search failed',
    };
  }

  if (!options.nonInteractive) {
    spinner.stop('Search is working');
  }

  return {
    success: true,
    mode: 'docker',
    searxngUrl: DEFAULT_SEARXNG_URL,
    envToPersist: {
      SETI_SEARXNG_BASE_URL: DEFAULT_SEARXNG_URL,
    },
    message: 'SearXNG is running via Docker',
  };
}

async function setupUvSearxng(options: {
  nonInteractive: boolean;
  forced: boolean;
}): Promise<SetupResult> {
  const uvAvailable = await isUvAvailable();

  if (!uvAvailable) {
    if (options.forced) {
      return {
        success: false,
        mode: 'uv',
        envToPersist: {},
        message: 'uv is not available',
        dependencyMissing: true,
      };
    }
    return {
      success: false,
      mode: 'uv',
      envToPersist: {},
      message: 'uv is not available',
    };
  }

  const checkInstalled = await runCommand('uv', ['tool', 'list'], { timeout: 10000 });
  const alreadyInstalled = checkInstalled.success && checkInstalled.stdout.includes('searxng');

  if (!alreadyInstalled) {
    const installResult = await runCommand('uv', ['tool', 'install', 'searxng'], {
      timeout: HEALTH_TIMEOUT_MS,
    });

    if (!installResult.success) {
      return {
        success: false,
        mode: 'uv',
        envToPersist: {},
        message: `Failed to install SearXNG via uv: ${installResult.stderr || installResult.stdout}`,
      };
    }
  }

  return {
    success: true,
    mode: 'uv',
    searxngUrl: DEFAULT_SEARXNG_URL,
    envToPersist: {
      SETI_SEARXNG_BASE_URL: DEFAULT_SEARXNG_URL,
    },
    message: 'SearXNG installed via uv tool (start with: uv tool run searxng)',
  };
}

async function setupExistingSearxng(
  searxngUrl: string,
  _options: {
    nonInteractive: boolean;
  }
): Promise<SetupResult> {
  const isHealthy = await checkSearXNGHealth(searxngUrl);

  if (!isHealthy) {
    return {
      success: false,
      mode: 'existing',
      envToPersist: {},
      message: `SearXNG at ${searxngUrl} is not responding`,
    };
  }

  const searchWorks = await probeSearXNGSearch(searxngUrl);

  if (!searchWorks) {
    return {
      success: false,
      mode: 'existing',
      envToPersist: {},
      message: 'Health check passed but search failed',
    };
  }

  return {
    success: true,
    mode: 'existing',
    searxngUrl,
    envToPersist: {
      SETI_SEARXNG_BASE_URL: searxngUrl,
    },
    message: `Connected to SearXNG at ${searxngUrl}`,
  };
}

// =============================================================================
// Interactive Wizard (Step-by-Step Flow)
// =============================================================================

interface InteractiveAnswers {
  mode: SetupMode;
  searxngUrl?: string;
  apiKeys: Record<string, string>;
  enableFallbacks: boolean;
}

async function runInteractiveWizard(): Promise<InteractiveAnswers> {
  const dockerAvailable = await isDockerAvailable();
  const uvAvailable = await isUvAvailable();

  const modeOptions: { label: string; value: SetupMode; hint?: string }[] = [];

  if (dockerAvailable) {
    modeOptions.push({
      label: 'Docker',
      value: 'docker',
      hint: 'Recommended',
    });
  }

  if (uvAvailable) {
    modeOptions.push({
      label: 'uv',
      value: 'uv',
      hint: 'Persistent local install',
    });
  }

  modeOptions.push(
    { label: 'Connect existing', value: 'existing', hint: 'Use your own SearXNG instance' },
    { label: 'API only', value: 'api-only', hint: 'No local search server' }
  );

  const mode = cancelIfNeeded(
    await p.select({
      message: 'How do you want to run SearXNG?',
      options: modeOptions,
    })
  );

  let searxngUrl: string | undefined;

  if (mode === 'existing') {
    searxngUrl = cancelIfNeeded(
      await p.text({
        message: 'SearXNG base URL',
        placeholder: DEFAULT_SEARXNG_URL,
        defaultValue: DEFAULT_SEARXNG_URL,
        validate: (value) => {
          if (!value?.trim()) return 'URL is required';
          try {
            new URL(value);
            return;
          } catch {
            return 'Enter a valid URL';
          }
        },
      })
    );
  }

  const apiKeys = await collectApiKeys();

  let enableFallbacks = true;

  const hasApiKeys = Object.keys(apiKeys).some((k) => k !== 'JINA_READER_API_KEY' && apiKeys[k]);

  if (mode !== 'api-only' && hasApiKeys) {
    enableFallbacks = cancelIfNeeded(
      await p.confirm({
        message: 'Use API providers when SearXNG fails?',
        initialValue: true,
      })
    );
  }

  return {
    mode,
    searxngUrl,
    apiKeys,
    enableFallbacks,
  };
}

async function collectApiKeys(): Promise<Record<string, string>> {
  const apiKeys: Record<string, string> = {};

  p.log.message('');

  const setupApis = cancelIfNeeded(
    await p.confirm({
      message: 'Configure API fallback providers?',
      initialValue: false,
    })
  );

  if (!setupApis) {
    return apiKeys;
  }

  const selectedProviders = cancelIfNeeded(
    await p.multiselect({
      message: 'Which providers?',
      options: KEY_FIELDS.filter((f) => f.key !== 'GOOGLE_CX').map((field) => ({
        label: field.name,
        value: field.key,
      })),
      required: false,
    })
  );

  if (!selectedProviders || selectedProviders.length === 0) {
    return apiKeys;
  }

  for (const key of selectedProviders) {
    const field = KEY_FIELDS.find((f) => f.key === key);
    if (!field) continue;

    const value = cancelIfNeeded(
      await p.password({
        message: `${field.name}`,
        mask: pc.dim('·'),
      })
    );

    const trimmed = (value || '').trim();
    if (trimmed) {
      apiKeys[field.key] = trimmed;
    }

    if (field.key === 'GOOGLE_API_KEY' && trimmed) {
      const cxValue = cancelIfNeeded(
        await p.text({
          message: 'Google CX',
          placeholder: 'programmablesearchengine.google.com',
        })
      );
      if ((cxValue || '').trim()) {
        apiKeys.GOOGLE_CX = (cxValue || '').trim();
      }
    }
  }

  p.log.message('');
  p.log.info(pc.dim('Content enrichment'));

  const jinaKey = cancelIfNeeded(
    await p.password({
      message: 'Jina Reader API Key (optional)',
      mask: pc.dim('·'),
    })
  );

  const trimmedJina = (jinaKey || '').trim();
  if (trimmedJina) {
    apiKeys.JINA_READER_API_KEY = trimmedJina;
  }

  return apiKeys;
}

// =============================================================================
// Summary Display with Boxes (using p.note)
// =============================================================================

function displaySummary(
  mode: SetupMode,
  searxngUrl: string | undefined,
  apiKeys: Record<string, string>,
  enableFallbacks: boolean
): void {
  const lines: string[] = [];

  // Search Backend
  lines.push(pc.green('Search Backend'));
  switch (mode) {
    case 'docker':
      lines.push(`${S_CHECK_ACTIVE} SearXNG via Docker`);
      lines.push(`  ${pc.dim(DEFAULT_SEARXNG_URL)}`);
      break;
    case 'uv':
      lines.push(`${S_CHECK_ACTIVE} SearXNG via uv`);
      lines.push(`  ${pc.dim('Start manually: uv tool run searxng')}`);
      break;
    case 'existing':
      lines.push(`${S_CHECK_ACTIVE} SearXNG at ${searxngUrl || DEFAULT_SEARXNG_URL}`);
      break;
    case 'api-only':
      lines.push(`${S_CHECK_INACTIVE} No local search (API-only)`);
      break;
  }

  // API Providers
  const searchProviders = Object.keys(apiKeys).filter(
    (k) => k !== 'JINA_READER_API_KEY' && k !== 'GOOGLE_CX'
  );

  if (searchProviders.length > 0) {
    lines.push('');
    lines.push(pc.green('API Providers'));
    for (const key of searchProviders) {
      const field = KEY_FIELDS.find((f) => f.key === key);
      lines.push(`${S_CHECK_ACTIVE} ${field?.name || key}`);
    }
  }

  // Content Enrichment
  if (apiKeys.JINA_READER_API_KEY) {
    lines.push('');
    lines.push(pc.green('Content Enrichment'));
    lines.push(`${S_CHECK_ACTIVE} Jina AI Reader`);
  }

  // Fallbacks
  if (mode !== 'api-only' && searchProviders.length > 0) {
    lines.push('');
    lines.push(pc.green('Fallback Behavior'));
    lines.push(
      enableFallbacks
        ? `${S_CHECK_ACTIVE} Enabled (fallback to APIs on failure)`
        : `${S_CHECK_INACTIVE} Disabled (SearXNG only)`
    );
  }

  // Use p.note for the boxed summary
  p.note(lines.join('\n'), 'Configuration Summary');
}

// =============================================================================
// Env File Management
// =============================================================================

async function writeSparseEnvFile(envVars: Record<string, string>): Promise<void> {
  const envPath = getEnvFilePath();
  const configDir = path.dirname(envPath);

  await mkdir(configDir, { recursive: true });

  let existingContent = '';

  try {
    existingContent = await readFile(envPath, 'utf-8');
  } catch {
    // File doesn't exist
  }

  const lines = existingContent.split(/\r?\n/);
  const existingKeys = new Map<string, number>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const eqIndex = line.indexOf('=');
    if (eqIndex > 0 && !line.startsWith('#')) {
      const key = line.slice(0, eqIndex).trim();
      existingKeys.set(key, i);
    }
  }

  const searxngSettings: [string, string][] = [];
  const apiKeys: [string, string][] = [];
  const otherSettings: [string, string][] = [];

  for (const [key, value] of Object.entries(envVars)) {
    const entry: [string, string] = [key, value];

    if (key === 'SETI_SEARXNG_BASE_URL') {
      searxngSettings.push(entry);
    } else if (key.endsWith('_API_KEY') || key === 'GOOGLE_CX') {
      apiKeys.push(entry);
    } else if (PROVIDER_FLAGS.includes(key)) {
      otherSettings.push(entry);
    } else {
      otherSettings.push(entry);
    }
  }

  // Update existing lines or append new ones
  for (const [key, value] of [...searxngSettings, ...apiKeys, ...otherSettings]) {
    const lineIndex = existingKeys.get(key);
    const newLine = `${key}=${value}`;

    if (lineIndex !== undefined) {
      lines[lineIndex] = newLine;
    } else {
      lines.push(newLine);
    }
  }

  // Remove trailing empty lines and add one
  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  lines.push('');

  await writeFile(envPath, lines.join('\n'), 'utf-8');
  p.log.success(pc.green(`Configuration saved to ${pc.green(envPath)}`));
}

// =============================================================================
// Main Entry Points
// =============================================================================

async function runInteractiveSetup(): Promise<number> {
  // Show logo
  console.log(renderLogo());

  // Intro - space themed one-liner
  p.intro(pc.dim('"Listening for signals from across the cosmos."'));

  p.log.message('');

  // Run wizard
  const answers = await runInteractiveWizard();

  // Execute setup based on mode
  let result: SetupResult;

  p.log.step('Executing setup...');

  switch (answers.mode) {
    case 'docker':
      result = await setupDockerSearxng({
        nonInteractive: false,
        forced: false,
      });
      break;

    case 'uv':
      result = await setupUvSearxng({
        nonInteractive: false,
        forced: false,
      });
      break;

    case 'existing':
      result = await setupExistingSearxng(answers.searxngUrl!, {
        nonInteractive: false,
      });
      break;

    case 'api-only':
      result = {
        success: true,
        mode: 'api-only',
        envToPersist: {},
        message: 'API-only mode selected',
      };
      break;

    default:
      result = {
        success: false,
        mode: answers.mode,
        envToPersist: {},
        message: 'Unknown setup mode',
      };
  }

  if (!result.success) {
    p.log.error(result.message);
    p.outro(pc.red('Setup failed'));
    return EXIT_CODES.GENERIC_FAILURE;
  }

  p.log.success(result.message);

  // Build sparse env
  const envToPersist: Record<string, string> = { ...result.envToPersist };

  for (const [key, value] of Object.entries(answers.apiKeys)) {
    if (value) envToPersist[key] = value;
  }

  if (answers.mode === 'api-only') {
    envToPersist.SETI_SEARXNG_ENABLED = 'false';
  } else if (!answers.enableFallbacks) {
    for (const flag of PROVIDER_FLAGS) {
      envToPersist[flag] = 'false';
    }
  }

  // Show summary
  displaySummary(answers.mode, answers.searxngUrl, answers.apiKeys, answers.enableFallbacks);

  // Write env file
  if (Object.keys(envToPersist).length > 0) {
    await writeSparseEnvFile(envToPersist);
  } else {
    p.log.info(pc.dim('Running with built-in defaults (no .env changes)'));
  }

  // Outro with helpful next steps
  const nextSteps = [
    `${pc.green('seti')} ${pc.dim('# Start the MCP server')}`,
    `${pc.green('seti verify')} ${pc.dim('# Check configuration')}`,
  ];

  p.note(nextSteps.join('\n'), 'Next Steps');

  p.outro(pc.green('Setup complete!'));
  return EXIT_CODES.SUCCESS;
}

async function runNonInteractiveSetup(options: SetupOptions): Promise<number> {
  // Simple text output for non-interactive mode
  console.log(pc.green('SETI Setup') + pc.dim(' (non-interactive mode)'));
  console.log();

  let mode: SetupMode | null = null;
  let isForced = false;

  if (options.docker) {
    mode = 'docker';
    isForced = true;
    console.log(pc.dim('Mode:') + ' Docker (forced)');
  } else if (options.uv) {
    mode = 'uv';
    isForced = true;
    console.log(pc.dim('Mode:') + ' uv (forced)');
  }

  // Check for existing SearXNG
  if (!isForced) {
    const searxngHealthy = await checkSearXNGHealth(DEFAULT_SEARXNG_URL);
    if (searxngHealthy) {
      const searchWorks = await probeSearXNGSearch(DEFAULT_SEARXNG_URL);
      if (searchWorks) {
        console.log(pc.green('✓') + ' Using existing SearXNG at ' + DEFAULT_SEARXNG_URL);
        console.log();
        console.log(pc.dim('Running with built-in defaults'));
        return EXIT_CODES.SUCCESS;
      }
    }
  }

  // Auto-select mode
  if (!mode) {
    const dockerAvailable = await isDockerAvailable();
    if (dockerAvailable) {
      mode = 'docker';
      console.log(pc.dim('Mode:') + ' Docker (auto-selected)');
    }
  }

  if (!mode) {
    console.error(pc.red('Error:') + ' SearXNG is not running and no setup method is available.');
    console.error();
    console.error('To use SETI in non-interactive mode:');
    console.error('  1. Install Docker: https://docs.docker.com/get-docker/');
    console.error('  2. Start SearXNG manually at ' + DEFAULT_SEARXNG_URL);
    console.error();
    console.error('Or run interactive mode: ' + pc.green('seti setup'));
    return EXIT_CODES.DEPENDENCY_MISSING;
  }

  // Execute setup
  let result: SetupResult;

  switch (mode) {
    case 'docker':
      console.log(pc.dim('Setting up SearXNG with Docker...'));
      result = await setupDockerSearxng({
        nonInteractive: true,
        forced: isForced,
      });
      break;
    case 'uv':
      result = await setupUvSearxng({
        nonInteractive: true,
        forced: isForced,
      });
      break;
    default:
      result = {
        success: false,
        mode,
        envToPersist: {},
        message: 'Unknown setup mode',
      };
  }

  if (!result.success) {
    console.error(pc.red('✗') + ' ' + result.message);
    return EXIT_CODES.GENERIC_FAILURE;
  }

  console.log(pc.green('✓') + ' ' + result.message);
  console.log();
  console.log(pc.dim('Running with built-in defaults'));
  return EXIT_CODES.SUCCESS;
}

// =============================================================================
// Main Entry Point
// =============================================================================

async function main(): Promise<number> {
  const options = parseArgs();

  if (options.nonInteractive) {
    return await runNonInteractiveSetup(options);
  }

  return await runInteractiveSetup();
}

main()
  .then((code) => {
    process.exit(code);
  })
  .catch((error) => {
    console.error(pc.red('Fatal error:'), error instanceof Error ? error.message : String(error));
    process.exit(EXIT_CODES.GENERIC_FAILURE);
  });
