import { NextResponse, type NextRequest } from 'next/server';
import { copyFile, stat } from 'node:fs/promises';
import { getCurrentUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { videoPath, ensureDirFor } from '@/lib/storage/local';
import { hasUploadScope } from '@/lib/integrations/youtube';
import { logger } from '@/lib/util/logger';

const PRIVACY_VALUES = new Set(['private', 'unlisted', 'public']);

/**
 * POST /api/publish/from-clip
 *
 * Creates a PublishJob straight from an already-rendered ClipJob, so a clip
 * edited in Studio doesn't have to be downloaded and re-uploaded through the
 * browser just to publish it.
 *
 * The rendered file is *copied* into the publish staging area rather than
 * referenced in place: the publish runner deletes its source file on success,
 * which would otherwise silently destroy the clip the user just made.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in to publish videos.' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const clipJobId = typeof body?.clipJobId === 'string' ? body.clipJobId : null;
  const connectedAccountId = typeof body?.connectedAccountId === 'string' ? body.connectedAccountId : null;
  const title = String(body?.title ?? '').trim();
  if (!clipJobId || !connectedAccountId || !title) {
    return NextResponse.json({ error: 'clipJobId, connectedAccountId and title are required.' }, { status: 400 });
  }
  const privacy = String(body?.privacy ?? 'private');
  if (!PRIVACY_VALUES.has(privacy)) {
    return NextResponse.json({ error: 'privacy must be private, unlisted, or public.' }, { status: 400 });
  }

  const clip = await prisma.clipJob.findUnique({ where: { id: clipJobId } });
  if (!clip || clip.userId !== user.id || clip.status !== 'DONE' || !clip.outputFilePath) {
    return NextResponse.json({ error: 'That rendered clip was not found.' }, { status: 404 });
  }

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

  const thumbnailAssetId = typeof body?.thumbnailAssetId === 'string' ? body.thumbnailAssetId : undefined;
  if (thumbnailAssetId) {
    const thumb = await prisma.thumbnailAsset.findUnique({ where: { id: thumbnailAssetId } });
    if (!thumb || thumb.userId !== user.id) {
      return NextResponse.json({ error: 'Thumbnail not found.' }, { status: 404 });
    }
  }

  // Declared outside the try so a failed copy can remove the half-built row
  // rather than leaving an unpublishable PENDING job with no file behind it.
  let createdJobId: string | null = null;
  try {
    const job = await prisma.publishJob.create({
      data: {
        userId: user.id,
        connectedAccountId: account.id,
        status: 'PENDING',
        videoFilePath: '',
        thumbnailAssetId,
        title,
        description: typeof body?.description === 'string' ? body.description : undefined,
        categoryId: typeof body?.categoryId === 'string' ? body.categoryId : '20',
        privacy,
        totalBytes: 0n,
      },
    });

    createdJobId = job.id;

    const destPath = videoPath(user.id, job.id, 'mp4');
    await ensureDirFor(destPath);
    await copyFile(clip.outputFilePath, destPath);
    const { size } = await stat(destPath);

    await prisma.publishJob.update({
      where: { id: job.id },
      data: { videoFilePath: destPath, totalBytes: BigInt(size) },
    });

    logger.info('studio.publish_from_clip', { userId: user.id, jobId: job.id, clipJobId, bytes: size });
    return NextResponse.json({ jobId: job.id }, { status: 201 });
  } catch (error) {
    logger.error('studio.publish_from_clip_failed', { error, userId: user.id, clipJobId });
    if (createdJobId) {
      await prisma.publishJob.delete({ where: { id: createdJobId } }).catch(() => undefined);
    }
    return NextResponse.json({ error: 'Could not stage that clip for publishing.' }, { status: 500 });
  }
}
