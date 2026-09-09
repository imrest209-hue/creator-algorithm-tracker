import { PLATFORMS, type Platform, type VideoRecord } from '@/lib/types';
import { DEFAULT_CATEGORIES, classifyCategory, normaliseHashtag } from '@/lib/analytics/content';
import { classifyHook } from '@/lib/analytics/hooks';
import { parseCsv } from '@/lib/csv/parse';

/**
 * CSV IMPORT
 * ---------------------------------------------------------------------------
 * Maps arbitrary analytics exports onto the app's video shape.
 *
 * Rules that matter for data integrity:
 *  * A column that is absent, blank, or not numeric becomes `null`, never 0.
 *  * Rows without a usable id, title or publish date are rejected, not guessed.
 *  * Duplicates (same platform + platform video id) are flagged so the caller
 *    can choose to update instead of silently creating a second record.
 */

export type FieldKey =
  | 'platformVideoId'
  | 'platform'
  | 'title'
  | 'caption'
  | 'description'
  | 'hashtags'
  | 'category'
  | 'hookText'
  | 'durationSeconds'
  | 'publishedAt'
  | 'views'
  | 'likes'
  | 'comments'
  | 'shares'
  | 'saves'
  | 'followersGained'
  | 'watchTimeMinutes'
  | 'averageViewDurationSeconds'
  | 'averagePercentageViewed'
  | 'impressions'
  | 'clickThroughRate';

export interface FieldDefinition {
  key: FieldKey;
  label: string;
  required: boolean;
  type: 'string' | 'number' | 'date' | 'list' | 'platform' | 'duration';
  /** Lower-cased header names that map onto this field automatically. */
  aliases: string[];
  hint?: string;
}

export const IMPORT_FIELDS: FieldDefinition[] = [
  {
    key: 'platformVideoId',
    label: 'Video ID',
    required: true,
    type: 'string',
    aliases: ['video id', 'videoid', 'content', 'video', 'id', 'item id', 'video_id', 'post id'],
  },
  {
    key: 'platform',
    label: 'Platform',
    required: false,
    type: 'platform',
    aliases: ['platform', 'source', 'channel type'],
    hint: 'If missing, the platform you pick for the whole import is used.',
  },
  {
    key: 'title',
    label: 'Title',
    required: true,
    type: 'string',
    aliases: ['video title', 'title', 'name', 'video name'],
  },
  { key: 'caption', label: 'Caption', required: false, type: 'string', aliases: ['caption', 'post caption'] },
  {
    key: 'description',
    label: 'Description',
    required: false,
    type: 'string',
    aliases: ['description', 'video description'],
  },
  {
    key: 'hashtags',
    label: 'Hashtags',
    required: false,
    type: 'list',
    aliases: ['hashtags', 'tags', 'hashtag'],
  },
  {
    key: 'category',
    label: 'Category',
    required: false,
    type: 'string',
    aliases: ['category', 'topic', 'content type'],
  },
  { key: 'hookText', label: 'Hook', required: false, type: 'string', aliases: ['hook', 'opening line', 'first line'] },
  {
    key: 'durationSeconds',
    label: 'Duration (seconds)',
    required: true,
    type: 'duration',
    aliases: ['duration', 'length', 'video length', 'duration (seconds)', 'video duration', 'duration seconds'],
    hint: 'Accepts seconds, or mm:ss / hh:mm:ss.',
  },
  {
    key: 'publishedAt',
    label: 'Published at',
    required: true,
    type: 'date',
    aliases: ['video publish time', 'publish time', 'published', 'date', 'post time', 'create time', 'upload date', 'published at'],
  },
  { key: 'views', label: 'Views', required: true, type: 'number', aliases: ['views', 'video views', 'play count', 'plays'] },
  { key: 'likes', label: 'Likes', required: false, type: 'number', aliases: ['likes', 'like count'] },
  { key: 'comments', label: 'Comments', required: false, type: 'number', aliases: ['comments', 'comment count'] },
  { key: 'shares', label: 'Shares', required: false, type: 'number', aliases: ['shares', 'share count'] },
  { key: 'saves', label: 'Saves / favorites', required: false, type: 'number', aliases: ['saves', 'favorites', 'favourites', 'bookmarks'] },
  {
    key: 'followersGained',
    label: 'Followers/subscribers gained',
    required: false,
    type: 'number',
    aliases: ['subscribers gained', 'subscribers', 'new followers', 'followers gained', 'follows'],
  },
  {
    key: 'watchTimeMinutes',
    label: 'Watch time (minutes)',
    required: false,
    type: 'number',
    aliases: ['watch time (hours)', 'watch time (minutes)', 'watch time', 'total watch time', 'watch time minutes'],
    hint: 'A column named "watch time (hours)" is converted to minutes automatically.',
  },
  {
    key: 'averageViewDurationSeconds',
    label: 'Average view duration (seconds)',
    required: false,
    type: 'duration',
    aliases: ['average view duration', 'avg view duration', 'average watch time', 'avg watch time', 'avg view duration seconds'],
  },
  {
    key: 'averagePercentageViewed',
    label: 'Average percentage viewed',
    required: false,
    type: 'number',
    aliases: ['average percentage viewed', 'avg percentage viewed', 'retention', 'average view percentage', 'watched full video', 'retention pct'],
  },
  { key: 'impressions', label: 'Impressions', required: false, type: 'number', aliases: ['impressions', 'shows'] },
  {
    key: 'clickThroughRate',
    label: 'Click-through rate (%)',
    required: false,
    type: 'number',
    aliases: ['impressions click-through rate', 'impressions click-through rate (%)', 'ctr', 'click-through rate', 'click through rate', 'click through rate pct'],
  },
];

