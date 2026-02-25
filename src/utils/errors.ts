/**
 * Error handling utilities
 */

import type { ErrorType, ProviderError } from '../types/index.js';

/** Base SETI error */
export class SETIError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly retryable: boolean = false
  ) {
    super(message);
    this.name = 'SETIError';
  }
}

/** Provider-specific error */
export class ProviderErrorClass extends Error implements ProviderError {
  public readonly type: ErrorType;
  public readonly retryable: boolean;
  public readonly provider: string;
  public readonly timestamp: Date;
  public readonly originalError?: Error;

  constructor(
    provider: string,
    type: ErrorType,
    message: string,
    retryable: boolean,
    originalError?: Error
  ) {
    super(message);
    this.name = 'ProviderError';
    this.provider = provider;
    this.type = type;
    this.retryable = retryable;
    this.originalError = originalError;
    this.timestamp = new Date();
  }
}

/** Classify an error from a provider */
export function classifyError(provider: string, error: unknown): ProviderError {
  const err = error instanceof Error ? error : new Error(String(error));
  const message = err.message.toLowerCase();

  let type: ErrorType = 'unknown';
  let retryable = false;

  if (message.includes('timeout') || message.includes('etimedout')) {
    type = 'timeout';
    retryable = true;
  } else if (message.includes('rate limit') || message.includes('too many requests')) {
    type = 'rate_limit';
    retryable = true;
  } else if (
    message.includes('unauthorized') ||
    message.includes('invalid api key') ||
    message.includes('authentication')
  ) {
    type = 'auth';
    retryable = false;
  } else if (message.includes('quota') || message.includes('limit exceeded')) {
    type = 'quota_exceeded';
    retryable = false;
  } else if (
    message.includes('network') ||
    message.includes('econnrefused') ||
    message.includes('enotfound')
  ) {
    type = 'network';
    retryable = true;
  } else if (
    message.includes('parse') ||
    message.includes('json') ||
    message.includes('invalid response')
  ) {
    type = 'parsing_error';
    retryable = false;
  } else if (
    message.includes('bad request') ||
    message.includes('validation') ||
    message.includes('invalid')
  ) {
    type = 'invalid_request';
    retryable = false;
  }

  return new ProviderErrorClass(provider, type, err.message, retryable, err);
}
