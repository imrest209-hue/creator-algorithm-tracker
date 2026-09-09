import type { DataSource, HookType, Platform, VideoRecord } from '@/lib/types';
import { deriveMetrics } from '@/lib/analytics/metrics';
import { computePerformanceScore } from '@/lib/analytics/score';
import { computeViralPotential } from '@/lib/analytics/viral';
import { analyseVelocity } from '@/lib/analytics/velocity';
import { round } from '@/lib/util/math';

/** Shared across performance and viral scores - see score.ts / viral.ts. */
export type ScoreConfidence = 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';

/**
 * Flat, serialisable view model for tables.
 *
 * Server components compute these once and hand them to client components, so
 * the scoring engine never has to run in the browser and nothing but plain JSON
 * crosses the boundary.
 */
export interface VideoRow {
  id: string;
  title: string;
  platform: Platform;
  categorySlug: string;
  categoryName: string;
  hookType: HookType;
  hookText: string | null;
  source: DataSource;
  publishedAt: string;
  durationSeconds: number;
  hashtags: string[];
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number | null;
  followersGained: number | null;
  retention: number | null;
  avgViewDurationSeconds: number | null;
  watchTimeMinutes: number | null;
  engagementRate: number | null;
  followerConversion: number | null;
  clickThroughRate: number | null;
  viewsPerHour: number | null;
  viewsPerDay: number | null;
  velocityMultiplier: number | null;
  velocityLabel: string | null;
  score: number;
  scoreConfidence: ScoreConfidence;
  viralScore: number;
  viralConfidence: ScoreConfidence;
}

export function buildVideoRow(
  video: VideoRecord,
  baselineSet: VideoRecord[],
  now = new Date(),
): VideoRow {
  const d = deriveMetrics(video, now);
  const score = computePerformanceScore(video, baselineSet, now);
  const viral = computeViralPotential(video, baselineSet, now);
  const velocity = analyseVelocity(video, baselineSet, now);

  return {
    id: video.id,
    title: video.title,
    platform: video.platform,
    categorySlug: video.categorySlug,
    categoryName: video.categoryName,
    hookType: video.hookType,
    hookText: video.hookText,
    source: video.source,
    publishedAt: video.publishedAt,
    durationSeconds: video.durationSeconds,
    hashtags: video.hashtags,
    views: video.metrics.views,
    likes: video.metrics.likes,
    comments: video.metrics.comments,
    shares: video.metrics.shares,
    saves: video.metrics.saves,
    followersGained: video.metrics.followersGained,
    retention: video.metrics.averagePercentageViewed,
    avgViewDurationSeconds: video.metrics.averageViewDurationSeconds,
    watchTimeMinutes: video.metrics.watchTimeMinutes,
    engagementRate: d.engagementRate === null ? null : round(d.engagementRate, 2),
    followerConversion: d.followerConversion === null ? null : round(d.followerConversion, 3),
    clickThroughRate: d.clickThroughRate,
    viewsPerHour: d.viewsPerHour === null ? null : round(d.viewsPerHour, 1),
    viewsPerDay: d.viewsPerDay === null ? null : round(d.viewsPerDay, 1),
    velocityMultiplier:
      velocity.headlineMultiplier === null ? null : round(velocity.headlineMultiplier, 2),
    velocityLabel: velocity.headlineLabel,
    score: score.score,
    scoreConfidence: score.confidence,
    viralScore: viral.score,
    viralConfidence: viral.confidence,
  };
}

export function buildVideoRows(
  videos: VideoRecord[],
  baselineSet: VideoRecord[],
  now = new Date(),
): VideoRow[] {
  return videos.map((v) => buildVideoRow(v, baselineSet, now));
}
