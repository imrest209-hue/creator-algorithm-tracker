import Link from 'next/link';
import type { Metadata } from 'next';
import { getPageContext, type SearchParams } from '@/lib/data/page';
import { generateContentIdeas, IDEA_KIND_LABELS } from '@/lib/analytics/recommendations';
import { filterToQuery } from '@/lib/analytics/filter';
import { formatCompact } from '@/lib/util/format';
import { PageHeader } from '@/components/layout/Shell';
import { Badge, Card, EmptyState, SectionHeading } from '@/components/ui/primitives';
import { AnalystPanel } from '@/components/ideas/AnalystPanel';

export const metadata: Metadata = { title: 'Ideas & analyst' };

export default async function IdeasPage({ searchParams }: { searchParams: SearchParams }) {
  const { viewer, filter, set, now } = await getPageContext(searchParams);
  const query = filterToQuery(filter);
  const ideas = generateContentIdeas(
    { videos: set.platformVideos, timezone: viewer.dataset.timezone, now },
    12,
  );

  return (
    <>
      <PageHeader
        title="Content ideas & analyst"
        description="Ask questions about your data, and get new video ideas generated from your own best-performing videos. Nothing here is ever posted automatically."
        filter={filter}
      />

      <div className="mb-4">
        <AnalystPanel query={query} />
      </div>

      <Card>
        <SectionHeading
          title="Generated content ideas"
          description="Follow-ups, variations and new concepts drawn from your top-performing videos and topics."
          action={<Badge tone="warn">AI-GENERATED</Badge>}
        />
        {ideas.length === 0 ? (
          <EmptyState
            title="Not enough data yet"
            description="Add or import more videos so the recommendation engine has performers to learn from."
          />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {ideas.map((idea) => (
              <div key={idea.id} className="rounded-lg border border-base-800 bg-base-900/50 p-3">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <Badge tone="brand">{IDEA_KIND_LABELS[idea.kind]}</Badge>
                  <Badge tone={idea.confidence === 'HIGH' ? 'good' : idea.confidence === 'MEDIUM' ? 'info' : 'neutral'}>
                    {idea.confidence.charAt(0) + idea.confidence.slice(1).toLowerCase()} confidence
                  </Badge>
                </div>
                <p className="text-sm font-semibold text-ink">{idea.title}</p>
                <p className="mt-1 text-xs italic text-ink-muted">Hook: &ldquo;{idea.hook}&rdquo;</p>
                <p className="mt-1.5 text-xs text-ink-muted">{idea.caption}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {idea.hashtags.map((tag) => (
                    <Badge key={tag} tone="neutral">
                      {tag}
                    </Badge>
                  ))}
                  {idea.suggestedLengthSeconds ? (
                    <Badge tone="neutral">~{idea.suggestedLengthSeconds}s</Badge>
                  ) : null}
                </div>
                <p className="mt-2 border-t border-base-800 pt-2 text-xs text-ink-muted">
                  {idea.evidence}
                </p>
                {idea.sourceVideoId ? (
                  <Link
                    href={'/videos/' + idea.sourceVideoId + '?' + query}
                    className="mt-1 inline-block text-xs link"
                  >
                    View source video →
                  </Link>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Card>

      <p className="mt-3 text-xs text-ink-muted">
        {set.platformVideos.length} videos considered ·{' '}
        {formatCompact(set.platformVideos.reduce((acc, v) => acc + v.metrics.views, 0))} total views
        in the underlying catalogue. Ideas are drafts for you to edit - nothing is published
        automatically.
      </p>
    </>
  );
}
