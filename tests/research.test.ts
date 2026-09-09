import { describe, expect, it } from 'vitest';
import { looksBlocked } from '@/lib/ai/search';

describe('looksBlocked', () => {
  it('treats DuckDuckGo\'s 202 anomaly response as a block, not an empty result set', () => {
    // Regression: DDG serves its rate-limit interstitial as HTTP 202, which
    // passes `response.ok` and then parses to zero results - indistinguishable
    // from "the web had nothing", so the assistant silently degraded.
    expect(looksBlocked(202, '<html><body>nothing useful</body></html>')).toBe(true);
  });

  it('treats an explicit 429 as a block', () => {
    expect(looksBlocked(429, '')).toBe(true);
  });

  it('detects block markers in the body even on a 200', () => {
    expect(looksBlocked(200, '<script src="/dist/anomaly.js"></script>')).toBe(true);
    expect(looksBlocked(200, '<div class="captcha-wrap">verify</div>')).toBe(true);
    expect(looksBlocked(200, '<p>We detected unusual traffic</p>')).toBe(true);
  });

  it('does not flag a normal results page', () => {
    const html = '<div class="result__body"><a class="result__a" href="https://example.com">Title</a></div>';
    expect(looksBlocked(200, html)).toBe(false);
  });

  it('only inspects the head of the document, so page text cannot trigger it', () => {
    // A page legitimately *about* CAPTCHAs shouldn't read as a block just
    // because the word appears far down in its body.
    const html = '<html><body>' + 'x'.repeat(5000) + 'unusual traffic</body></html>';
    expect(looksBlocked(200, html)).toBe(false);
  });
});
