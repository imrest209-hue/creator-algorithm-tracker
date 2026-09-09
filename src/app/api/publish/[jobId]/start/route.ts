import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { startPublishJob } from '@/lib/integrations/publish';
import { logger } from '@/lib/util/logger';

/**
 * POST /api/publish/[jobId]/start - kicks off the resumable upload for a
 * staged job. Returns immediately; the client polls GET /api/publish/[jobId]
 * for progress.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in to publish videos.' }, { status: 401 });
  }

  const { jobId } = await params;
  const job = await prisma.publishJob.findUnique({ where: { id: jobId } });
  if (!job || job.userId !== user.id) {
    return NextResponse.json({ error: 'Publish job not found.' }, { status: 404 });
  }
  if (job.status !== 'PENDING') {
    return NextResponse.json({ error: 'This job has already been started.' }, { status: 409 });
  }

  startPublishJob(job.id);
  logger.info('studio.publish_started', { userId: user.id, jobId: job.id });
  return NextResponse.json({ started: true }, { status: 202 });
}
