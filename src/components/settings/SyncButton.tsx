'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function SyncButton({ accountId }: { accountId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const sync = async () => {
    setLoading(true);
    setMessage('');
    try {
      const response = await fetch('/api/connect/sync', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Could not sync this account.');
      setMessage(`Updated ${data.imported} videos.${data.warnings?.length ? ' ' + data.warnings.join(' ') : ''}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not reach the app. Try again.');
    } finally {
      setLoading(false);
      router.refresh();
    }
  };
  return (
    <div className="max-w-sm">
      <button type="button" className="btn-primary px-2 py-1 text-xs" disabled={loading} onClick={sync}>
        {loading ? 'Syncing…' : 'Sync now'}
      </button>
      {message ? <p role="status" className="mt-1 text-xs text-ink-muted">{message}</p> : null}
    </div>
  );
}
