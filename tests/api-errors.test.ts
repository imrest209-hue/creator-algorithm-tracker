import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, fetchJson } from '@/lib/integrations/http';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

function mockResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (key: string) => headers[key.toLowerCase()] ?? null },
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  } as Response;
}

describe('fetchJson', () => {
  it('returns parsed JSON on a 200 response', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockResponse(200, { hello: 'world' }));
    const result = await fetchJson<{ hello: string }>('https://example.com', { label: 'test' });
    expect(result.hello).toBe('world');
  });

  it('classifies a 401 as an AUTH error with a user-facing message', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockResponse(401, { error: 'invalid_token' }));
    await expect(fetchJson('https://example.com', { label: 'test', maxAttempts: 1 })).rejects.toMatchObject({
      kind: 'AUTH',
    });
  });

  it('classifies a quota-exceeded 403 distinctly from an auth 403', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(mockResponse(403, { error: { errors: [{ reason: 'quotaExceeded' }] } }));
    try {
      await fetchJson('https://example.com', { label: 'test', maxAttempts: 1 });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).kind).toBe('QUOTA');
    }
  });

  it('retries a 429 rate-limit response and eventually succeeds', async () => {
    let calls = 0;
    global.fetch = vi.fn().mockImplementation(async () => {
      calls += 1;
      if (calls === 1) return mockResponse(429, 'rate limited', { 'retry-after': '0' });
      return mockResponse(200, { ok: true });
    });
    const result = await fetchJson<{ ok: boolean }>('https://example.com', {
      label: 'test',
      maxAttempts: 2,
    });
    expect(result.ok).toBe(true);
    expect(calls).toBe(2);
  });

  it('does not retry a plain 4xx client error', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockResponse(400, 'bad request'));
    await expect(fetchJson('https://example.com', { label: 'test', maxAttempts: 3 })).rejects.toMatchObject({
      kind: 'CLIENT',
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('surfaces a network failure as a NETWORK ApiError after exhausting retries', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(fetchJson('https://example.com', { label: 'test', maxAttempts: 2 })).rejects.toMatchObject({
      kind: 'NETWORK',
    });
  });

  it('exposes a friendly userMessage for each error kind', () => {
    const authError = new ApiError('x', 401, 'AUTH');
    const quotaError = new ApiError('x', 403, 'QUOTA');
    expect(authError.userMessage).toMatch(/reconnect/i);
    expect(quotaError.userMessage).toMatch(/quota/i);
  });
});