export type ColumnMapping = Partial<Record<FieldKey, number>>;

function normaliseHeader(header: string): string {
  return header
    .toLowerCase()
    .replace(/\(.*?\)/g, (m) => m) // keep parenthetical units, they disambiguate
    .replace(/[_.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Best-effort automatic mapping of CSV headers onto known fields. */
export function autoMapColumns(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const used = new Set<number>();
  const normalised = headers.map(normaliseHeader);

  // Exact alias matches first, then "contains" matches, so "views" does not
  // steal the column that should map to "video views" for another field.
  for (const pass of ['exact', 'contains'] as const) {
    for (const field of IMPORT_FIELDS) {
      if (mapping[field.key] !== undefined) continue;
      for (let i = 0; i < normalised.length; i += 1) {
        if (used.has(i)) continue;
        const header = normalised[i];
        const hit = field.aliases.some((alias) =>
          pass === 'exact' ? header === alias : header.includes(alias),
        );
        if (hit) {
          mapping[field.key] = i;
          used.add(i);
          break;
        }
      }
    }
  }
  return mapping;
}

export function parseNumber(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const cleaned = raw.replace(/[,\s%$]/g, '').trim();
  if (cleaned === '' || cleaned === '-' || cleaned.toLowerCase() === 'n/a') return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

/** Accepts raw seconds, "mm:ss" and "hh:mm:ss". */
export function parseDuration(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  if (trimmed.includes(':')) {
    const parts = trimmed.split(':').map((p) => Number(p.trim()));
    if (parts.some((p) => !Number.isFinite(p))) return null;
    return parts.reduce((acc, part) => acc * 60 + part, 0);
  }
  return parseNumber(trimmed);
}

export function parseDate(raw: string | undefined): string | null {
  if (raw === undefined) return null;
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  // Normalise "2026-01-31 14:05:00" (no T) which Date parses inconsistently.
  const candidate = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(trimmed)
    ? trimmed.replace(' ', 'T')
    : trimmed;
  const date = new Date(candidate);
  if (Number.isNaN(date.getTime())) return null;
  // Reject dates far outside a plausible range - usually a mis-mapped column.
  const year = date.getUTCFullYear();
  if (year < 2005 || year > new Date().getUTCFullYear() + 1) return null;
  return date.toISOString();
}

export function parsePlatform(raw: string | undefined, fallback: Platform): Platform {
  if (!raw) return fallback;
  const value = raw.trim().toUpperCase().replace(/[\s-]/g, '_');
  if ((PLATFORMS as readonly string[]).includes(value)) return value as Platform;
  if (value.includes('TIKTOK') || value.includes('TT')) return 'TIKTOK';
  if (value.includes('SHORT')) return 'YOUTUBE_SHORTS';
  if (value.includes('YOUTUBE') || value.includes('YT')) return 'YOUTUBE';
  if (value.includes('TWITCH')) return 'TWITCH';
  if (value.includes('KICK')) return 'KICK';
  return fallback;
}

export function parseHashtags(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;\s]+/)
    .map((t) => normaliseHashtag(t))
    .filter((t) => t.length > 0)
    .map((t) => '#' + t);
}

export interface RowIssue {
  rowNumber: number;
  field: FieldKey | 'row';
  severity: 'ERROR' | 'WARNING';
  message: string;
}

export interface ParsedVideoRow {
  rowNumber: number;
  valid: boolean;
  duplicate: boolean;
  issues: RowIssue[];
  /** Present when `valid` is true. */
  video: ImportedVideo | null;
}

export interface ImportedVideo {
  platformVideoId: string;
  platform: Platform;
  title: string;
  caption: string | null;
  description: string | null;
  hashtags: string[];
  categorySlug: string;
  categoryName: string;
  categoryAuto: boolean;
  hookText: string | null;
  hookType: VideoRecord['hookType'];
  durationSeconds: number;
  publishedAt: string;
  metrics: VideoRecord['metrics'];
}

export interface ImportPreview {
  headers: string[];
  mapping: ColumnMapping;
  rows: ParsedVideoRow[];
  totalRows: number;
  validRows: number;
  errorRows: number;
  duplicateRows: number;
  malformedRowNumbers: number[];
  unmappedRequiredFields: FieldKey[];
}

export interface BuildPreviewOptions {
  defaultPlatform: Platform;
  /** Existing "platform:platformVideoId" keys, for duplicate detection. */
  existingKeys?: Set<string>;
  mapping?: ColumnMapping;
  /** Cap the number of rows parsed, to keep previews responsive. */
  limit?: number;
}

export function buildImportPreview(
  csvText: string,
  options: BuildPreviewOptions,
): ImportPreview {
  const parsed = parseCsv(csvText);
  const mapping = options.mapping ?? autoMapColumns(parsed.headers);
  const existing = options.existingKeys ?? new Set<string>();
  const seenInFile = new Set<string>();
  const limit = options.limit ?? 5000;

  const unmappedRequiredFields = IMPORT_FIELDS.filter(
    (f) => f.required && mapping[f.key] === undefined,
  ).map((f) => f.key);

  const rows: ParsedVideoRow[] = [];
  const watchTimeIsHours = isWatchTimeInHours(parsed.headers, mapping);

  parsed.rows.slice(0, limit).forEach((cells, index) => {
    const rowNumber = index + 2;
    const issues: RowIssue[] = [];
    const cell = (key: FieldKey): string | undefined => {
      const columnIndex = mapping[key];
      if (columnIndex === undefined) return undefined;
      const value = cells[columnIndex];
      return value === undefined || value.trim() === '' ? undefined : value;
    };

    const title = cell('title');
    const publishedRaw = cell('publishedAt');
    const publishedAt = parseDate(publishedRaw);
    const durationRaw = cell('durationSeconds');
    const durationSeconds = parseDuration(durationRaw);
    const views = parseNumber(cell('views'));
    const platform = parsePlatform(cell('platform'), options.defaultPlatform);
    const platformVideoId = cell('platformVideoId');

    if (!platformVideoId) {
      issues.push({ rowNumber, field: 'platformVideoId', severity: 'ERROR', message: 'Missing video ID.' });
    }
    if (!title) {
      issues.push({ rowNumber, field: 'title', severity: 'ERROR', message: 'Missing title.' });
    }
    if (!publishedAt) {
      issues.push({
        rowNumber,
        field: 'publishedAt',
        severity: 'ERROR',
        message: publishedRaw
          ? 'Could not parse the publish date "' + publishedRaw + '".'
          : 'Missing publish date.',
      });
    }
    if (durationSeconds === null || durationSeconds <= 0) {
      issues.push({
        rowNumber,
        field: 'durationSeconds',
        severity: 'ERROR',
        message: durationRaw ? 'Could not parse duration "' + durationRaw + '".' : 'Missing duration.',
      });
    }
    if (views === null) {
      issues.push({ rowNumber, field: 'views', severity: 'ERROR', message: 'Missing or non-numeric views.' });
    } else if (views < 0) {
      issues.push({ rowNumber, field: 'views', severity: 'ERROR', message: 'Views cannot be negative.' });
    }

    const retention = parseNumber(cell('averagePercentageViewed'));
    if (retention !== null && (retention < 0 || retention > 100)) {
      issues.push({
        rowNumber,
        field: 'averagePercentageViewed',
        severity: 'WARNING',
        message: 'Average percentage viewed is outside 0-100 and will be imported as unavailable.',
      });
    }
    const ctr = parseNumber(cell('clickThroughRate'));
    if (ctr !== null && (ctr < 0 || ctr > 100)) {
      issues.push({
        rowNumber,
        field: 'clickThroughRate',
        severity: 'WARNING',
        message: 'Click-through rate is outside 0-100 and will be imported as unavailable.',
      });
    }

    for (const optional of ['likes', 'comments', 'shares'] as const) {
      if (mapping[optional] === undefined) continue;
      if (cell(optional) !== undefined && parseNumber(cell(optional)) === null) {
        issues.push({
          rowNumber,
          field: optional,
          severity: 'WARNING',
          message: 'Non-numeric ' + optional + ' will be imported as 0.',
        });
      }
    }

    const key = platform + ':' + (platformVideoId ?? '');
    const duplicate = Boolean(platformVideoId) && (existing.has(key) || seenInFile.has(key));
    if (duplicate) {
      issues.push({
        rowNumber,
        field: 'row',
        severity: 'WARNING',
        message: seenInFile.has(key)
          ? 'Duplicate of an earlier row in this file.'
          : 'This video already exists; importing will update it.',
      });
    }
    if (platformVideoId) seenInFile.add(key);

    const hasError = issues.some((i) => i.severity === 'ERROR');
    if (hasError || !title || !publishedAt || durationSeconds === null || views === null || !platformVideoId) {
      rows.push({ rowNumber, valid: false, duplicate, issues, video: null });
      return;
    }

    const hashtags = parseHashtags(cell('hashtags'));
    const caption = cell('caption') ?? null;
    const description = cell('description') ?? null;
    const explicitCategory = cell('category');
    const classification = classifyCategory(
      { title, caption, description, hashtags },
      DEFAULT_CATEGORIES,
    );
    const hookText = cell('hookText') ?? null;
    const watchTimeRaw = parseNumber(cell('watchTimeMinutes'));

    rows.push({
      rowNumber,
      valid: true,
      duplicate,
      issues,
      video: {
        platformVideoId,
        platform,
        title,
        caption,
        description,
        hashtags,
        categorySlug: explicitCategory ? slugify(explicitCategory) : classification.slug,
        categoryName: explicitCategory ?? classification.name,
        categoryAuto: !explicitCategory,
        hookText,
        hookType: classifyHook(hookText),
        durationSeconds: Math.round(durationSeconds),
        publishedAt,
        metrics: {
          views: Math.round(views),
          likes: Math.round(parseNumber(cell('likes')) ?? 0),
          comments: Math.round(parseNumber(cell('comments')) ?? 0),
          shares: Math.round(parseNumber(cell('shares')) ?? 0),
          saves: nullableInt(parseNumber(cell('saves'))),
          followersGained: nullableInt(parseNumber(cell('followersGained'))),
          watchTimeMinutes:
            watchTimeRaw === null ? null : watchTimeIsHours ? watchTimeRaw * 60 : watchTimeRaw,
          averageViewDurationSeconds: parseDuration(cell('averageViewDurationSeconds')),
          averagePercentageViewed: retention !== null && retention >= 0 && retention <= 100 ? retention : null,
          impressions: nullableInt(parseNumber(cell('impressions'))),
          clickThroughRate: ctr !== null && ctr >= 0 && ctr <= 100 ? ctr : null,
        },
      },
    });
  });

  return {
    headers: parsed.headers,
    mapping,
    rows,
    totalRows: parsed.rows.length,
    validRows: rows.filter((r) => r.valid).length,
    errorRows: rows.filter((r) => !r.valid).length,
    duplicateRows: rows.filter((r) => r.duplicate).length,
    malformedRowNumbers: parsed.malformedRowNumbers,
    unmappedRequiredFields,
  };
}

function nullableInt(value: number | null): number | null {
  return value === null ? null : Math.round(value);
}

/** YouTube Studio exports watch time in hours; the app stores minutes. */
function isWatchTimeInHours(headers: string[], mapping: ColumnMapping): boolean {
  const index = mapping.watchTimeMinutes;
  if (index === undefined) return false;
  return /hour/i.test(headers[index] ?? '');
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'other';
}
