import { open, readFile, unlink } from 'node:fs/promises';
import type { PublishJob } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { ApiError, fetchJson } from '@/lib/integrations/http';
import { resolveAccountTokens } from '@/lib/integrations/sync';
import { getIntegration } from '@/lib/integrations/registry';
import {
  initiateResumableUpload,
  uploadVideoChunk,
  setThumbnail,
  type PublishMetadata,
} from '@/lib/integrations/youtube';
import { extractHashtags, parseIsoDuration, type OAuthTokens } from '@/lib/integrations/types';
import { upsertVideo } from '@/lib/videos/persist';
import { logger } from '@/lib/util/logger';

/**
 * PUBLISH JOB RUNNER
 * ---------------------------------------------------------------------------
 * Drives one PublishJob from PENDING through to DONE/FAILED: resumable
 * upload to YouTube in chunks, then the thumbnail, then a tracked `Video`
 * row via the same `upsertVideo` every other data path uses. Progress
 * (`bytesUploaded`) is written to the DB after every chunk so the client can
 * poll it and so a restart can resume instead of losing the job entirely.
 */

const CHUNK_BYTES = 8 * 1024 * 1024;
const DATA_API = 'https://www.googleapis.com/youtube/v3';

// In-memory guard against double-starting the same job from two requests -
// the job's own persisted status is the source of truth, this just avoids
// two runners racing on the same resumable session in this process.
const activeJobs = new Set<string>();

/** Fire-and-forget: starts (or resumes) a job's upload without blocking the caller. */
export function startPublishJob(jobId: string): void {
  if (activeJobs.has(jobId)) return;
  activeJobs.add(jobId);
  void runPublishJob(jobId).finally(() => activeJobs.delete(jobId));
}

async function runPublishJob(jobId: string): Promise<void> {
  const job = await prisma.publishJob.findUnique({ where: { id: jobId } });
  if (!job || (job.status !== 'PENDING' && job.status !== 'UPLOADING_VIDEO')) return;

  const account = await prisma.connectedAccount.findUnique({ where: { id: job.connectedAccountId } });
  const integration = account ? getIntegration(account.platform) : null;
  if (!account || !integration) {
    await failJob(job.id, 'The connected YouTube account is no longer available.');
    return;
  }

  try {
    const tokens = await resolveAccountTokens(account, integration);

    if (job.status === 'PENDING') {
      await prisma.publishJob.update({ where: { id: job.id }, data: { status: 'UPLOADING_VIDEO' } });
    }

    const totalBytes = Number(job.totalBytes);
    const sessionUri =
      job.resumableSessionUri ??
      (await initiateResumableUpload(
        tokens,
        {
          title: job.title,
          description: job.description ?? undefined,
          categoryId: job.categoryId,
          privacyStatus: job.privacy as PublishMetadata['privacyStatus'],
        },
        totalBytes,
        guessMimeType(job.videoFilePath),
      ));
    if (sessionUri !== job.resumableSessionUri) {
      await prisma.publishJob.update({ where: { id: job.id }, data: { resumableSessionUri: sessionUri } });
    }

    let position = Number(job.bytesUploaded);
    let videoId: string | undefined;
    while (position < totalBytes) {
      const end = Math.min(position + CHUNK_BYTES, totalBytes);
      const chunk = await readChunk(job.videoFilePath, position, end);
      const result = await uploadVideoChunk(sessionUri, chunk, position, totalBytes);
      position = result.done ? totalBytes : result.nextByte;
      await prisma.publishJob.update({ where: { id: job.id }, data: { bytesUploaded: BigInt(position) } });
      if (result.done) videoId = result.videoId;
    }
    if (!videoId) throw new ApiError('YouTube did not confirm the upload finished.', 502, 'SERVER');

    await prisma.publishJob.update({
      where: { id: job.id },
      data: { status: 'SETTING_THUMBNAIL', resultVideoId: videoId },
    });

    if (job.thumbnailAssetId) {
      const thumbnail = await prisma.thumbnailAsset.findUnique({ where: { id: job.thumbnailAssetId } });
      if (thumbnail) {
        await setThumbnail(tokens, videoId, await readFile(thumbnail.filePath));
      }
    }

    await prisma.publishJob.update({ where: { id: job.id }, data: { status: 'SAVING' } });
    await saveAsTrackedVideo(job, videoId, tokens);

    await prisma.publishJob.update({ where: { id: job.id }, data: { status: 'DONE' } });
    await unlink(job.videoFilePath).catch(() => undefined);
    logger.info('studio.publish_done', { userId: job.userId, jobId: job.id, videoId });
  } catch (error) {
    const message =
      error instanceof ApiError
        ? error.userMessage
        : 'Publishing failed. The video file was kept so you can retry.';
    await prisma.publishJob.update({ where: { id: job.id }, data: { status: 'FAILED', errorMessage: message } });
    logger.error('studio.publish_failed', { error, userId: job.userId, jobId: job.id });
  }
}

