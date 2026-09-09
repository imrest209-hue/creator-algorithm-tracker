'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function DisconnectButton({ accountId }: { accountId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const disconnect = async () => {
    if (!confirm('Disconnect this account? Videos already imported will be kept.')) return;
    setLoading(true);
    await fetch('/api/connect/disconnect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId }),
    });
    setLoading(false);
    router.refresh();
  };

  return (
    <button type="button" onClick={disconnect} disabled={loading} className="btn-danger px-2 py-1 text-xs">
      {loading ? 'Disconnecting…' : 'Disconnect'}
    </button>
  );
}
