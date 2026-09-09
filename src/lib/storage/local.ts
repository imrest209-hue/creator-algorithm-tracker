import { mkdir } from 'node:fs/promises';
import path from 'node:path';

/**
 * LOCAL FILE STORAGE
 * ---------------------------------------------------------------------------
 * This app runs locally, single-user, via the Desktop launcher - there is no
 * multi-tenant hosting to design around, so Studio's generated thumbnails and
 * staged video uploads live on local disk under `.runtime/uploads/`, the same
 * gitignored scratch directory already used for the pre-audit DB dump.
 *
 * Every path is built from a server-generated id (a Prisma `cuid()`), never
 * from client-supplied input - this rules out path traversal by construction,
 * since nothing derived from a request ever reaches `path.join`.
 */

const RUNTIME_ROOT = path.join(process.cwd(), '.runtime', 'uploads');

export function thumbnailDir(userId: string): string {
  return path.join(RUNTIME_ROOT, 'thumbnails', userId);
}

export function thumbnailPath(userId: string, assetId: string): string {
  return path.join(thumbnailDir(userId), assetId + '.png');
}

export function videoDir(userId: string): string {
  return path.join(RUNTIME_ROOT, 'videos', userId);
}

export function videoPath(userId: string, jobId: string, ext: string): string {
  const safeExt = ext.replace(/[^a-z0-9]/gi, '').slice(0, 10) || 'bin';
  return path.join(videoDir(userId), jobId + '.' + safeExt);
}

export function clipSourcePath(userId: string, jobId: string, ext: string): string {
  const safeExt = ext.replace(/[^a-z0-9]/gi, '').slice(0, 10) || 'mp4';
  return path.join(RUNTIME_ROOT, 'clips', userId, jobId + '-source.' + safeExt);
}

export function clipOutputPath(userId: string, jobId: string): string {
  return path.join(RUNTIME_ROOT, 'clips', userId, jobId + '-edit.mp4');
}

/** Ensures the parent directory of `filePath` exists before it's written to. */
export async function ensureDirFor(filePath: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
}
