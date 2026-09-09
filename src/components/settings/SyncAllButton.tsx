'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/**
 * Runs the same per-account sync as SyncButton, once for every connected
 * account, and reports a combined summary. Each call still goes through
 * `syncConnectedAccount`'s existing per-account coalescing/token-refresh/
 * failure-recording - this just fires all of them and aggregates results,
 * it doesn't duplicate any of that logic.
 */
export function SyncAllButton({ accountIds }: { accountIds: string[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const syncAll = async () => {
    if (accountIds.length === 0) return;
    setLoading(true);
    setMessage('');
    const results = await Promise.allSettled(
      accountIds.map((accountId) =>
        fetch('/api/connect/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accountId }),
        }).then(async (response) => {
          const data = await response.json();
          if (!response.ok) throw new Error(data.error ?? 'Sync failed.');
          return data as { imported: number };
        }),
      ),
    );
    const succeeded = results.filter((r): r is PromiseFulfilledResult<{ imported: number }> => r.status === 'fulfilled');
    const failed = results.length - succeeded.length;
    const totalImported = succeeded.reduce((sum, r) => sum + (r.value.imported ?? 0), 0);
    setMessage(
      succeeded.length + '/' + results.length + ' accounts synced, ' + totalImported + ' videos updated.' +
        (failed > 0 ? ' ' + failed + ' failed - check individual accounts below.' : ''),
    );
    setLoading(false);
    router.refresh();
  };

  return (
    <div>
      <button type="button" className="btn-ghost text-xs" disabled={loading || accountIds.length === 0} onClick={syncAll}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12a9 9 0 1 1-2.6-6.4M21 4v5h-5" />
        </svg>
        {loading ? 'Syncing all…' : 'Sync all accounts'}
      </button>
      {message ? (
        <p role="status" className="mt-1 text-xs text-ink-muted">
          {message}
        </p>
      ) : null}
    </div>
  );
}
