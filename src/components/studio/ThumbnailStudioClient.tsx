'use client';

import dynamic from 'next/dynamic';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/primitives';
import { IconCheckCircle, IconAlertCircle } from '@/components/studio/icons';
import type { ThumbnailEditorHandle } from '@/components/studio/ThumbnailEditor';

// Konva touches `window`/canvas at import time, so it can't run during SSR -
// this wrapper is the boundary that defers loading it to the client.
const ThumbnailEditor = dynamic(
  () => import('@/components/studio/ThumbnailEditor').then((mod) => mod.ThumbnailEditor),
  {
    ssr: false,
    loading: () => (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Card padded={false} className="h-[420px] animate-pulse overflow-hidden">
          {null}
        </Card>
        <div className="flex flex-col gap-4">
          <Card className="h-40 animate-pulse">{null}</Card>
          <Card className="h-24 animate-pulse">{null}</Card>
        </div>
      </div>
    ),
  },
);

export function ThumbnailStudioClient() {
  const router = useRouter();
  const handleRef = useRef<ThumbnailEditorHandle | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!handleRef.current) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const result = await handleRef.current.exportPng();
      if (!result) {
        setError('Nothing to export yet - add a base image or a layer first.');
        return;
      }
      const body = new FormData();
      body.set('file', result.blob, 'thumbnail.png');
      body.set('width', String(result.width));
      body.set('height', String(result.height));
      const response = await fetch('/api/studio/thumbnails', { method: 'POST', body });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? 'Could not save this thumbnail.');
        return;
      }
      setMessage('Thumbnail saved - you can attach it when you publish a video.');
      router.refresh();
    } catch {
      setError('Could not reach the server. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <ThumbnailEditor onExportRef={(handle) => (handleRef.current = handle)} />
      <div className="flex items-center gap-3">
        <button type="button" className="btn-primary" disabled={saving} onClick={save}>
          {saving ? 'Saving…' : 'Save thumbnail'}
        </button>
        {message ? (
          <p role="status" className="flex items-center gap-1.5 text-xs text-good">
            <IconCheckCircle width={14} height={14} /> {message}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="flex items-center gap-1.5 text-xs text-bad">
            <IconAlertCircle width={14} height={14} /> {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
