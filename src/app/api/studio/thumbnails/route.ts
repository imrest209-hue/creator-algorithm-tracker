import { NextResponse, type NextRequest } from 'next/server';
import { writeFile } from 'node:fs/promises';
import { getCurrentUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { thumbnailPath, ensureDirFor } from '@/lib/storage/local';
import { logger } from '@/lib/util/logger';

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * POST /api/studio/thumbnails - persists a PNG exported by the Studio
 * thumbnail editor. GET lists the signed-in user's saved thumbnails.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in to save thumbnails.' }, { status: 401 });
  }

  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: 'Expected multipart form data with a "file" field.' }, { status: 400 });
  }
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No image file was provided.' }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: 'Thumbnail is too large (max 5MB).' }, { status: 413 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length < PNG_MAGIC.length || !buffer.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)) {
    return NextResponse.json({ error: 'File is not a valid PNG.' }, { status: 400 });
  }

  const width = Number(form.get('width') ?? 0);
  const height = Number(form.get('height') ?? 0);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return NextResponse.json({ error: 'Missing or invalid image dimensions.' }, { status: 400 });
  }

  const sourceVideoIdRaw = form.get('sourceVideoId');
  const sourceVideoId = typeof sourceVideoIdRaw === 'string' && sourceVideoIdRaw.length > 0 ? sourceVideoIdRaw : null;

  try {
    const asset = await prisma.thumbnailAsset.create({
      data: { userId: user.id, filePath: '', width: Math.round(width), height: Math.round(height), sourceVideoId },
    });
    const destPath = thumbnailPath(user.id, asset.id);
    await ensureDirFor(destPath);
    await writeFile(destPath, buffer);
    await prisma.thumbnailAsset.update({ where: { id: asset.id }, data: { filePath: destPath } });

    logger.info('studio.thumbnail_saved', { userId: user.id, assetId: asset.id, width, height });
    return NextResponse.json({ id: asset.id, url: '/api/assets/thumbnails/' + asset.id }, { status: 201 });
  } catch (error) {
    logger.error('studio.thumbnail_save_failed', { error, userId: user.id });
    return NextResponse.json({ error: 'Could not save this thumbnail. Check server logs.' }, { status: 500 });
  }
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in to view saved thumbnails.' }, { status: 401 });
  }

  const assets = await prisma.thumbnailAsset.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return NextResponse.json({
    thumbnails: assets.map((asset) => ({
      id: asset.id,
      url: '/api/assets/thumbnails/' + asset.id,
      width: asset.width,
      height: asset.height,
      createdAt: asset.createdAt.toISOString(),
    })),
  });
}
