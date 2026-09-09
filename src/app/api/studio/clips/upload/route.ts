import { NextResponse, type NextRequest } from 'next/server';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { getCurrentUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { clipSourcePath, ensureDirFor } from '@/lib/storage/local';
import { probeVideo, ffmpegPath } from '@/lib/video/ffmpeg';
import { logger } from '@/lib/util/logger';

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024 * 1024;

/**
 * POST /api/studio/clips/upload?filename=...
 *
 * Streams a source video to disk (raw body, never buffered whole), probes it
 * with ffprobe for real duration/dimensions, and returns a DRAFT ClipJob the
 * editor then builds an edit spec against.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in to edit clips.' }, { status: 401 });
  }

  if (!(await ffmpegPath())) {
    return NextResponse.json(
      { error: 'FFmpeg was not found on this machine. Install it, then restart the app.' },
      { status: 503 },
    );
  }

  if (!request.body) {
    return NextResponse.json({ error: 'No video file was provided.' }, { status: 400 });
  }
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: 'Video file is too large.' }, { status: 413 });
  }

  const filename = request.nextUrl.searchParams.get('filename') ?? 'clip.mp4';
  const ext = filename.includes('.') ? filename.slice(filename.lastIndexOf('.') + 1) : 'mp4';

  let jobId: string | null = null;
  let destPath: string | null = null;
  try {
    const job = await prisma.clipJob.create({
      data: {
        userId: user.id,
        status: 'DRAFT',
        sourceFilePath: '',
        sourceName: filename.slice(0, 200),
        editSpec: {},
      },
    });
    jobId = job.id;
    destPath = clipSourcePath(user.id, job.id, ext);
    await ensureDirFor(destPath);
    await pipeline(
      Readable.fromWeb(request.body as import('stream/web').ReadableStream),
      createWriteStream(destPath),
    );

    const probe = await probeVideo(destPath);
    if (!probe) {
      await unlink(destPath).catch(() => undefined);
      await prisma.clipJob.delete({ where: { id: job.id } }).catch(() => undefined);
      return NextResponse.json(
        { error: 'Could not read that video. It may be corrupt or an unsupported format.' },
        { status: 400 },
      );
    }

    const updated = await prisma.clipJob.update({
      where: { id: job.id },
      data: {
        sourceFilePath: destPath,
        durationSeconds: probe.durationSeconds,
        width: probe.width,
        height: probe.height,
      },
    });

    logger.info('studio.clip_uploaded', {
      userId: user.id,
      jobId: job.id,
      seconds: probe.durationSeconds,
    });
    return NextResponse.json(
      {
        jobId: updated.id,
        durationSeconds: probe.durationSeconds,
        width: probe.width,
        height: probe.height,
        hasAudio: probe.hasAudio,
      },
      { status: 201 },
    );
  } catch (error) {
    logger.error('studio.clip_upload_failed', { error, userId: user.id });
    if (destPath) await unlink(destPath).catch(() => undefined);
    if (jobId) await prisma.clipJob.delete({ where: { id: jobId } }).catch(() => undefined);
    return NextResponse.json({ error: 'Could not save that video. Check server logs.' }, { status: 500 });
  }
}
