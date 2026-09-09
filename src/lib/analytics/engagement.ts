import type { VideoRecord } from '@/lib/types';
import { deriveMetrics } from '@/lib/analytics/metrics';
import { mean, round, sum } from '@/lib/util/math';

/** Engagement analysis: likes, comments, shares, saves and follower conversion. */

export interface EngagementBreakdown {
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  totalSaves: number | null;
  totalFollowersGained: number | null;
  avgEngagementRate: number | null;
  avgLikeRate: number | null;
  avgCommentRate: number | null;
  avgShareRate: number | null;
  avgFollowerConversion: number | null;
  /** Share of total interactions, for the composition chart. */
  mix: Array<{ key: string; label: string; value: number; share: number }>;
}

export function analyseEngagement(videos: VideoRecord[], now = new Date()): EngagementBreakdown {
  const derived = videos.map((v) => deriveMetrics(v, now));
  const likes = sum(videos.map((v) => v.metrics.likes));
  const comments = sum(videos.map((v) => v.metrics.comments));
  const shares = sum(videos.map((v) => v.metrics.shares));
  const savesAvailable = videos.some((v) => v.metrics.saves !== null);
  const saves = savesAvailable ? sum(videos.map((v) => v.metrics.saves)) : null;
  const followersAvailable = videos.some((v) => v.metrics.followersGained !== null);

  const total = likes + comments + shares + (saves ?? 0);
  const entry = (key: string, label: string, value: number) => ({
    key,
    label,
    value,
    share: total > 0 ? round((value / total) * 100, 1) : 0,
  });

  const mix = [
    entry('likes', 'Likes', likes),
    entry('comments', 'Comments', comments),
    entry('shares', 'Shares', shares),
  ];
  if (saves !== null) mix.push(entry('saves', 'Saves', saves));

  return {
    totalLikes: likes,
    totalComments: comments,
    totalShares: shares,
    totalSaves: saves,
    totalFollowersGained: followersAvailable
      ? sum(videos.map((v) => v.metrics.followersGained))
      : null,
    avgEngagementRate: mean(derived.map((d) => d.engagementRate)),
    avgLikeRate: mean(derived.map((d) => d.likeRate)),
    avgCommentRate: mean(derived.map((d) => d.commentRate)),
    avgShareRate: mean(derived.map((d) => d.shareRate)),
    avgFollowerConversion: mean(derived.map((d) => d.followerConversion)),
    mix,
  };
}

export interface EngagementLeader {
  video: VideoRecord;
  engagementRate: number;
  shareRate: number | null;
  commentRate: number | null;
  followerConversion: number | null;
}

export function topEngagementVideos(
  videos: VideoRecord[],
  limit = 10,
  now = new Date(),
): EngagementLeader[] {
  return videos
    .map((video) => {
      const d = deriveMetrics(video, now);
      return {
        video,
        engagementRate: d.engagementRate ?? 0,
        shareRate: d.shareRate,
        commentRate: d.commentRate,
        followerConversion: d.followerConversion,
      };
    })
    .sort((a, b) => b.engagementRate - a.engagementRate)
    .slice(0, limit);
}
