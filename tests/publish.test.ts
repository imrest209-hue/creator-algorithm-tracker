import { describe, expect, it } from 'vitest';
import {
  hasUploadScope,
  parseNextByteFromRangeHeader,
  buildContentRangeHeader,
  YOUTUBE_UPLOAD_SCOPE,
} from '@/lib/integrations/youtube';

describe('hasUploadScope', () => {
  it('is false when the upload scope was never granted', () => {
    expect(hasUploadScope(['https://www.googleapis.com/auth/youtube.readonly'])).toBe(false);
  });

  it('is true once the upload scope is present alongside the read-only ones', () => {
    expect(hasUploadScope(['https://www.googleapis.com/auth/youtube.readonly', YOUTUBE_UPLOAD_SCOPE])).toBe(true);
  });

  it('handles an empty scope list', () => {
    expect(hasUploadScope([])).toBe(false);
  });
});

describe('parseNextByteFromRangeHeader', () => {
  it('returns 0 when no Range header was sent (nothing received yet)', () => {
    expect(parseNextByteFromRangeHeader(null)).toBe(0);
  });

  it('returns the byte after the last one YouTube confirmed receiving', () => {
    expect(parseNextByteFromRangeHeader('bytes=0-8388607')).toBe(8388608);
  });

  it('handles a single-byte range', () => {
    expect(parseNextByteFromRangeHeader('bytes=0-0')).toBe(1);
  });

  it('returns 0 for a header in an unexpected shape rather than throwing', () => {
    expect(parseNextByteFromRangeHeader('not-a-range-header')).toBe(0);
  });
});

describe('buildContentRangeHeader', () => {
  it('builds the header for a full-size chunk starting at 0', () => {
    expect(buildContentRangeHeader(0, 8_388_608, 20_000_000)).toBe('bytes 0-8388607/20000000');
  });

  it('builds the header for a chunk that starts mid-file', () => {
    expect(buildContentRangeHeader(8_388_608, 8_388_608, 20_000_000)).toBe('bytes 8388608-16777215/20000000');
  });

  it('handles the final, partial chunk correctly', () => {
    // File is 20,000,000 bytes; the last chunk starting at 16,777,216 is only
    // 3,222,784 bytes (not a full 8 MiB) - the end byte must land on totalBytes - 1.
    expect(buildContentRangeHeader(16_777_216, 3_222_784, 20_000_000)).toBe('bytes 16777216-19999999/20000000');
  });

  it('handles a single-chunk upload smaller than one chunk size', () => {
    expect(buildContentRangeHeader(0, 500, 500)).toBe('bytes 0-499/500');
  });
});
