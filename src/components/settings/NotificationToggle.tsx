'use client';

import { useState, type ChangeEvent } from 'react';
import type { NotificationType } from '@/lib/types';

export function NotificationToggle({ type, initialEnabled }: { type: NotificationType; initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [saving, setSaving] = useState(false);

  const onChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const next = e.target.checked;
    setEnabled(next);
    setSaving(true);
    await fetch('/api/notifications/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, enabled: next }),
    }).catch(() => setEnabled(!next));
    setSaving(false);
  };

  return (
    <label className="flex cursor-pointer items-center gap-2">
      <input
        type="checkbox"
        checked={enabled}
        onChange={onChange}
        disabled={saving}
        className="h-4 w-4 rounded border-base-600 bg-base-900 accent-brand-500"
      />
    </label>
  );
}
