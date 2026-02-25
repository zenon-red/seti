import { createConsola } from 'consola';
import type { LogConfig } from '../types/index.js';

function levelToNumber(level: LogConfig['level']): number {
  switch (level) {
    case 'debug':
      return 4;
    case 'info':
      return 3;
    case 'warn':
      return 2;
    case 'error':
      return 1;
  }
}

const defaultLogConfig: LogConfig = {
  level: 'info',
  logUsage: false,
  timestamps: false,
};

let activeLogConfig: LogConfig = defaultLogConfig;
let activeLogger = createConsola({
  level: levelToNumber(defaultLogConfig.level),
  fancy: true,
  formatOptions: {
    date: defaultLogConfig.timestamps,
    colors: true,
  },
});

export const logger = new Proxy({} as ReturnType<typeof createConsola>, {
  get(_target, prop, receiver) {
    return Reflect.get(activeLogger, prop, receiver);
  },
  set(_target, prop, value, receiver) {
    return Reflect.set(activeLogger, prop, value, receiver);
  },
});

export function configureLogger(config: LogConfig): void {
  activeLogConfig = config;
  activeLogger = createConsola({
    level: levelToNumber(config.level),
    fancy: true,
    formatOptions: {
      date: config.timestamps,
      colors: true,
    },
  });
}

/** Log provider usage */
export function logUsage(
  provider: string,
  query: string,
  results: number,
  durationMs: number
): void {
  if (activeLogConfig.logUsage) {
    logger.info('Search completed', {
      provider,
      query: query.substring(0, 50),
      results,
      durationMs,
    });
  }
}
