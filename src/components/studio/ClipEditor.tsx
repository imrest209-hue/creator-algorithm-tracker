'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Card, SectionHeading, ProgressBar, Alert, Badge } from '@/components/ui/primitives';
import {
  IconUpload,
  IconVideo,
  IconTrash,
  IconText,
  IconCheckCircle,
  IconAlertCircle,
  IconClock,
} from '@/components/studio/icons';

/**
 * CLIP EDITOR
 * ---------------------------------------------------------------------------
 * Trim / reframe / caption a clip and render it with FFmpeg server-side.
 * Deliberately a *clip* editor, not a timeline NLE: one source in, one
 * trimmed-and-framed cut out, ready to publish. That covers the actual
 * gameplay-clip workflow without pretending to be Premiere.
 *
 * Preview is the raw source in a <video> element with a crop overlay drawn on
 * top - the real crop/overlays are burned in by FFmpeg at render time, so what
 * the browser shows is a framing guide, not a fake "rendered" preview.
 */

type Stage = 'upload' | 'uploading' | 'editing' | 'rendering' | 'done';
type CropPreset = 'none' | 'vertical' | 'square';

interface Overlay {
  id: string;
  text: string;
  x: number;
  y: number;
  sizeRatio: number;
  color: string;
}

interface ClipMeta {
  jobId: string;
  durationSeconds: number;
  width: number;
  height: number;
  hasAudio: boolean;
}

interface JobStatus {
  status: 'DRAFT' | 'RENDERING' | 'DONE' | 'FAILED';
  progress: number;
  errorMessage: string | null;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00.0';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m + ':' + s.toFixed(1).padStart(4, '0');
}

const SPEED_PRESETS = [
  { label: '0.25x', value: 0.25 },
  { label: '0.5x', value: 0.5 },
  { label: 'Normal', value: 1 },
  { label: '1.5x', value: 1.5 },
  { label: '2x', value: 2 },
] as const;

function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb < 1024 ? mb.toFixed(1) + ' MB' : (mb / 1024).toFixed(2) + ' GB';
}

