import { existsSync, readFileSync } from 'node:fs';
import { homedir, platform } from 'os';
import { join } from 'path';

export function getConfigDir(): string {
  const home = homedir();

  if (platform() === 'win32') {
    const appDataLocal = process.env.LOCALAPPDATA;
    if (appDataLocal) {
      return join(appDataLocal, 'seti');
    }
    const appData = process.env.APPDATA;
    if (appData) {
      return join(appData, 'seti');
    }
    return join(home, '.seti');
  }

  return join(home, '.config', 'seti');
}

export function getUsageFilePath(): string {
  return join(getConfigDir(), 'usage.json');
}

export function getSearXNGManagedDir(): string {
  return join(getConfigDir(), 'searxng');
}

export function getEnvFilePath(): string {
  return join(getConfigDir(), '.env');
}

export function loadCentralizedEnv(): void {
  const envPath = getEnvFilePath();
  if (!existsSync(envPath)) return;

  try {
    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const eqIndex = trimmed.indexOf('=');
      if (eqIndex <= 0) continue;

      const key = trimmed.slice(0, eqIndex).trim();
      let value = trimmed.slice(eqIndex + 1).trim();

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch {
    // Silently ignore errors reading env file
  }
}
