import { NextResponse, type NextRequest } from 'next/server';
import { PLATFORMS, type Platform } from '@/lib/types';
import { getCurrentUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { buildImportPreview } from '@/lib/csv/import';
import { upsertVideo } from '@/lib/videos/persist';
import { logger } from '@/lib/util/logger';

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/**
 * POST /api/import/commit - re-parses the CSV server-side (never trusts the
 * client's edited preview for the actual numbers) and writes every valid row.
 */
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
  const skipDuplicates = form.get('skipDuplicates') === 'true';

  const text = await file.text();

  const existingVideos = await prisma.video.findMany({
    where: { userId: user.id },
    select: { platform: true, platformVideoId: true },
  });
  const existingKeys = new Set(existingVideos.map((v) => v.platform + ':' + v.platformVideoId));

  const preview = buildImportPreview(text, { defaultPlatform, existingKeys, limit: 20000 });

  let imported = 0;
  let skipped = 0;
  const errors: Array<{ rowNumber: number; message: string }> = [];

  for (const row of preview.rows) {
    if (!row.valid || !row.video) {
      skipped += 1;
      if (row.issues.some((i) => i.severity === 'ERROR')) {
        errors.push({ rowNumber: row.rowNumber, message: row.issues[0]?.message ?? 'Invalid row.' });
      }
      continue;
    }
    if (row.duplicate && skipDuplicates) {
      skipped += 1;
      continue;
    }
    try {
      await upsertVideo(
        user.id,
        {
          platform: row.video.platform,
          platformVideoId: row.video.platformVideoId,
          title: row.video.title,
          caption: row.video.caption,
          description: row.video.description,
          hashtags: row.video.hashtags,
          categorySlug: row.video.categorySlug,
          categoryName: row.video.categoryAuto ? undefined : row.video.categoryName,
          hookText: row.video.hookText,
          durationSeconds: row.video.durationSeconds,
          publishedAt: row.video.publishedAt,
          views: row.video.metrics.views,
          likes: row.video.metrics.likes,
          comments: row.video.metrics.comments,
          shares: row.video.metrics.shares,
          saves: row.video.metrics.saves,
          followersGained: row.video.metrics.followersGained,
          watchTimeMinutes: row.video.metrics.watchTimeMinutes,
          averageViewDurationSeconds: row.video.metrics.averageViewDurationSeconds,
          averagePercentageViewed: row.video.metrics.averagePercentageViewed,
          impressions: row.video.metrics.impressions,
          clickThroughRate: row.video.metrics.clickThroughRate,
        },
        'CSV',
      );
      imported += 1;
    } catch (error) {
      skipped += 1;
      errors.push({ rowNumber: row.rowNumber, message: 'Database error while saving this row.' });
      logger.error('import.row_failed', { error, rowNumber: row.rowNumber, userId: user.id });
    }
  }

  await prisma.importJob.create({
    data: {
      userId: user.id,
      filename: file.name,
      platform: defaultPlatform,
      rowsTotal: preview.totalRows,
      rowsImported: imported,
      rowsSkipped: skipped,
      errors: errors.length > 0 ? errors : undefined,
      source: 'CSV',
    },
  });

  logger.info('import.committed', { userId: user.id, imported, skipped, total: preview.totalRows });

  return NextResponse.json({
    imported,
    skipped,
    total: preview.totalRows,
    errors: errors.slice(0, 50),
  });
}
