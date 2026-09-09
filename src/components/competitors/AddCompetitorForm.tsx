'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { PLATFORMS, PLATFORM_LABELS, type Platform } from '@/lib/types';
import { Alert } from '@/components/ui/primitives';

export function AddCompetitorForm() {
  const router = useRouter();
  const [platform, setPlatform] = useState<Platform>('YOUTUBE');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    const form = new FormData(event.currentTarget);
    const payload = {
      platform,
      handle: String(form.get('handle') ?? ''),
      url: String(form.get('url') ?? '') || null,
      displayName: String(form.get('displayName') ?? '') || null,
      notes: String(form.get('notes') ?? '') || null,
    };

    try {
      const response = await fetch('/api/competitors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? 'Could not save this creator.');
        setLoading(false);
        return;
      }
      (event.target as HTMLFormElement).reset();
      router.refresh();
    } catch {
      setError('Could not reach the server.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      {error ? <Alert tone="bad">{error}</Alert> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="platform" className="label mb-1 block">
            Platform
          </label>
          <select
            id="platform"
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
        </div>
        <div>
          <label htmlFor="handle" className="label mb-1 block">
            Username / handle
          </label>
          <input id="handle" name="handle" type="text" required maxLength={80} className="input" placeholder="@creator" />
        </div>
      </div>
      <div>
        <label htmlFor="url" className="label mb-1 block">
          Profile URL (optional)
        </label>
        <input id="url" name="url" type="url" maxLength={500} className="input" placeholder="https://…" />
      </div>
      <div>
        <label htmlFor="displayName" className="label mb-1 block">
          Display name (optional)
        </label>
        <input id="displayName" name="displayName" type="text" maxLength={120} className="input" />
      </div>
      <div>
        <label htmlFor="notes" className="label mb-1 block">
          Notes (optional)
        </label>
        <textarea id="notes" name="notes" rows={2} maxLength={2000} className="input" />
      </div>
      <button type="submit" disabled={loading} className="btn-primary">
        {loading ? 'Saving…' : 'Track creator'}
      </button>
    </form>
  );
}
