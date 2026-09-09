'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Card, SectionHeading, ProgressBar, Alert } from '@/components/ui/primitives';
import { ThumbnailPicker } from '@/components/studio/ThumbnailPicker';
import {
  IconVideo,
  IconUpload,
  IconCheckCircle,
  IconAlertCircle,
  IconClock,
  IconTag,
  IconLock,
  IconLink,
  IconGlobe,
  IconImage,
  IconTrash,
} from '@/components/studio/icons';

const YOUTUBE_CATEGORIES = [
  { id: '20', label: 'Gaming' },
  { id: '24', label: 'Entertainment' },
  { id: '26', label: 'Howto & Style' },
  { id: '22', label: 'People & Blogs' },
  { id: '23', label: 'Comedy' },
];

const PRIVACY_OPTIONS = [
  { id: 'private', label: 'Private', icon: IconLock, hint: 'Only you can watch it' },
  { id: 'unlisted', label: 'Unlisted', icon: IconLink, hint: 'Anyone with the link' },
  { id: 'public', label: 'Public', icon: IconGlobe, hint: 'Visible on your channel' },
] as const;

type Stage = 'form' | 'staging' | 'uploading' | 'done' | 'error';

interface JobStatus {
  status: 'PENDING' | 'UPLOADING_VIDEO' | 'SETTING_THUMBNAIL' | 'SAVING' | 'DONE' | 'FAILED';
  totalBytes: string;
  bytesUploaded: string;
  resultVideoId: string | null;
  errorMessage: string | null;
}

const STAGE_STEPS: Array<{ key: JobStatus['status']; label: string }> = [
  { key: 'UPLOADING_VIDEO', label: 'Uploading' },
  { key: 'SETTING_THUMBNAIL', label: 'Thumbnail' },
  { key: 'SAVING', label: 'Saving' },
  { key: 'DONE', label: 'Done' },
];

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 MB';
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return mb.toFixed(1) + ' MB';
  return (mb / 1024).toFixed(2) + ' GB';
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m + ':' + String(s).padStart(2, '0');
}

interface VideoProbe {
  durationSeconds: number;
  width: number;
  height: number;
}

function probeVideo(file: File): Promise<VideoProbe | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      resolve({ durationSeconds: video.duration, width: video.videoWidth, height: video.videoHeight });
      URL.revokeObjectURL(url);
    };
    video.onerror = () => {
      resolve(null);
      URL.revokeObjectURL(url);
    };
    video.src = url;
  });
}

