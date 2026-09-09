'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { PLATFORMS, PLATFORM_LABELS, type Platform } from '@/lib/types';
import { Alert } from '@/components/ui/primitives';

/**
 * Manual video entry form.
 *
 * Every metric field is optional except views: platform APIs and creators
 * alike do not always have every number, and leaving a field blank must mean
 * "unavailable", never "zero".
 */
export function VideoForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [platform, setPlatform] = useState<Platform>('YOUTUBE');

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    const form = new FormData(event.currentTarget);

    const num = (key: string): number | null => {
      const raw = form.get(key);
      if (raw === null || raw === '') return null;
      const value = Number(raw);
      return Number.isFinite(value) ? value : null;
    };
    const str = (key: string): string | null => {
      const raw = form.get(key);
      return typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : null;
    };

    const publishedLocal = String(form.get('publishedAt') ?? '');
    const payload = {
      platform,
      platformVideoId: str('platformVideoId') ?? 'manual-' + Date.now(),
      title: str('title') ?? '',
      caption: str('caption'),
      description: str('description'),
      hashtags: (str('hashtags') ?? '')
        .split(/[,\s]+/)
        .map((t) => t.trim())
        .filter(Boolean),
      hookText: str('hookText'),
      durationSeconds: Math.round(num('durationSeconds') ?? 0),
      publishedAt: publishedLocal ? new Date(publishedLocal).toISOString() : null,
      views: Math.round(num('views') ?? 0),
      likes: Math.round(num('likes') ?? 0),
      comments: Math.round(num('comments') ?? 0),
      shares: Math.round(num('shares') ?? 0),
      saves: num('saves'),
      followersGained: num('followersGained'),
      watchTimeMinutes: num('watchTimeMinutes'),
      averageViewDurationSeconds: num('averageViewDurationSeconds'),
      averagePercentageViewed: num('averagePercentageViewed'),
      impressions: num('impressions'),
      clickThroughRate: num('clickThroughRate'),
    };

    if (!payload.publishedAt) {
      setError('Enter a valid publish date and time.');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? 'Could not save this video.');
        setLoading(false);
        return;
      }
      router.push('/videos/' + data.id);
      router.refresh();
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
      setLoading(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {error ? <Alert tone="bad">{error}</Alert> : null}

      <fieldset className="space-y-3">
        <legend className="mb-1 text-sm font-semibold text-ink">Basics</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Platform" htmlFor="platform">
            <select
              id="platform"
              name="platform"
              value={platform}
              onChange={(e) => setPlatform(e.target.value as Platform)}
              className="input"
            >
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {PLATFORM_LABELS[p]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Video ID (optional)" htmlFor="platformVideoId" hint="Leave blank to auto-generate one.">
            <input id="platformVideoId" name="platformVideoId" type="text" className="input" maxLength={120} />
          </Field>
        </div>
        <Field label="Title" htmlFor="title" required>
          <input id="title" name="title" type="text" required maxLength={300} className="input" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Published at" htmlFor="publishedAt" required>
            <input id="publishedAt" name="publishedAt" type="datetime-local" required className="input" />
          </Field>
          <Field label="Length (seconds)" htmlFor="durationSeconds" required>
            <input
              id="durationSeconds"
              name="durationSeconds"
              type="number"
              min={1}
              max={21600}
              required
              className="input"
            />
          </Field>
        </div>
        <Field label="Caption" htmlFor="caption">
          <textarea id="caption" name="caption" rows={2} maxLength={2200} className="input" />
        </Field>
        <Field label="Description" htmlFor="description">
          <textarea id="description" name="description" rows={3} maxLength={5000} className="input" />
        </Field>
        <Field label="Hashtags" htmlFor="hashtags" hint="Space or comma separated, with or without #.">
          <input id="hashtags" name="hashtags" type="text" className="input" placeholder="#cars #diy" />
        </Field>
        <Field label="Hook (first few seconds)" htmlFor="hookText">
          <input id="hookText" name="hookText" type="text" maxLength={500} className="input" />
        </Field>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="mb-1 text-sm font-semibold text-ink">
          Metrics <span className="font-normal text-ink-muted">(leave blank if unavailable)</span>
        </legend>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Views" htmlFor="views" required>
            <input id="views" name="views" type="number" min={0} required className="input" />
          </Field>
          <Field label="Likes" htmlFor="likes">
            <input id="likes" name="likes" type="number" min={0} className="input" />
          </Field>
          <Field label="Comments" htmlFor="comments">
            <input id="comments" name="comments" type="number" min={0} className="input" />
          </Field>
          <Field label="Shares" htmlFor="shares">
            <input id="shares" name="shares" type="number" min={0} className="input" />
          </Field>
          <Field label="Saves / favorites" htmlFor="saves">
            <input id="saves" name="saves" type="number" min={0} className="input" />
          </Field>
          <Field label="Followers gained" htmlFor="followersGained">
            <input id="followersGained" name="followersGained" type="number" className="input" />
          </Field>
          <Field label="Watch time (minutes)" htmlFor="watchTimeMinutes">
            <input id="watchTimeMinutes" name="watchTimeMinutes" type="number" min={0} step="0.1" className="input" />
          </Field>
          <Field label="Avg view duration (sec)" htmlFor="averageViewDurationSeconds">
            <input
              id="averageViewDurationSeconds"
              name="averageViewDurationSeconds"
              type="number"
              min={0}
              step="0.1"
              className="input"
            />
          </Field>
          <Field label="Avg % viewed" htmlFor="averagePercentageViewed">
            <input
              id="averagePercentageViewed"
              name="averagePercentageViewed"
              type="number"
              min={0}
              max={100}
              step="0.1"
              className="input"
            />
          </Field>
          <Field label="Impressions" htmlFor="impressions">
            <input id="impressions" name="impressions" type="number" min={0} className="input" />
          </Field>
          <Field label="Click-through rate (%)" htmlFor="clickThroughRate">
            <input
              id="clickThroughRate"
              name="clickThroughRate"
              type="number"
              min={0}
              max={100}
              step="0.01"
              className="input"
            />
          </Field>
        </div>
      </fieldset>

      <button type="submit" disabled={loading} className="btn-primary">
        {loading ? 'Saving…' : 'Save video'}
      </button>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  required,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="label mb-1 block">
        {label}
        {required ? <span className="text-bad"> *</span> : null}
      </label>
      {children}
      {hint ? <p className="mt-1 text-xs text-ink-muted">{hint}</p> : null}
    </div>
  );
}
