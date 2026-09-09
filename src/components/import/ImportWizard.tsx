'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { PLATFORMS, PLATFORM_LABELS, type Platform } from '@/lib/types';
import { Alert, Badge, Card, EmptyState, SectionHeading } from '@/components/ui/primitives';

interface RowIssue {
  rowNumber: number;
  field: string;
  severity: 'ERROR' | 'WARNING';
  message: string;
}

interface ParsedRow {
  rowNumber: number;
  valid: boolean;
  duplicate: boolean;
  issues: RowIssue[];
  video: { title: string; publishedAt: string; platform: Platform; metrics: { views: number } } | null;
}

interface PreviewResponse {
  headers: string[];
  mapping: Record<string, number>;
  rows: ParsedRow[];
  totalRows: number;
  validRows: number;
  errorRows: number;
  duplicateRows: number;
  malformedRowNumbers: number[];
  unmappedRequiredFields: string[];
  truncated: boolean;
  error?: string;
}

interface CommitResponse {
  imported: number;
  skipped: number;
  total: number;
  errors: Array<{ rowNumber: number; message: string }>;
  error?: string;
}

type Stage = 'upload' | 'previewing' | 'preview' | 'committing' | 'done';

export function ImportWizard() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>('upload');
  const [platform, setPlatform] = useState<Platform>('YOUTUBE');
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [result, setResult] = useState<CommitResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runPreview = async (selected: File) => {
    setError(null);
    setStage('previewing');
    const body = new FormData();
    body.set('file', selected);
    body.set('platform', platform);
    try {
      const response = await fetch('/api/import/preview', { method: 'POST', body });
      const data: PreviewResponse = await response.json();
      if (!response.ok) {
        setError(data.error ?? 'Could not parse this file.');
        setStage('upload');
        return;
      }
      setPreview(data);
      setStage('preview');
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
      setStage('upload');
    }
  };

  const onFileSelected = (selected: File | null) => {
    setFile(selected);
    setPreview(null);
    setResult(null);
    if (selected) runPreview(selected);
  };

  const commit = async () => {
    if (!file) return;
    setStage('committing');
    setError(null);
    const body = new FormData();
    body.set('file', file);
    body.set('platform', platform);
    body.set('skipDuplicates', String(skipDuplicates));
    try {
      const response = await fetch('/api/import/commit', { method: 'POST', body });
      const data: CommitResponse = await response.json();
      if (!response.ok) {
        setError(data.error ?? 'Import failed.');
        setStage('preview');
        return;
      }
      setResult(data);
      setStage('done');
      router.refresh();
    } catch {
      setError('Could not reach the server during import.');
      setStage('preview');
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <SectionHeading title="1. Choose a file" description="CSV exports from YouTube Studio, TikTok Analytics, or your own spreadsheet." />
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label htmlFor="import-platform" className="label mb-1 block">
              Default platform
            </label>
            <select
              id="import-platform"
              value={platform}
              onChange={(e) => setPlatform(e.target.value as Platform)}
              className="input w-auto"
            >
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {PLATFORM_LABELS[p]}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-ink-muted">Used when the file has no platform column.</p>
          </div>
          <div>
            <label htmlFor="import-file" className="label mb-1 block">
              CSV file
            </label>
            <input
              ref={fileInputRef}
              id="import-file"
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => onFileSelected(e.target.files?.[0] ?? null)}
              className="block text-sm text-ink-muted file:mr-3 file:rounded-lg file:border-0 file:bg-brand-500 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-brand-600"
            />
          </div>
        </div>
        {error ? (
          <Alert tone="bad" className="mt-3">
            {error}
          </Alert>
        ) : null}
        {stage === 'previewing' ? <p className="mt-3 text-sm text-ink-muted">Parsing…</p> : null}
      </Card>

      {preview ? (
        <Card>
          <SectionHeading
            title="2. Preview"
            description={
              preview.totalRows +
              ' data rows found · ' +
              preview.validRows +
              ' valid · ' +
              preview.errorRows +
              ' with errors · ' +
              preview.duplicateRows +
              ' duplicates'
            }
          />

          {preview.unmappedRequiredFields.length > 0 ? (
            <Alert tone="bad" title="Missing required columns">
              Could not find a column for: {preview.unmappedRequiredFields.join(', ')}. Rename the
              column in your CSV to match, then re-upload.
            </Alert>
          ) : null}

          {preview.malformedRowNumbers.length > 0 ? (
            <Alert tone="warn" title="Some rows have the wrong number of columns" className="mt-2">
              Row(s) {preview.malformedRowNumbers.slice(0, 10).join(', ')}
              {preview.malformedRowNumbers.length > 10 ? '…' : ''} — these are still shown below.
            </Alert>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-ink-muted">
              <input
                type="checkbox"
                checked={skipDuplicates}
                onChange={(e) => setSkipDuplicates(e.target.checked)}
                className="h-4 w-4 rounded border-base-600 bg-base-900 accent-brand-500"
              />
              Skip duplicates instead of updating them
            </label>
          </div>

          <div className="-mx-1 mt-3 max-h-[420px] overflow-auto">
            <table className="w-full min-w-[640px] border-collapse">
              <thead className="sticky top-0 bg-base-850">
                <tr className="border-b border-base-700">
                  <th className="th">Row</th>
                  <th className="th">Title</th>
                  <th className="th">Published</th>
                  <th className="th text-right">Views</th>
                  <th className="th">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-base-800">
                {preview.rows.map((row) => (
                  <tr key={row.rowNumber}>
                    <td className="td text-ink-muted">{row.rowNumber}</td>
                    <td className="td max-w-[240px] truncate">{row.video?.title ?? '—'}</td>
                    <td className="td text-ink-muted">
                      {row.video?.publishedAt ? new Date(row.video.publishedAt).toLocaleDateString() : '—'}
                    </td>
                    <td className="td text-right tabular-nums">
                      {row.video ? row.video.metrics.views.toLocaleString() : '—'}
                    </td>
                    <td className="td">
                      {row.valid ? (
                        row.duplicate ? (
                          <Badge tone="warn">Will update existing</Badge>
                        ) : (
                          <Badge tone="good">New</Badge>
                        )
                      ) : (
                        <Badge tone="bad" title={row.issues[0]?.message}>
                          Error
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.truncated ? (
            <p className="mt-2 text-xs text-ink-muted">
              Showing the first 200 rows. All {preview.totalRows} rows will be processed on import.
            </p>
          ) : null}

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={commit}
              disabled={preview.validRows === 0 || stage === 'committing'}
              className="btn-primary"
            >
              {stage === 'committing'
                ? 'Importing…'
                : 'Import ' + preview.validRows + ' video' + (preview.validRows === 1 ? '' : 's')}
            </button>
          </div>
        </Card>
      ) : null}

      {result ? (
        <Card>
          <SectionHeading title="3. Done" />
          <Alert tone="good">
            Imported {result.imported} of {result.total} rows. {result.skipped} skipped.
          </Alert>
          {result.errors.length > 0 ? (
            <div className="mt-3">
              <p className="label mb-1">Row errors</p>
              <ul className="max-h-40 space-y-1 overflow-auto text-xs text-ink-muted">
                {result.errors.map((e) => (
                  <li key={e.rowNumber}>
                    Row {e.rowNumber}: {e.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Card>
      ) : null}

      {!file ? (
        <EmptyState
          icon="⇪"
          title="Upload a CSV to get started"
          description="Column headers are matched automatically where possible - views, likes, comments, watch time, retention, hashtags and more."
        />
      ) : null}
    </div>
  );
}
