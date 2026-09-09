import type { VideoRecord } from '@/lib/types';
import { hoursSince } from '@/lib/util/date';
import { safeDivide } from '@/lib/util/math';

/**
 * Metrics derived from stored raw counts.
 *
 * Every field is either a real computed number or `null`. `null` propagates all
 * the way to the UI as "Unavailable" - it is never replaced by a placeholder
 * number, because a fabricated analytics value is worse than a missing one.
 */
export interface DerivedMetrics {
  /** (likes + comments + shares + saves) / views, as a percentage. */
  engagementRate: number | null;
  likeRate: number | null;
  commentRate: number | null;
  shareRate: number | null;
  /** followersGained / views, as a percentage. */
  followerConversion: number | null;
  /** averagePercentageViewed, surfaced under the name the UI uses. */
  retention: number | null;
  viewsPerHour: number | null;
  viewsPerDay: number | null;
  hoursSincePublish: number;
  clickThroughRate: number | null;
  averageViewDurationSeconds: number | null;
  watchTimeMinutes: number | null;
}

const MIN_HOURS = 1;

export function deriveMetrics(video: VideoRecord, now = new Date()): DerivedMetrics {
  const m = video.metrics;
  const views = m.views;
  const interactions = m.likes + m.comments + m.shares + (m.saves ?? 0);
  const age = Math.max(hoursSince(video.publishedAt, now), MIN_HOURS);

  const pct = (numerator: number | null) => {
    const r = safeDivide(numerator, views);
    return r === null ? null : r * 100;
  };

  return {
    engagementRate: pct(interactions),
    likeRate: pct(m.likes),
    commentRate: pct(m.comments),
    shareRate: pct(m.shares),
    followerConversion: m.followersGained === null ? null : pct(m.followersGained),
    retention: m.averagePercentageViewed,
    viewsPerHour: safeDivide(views, age),
    viewsPerDay: safeDivide(views, age / 24),
    hoursSincePublish: age,
    clickThroughRate: m.clickThroughRate,
    averageViewDurationSeconds: m.averageViewDurationSeconds,
    watchTimeMinutes: m.watchTimeMinutes,
  };
}

/** Views recorded at a velocity milestone, or null if no snapshot exists yet. */
export function viewsAtMinute(video: VideoRecord, minutes: number): number | null {
  const snap = video.snapshots.find((s) => s.minutesAfterPublish === minutes);
  return snap ? snap.views : null;
}

/**
 * Views per hour over the first `minutes` of a video's life. This is the
 * "early velocity" figure the viral-potential score and alerts compare against.
 */
export function earlyVelocity(video: VideoRecord, minutes: number): number | null {
  const views = viewsAtMinute(video, minutes);
  if (views === null) return null;
  return views / (minutes / 60);
}

/** The earliest milestone at or before `preferred` that actually has data. */
export function bestAvailableMilestone(
  video: VideoRecord,
  candidates: readonly number[],
): number | null {
  const available = candidates.filter((m) => viewsAtMinute(video, m) !== null);
  if (available.length === 0) return null;
  return available[available.length - 1];
}

export function isShortForm(video: VideoRecord): boolean {
  // Twitch and Kick "videos" in this app are clips, not full VODs - clips are
  // inherently short-form, so they group with Shorts/TikTok everywhere length
  // buckets and retention-by-length comparisons are built.
  return (
    video.platform === 'TIKTOK' ||
    video.platform === 'YOUTUBE_SHORTS' ||
    video.platform === 'TWITCH' ||
    video.platform === 'KICK'
  );
}