export function PublishWizard({
  connectedAccountId,
  timingHint,
  incomingClip = null,
}: {
  connectedAccountId: string;
  timingHint: string | null;
  /** Set when arriving from the clip editor - publishes the rendered file directly. */
  incomingClip?: { jobId: string; sourceName: string } | null;
}) {
  const [stage, setStage] = useState<Stage>('form');
  const [error, setError] = useState<string | null>(null);
  const [thumbnailAssetId, setThumbnailAssetId] = useState<string | null>(null);
  const [job, setJob] = useState<JobStatus | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [videoInfo, setVideoInfo] = useState<VideoProbe | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [title, setTitle] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, []);

  async function onFileChosen(file: File) {
    setSelectedFile(file);
    setVideoInfo(null);
    if (!title) setTitle(file.name.replace(/\.[^/.]+$/, ''));
    const info = await probeVideo(file);
    setVideoInfo(info);
  }

  function pollJob(jobId: string) {
    pollTimer.current = setInterval(async () => {
      try {
        const response = await fetch('/api/publish/' + jobId);
        const data: JobStatus = await response.json();
        if (!response.ok) throw new Error();
        setJob(data);
        if (data.status === 'DONE') {
          if (pollTimer.current) clearInterval(pollTimer.current);
          setStage('done');
        } else if (data.status === 'FAILED') {
          if (pollTimer.current) clearInterval(pollTimer.current);
          setError(data.errorMessage ?? 'Publishing failed.');
          setStage('error');
        }
      } catch {
        // Transient poll failure - try again on the next tick rather than aborting.
      }
    }, 1500);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    const file = selectedFile;
    if (!file && !incomingClip) {
      setError('Choose a video file to publish.');
      return;
    }
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError('Enter a title.');
      return;
    }

    setStage('staging');
    try {
      let uploadData: { jobId?: string; error?: string };

      if (incomingClip) {
        // Already rendered and sitting on disk - the server copies it into the
        // publish staging area rather than making the browser re-upload it.
        const response = await fetch('/api/publish/from-clip', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clipJobId: incomingClip.jobId,
            connectedAccountId,
            title: trimmedTitle,
            description: String(form.get('description') ?? ''),
            categoryId: String(form.get('categoryId') ?? '20'),
            privacy: String(form.get('privacy') ?? 'private'),
            thumbnailAssetId: thumbnailAssetId ?? undefined,
          }),
        });
        uploadData = await response.json();
        if (!response.ok) {
          setError(uploadData.error ?? 'Could not stage that clip.');
          setStage('error');
          return;
        }
      } else {
        const params = new URLSearchParams({
          connectedAccountId,
          title: trimmedTitle,
          description: String(form.get('description') ?? ''),
          categoryId: String(form.get('categoryId') ?? '20'),
          privacy: String(form.get('privacy') ?? 'private'),
          filename: file!.name,
        });
        if (thumbnailAssetId) params.set('thumbnailAssetId', thumbnailAssetId);

        const uploadResponse = await fetch('/api/publish/upload-video?' + params.toString(), {
          method: 'POST',
          body: file!,
        });
        uploadData = await uploadResponse.json();
        if (!uploadResponse.ok) {
          setError(uploadData.error ?? 'Could not stage the video file.');
          setStage('error');
          return;
        }
      }

      const startResponse = await fetch('/api/publish/' + uploadData.jobId + '/start', { method: 'POST' });
      if (!startResponse.ok) {
        const startData = await startResponse.json().catch(() => ({}));
        setError(startData.error ?? 'Could not start the upload.');
        setStage('error');
        return;
      }

      setStage('uploading');
      if (uploadData.jobId) pollJob(uploadData.jobId);
    } catch {
      setError('Could not reach the server. Try again.');
      setStage('error');
    }
  }

  if (stage === 'uploading' || stage === 'staging') {
    const total = job ? Number(job.totalBytes) : 0;
    const uploaded = job ? Number(job.bytesUploaded) : 0;
    const percent = total > 0 ? (uploaded / total) * 100 : 0;
    const currentStepIndex =
      stage === 'staging' ? -1 : STAGE_STEPS.findIndex((s) => s.key === job?.status);

    return (
      <Card>
        <SectionHeading title="Publishing" description={selectedFile?.name} />

        <div className="mb-5 flex items-center justify-between">
          {STAGE_STEPS.map((step, index) => {
            const active = index === currentStepIndex;
            const done = currentStepIndex > index || (stage === 'staging' && false);
            return (
              <div key={step.key} className="flex flex-1 items-center last:flex-none">
                <div className="flex flex-col items-center gap-1.5">
                  <div
                    className={
                      'flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold transition-colors ' +
                      (done
                        ? 'border-good bg-good/15 text-good'
                        : active
                          ? 'border-brand-500 bg-brand-500/15 text-brand-300'
                          : 'border-base-700 bg-base-800 text-ink-muted')
                    }
                  >
                    {done ? <IconCheckCircle width={16} height={16} /> : index + 1}
                  </div>
                  <span className={'text-[11px] ' + (active ? 'text-ink' : 'text-ink-muted')}>{step.label}</span>
                </div>
                {index < STAGE_STEPS.length - 1 ? (
                  <div className={'mx-2 h-px flex-1 ' + (done ? 'bg-good/40' : 'bg-base-700')} />
                ) : null}
              </div>
            );
          })}
        </div>

        <ProgressBar value={stage === 'staging' ? 8 : Math.max(4, percent)} />
        <div className="mt-2 flex items-center justify-between text-xs text-ink-muted">
          <span>
            {stage === 'staging'
              ? 'Staging video file…'
              : job?.status === 'UPLOADING_VIDEO'
                ? 'Uploading to YouTube…'
                : job?.status === 'SETTING_THUMBNAIL'
                  ? 'Setting thumbnail…'
                  : 'Saving to your tracker…'}
          </span>
          {stage === 'uploading' && total > 0 ? (
            <span>
              {formatBytes(uploaded)} / {formatBytes(total)}
            </span>
          ) : null}
        </div>
        <p className="mt-3 text-xs text-ink-muted">
          This can take a while for a large file - you can leave this page open or come back later; progress is
          saved.
        </p>
      </Card>
    );
  }

  if (stage === 'done') {
    return (
      <Card className="border-good/30 bg-good/[0.04]">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-good/15 text-good">
            <IconCheckCircle width={22} height={22} />
          </div>
          <div>
            <h2 className="text-base font-semibold text-ink">Published</h2>
            <p className="mt-1 text-sm text-ink-muted">
              Your video is live on YouTube and now shows up in your video tracker.
            </p>
            <div className="mt-3 flex gap-2">
              <Link href="/videos" className="btn-primary">
                View your videos
              </Link>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  setStage('form');
                  setSelectedFile(null);
                  setVideoInfo(null);
                  setThumbnailAssetId(null);
                  setTitle('');
                  setJob(null);
                }}
              >
                Publish another
              </button>
            </div>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {timingHint ? (
        <Alert tone="info">
          <span className="inline-flex items-center gap-1.5 font-medium text-ink">
            <IconClock width={14} height={14} /> Best time to publish
          </span>
          <span className="ml-1">{timingHint}</span>
        </Alert>
      ) : null}

      <Card>
        <SectionHeading title="Publish a video" description="Uploads directly to YouTube, then tracks it here automatically." />
        {stage === 'error' && error ? (
          <Alert tone="bad" className="mb-3">
            <span className="inline-flex items-center gap-1.5">
              <IconAlertCircle width={14} height={14} /> {error}
            </span>
          </Alert>
        ) : null}

        <form className="space-y-4" onSubmit={onSubmit}>
          <div>
            <label className="label mb-1 block">Video file</label>
            {incomingClip ? (
              <div className="flex items-center gap-3 rounded-lg border border-brand-500/40 bg-brand-500/[0.06] p-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-500/15 text-brand-300">
                  <IconVideo width={18} height={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{incomingClip.sourceName}</p>
                  <p className="text-xs text-ink-muted">Rendered in the clip editor · publishes without re-uploading</p>
                </div>
                <a href="/studio/clips" className="link shrink-0 text-xs">
                  Edit again
                </a>
              </div>
            ) : selectedFile ? (
              <div className="flex items-center gap-3 rounded-lg border border-base-700 bg-base-900 p-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-500/15 text-brand-300">
                  <IconVideo width={18} height={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{selectedFile.name}</p>
                  <p className="text-xs text-ink-muted">
                    {formatBytes(selectedFile.size)}
                    {videoInfo ? ' · ' + formatDuration(videoInfo.durationSeconds) + ' · ' + videoInfo.width + '×' + videoInfo.height : ' · reading details…'}
                    {videoInfo && videoInfo.durationSeconds > 0 && videoInfo.durationSeconds <= 180 ? ' · Shorts-length' : ''}
                  </p>
                </div>
                <button
                  type="button"
                  className="rounded-lg p-2 text-ink-muted hover:bg-bad/10 hover:text-bad"
                  onClick={() => {
                    setSelectedFile(null);
                    setVideoInfo(null);
                  }}
                  aria-label="Remove video"
                >
                  <IconTrash width={16} height={16} />
                </button>
              </div>
            ) : (
              <label
                className={
                  'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors ' +
                  (isDraggingFile ? 'border-brand-500 bg-brand-500/10' : 'border-base-700 hover:border-base-600 hover:bg-base-900')
                }
                onDragOver={(event) => {
                  event.preventDefault();
                  setIsDraggingFile(true);
                }}
                onDragLeave={() => setIsDraggingFile(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setIsDraggingFile(false);
                  const file = event.dataTransfer.files?.[0];
                  if (file) void onFileChosen(file);
                }}
              >
                <IconUpload width={24} height={24} className="text-ink-muted" />
                <p className="text-sm text-ink">
                  <span className="font-medium text-brand-300">Click to choose</span> or drag a video file here
                </p>
                <p className="text-xs text-ink-muted">MP4, MOV, WebM, MKV</p>
                <input
                  ref={fileInputRef}
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
          </div>

          <div>
            <label htmlFor="title" className="label mb-1 block">
              Title <span className="text-bad">*</span>
            </label>
            <input
              id="title"
              name="title"
              type="text"
              required
              maxLength={100}
              className="input"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>

          <div>
            <label htmlFor="description" className="label mb-1 block">
              Description
            </label>
            <textarea id="description" name="description" rows={4} className="input" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="categoryId" className="label mb-1.5 flex items-center gap-1.5">
                <IconTag width={13} height={13} /> Category
              </label>
              <select id="categoryId" name="categoryId" defaultValue="20" className="input">
                {YOUTUBE_CATEGORIES.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label mb-1.5 block">Privacy</label>
              <div className="grid grid-cols-3 gap-1.5">
                {PRIVACY_OPTIONS.map((option) => (
                  <label key={option.id} className="relative">
                    <input type="radio" name="privacy" value={option.id} defaultChecked={option.id === 'private'} className="peer sr-only" />
                    <div className="flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-base-700 bg-base-900 px-1 py-2 text-center text-ink-muted transition-colors peer-checked:border-brand-500 peer-checked:bg-brand-500/10 peer-checked:text-brand-300">
                      <option.icon width={15} height={15} />
                      <span className="text-[11px] font-medium">{option.label}</span>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className="label mb-1.5 flex items-center gap-1.5">
              <IconImage width={13} height={13} /> Thumbnail (optional)
            </label>
            <ThumbnailPicker selectedId={thumbnailAssetId} onSelect={setThumbnailAssetId} />
          </div>

          <button type="submit" className="btn-primary w-full sm:w-auto">
            <IconUpload width={16} height={16} /> Publish to YouTube
          </button>
        </form>
      </Card>
    </div>
  );
}
