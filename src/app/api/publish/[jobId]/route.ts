import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';

/** GET /api/publish/[jobId] - current status/progress, for the publish wizard to poll. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in to view this job.' }, { status: 401 });
  }

  const { jobId } = await params;
  const job = await prisma.publishJob.findUnique({ where: { id: jobId } });
  if (!job || job.userId !== user.id) {
    return NextResponse.json({ error: 'Publish job not found.' }, { status: 404 });
  }

  return NextResponse.json({
    id: job.id,
    status: job.status,
    totalBytes: job.totalBytes.toString(),
    bytesUploaded: job.bytesUploaded.toString(),
    resultVideoId: job.resultVideoId,
    errorMessage: job.errorMessage,
  });
}
