import Link from 'next/link';
import type { Metadata } from 'next';
import { getViewer } from '@/lib/data/viewer';
import { PageHeader } from '@/components/layout/Shell';
import { Alert, Badge } from '@/components/ui/primitives';
import { IconImage, IconUpload, IconFilm, IconSparkles } from '@/components/studio/icons';

export const metadata: Metadata = { title: 'Studio' };

function StudioCard({
  href,
  icon,
  tint,
  title,
  description,
  cta,
  comingSoon,
}: {
  href?: string;
  icon: React.ReactNode;
  tint: string;
  title: string;
  description: string;
  cta?: string;
  comingSoon?: boolean;
}) {
  const inner = (
    <>
      <div className={'flex h-11 w-11 items-center justify-center rounded-xl ' + tint}>{icon}</div>
      <div className="mt-4 flex items-center gap-2">
        <h3 className="text-base font-semibold text-ink">{title}</h3>
        {comingSoon ? (
          <Badge tone="neutral">Coming soon</Badge>
        ) : null}
      </div>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{description}</p>
      {cta && href ? (
        <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-brand-300">
          {cta}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </span>
      ) : null}
    </>
  );

  const className =
    'group relative overflow-hidden rounded-xl border border-base-700 bg-base-850/80 p-5 shadow-sm transition-all ' +
    (comingSoon ? 'opacity-50' : 'hover:-translate-y-0.5 hover:border-brand-500/40 hover:shadow-lg hover:shadow-brand-500/5');

  if (href && !comingSoon) {
    return (
      <Link href={href} className={className}>
        {inner}
      </Link>
    );
  }
  return <div className={className}>{inner}</div>;
}

export default async function StudioPage() {
  const viewer = await getViewer();

  return (
    <>
      <PageHeader
        title="Studio"
        description="Make a thumbnail and publish straight to your platforms - no separate tools, no re-entering the video by hand afterward."
        showFilter={false}
      />

      {viewer.isDemo ? (
        <Alert tone="warn" title="Demo mode is read-only">
          You&apos;re viewing demo data.{' '}
          <Link href="/register" className="link">
            Create an account
          </Link>{' '}
          to use Studio with your own videos.
        </Alert>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <StudioCard
            href="/studio/thumbnails"
            icon={<IconImage className="text-brand-300" width={22} height={22} />}
            tint="bg-brand-500/15"
            title="Thumbnail editor"
            description="Base image, title text, and highlight shapes - sized exactly to your platform, with reusable templates for your next upload."
            cta="Open editor"
          />
          <StudioCard
            href="/studio/publish"
            icon={<IconUpload className="text-good" width={22} height={22} />}
            tint="bg-good/15"
            title="Publish to YouTube"
            description="Upload a finished video and thumbnail, set the title/description, and it lands in your tracker automatically."
            cta="Publish a video"
          />
          <StudioCard
            href="/studio/clips"
            icon={<IconFilm className="text-warn" width={22} height={22} />}
            tint="bg-warn/15"
            title="Clip editor"
            description="Trim a gameplay clip, reframe it for Shorts, burn in captions, adjust audio - then send it straight to publish."
            cta="Edit a clip"
          />
          <StudioCard
            icon={<IconSparkles className="text-ink-muted" width={22} height={22} />}
            tint="bg-base-700"
            title="Post to TikTok"
            description="Requires TikTok's Content Posting API approval, separate from the current login access."
            comingSoon
          />
        </div>
      )}
    </>
  );
}