async function failJob(jobId: string, message: string): Promise<void> {
  await prisma.publishJob.update({ where: { id: jobId }, data: { status: 'FAILED', errorMessage: message } });
}

async function readChunk(filePath: string, start: number, end: number): Promise<Buffer> {
  const length = end - start;
  const buffer = Buffer.alloc(length);
  const handle = await open(filePath, 'r');
  try {
    await handle.read(buffer, 0, length, start);
  } finally {
    await handle.close();
  }
  return buffer;
}

function guessMimeType(filePath: string): string {
  const ext = filePath.slice(filePath.lastIndexOf('.') + 1).toLowerCase();
  const map: Record<string, string> = {
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    webm: 'video/webm',
    mkv: 'video/x-matroska',
    avi: 'video/x-msvideo',
    m4v: 'video/x-m4v',
  };
  return map[ext] ?? 'video/mp4';
}

interface YoutubeVideoLookup {
  items?: Array<{
    snippet?: { title?: string; description?: string; publishedAt?: string; thumbnails?: Record<string, { url?: string }> };
    contentDetails?: { duration?: string };
    statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
  }>;
}

/**
 * Creates the tracked `Video` row for a just-published upload, through the
 * same `upsertVideo` every other data path (manual entry, CSV, sync) uses.
 * Re-fetches the video from the Data API rather than trusting the form
 * metadata, so duration/thumbnail/publishedAt match what YouTube actually
 * has - and so a later "Sync now" converges cleanly onto YOUTUBE_API data.
 */
async function saveAsTrackedVideo(job: PublishJob, videoId: string, tokens: OAuthTokens): Promise<void> {
  const data = await fetchJson<YoutubeVideoLookup>(
    DATA_API + '/videos?part=snippet,contentDetails,statistics&id=' + videoId,
    { label: 'YouTube published video lookup', headers: { Authorization: 'Bearer ' + tokens.accessToken } },
  );
  const item = data.items?.[0];
  const durationSeconds = parseIsoDuration(item?.contentDetails?.duration);
  const platform = durationSeconds > 0 && durationSeconds <= 180 ? 'YOUTUBE_SHORTS' : 'YOUTUBE';
  const description = item?.snippet?.description ?? job.description ?? null;
  const hashtags = Array.from(new Set([...extractHashtags(job.title), ...extractHashtags(description)]));

  await upsertVideo(
    job.userId,
    {
      platform,
      platformVideoId: videoId,
      title: item?.snippet?.title ?? job.title,
      caption: null,
      description,
      hashtags,
      durationSeconds,
      publishedAt: item?.snippet?.publishedAt ?? new Date().toISOString(),
      views: Number(item?.statistics?.viewCount ?? 0),
      likes: Number(item?.statistics?.likeCount ?? 0),
      comments: Number(item?.statistics?.commentCount ?? 0),
      shares: 0,
      thumbnailUrl: item?.snippet?.thumbnails?.medium?.url ?? item?.snippet?.thumbnails?.default?.url ?? null,
    },
    'YOUTUBE_UPLOAD',
    job.connectedAccountId,
  );
}
