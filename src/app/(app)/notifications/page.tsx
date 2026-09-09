import Link from 'next/link';
import type { Metadata } from 'next';
import { NOTIFICATION_TYPE_LABELS, DEFAULT_NOTIFICATION_SETTINGS } from '@/lib/types';
import { getPageContext, type SearchParams } from '@/lib/data/page';
import { generateNotifications } from '@/lib/analytics/notifications';
import { getNotificationSettings } from '@/lib/data/notification-settings';
import { formatRelative } from '@/lib/util/format';
import { PageHeader } from '@/components/layout/Shell';
import { Badge, Card, EmptyState, SectionHeading } from '@/components/ui/primitives';

export const metadata: Metadata = { title: 'Notifications' };

export default async function NotificationsPage({ searchParams }: { searchParams: SearchParams }) {
  const { viewer, filter, set, now } = await getPageContext(searchParams);
  const settings = viewer.user
    ? await getNotificationSettings(viewer.user.id)
    : DEFAULT_NOTIFICATION_SETTINGS;

  const notifications = generateNotifications({
    videos: set.platformVideos,
    timezone: viewer.dataset.timezone,
    settings,
    now,
    windowDays: 60,
  });

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Rule-based alerts computed from your stored metrics: rapid growth, unusual retention, milestones, strong topics and recommended posting opportunities."
        filter={filter}
        actions={
          <Link href="/settings" className="btn-ghost">
            Configure types →
          </Link>
        }
      />

      <Card>
        {notifications.length === 0 ? (
          <EmptyState
            title="No notifications right now"
            description="Alerts appear here as your videos hit milestones, gain unusual traction, or when a topic pulls ahead of your average."
          />
        ) : (
          <ul className="divide-y divide-base-800">
            {notifications.map((n) => (
              <li key={n.id} className="flex items-start justify-between gap-3 py-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge tone={n.severity === 'GOOD' ? 'good' : n.severity === 'WARN' ? 'warn' : 'info'}>
                      {NOTIFICATION_TYPE_LABELS[n.type]}
                    </Badge>
                    <span className="text-xs text-ink-muted">{formatRelative(n.createdAt, now)}</span>
                  </div>
                  <p className="mt-1 text-sm font-medium text-ink">{n.title}</p>
                  <p className="text-sm text-ink-muted">{n.body}</p>
                </div>
                {n.videoId ? (
                  <Link href={'/videos/' + n.videoId} className="whitespace-nowrap text-xs link">
                    View →
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
