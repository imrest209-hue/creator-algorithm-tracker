import { NextResponse, type NextRequest } from 'next/server';
import { readFile } from 'node:fs/promises';
import { getCurrentUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/util/logger';

/**
 * GET /api/assets/thumbnails/[assetId] - streams a saved thumbnail PNG back
 * to its owner. Ownership is checked against the DB row before the file is
 * ever read; the id itself never resolves to a filesystem path the client
 * controls (see src/lib/storage/local.ts).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ assetId: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in to view this thumbnail.' }, { status: 401 });
  }

  const { assetId } = await params;
  const asset = await prisma.thumbnailAsset.findUnique({ where: { id: assetId } });
  if (!asset || asset.userId !== user.id) {
    return NextResponse.json({ error: 'Thumbnail not found.' }, { status: 404 });
  }

  try {
    const bytes = await readFile(asset.filePath);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'private, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    logger.error('studio.thumbnail_read_failed', { error, userId: user.id, assetId });
    return NextResponse.json({ error: 'Could not read this thumbnail file.' }, { status: 500 });
  }
}
