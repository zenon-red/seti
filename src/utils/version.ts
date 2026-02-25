import { readFileSync } from 'node:fs';
import path from 'node:path';

export function resolveCliVersion(startDir: string): string {
  let currentDir = startDir;

  for (let i = 0; i < 8; i++) {
    const packageJsonPath = path.join(currentDir, 'package.json');

    try {
      const raw = readFileSync(packageJsonPath, 'utf-8');
      const parsed = JSON.parse(raw) as { version?: unknown };
      if (typeof parsed.version === 'string' && parsed.version.trim()) {
        return parsed.version;
      }
    } catch {
      // Try parent directory
    }

    const parent = path.dirname(currentDir);
    if (parent === currentDir) break;
    currentDir = parent;
  }

  return '0.0.0';
}
