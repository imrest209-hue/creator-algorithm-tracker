import {
  DEFAULT_NOTIFICATION_SETTINGS,
  type NotificationRecord,
  type NotificationSettings,
  type VideoRecord,
} from '@/lib/types';
import { analyseCategories, categoryVerdict } from '@/lib/analytics/content';
import { baselineForVideo } from '@/lib/analytics/baselines';
import { deriveMetrics } from '@/lib/analytics/metrics';
import { computePerformanceScore } from '@/lib/analytics/score';
import { analyseTiming, describeBestWindow } from '@/lib/analytics/timing';
import { analyseVelocity } from '@/lib/analytics/velocity';
import { hoursSince } from '@/lib/util/date';
import { formatCompact } from '@/lib/util/format';
import { round, sum } from '@/lib/util/math';

/**
 * NOTIFICATION RULES
 * ---------------------------------------------------------------------------
 * Derived deterministically from stored metrics so the same data always
 * produces the same alerts. Each rule respects the user's per-type toggle.
 */

const VIEW_MILESTONES = [1_000, 10_000, 100_000, 1_000_000, 10_000_000];

export interface NotificationInput {
  videos: VideoRecord[];
  timezone: string;
  settings?: NotificationSettings;
  now?: Date;
  /** Only consider videos published within this many days. */
  windowDays?: number;
}

export function generateNotifications(input: NotificationInput): NotificationRecord[] {
  const now = input.now ?? new Date();
  const settings = input.settings ?? DEFAULT_NOTIFICATION_SETTINGS;
  const windowDays = input.windowDays ?? 30;
  const videos = input.videos;
  const recent = videos.filter((v) => hoursSince(v.publishedAt, now) <= windowDays * 24);
  const out: NotificationRecord[] = [];

  const add = (
    n: Omit<NotificationRecord, 'id' | 'read' | 'createdAt'> & { createdAt?: string },
  ) => {
    if (!settings[n.type]) return;
    out.push({
      ...n,
      id: n.type + ':' + (n.videoId ?? 'account') + ':' + out.length,
      createdAt: n.createdAt ?? now.toISOString(),
      read: false,
    });
  };

  for (const video of recent) {
    const velocity = analyseVelocity(video, videos, now);
    const derived = deriveMetrics(video, now);
    const baseline = baselineForVideo(video, videos, now);
    const score = computePerformanceScore(video, videos, now);

    const multiplier = velocity.headlineMultiplier;
    if (multiplier !== null && multiplier >= 2.5) {
      add({
        type: 'VIRAL_GROWTH',
        severity: 'GOOD',
        title: 'Rapid growth: ' + video.title,
        body:
          'Gaining views ' +
          round(multiplier, 1) +
          'x faster than your average at the ' +
          (velocity.headlineLabel ?? 'latest') +
          ' mark (' +
          formatCompact(video.metrics.views) +
          ' views so far).',
        videoId: video.id,
        createdAt: video.publishedAt,
      });
    }

    if (
      derived.retention !== null &&
      baseline.meanRetention !== null &&
      derived.retention >= baseline.meanRetention * 1.25
    ) {
      add({
        type: 'HIGH_RETENTION',
        severity: 'GOOD',
        title: 'Unusually high retention: ' + video.title,
        body:
          round(derived.retention, 1) +
          '% average percentage viewed vs your ' +
          round(baseline.meanRetention, 1) +
          '% average - a ' +
          Math.round((derived.retention / baseline.meanRetention - 1) * 100) +
          '% lift.',
        videoId: video.id,
        createdAt: video.publishedAt,
      });
    }

    if (score.confidence !== 'NONE' && score.score <= 25) {
      add({
        type: 'LOW_PERFORMANCE',
        severity: 'WARN',
        title: 'Underperforming: ' + video.title,
        body:
          'Performance score ' +
          score.score +
          '/100. ' +
          (score.reasons[0] ?? 'Below your account average on most measured components.'),
        videoId: video.id,
        createdAt: video.publishedAt,
      });
    }

    const crossed = VIEW_MILESTONES.filter((m) => video.metrics.views >= m).pop();
    if (crossed) {
      add({
        type: 'MILESTONE',
        severity: 'INFO',
        title: formatCompact(crossed) + ' views: ' + video.title,
        body:
          'This video has passed ' +
          formatCompact(crossed) +
          ' views (' +
          formatCompact(video.metrics.views) +
          ' total).',
        videoId: video.id,
        createdAt: video.publishedAt,
      });
    }
  }

  const totalViews = sum(videos.map((v) => v.metrics.views));
  const accountMilestone = VIEW_MILESTONES.filter((m) => totalViews >= m).pop();
  if (accountMilestone && accountMilestone >= 100_000) {
    add({
      type: 'MILESTONE',
      severity: 'INFO',
      title: 'Account milestone: ' + formatCompact(accountMilestone) + ' lifetime views',
      body: 'Your tracked library has passed ' + formatCompact(accountMilestone) + ' total views.',
      videoId: null,
    });
  }

  const verdict = categoryVerdict(analyseCategories(videos, now));
  for (const cat of verdict.makeMore.slice(0, 2)) {
    add({
      type: 'STRONG_TOPIC',
      severity: 'GOOD',
      title: 'Strong topic: ' + cat.name,
      body:
        cat.name +
        ' averages ' +
        (cat.avgPerformanceScore ?? 0) +
        '/100 across ' +
        cat.videoCount +
        ' videos - ' +
        Math.abs(cat.scoreVsAccount ?? 0) +
        ' points above your account average.',
      videoId: null,
    });
  }

  const timing = analyseTiming(videos, input.timezone, now);
  if (timing.hasEnoughData && timing.bestWindows.length > 0) {
    add({
      type: 'POSTING_OPPORTUNITY',
      severity: 'INFO',
      title: 'Recommended posting window',
      body: describeBestWindow(timing),
      videoId: null,
    });
  }

  return out.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}
