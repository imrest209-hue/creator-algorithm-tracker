import { NextResponse, type NextRequest } from 'next/server';
import { unlink } from 'node:fs/promises';
import { getCurrentUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/util/logger';

/**
 * POST /api/publish/[jobId]/cancel - best-effort cancel. If the upload hasn't
 * started, deletes the staged file and marks the job failed. An in-progress
 * YouTube resumable session simply expires unattended - no explicit cancel
 * call exists on Google's side, so a job already uploading just gets marked
 * failed here and its file is left in place (an active runner will still
 * finish or fail it on its own; this only stops a job that hasn't started).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in to manage publish jobs.' }, { status: 401 });
  }

  const { jobId } = await params;
  const job = await prisma.publishJob.findUnique({ where: { id: jobId } });
  if (!job || job.userId !== user.id) {
    return NextResponse.json({ error: 'Publish job not found.' }, { status: 404 });
  }
  if (job.status !== 'PENDING') {
    return NextResponse.json({ error: 'This job has already started and cannot be cancelled here.' }, { status: 409 });
  }

  await prisma.publishJob.update({ where: { id: job.id }, data: { status: 'FAILED', errorMessage: 'Cancelled.' } });
  await unlink(job.videoFilePath).catch(() => undefined);
  logger.info('studio.publish_cancelled', { userId: user.id, jobId: job.id });
  return NextResponse.json({ cancelled: true });
}
