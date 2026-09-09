import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { startClipRender, normaliseEditSpec } from '@/lib/video/clips';
import { logger } from '@/lib/util/logger';

/**
 * POST /api/studio/clips/[jobId]/render - saves the submitted edit spec and
 * kicks off the FFmpeg render. Returns immediately; the client polls
 * GET /api/studio/clips/[jobId] for progress.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in to render clips.' }, { status: 401 });
  }

  const { jobId } = await params;
  const job = await prisma.clipJob.findUnique({ where: { id: jobId } });
  if (!job || job.userId !== user.id) {
    return NextResponse.json({ error: 'Clip not found.' }, { status: 404 });
  }
  if (job.status === 'RENDERING') {
    return NextResponse.json({ error: 'This clip is already rendering.' }, { status: 409 });
  }

  const body = await request.json().catch(() => null);
  const spec = normaliseEditSpec(body?.editSpec, job.durationSeconds ?? 0);

  await prisma.clipJob.update({
    where: { id: job.id },
    data: { editSpec: spec as unknown as object, status: 'DRAFT', progress: 0, errorMessage: null },
  });

  startClipRender(job.id);
  logger.info('studio.clip_render_started', { userId: user.id, jobId: job.id });
  return NextResponse.json({ started: true }, { status: 202 });
}
