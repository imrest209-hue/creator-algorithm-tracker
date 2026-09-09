'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function DisconnectButton({ accountId }: { accountId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const disconnect = async () => {
    if (!confirm('Disconnect this account? Videos already imported will be kept.')) return;
    setLoading(true);
    setError('');
    try {
    const response = await fetch('/api/connect/disconnect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId }),
    });
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error ?? 'Could not disconnect this account.');
    }
    router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not reach the app. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div><button type="button" onClick={disconnect} disabled={loading} className="btn-danger px-2 py-1 text-xs">
      {loading ? 'Disconnecting…' : 'Disconnect'}
    </button>{error ? <p role="alert" className="mt-1 text-xs text-bad">{error}</p> : null}</div>
  );
}
