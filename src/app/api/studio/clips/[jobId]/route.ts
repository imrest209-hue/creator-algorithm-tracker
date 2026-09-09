import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';

/** GET /api/studio/clips/[jobId] - status/progress for the editor to poll. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in to view this clip.' }, { status: 401 });
  }

  const { jobId } = await params;
  const job = await prisma.clipJob.findUnique({ where: { id: jobId } });
  if (!job || job.userId !== user.id) {
    return NextResponse.json({ error: 'Clip not found.' }, { status: 404 });
  }

  return NextResponse.json({
    id: job.id,
    status: job.status,
    progress: job.progress,
    sourceName: job.sourceName,
    durationSeconds: job.durationSeconds,
    width: job.width,
    height: job.height,
    errorMessage: job.errorMessage,
    hasOutput: Boolean(job.outputFilePath),
  });
}
