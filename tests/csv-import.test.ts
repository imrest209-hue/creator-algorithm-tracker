import { describe, expect, it } from 'vitest';
import { parseCsv, detectDelimiter, toCsv } from '@/lib/csv/parse';
import {
  autoMapColumns,
  buildImportPreview,
  parseDate,
  parseDuration,
  parseHashtags,
  parseNumber,
  parsePlatform,
} from '@/lib/csv/import';

describe('parseCsv', () => {
  it('parses a simple CSV with a header row', () => {
    const result = parseCsv('a,b,c\n1,2,3\n4,5,6');
    expect(result.headers).toEqual(['a', 'b', 'c']);
    expect(result.rows).toEqual([
      ['1', '2', '3'],
      ['4', '5', '6'],
    ]);
  });

  it('handles quoted fields with embedded commas and newlines', () => {
    const result = parseCsv('title,note\n"Hello, world","Line1\nLine2"');
    expect(result.rows[0]).toEqual(['Hello, world', 'Line1\nLine2']);
  });

  it('handles escaped quotes inside quoted fields', () => {
    const result = parseCsv('title\n"She said ""hi"""');
    expect(result.rows[0][0]).toBe('She said "hi"');
  });

  it('strips a UTF-8 BOM from the first header', () => {
    const result = parseCsv('﻿title,views\nVideo,100');
    expect(result.headers[0]).toBe('title');
  });

  it('flags rows with the wrong column count as malformed but keeps them', () => {
    const result = parseCsv('a,b,c\n1,2\n4,5,6');
    expect(result.malformedRowNumbers).toEqual([2]);
    expect(result.rows.length).toBe(2);
  });

  it('detects a semicolon delimiter when it produces more columns', () => {
    expect(detectDelimiter('a;b;c\n1;2;3')).toBe(';');
  });
});

describe('toCsv', () => {
  it('quotes values containing commas, quotes, or newlines', () => {
    const csv = toCsv(['a', 'b'], [['has,comma', 'has"quote']]);
    expect(csv).toContain('"has,comma"');
    expect(csv).toContain('"has""quote"');
  });
});

describe('field parsers', () => {
  it('parseNumber strips thousands separators and percent signs', () => {
    expect(parseNumber('1,234')).toBe(1234);
    expect(parseNumber('45.6%')).toBe(45.6);
    expect(parseNumber('N/A')).toBeNull();
    expect(parseNumber(undefined)).toBeNull();
  });

  it('parseDuration accepts raw seconds and mm:ss / hh:mm:ss', () => {
    expect(parseDuration('90')).toBe(90);
    expect(parseDuration('1:30')).toBe(90);
    expect(parseDuration('1:01:30')).toBe(3690);
    expect(parseDuration('')).toBeNull();
  });

  it('parseDate rejects implausible years instead of accepting garbage', () => {
    expect(parseDate('2026-01-15T10:00:00Z')).not.toBeNull();
    expect(parseDate('1900-01-01')).toBeNull();
    expect(parseDate('not a date')).toBeNull();
  });

  it('parsePlatform recognises common aliases and falls back to the default', () => {
    expect(parsePlatform('tiktok', 'YOUTUBE')).toBe('TIKTOK');
    expect(parsePlatform('YT Shorts', 'YOUTUBE')).toBe('YOUTUBE_SHORTS');
    expect(parsePlatform(undefined, 'TIKTOK')).toBe('TIKTOK');
    expect(parsePlatform('unknown-thing', 'YOUTUBE')).toBe('YOUTUBE');
  });

  it('parseHashtags normalises and de-duplicates casing/prefix', () => {
    expect(parseHashtags('#Cars, cars, #DIY')).toEqual(['#cars', '#cars', '#diy']);
  });
});

describe('autoMapColumns', () => {
  it('maps common YouTube Studio-style headers to the right fields', () => {
    const headers = ['Video title', 'Video publish time', 'Views', 'Likes', 'Duration'];
    const mapping = autoMapColumns(headers);
    expect(mapping.title).toBe(0);
    expect(mapping.publishedAt).toBe(1);
    expect(mapping.views).toBe(2);
    expect(mapping.likes).toBe(3);
    expect(mapping.durationSeconds).toBe(4);
  });
});

describe('buildImportPreview', () => {
  const csv = [
    'Video ID,Title,Published,Duration,Views,Likes,Retention',
    'v1,My First Video,2026-01-15T10:00:00Z,120,1000,50,45.5',
    'v2,Missing Views Row,2026-01-16T10:00:00Z,90,,10,',
    'v1,Duplicate Of v1,2026-01-17T10:00:00Z,60,500,5,',
  ].join('\n');

  it('validates rows and reports errors for missing required fields', () => {
    const preview = buildImportPreview(csv, { defaultPlatform: 'YOUTUBE' });
    expect(preview.totalRows).toBe(3);
    expect(preview.validRows).toBe(2);
    expect(preview.errorRows).toBe(1);
    const badRow = preview.rows.find((r) => !r.valid);
    expect(badRow?.issues.some((i) => i.field === 'views')).toBe(true);
  });

  it('flags duplicate platform video ids within the same file', () => {
    const preview = buildImportPreview(csv, { defaultPlatform: 'YOUTUBE' });
    expect(preview.duplicateRows).toBeGreaterThanOrEqual(1);
  });

  it('flags duplicates against existing keys from the database', () => {
    const preview = buildImportPreview(csv, {
      defaultPlatform: 'YOUTUBE',
      existingKeys: new Set(['YOUTUBE:v1']),
    });
    const firstRow = preview.rows.find((r) => r.video?.platformVideoId === 'v1');
    expect(firstRow?.duplicate).toBe(true);
  });

  it('rejects retention values outside 0-100 as unavailable rather than importing garbage', () => {
    const badRetention = [
      'Video ID,Title,Published,Duration,Views,Retention',
      'v1,Bad retention,2026-01-15T10:00:00Z,120,1000,150',
    ].join('\n');
    const preview = buildImportPreview(badRetention, { defaultPlatform: 'YOUTUBE' });
    const row = preview.rows[0];
    expect(row.video?.metrics.averagePercentageViewed).toBeNull();
    expect(row.issues.some((i) => i.severity === 'WARNING')).toBe(true);
  });

  it('reports unmapped required fields when the header set is unusable', () => {
    const preview = buildImportPreview('foo,bar\n1,2', { defaultPlatform: 'YOUTUBE' });
    expect(preview.unmappedRequiredFields.length).toBeGreaterThan(0);
  });
});
