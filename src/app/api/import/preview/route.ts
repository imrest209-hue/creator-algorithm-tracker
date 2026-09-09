import { NextResponse, type NextRequest } from 'next/server';
import { PLATFORMS, type Platform } from '@/lib/types';
import { getCurrentUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { buildImportPreview } from '@/lib/csv/import';
import { logger } from '@/lib/util/logger';

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8MB

/** POST /api/import/preview - parses a CSV and returns a mapped, validated preview. Nothing is written. */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in to import videos.' }, { status: 401 });
  }

  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: 'Expected multipart form data with a "file" field.' }, { status: 400 });
  }
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No CSV file was provided.' }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: 'File is too large (max 8MB).' }, { status: 413 });
  }

  const platformRaw = String(form.get('platform') ?? 'YOUTUBE');
  const defaultPlatform: Platform = (PLATFORMS as readonly string[]).includes(platformRaw)
    ? (platformRaw as Platform)
    : 'YOUTUBE';

  let text: string;
  try {
    text = await file.text();
  } catch (error) {
    logger.warn('import.file_read_failed', { error });
    return NextResponse.json({ error: 'Could not read the uploaded file as text.' }, { status: 400 });
  }

  const existingVideos = await prisma.video.findMany({
    where: { userId: user.id },
    select: { platform: true, platformVideoId: true },
  });
  const existingKeys = new Set(existingVideos.map((v) => v.platform + ':' + v.platformVideoId));

  const preview = buildImportPreview(text, { defaultPlatform, existingKeys, limit: 2000 });

  return NextResponse.json({
    ...preview,
    // Only send a bounded sample of rows to the client to keep the payload small;
    // the commit step re-parses the full file server-side.
    rows: preview.rows.slice(0, 200),
    truncated: preview.rows.length > 200,
  });
}
