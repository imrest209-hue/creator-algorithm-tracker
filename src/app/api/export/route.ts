import { NextResponse, type NextRequest } from 'next/server';
import { getViewer } from '@/lib/data/viewer';
import { buildVideoRows } from '@/lib/analytics/rows';
import { toCsv } from '@/lib/csv/parse';

/**
 * GET /api/export?format=csv|json
 * Exports the current dataset (demo or real, whichever the viewer is looking
 * at) with every derived analytics field alongside the raw metrics.
 */
export async function GET(request: NextRequest) {
  const viewer = await getViewer();
  const format = request.nextUrl.searchParams.get('format') === 'json' ? 'json' : 'csv';
  const rows = buildVideoRows(viewer.dataset.videos, viewer.dataset.videos);

  if (format === 'json') {
    return NextResponse.json(
      { isDemo: viewer.isDemo, exportedAt: new Date().toISOString(), videos: rows },
      {
        headers: {
          'Content-Disposition': 'attachment; filename="creator-tracker-export.json"',
        },
      },
    );
  }

  const headers = [
    'id', 'title', 'platform', 'category', 'hook_type', 'source', 'published_at', 'duration_seconds',
    'hashtags', 'views', 'likes', 'comments', 'shares', 'saves', 'followers_gained', 'retention_pct',
    'avg_view_duration_seconds', 'watch_time_minutes', 'engagement_rate_pct', 'follower_conversion_pct',
    'click_through_rate_pct', 'views_per_hour', 'views_per_day', 'velocity_multiplier',
    'performance_score', 'viral_potential_score', 'viral_confidence',
  ];

  const csvRows = rows.map((r) => [
    r.id, r.title, r.platform, r.categoryName, r.hookType, r.source, r.publishedAt, r.durationSeconds,
    r.hashtags.join(' '), r.views, r.likes, r.comments, r.shares, r.saves, r.followersGained,
    r.retention, r.avgViewDurationSeconds, r.watchTimeMinutes, r.engagementRate, r.followerConversion,
    r.clickThroughRate, r.viewsPerHour, r.viewsPerDay, r.velocityMultiplier, r.score, r.viralScore,
    r.viralConfidence,
  ]);

  const csv = toCsv(headers, csvRows);
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="creator-tracker-export.csv"',
    },
  });
}
