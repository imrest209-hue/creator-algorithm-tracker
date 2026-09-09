import { NextResponse, type NextRequest } from 'next/server';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { getCurrentUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { videoPath, ensureDirFor } from '@/lib/storage/local';
import { hasUploadScope } from '@/lib/integrations/youtube';
import { logger } from '@/lib/util/logger';

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024 * 1024; // 8GB sanity backstop, not a real limit on a local app

const PRIVACY_VALUES = new Set(['private', 'unlisted', 'public']);

/**
 * POST /api/publish/upload-video?connectedAccountId=...&title=...&description=...&categoryId=...&privacy=...&thumbnailAssetId=...&filename=...
 *
 * The raw video file is the request body (client sends `fetch(url, {body: file})`,
 * not FormData - both the browser and this route stream it without ever
 * buffering the whole file in memory). Creates a PublishJob in PENDING status;
 * the actual YouTube upload is a separate step (POST /api/publish/[jobId]/start).
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in to publish videos.' }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const connectedAccountId = params.get('connectedAccountId');
  const title = params.get('title')?.trim();
  if (!connectedAccountId || !title) {
    return NextResponse.json({ error: 'connectedAccountId and title are required.' }, { status: 400 });
  }
  const privacy = params.get('privacy') ?? 'private';
  if (!PRIVACY_VALUES.has(privacy)) {
    return NextResponse.json({ error: 'privacy must be private, unlisted, or public.' }, { status: 400 });
  }
  const description = params.get('description') ?? undefined;
  const categoryId = params.get('categoryId') ?? '20';
  const thumbnailAssetId = params.get('thumbnailAssetId') ?? undefined;
  const filename = params.get('filename') ?? 'video.mp4';

  const account = await prisma.connectedAccount.findUnique({ where: { id: connectedAccountId } });
  if (!account || account.userId !== user.id || account.platform !== 'YOUTUBE') {
    return NextResponse.json({ error: 'YouTube account not found.' }, { status: 404 });
  }
  if (!hasUploadScope(account.scopes)) {
    return NextResponse.json(
      { error: 'This account needs to be reconnected to grant upload access before you can publish.' },
      { status: 403 },
    );
  }

  if (thumbnailAssetId) {
    const thumb = await prisma.thumbnailAsset.findUnique({ where: { id: thumbnailAssetId } });
    if (!thumb || thumb.userId !== user.id) {
      return NextResponse.json({ error: 'Thumbnail not found.' }, { status: 404 });
    }
  }

  if (!request.body) {
    return NextResponse.json({ error: 'No video file was provided.' }, { status: 400 });
  }
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: 'Video file is too large.' }, { status: 413 });
  }

  try {
    const job = await prisma.publishJob.create({
      data: {
        userId: user.id,
        connectedAccountId: account.id,
        status: 'PENDING',
        videoFilePath: '',
        thumbnailAssetId,
        title,
        description,
        categoryId,
        privacy,
        totalBytes: 0n,
      },
    });

    const ext = filename.includes('.') ? filename.slice(filename.lastIndexOf('.') + 1) : 'mp4';
    const destPath = videoPath(user.id, job.id, ext);
    await ensureDirFor(destPath);
    await pipeline(Readable.fromWeb(request.body as import('stream/web').ReadableStream), createWriteStream(destPath));

    const { size } = await stat(destPath);
    await prisma.publishJob.update({
      where: { id: job.id },
      data: { videoFilePath: destPath, totalBytes: BigInt(size) },
    });

    logger.info('studio.video_staged', { userId: user.id, jobId: job.id, bytes: size });
    return NextResponse.json({ jobId: job.id }, { status: 201 });
  } catch (error) {
    logger.error('studio.video_stage_failed', { error, userId: user.id });
    return NextResponse.json({ error: 'Could not save the uploaded video. Check server logs.' }, { status: 500 });
  }
}