export function ClipEditor() {
  const [stage, setStage] = useState<Stage>('upload');
  const [error, setError] = useState<string | null>(null);
  const [clip, setClip] = useState<ClipMeta | null>(null);
  const [sourceName, setSourceName] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [crop, setCrop] = useState<CropPreset>('none');
  const [cropOffset, setCropOffset] = useState(0.5);
  const [volume, setVolume] = useState(1);
  const [speed, setSpeed] = useState(1);
  const [fadeIn, setFadeIn] = useState(0);
  const [fadeOut, setFadeOut] = useState(0);
  const [overlays, setOverlays] = useState<Overlay[]>([]);

  // The finished clip's length is the trim range divided by the speed - every
  // length shown to the user must use this, not the raw trim range.
  const outputSeconds = Math.max(0, (trimEnd - trimStart) / speed);

  const [job, setJob] = useState<JobStatus | null>(null);
  const [playhead, setPlayhead] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, []);

  async function onFileChosen(file: File) {
    setError(null);
    setSourceName(file.name);
    setStage('uploading');
    try {
      const response = await fetch('/api/studio/clips/upload?filename=' + encodeURIComponent(file.name), {
        method: 'POST',
        body: file,
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? 'Could not upload that clip.');
        setStage('upload');
        return;
      }
      setClip(data);
      setTrimStart(0);
      setTrimEnd(data.durationSeconds);
      setStage('editing');
    } catch {
      setError('Could not reach the server. Try again.');
      setStage('upload');
    }
  }

  function seekTo(seconds: number) {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, Math.min(seconds, clip?.durationSeconds ?? seconds));
  }

  function addOverlay() {
    setOverlays((prev) => [
      ...prev,
      {
        id: 'ov-' + Date.now().toString(36),
        text: 'CLUTCH',
        x: 0.5,
        y: 0.12,
        sizeRatio: 0.09,
        color: '#ffffff',
      },
    ]);
  }

  function updateOverlay(id: string, patch: Partial<Overlay>) {
    setOverlays((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  }

  async function render() {
    if (!clip) return;
    setError(null);
    setStage('rendering');
    setJob({ status: 'RENDERING', progress: 0, errorMessage: null });
    try {
      const response = await fetch('/api/studio/clips/' + clip.jobId + '/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          editSpec: {
            trimStart,
            trimEnd,
            crop,
            cropOffset,
            volume,
            speed,
            fadeIn,
            fadeOut,
            overlays: overlays.map(({ id: _id, ...rest }) => rest),
          },
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.error ?? 'Could not start the render.');
        setStage('editing');
        return;
      }
      pollTimer.current = setInterval(async () => {
        try {
          const poll = await fetch('/api/studio/clips/' + clip.jobId);
          const data: JobStatus = await poll.json();
          if (!poll.ok) return;
          setJob(data);
          if (data.status === 'DONE') {
            if (pollTimer.current) clearInterval(pollTimer.current);
            setStage('done');
          } else if (data.status === 'FAILED') {
            if (pollTimer.current) clearInterval(pollTimer.current);
            setError(data.errorMessage ?? 'Rendering failed.');
            setStage('editing');
          }
        } catch {
          // Transient poll failure - keep trying on the next tick.
        }
      }, 1000);
    } catch {
      setError('Could not reach the server. Try again.');
      setStage('editing');
    }
  }

  function startOver() {
    if (pollTimer.current) clearInterval(pollTimer.current);
    setStage('upload');
    setClip(null);
    setJob(null);
    setOverlays([]);
    setCrop('none');
    setCropOffset(0.5);
    setVolume(1);
    setSpeed(1);
    setFadeIn(0);
    setFadeOut(0);
    setError(null);
  }

  // ---------------------------------------------------------------- upload
  if (stage === 'upload' || stage === 'uploading') {
    return (
      <Card>
        <SectionHeading
          title="Edit a clip"
          description="Trim it, reframe it for Shorts, burn in a caption - then send it straight to publish."
        />
        {error ? (
          <Alert tone="bad" className="mb-3">
            <span className="inline-flex items-center gap-1.5">
              <IconAlertCircle width={14} height={14} /> {error}
            </span>
          </Alert>
        ) : null}
        {stage === 'uploading' ? (
          <div className="rounded-lg border border-base-700 bg-base-900 p-6 text-center">
            <p className="text-sm text-ink">Uploading {sourceName}…</p>
            <ProgressBar value={40} className="mt-3" />
            <p className="mt-2 text-xs text-ink-muted">Reading duration and dimensions once it lands.</p>
          </div>
        ) : (
          <label
            className={
              'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-10 text-center transition-colors ' +
              (isDragging ? 'border-brand-500 bg-brand-500/10' : 'border-base-700 hover:border-base-600 hover:bg-base-900')
            }
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragging(false);
              const file = event.dataTransfer.files?.[0];
              if (file) void onFileChosen(file);
            }}
          >
            <IconUpload width={26} height={26} className="text-ink-muted" />
            <p className="text-sm text-ink">
              <span className="font-medium text-brand-300">Click to choose</span> or drag a clip here
            </p>
            <p className="text-xs text-ink-muted">MP4, MOV, WebM, MKV</p>
            <input
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void onFileChosen(file);
              }}
            />
          </label>
        )}
      </Card>
    );
  }

  // --------------------------------------------------------------- rendering
  if (stage === 'rendering') {
    return (
      <Card>
        <SectionHeading title="Rendering" description={sourceName} />
        <ProgressBar value={Math.max(3, job?.progress ?? 0)} />
        <div className="mt-2 flex items-center justify-between text-xs text-ink-muted">
          <span>FFmpeg is encoding your clip…</span>
          <span>{job?.progress ?? 0}%</span>
        </div>
        <p className="mt-3 text-xs text-ink-muted">
          Encoding {formatTime(outputSeconds)} of footage. Longer clips and higher resolutions take longer.
        </p>
      </Card>
    );
  }

  // -------------------------------------------------------------------- done
  if (stage === 'done' && clip) {
    return (
      <div className="space-y-4">
        <Alert tone="good">
          <span className="inline-flex items-center gap-1.5 font-medium text-ink">
            <IconCheckCircle width={14} height={14} /> Clip rendered
          </span>
          <span className="ml-1">{formatTime(outputSeconds)} · ready to publish or download.</span>
        </Alert>
        <Card>
          <SectionHeading title="Result" />
          <video
            src={'/api/studio/clips/' + clip.jobId + '/file?variant=output'}
            controls
            className="max-h-[420px] w-full rounded-lg bg-black"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href={'/studio/publish?clipJobId=' + clip.jobId} className="btn-primary">
              <IconUpload width={15} height={15} /> Send to Publish
            </Link>
            <a
              href={'/api/studio/clips/' + clip.jobId + '/file?variant=output'}
              download={sourceName.replace(/\.[^/.]+$/, '') + '-edit.mp4'}
              className="btn-ghost"
            >
              Download
            </a>
            <button type="button" className="btn-ghost" onClick={() => setStage('editing')}>
              Back to edit
            </button>
            <button type="button" className="btn-ghost" onClick={startOver}>
              New clip
            </button>
          </div>
        </Card>
      </div>
    );
  }

  // ----------------------------------------------------------------- editing
  if (!clip) return null;
  const cropRatio = crop === 'vertical' ? 9 / 16 : crop === 'square' ? 1 : null;
  const sourceRatio = clip.width / clip.height;
  const cropWidthPercent = cropRatio && sourceRatio > cropRatio ? (cropRatio / sourceRatio) * 100 : 100;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-4">
        <Card padded={false} className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-base-700 px-4 py-3">
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold text-ink">{sourceName}</h2>
              <p className="mt-0.5 text-xs text-ink-muted">
                {clip.width}×{clip.height} · {formatTime(clip.durationSeconds)}
                {clip.hasAudio ? '' : ' · no audio track'}
              </p>
            </div>
            <button type="button" className="btn-ghost text-xs" onClick={startOver}>
              Replace
            </button>
          </div>

          <div className="relative bg-black">
            <video
              ref={videoRef}
              src={'/api/studio/clips/' + clip.jobId + '/file?variant=source'}
              controls
              onTimeUpdate={(event) => setPlayhead(event.currentTarget.currentTime)}
              className="max-h-[420px] w-full"
            />
            {cropRatio && cropWidthPercent < 99.5 ? (
              <div className="pointer-events-none absolute inset-0 flex">
                <div
                  className="h-full bg-black/60"
                  style={{ width: (100 - cropWidthPercent) * cropOffset + '%' }}
                />
                <div
                  className="h-full border-x-2 border-brand-500"
                  style={{ width: cropWidthPercent + '%' }}
                />
                <div className="h-full flex-1 bg-black/60" />
              </div>
            ) : null}
          </div>
        </Card>

        <Card>
          <SectionHeading
            title="Trim"
            description="Scrub the video, then set the in and out points from the playhead."
          />
          <div className="space-y-3">
            <div>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="label">Start · {formatTime(trimStart)}</span>
                <div className="flex gap-1.5">
                  <button type="button" className="btn-ghost px-2 py-0.5 text-[11px]" onClick={() => setTrimStart(Math.min(playhead, trimEnd - 0.1))}>
                    Set from playhead
                  </button>
                  <button type="button" className="btn-ghost px-2 py-0.5 text-[11px]" onClick={() => seekTo(trimStart)}>
                    Go to
                  </button>
                </div>
              </div>
              <input
                type="range"
                min={0}
                max={clip.durationSeconds}
                step={0.1}
                value={trimStart}
                onChange={(event) => setTrimStart(Math.min(Number(event.target.value), trimEnd - 0.1))}
                className="w-full"
              />
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="label">End · {formatTime(trimEnd)}</span>
                <div className="flex gap-1.5">
                  <button type="button" className="btn-ghost px-2 py-0.5 text-[11px]" onClick={() => setTrimEnd(Math.max(playhead, trimStart + 0.1))}>
                    Set from playhead
                  </button>
                  <button type="button" className="btn-ghost px-2 py-0.5 text-[11px]" onClick={() => seekTo(trimEnd)}>
                    Go to
                  </button>
                </div>
              </div>
              <input
                type="range"
                min={0}
                max={clip.durationSeconds}
                step={0.1}
                value={trimEnd}
                onChange={(event) => setTrimEnd(Math.max(Number(event.target.value), trimStart + 0.1))}
                className="w-full"
              />
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-base-800 bg-base-900/60 px-3 py-2">
              <IconClock width={14} height={14} className="text-ink-muted" />
              <span className="text-xs text-ink">
                Output length <strong>{formatTime(outputSeconds)}</strong>
              </span>
              {outputSeconds <= 180 ? <Badge tone="brand">Shorts-eligible</Badge> : null}
            </div>
          </div>
        </Card>
      </div>

      <div className="flex flex-col gap-4">
        {error ? (
          <Alert tone="bad">
            <span className="inline-flex items-center gap-1.5">
              <IconAlertCircle width={14} height={14} /> {error}
            </span>
          </Alert>
        ) : null}

        <Card>
          <SectionHeading title="Framing" />
          <div className="grid grid-cols-3 gap-1.5">
            {(
              [
                { id: 'none', label: 'Original' },
                { id: 'vertical', label: '9:16' },
                { id: 'square', label: '1:1' },
              ] as const
            ).map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setCrop(option.id)}
                className={
                  'rounded-lg border px-2 py-2 text-xs font-medium transition-colors ' +
                  (crop === option.id
                    ? 'border-brand-500 bg-brand-500/10 text-brand-300'
                    : 'border-base-700 bg-base-900 text-ink-muted hover:bg-base-800')
                }
              >
                {option.label}
              </button>
            ))}
          </div>
          {crop !== 'none' ? (
            <div className="mt-3">
              <label className="label mb-1 block">Horizontal position</label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={cropOffset}
                onChange={(event) => setCropOffset(Number(event.target.value))}
                className="w-full"
              />
              <p className="mt-1 text-xs text-ink-muted">Slide to keep the action inside the frame.</p>
            </div>
          ) : null}
        </Card>

        <Card>
          <SectionHeading
            title="Captions"
            action={
              <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={addOverlay} disabled={overlays.length >= 5}>
                <IconText width={13} height={13} /> Add
              </button>
            }
          />
          {overlays.length === 0 ? (
            <p className="text-xs text-ink-muted">No captions. Text you add here is burned into the render.</p>
          ) : (
            <div className="space-y-3">
              {overlays.map((overlay) => (
                <div key={overlay.id} className="rounded-lg border border-base-800 bg-base-900/60 p-2.5">
                  <div className="mb-2 flex items-center gap-1.5">
                    <input
                      type="text"
                      className="input flex-1 py-1 text-xs"
                      value={overlay.text}
                      maxLength={120}
                      onChange={(event) => updateOverlay(overlay.id, { text: event.target.value })}
                    />
                    <button
                      type="button"
                      className="rounded p-1 text-bad hover:bg-bad/10"
                      onClick={() => setOverlays((prev) => prev.filter((o) => o.id !== overlay.id))}
                      aria-label="Remove caption"
                    >
                      <IconTrash width={14} height={14} />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <label className="block">
                      <span className="label">Across</span>
                      <input type="range" min={0} max={1} step={0.01} value={overlay.x} className="w-full"
                        onChange={(e) => updateOverlay(overlay.id, { x: Number(e.target.value) })} />
                    </label>
                    <label className="block">
                      <span className="label">Down</span>
                      <input type="range" min={0} max={1} step={0.01} value={overlay.y} className="w-full"
                        onChange={(e) => updateOverlay(overlay.id, { y: Number(e.target.value) })} />
                    </label>
                    <label className="block">
                      <span className="label">Size</span>
                      <input type="range" min={0.02} max={0.3} step={0.005} value={overlay.sizeRatio} className="w-full"
                        onChange={(e) => updateOverlay(overlay.id, { sizeRatio: Number(e.target.value) })} />
                    </label>
                    <label className="block">
                      <span className="label">Color</span>
                      <input type="color" value={overlay.color} className="input h-[30px] p-0.5"
                        onChange={(e) => updateOverlay(overlay.id, { color: e.target.value })} />
                    </label>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <SectionHeading
            title="Speed"
            description="Slow a play down for the replay, or speed through a quiet stretch."
          />
          <div className="mb-2 flex flex-wrap gap-1.5">
            {SPEED_PRESETS.map((preset) => (
              <button
                key={preset.value}
                type="button"
                onClick={() => setSpeed(preset.value)}
                className={
                  'rounded-lg border px-2.5 py-1 text-xs transition-colors ' +
                  (Math.abs(speed - preset.value) < 0.001
                    ? 'border-brand-500/50 bg-brand-500/15 font-medium text-brand-300'
                    : 'border-base-700 bg-base-900 text-ink-muted hover:text-ink')
                }
              >
                {preset.label}
              </button>
            ))}
          </div>
          <input
            type="range"
            min={0.25}
            max={4}
            step={0.05}
            value={speed}
            onChange={(event) => setSpeed(Number(event.target.value))}
            className="w-full"
          />
          <p className="mt-1 text-xs text-ink-muted">
            {speed.toFixed(2)}× · final length {formatTime(outputSeconds)}
            {outputSeconds > 60 ? ' (too long for a Short)' : ''}
          </p>
        </Card>

        <Card>
          <SectionHeading title="Fades" description="Ease in and out instead of cutting hard." />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label mb-1 block">
                Fade in · {fadeIn === 0 ? 'Off' : fadeIn.toFixed(1) + 's'}
              </label>
              <input
                type="range"
                min={0}
                max={Math.max(0.1, outputSeconds / 2)}
                step={0.1}
                value={Math.min(fadeIn, outputSeconds / 2)}
                onChange={(event) => setFadeIn(Number(event.target.value))}
                className="w-full"
              />
            </div>
            <div>
              <label className="label mb-1 block">
                Fade out · {fadeOut === 0 ? 'Off' : fadeOut.toFixed(1) + 's'}
              </label>
              <input
                type="range"
                min={0}
                max={Math.max(0.1, outputSeconds / 2)}
                step={0.1}
                value={Math.min(fadeOut, outputSeconds / 2)}
                onChange={(event) => setFadeOut(Number(event.target.value))}
                className="w-full"
              />
            </div>
          </div>
        </Card>

        <Card>
          <SectionHeading title="Audio" />
          <label className="label mb-1 block">
            Volume · {volume === 0 ? 'Muted' : Math.round(volume * 100) + '%'}
          </label>
          <input
            type="range"
            min={0}
            max={2}
            step={0.05}
            value={volume}
            onChange={(event) => setVolume(Number(event.target.value))}
            className="w-full"
            disabled={!clip.hasAudio}
          />
          {!clip.hasAudio ? (
            <p className="mt-1 text-xs text-ink-muted">This file has no audio track.</p>
          ) : null}
        </Card>

        <button type="button" className="btn-primary w-full" onClick={render}>
          <IconVideo width={16} height={16} /> Render clip
        </button>
      </div>
    </div>
  );
}
