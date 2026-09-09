import Link from 'next/link';
import type { Metadata } from 'next';
import { getPageContext, type SearchParams } from '@/lib/data/page';
import { buildVideoRows } from '@/lib/analytics/rows';
import { filterToQuery } from '@/lib/analytics/filter';
import { formatRangeLabel } from '@/lib/util/date';
import { PageHeader } from '@/components/layout/Shell';
import { Card, EmptyState } from '@/components/ui/primitives';
import { VideoTable } from '@/components/videos/VideoTable';

export const metadata: Metadata = { title: 'Videos' };

export default async function VideosPage({ searchParams }: { searchParams: SearchParams }) {
  const { viewer, filter, set, now } = await getPageContext(searchParams);
  const rows = buildVideoRows(set.videos, set.platformVideos, now);
  const query = filterToQuery(filter);

  return (
    <>
      <PageHeader
        title="Video tracker"
        description={
          'Every tracked video with its measured metrics and transparent performance score. ' +
          'Select two or more rows to compare them side by side.'
        }
        filter={filter}
        actions={
          <div className="flex gap-2">
            <Link href="/import" className="btn-ghost">
              Import CSV
            </Link>
            <Link href="/videos/new" className="btn-primary">
              Add video
            </Link>
          </div>
        }
      />

      <Card>
        {set.videos.length === 0 ? (
          <EmptyState
            icon="▶"
            title="No videos in this range"
            description={
              viewer.dataset.videos.length > 0
                ? 'You have ' +
                  viewer.dataset.videos.length +
                  ' tracked videos, but none published in this range (' +
                  formatRangeLabel(filter, set.range) +
                  ').'
                : 'Connect an account, import a CSV, or add a video manually to get started.'
            }
            action={
              <div className="mt-2 flex gap-2">
                <Link href="/videos/new" className="btn-primary">
                  Add a video manually
                </Link>
                <Link href="/import" className="btn-ghost">
                  Import CSV
                </Link>
              </div>
            }
          />
        ) : (
          <VideoTable
            rows={rows}
            timezone={viewer.dataset.timezone}
            selectable
            compareQuery={query}
          />
        )}
      </Card>
    </>
  );
}
