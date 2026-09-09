'use client';

import { useState, type ChangeEvent } from 'react';
import { NOTIFICATION_TYPE_LABELS, type NotificationType } from '@/lib/types';

export function NotificationToggle({ type, initialEnabled }: { type: NotificationType; initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const onChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const next = e.target.checked;
    setEnabled(next);
    setSaving(true);
    setError('');
    try {
    const response = await fetch('/api/notifications/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, enabled: next }),
    });
    if (!response.ok) throw new Error('Could not save notification settings.');
    } catch {
      setEnabled(!next);
      setError('Could not save. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <label className="flex cursor-pointer items-center gap-2">
      <input
        type="checkbox"
        aria-label={NOTIFICATION_TYPE_LABELS[type]}
        checked={enabled}
        onChange={onChange}
        disabled={saving}
        className="h-4 w-4 rounded border-base-600 bg-base-900 accent-brand-500"
      />
      {error ? <span role="alert" className="text-xs text-bad">{error}</span> : null}
    </label>
  );
}
