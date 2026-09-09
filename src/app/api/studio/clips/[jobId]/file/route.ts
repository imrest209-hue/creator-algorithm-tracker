import { NextResponse, type NextRequest } from 'next/server';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { getCurrentUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/util/logger';

/**
 * GET /api/studio/clips/[jobId]/file?variant=source|output
 *
 * Serves a clip's video back to its owner. Implements HTTP range requests -
 * without them a <video> element can load the file but can't seek, which
 * would make the trim scrubber useless.
 */
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

  const variant = request.nextUrl.searchParams.get('variant') === 'output' ? 'output' : 'source';
  const filePath = variant === 'output' ? job.outputFilePath : job.sourceFilePath;
  if (!filePath) {
    return NextResponse.json({ error: 'That version of this clip does not exist yet.' }, { status: 404 });
  }

  try {
    const { size } = await stat(filePath);
    const contentType = variant === 'output' ? 'video/mp4' : guessType(filePath);
    const range = request.headers.get('range');

    if (range) {
      const match = /bytes=(\d*)-(\d*)/.exec(range);
      const start = match && match[1] ? Number(match[1]) : 0;
      const end = match && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
      if (!Number.isFinite(start) || start >= size || start > end) {
        return new NextResponse(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
      }
      const stream = createReadStream(filePath, { start, end });
      return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
        status: 206,
        headers: {
          'Content-Type': contentType,
          'Content-Length': String(end - start + 1),
          'Content-Range': `bytes ${start}-${end}/${size}`,
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'private, no-store',
        },
      });
    }

    const stream = createReadStream(filePath);
    return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(size),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    logger.error('studio.clip_read_failed', { error, userId: user.id, jobId, variant });
    return NextResponse.json({ error: 'Could not read this clip file.' }, { status: 500 });
  }
}

function guessType(filePath: string): string {
  const ext = filePath.slice(filePath.lastIndexOf('.') + 1).toLowerCase();
  const map: Record<string, string> = {
    mp4: 'video/mp4',
    m4v: 'video/x-m4v',
    mov: 'video/quicktime',
    webm: 'video/webm',
    mkv: 'video/x-matroska',
  };
  return map[ext] ?? 'video/mp4';
}
