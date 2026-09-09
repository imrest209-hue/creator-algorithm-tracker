import { logger } from '@/lib/util/logger';

/**
 * Shared HTTP helper for platform APIs.
 *
 * Handles the two failure modes that actually bite in production: quota/rate
 * limits (429 and Google's 403 quotaExceeded) and transient 5xx responses.
 * Both are retried with exponential backoff and surfaced as typed errors so the
 * UI can explain what happened instead of showing a blank chart.
 */

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly kind: 'AUTH' | 'RATE_LIMIT' | 'QUOTA' | 'NOT_FOUND' | 'SERVER' | 'CLIENT' | 'NETWORK',
    readonly retryAfterSeconds: number | null = null,
    readonly details: unknown = null,
    /**
     * Whether the caller's retry loop should attempt again. Set once, at the
     * point the error was classified, so a later generic catch block can defer
     * to this instead of re-deciding (and getting it wrong) from `kind` alone.
     */
    readonly retryable: boolean = false,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get userMessage(): string {
    switch (this.kind) {
      case 'AUTH':
        return 'The platform rejected the stored credentials. Reconnect the account to continue syncing.';
      case 'RATE_LIMIT':
        return 'The platform is rate limiting requests. Data will be incomplete until the limit resets.';
      case 'QUOTA':
        return 'The daily API quota for this integration has been used up. Try again after the quota resets.';
      case 'NOT_FOUND':
        return 'The platform reported that this resource no longer exists.';
      case 'SERVER':
        return 'The platform API is having problems right now. No data was changed.';
      case 'NETWORK':
        return 'Could not reach the platform API.';
      default:
        return this.message;
    }
  }
}

interface FetchOptions {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string | URLSearchParams;
  /** Total attempts including the first. */
  maxAttempts?: number;
  timeoutMs?: number;
  /** Label used in logs. */
  label: string;
}

const DEFAULT_ATTEMPTS = 3;
const DEFAULT_TIMEOUT_MS = 15_000;

function classify(status: number, bodyText: string): ApiError['kind'] {
  if (status === 401) return 'AUTH';
  if (status === 429) return 'RATE_LIMIT';
  if (status === 403) {
    return /quota|rateLimitExceeded|userRateLimitExceeded/i.test(bodyText) ? 'QUOTA' : 'AUTH';
  }
  if (status === 404) return 'NOT_FOUND';
  if (status >= 500) return 'SERVER';
  return 'CLIENT';
}

function backoffMs(attempt: number, retryAfterSeconds: number | null): number {
  if (retryAfterSeconds !== null) return Math.min(retryAfterSeconds * 1000, 30_000);
  return Math.min(500 * 2 ** (attempt - 1), 8_000);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Fetches JSON with retries. Throws ApiError on non-2xx or invalid JSON. */
export async function fetchJson<T>(url: string, options: FetchOptions): Promise<T> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_ATTEMPTS;
  let lastError: ApiError | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method: options.method ?? 'GET',
        headers: options.headers,
        body: options.body,
        signal: controller.signal,
        cache: 'no-store',
      });
      const text = await response.text();

      if (!response.ok) {
        const retryAfterHeader = response.headers.get('retry-after');
        const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : null;
        const kind = classify(response.status, text);
        const retryable = kind === 'RATE_LIMIT' || kind === 'SERVER';
        lastError = new ApiError(
          options.label + ' failed with HTTP ' + response.status,
          response.status,
          kind,
          Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : null,
          text.slice(0, 500),
          retryable,
        );
        logger.warn('integration.http_error', {
          label: options.label,
          status: response.status,
          kind,
          attempt,
          retryable,
        });
        if (retryable && attempt < maxAttempts) {
          await sleep(backoffMs(attempt, lastError.retryAfterSeconds));
          continue;
        }
        // Non-retryable (or attempts exhausted): return immediately rather than
        // throwing here, which would fall into the generic catch block below and
        // retry it anyway.
        throw lastError;
      }

      if (text.trim() === '') return {} as T;
      try {
        return JSON.parse(text) as T;
      } catch {
        throw new ApiError(
          options.label + ' returned a response that was not valid JSON.',
          response.status,
          'SERVER',
          null,
          text.slice(0, 200),
        );
      }
    } catch (error) {
      if (error instanceof ApiError) {
        // Only loop again if this specific error was classified as retryable
        // AND we thrown it ourselves above (not re-derived here) - otherwise a
        // non-retryable error (e.g. a plain 400) would be retried anyway.
        if (!error.retryable || attempt >= maxAttempts) throw error;
        lastError = error;
        continue;
      }
      const isAbort = error instanceof Error && error.name === 'AbortError';
      lastError = new ApiError(
        isAbort ? options.label + ' timed out.' : options.label + ' could not reach the network.',
        0,
        'NETWORK',
        null,
        error instanceof Error ? error.message : String(error),
      );
      logger.warn('integration.network_error', { label: options.label, attempt });
      if (attempt < maxAttempts) {
        await sleep(backoffMs(attempt, null));
        continue;
      }
      throw lastError;
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError ?? new ApiError(options.label + ' failed.', 0, 'NETWORK');
}
