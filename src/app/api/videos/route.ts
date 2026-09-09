import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { manualVideoSchema } from '@/lib/videos/schema';
import { upsertVideo } from '@/lib/videos/persist';
import { logger } from '@/lib/util/logger';

/**
 * POST /api/videos - manual video entry.
 * Requires a signed-in user; demo mode has nowhere to persist a new video.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: 'Sign in to add videos. Demo mode is read-only.' },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const parsed = manualVideoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid input.', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const result = await upsertVideo(user.id, parsed.data, 'MANUAL');
    logger.info('video.manual_upsert', { userId: user.id, videoId: result.id, created: result.created });
    return NextResponse.json(result, { status: result.created ? 201 : 200 });
  } catch (error) {
    logger.error('video.manual_upsert_failed', { error, userId: user.id });
    return NextResponse.json({ error: 'Could not save this video. Check server logs.' }, { status: 500 });
  }
}
