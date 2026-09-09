import { unlink } from 'node:fs/promises';
import { prisma } from '@/lib/db/prisma';
import { clipOutputPath, ensureDirFor } from '@/lib/storage/local';
import {
  ffmpegPath,
  probeVideo,
  buildRenderArgs,
  renderClip,
  resolveFontFile,
  outputDuration,
  type EditSpec,
} from '@/lib/video/ffmpeg';
import { logger } from '@/lib/util/logger';

/**
 * CLIP RENDER RUNNER
 * ---------------------------------------------------------------------------
 * Same persisted-job shape as the publish runner: status + progress live in
 * the DB so the client can poll them and so a dev-server restart mid-render
 * leaves an honest FAILED row rather than a job that silently vanished.
 */

const activeRenders = new Set<string>();

export function startClipRender(jobId: string): void {
  if (activeRenders.has(jobId)) return;
  activeRenders.add(jobId);
  void runClipRender(jobId).finally(() => activeRenders.delete(jobId));
}

async function runClipRender(jobId: string): Promise<void> {
  const job = await prisma.clipJob.findUnique({ where: { id: jobId } });
  if (!job || job.status === 'RENDERING' || job.status === 'DONE') return;

  const ffmpeg = await ffmpegPath();
  if (!ffmpeg) {
    await fail(jobId, 'FFmpeg was not found on this machine. Install it, then restart the app.');
    return;
  }

  const source = await probeVideo(job.sourceFilePath);
  if (!source) {
    await fail(jobId, 'Could not read this video file. It may be corrupt or an unsupported format.');
    return;
  }

  const spec = job.editSpec as unknown as EditSpec;
  const outputPath = clipOutputPath(job.userId, job.id);

  try {
    await prisma.clipJob.update({
      where: { id: job.id },
      data: { status: 'RENDERING', progress: 0, errorMessage: null },
    });
    await ensureDirFor(outputPath);

    // FFmpeg reports progress in *output* time, which a speed change shortens
    // or lengthens - using the trim length here would misreport the percentage.
    const duration = outputDuration(spec);
    const fontFile = await resolveFontFile();
    if (!fontFile && spec.overlays.some((overlay) => overlay.text.trim())) {
      // The clip still renders, just without burned-in text - say so rather
      // than letting the user think the captions silently worked.
      logger.warn('studio.clip_no_font', { userId: job.userId, jobId: job.id });
    }
    const args = buildRenderArgs(spec, source, job.sourceFilePath, outputPath, fontFile);

    let lastWritten = -1;
    await renderClip(ffmpeg, args, duration, (percent) => {
      // Only touch the DB when the number actually moves, so a long render
      // doesn't turn into hundreds of pointless writes.
      if (percent > lastWritten) {
        lastWritten = percent;
        void prisma.clipJob.update({ where: { id: job.id }, data: { progress: percent } }).catch(() => undefined);
      }
    });

    await prisma.clipJob.update({
      where: { id: job.id },
      data: { status: 'DONE', progress: 100, outputFilePath: outputPath },
    });
    logger.info('studio.clip_rendered', { userId: job.userId, jobId: job.id, seconds: duration });
  } catch (error) {
    logger.error('studio.clip_render_failed', { error, userId: job.userId, jobId: job.id });
    await fail(
      jobId,
      error instanceof Error && error.message.includes('FFmpeg exited')
        ? 'FFmpeg could not render this clip. Try a different trim range or source file.'
        : 'Rendering failed. The source file was kept so you can retry.',
    );
    await unlink(outputPath).catch(() => undefined);
  }
}

async function fail(jobId: string, message: string): Promise<void> {
  await prisma.clipJob
    .update({ where: { id: jobId }, data: { status: 'FAILED', errorMessage: message } })
    .catch(() => undefined);
}

/** Clamps a client-submitted spec into something safe to hand to FFmpeg. */
export function normaliseEditSpec(raw: unknown, durationSeconds: number): EditSpec {
  const spec = (raw ?? {}) as Partial<EditSpec>;
  const start = clamp(Number(spec.trimStart ?? 0), 0, Math.max(0, durationSeconds - 0.1));
  const end = clamp(Number(spec.trimEnd ?? durationSeconds), start + 0.1, durationSeconds || start + 0.1);
  const overlays = Array.isArray(spec.overlays) ? spec.overlays.slice(0, 5) : [];

  // Fades are measured on the sped-up output, so clamp them against that
  // length rather than the raw trim range.
  const speed = clamp(Number(spec.speed ?? 1), 0.25, 4);
  const outSeconds = (end - start) / speed;

  return {
    trimStart: start,
    trimEnd: end,
    crop: spec.crop === 'vertical' || spec.crop === 'square' ? spec.crop : 'none',
    cropOffset: clamp(Number(spec.cropOffset ?? 0.5), 0, 1),
    volume: clamp(Number(spec.volume ?? 1), 0, 2),
    speed,
    fadeIn: clamp(Number(spec.fadeIn ?? 0), 0, outSeconds / 2),
    fadeOut: clamp(Number(spec.fadeOut ?? 0), 0, outSeconds / 2),
    overlays: overlays.map((overlay) => ({
      text: String(overlay?.text ?? '').slice(0, 120),
      x: clamp(Number(overlay?.x ?? 0.5), 0, 1),
      y: clamp(Number(overlay?.y ?? 0.1), 0, 1),
      sizeRatio: clamp(Number(overlay?.sizeRatio ?? 0.08), 0.02, 0.4),
      color: /^#[0-9a-f]{6}$/i.test(String(overlay?.color ?? '')) ? String(overlay.color) : '#ffffff',
    })),
  };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
