import Link from 'next/link';
import type { Metadata } from 'next';
import { NOTIFICATION_TYPE_LABELS, NOTIFICATION_TYPES, DEFAULT_NOTIFICATION_SETTINGS } from '@/lib/types';
import { getViewer } from '@/lib/data/viewer';
import { integrationStatuses } from '@/lib/integrations/registry';
import { getNotificationSettings } from '@/lib/data/notification-settings';
import { isDatabaseConfigured } from '@/lib/db/prisma';
import { isEncryptionConfigured } from '@/lib/auth/crypto';
import { formatDateTime } from '@/lib/util/format';
import { PageHeader } from '@/components/layout/Shell';
import { Alert, Badge, Card, EmptyState, SectionHeading } from '@/components/ui/primitives';
import { PlatformBadge } from '@/components/ui/metrics';
import { DisconnectButton } from '@/components/settings/DisconnectButton';
import { NotificationToggle } from '@/components/settings/NotificationToggle';

export const metadata: Metadata = { title: 'Settings' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function SettingsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const viewer = await getViewer();
  const statuses = integrationStatuses();
  const notificationSettings = viewer.user
    ? await getNotificationSettings(viewer.user.id)
    : DEFAULT_NOTIFICATION_SETTINGS;

  const errorMsg = firstParam(params.error);
  const warningMsg = firstParam(params.warning);
  const connected = firstParam(params.connected);
  const imported = firstParam(params.imported);

  return (
    <>
      <PageHeader title="Settings" showFilter={false} />

      {errorMsg ? (
        <Alert tone="bad" title="Connection failed" className="mb-4">
          {errorMsg}
        </Alert>
      ) : null}
      {connected ? (
        <Alert tone="good" title="Connected" className="mb-4">
          Connected {connected} and imported {imported ?? '0'} videos.
        </Alert>
      ) : null}
      {warningMsg ? (
        <Alert tone="warn" title="Partial data" className="mb-4">
          {warningMsg}
        </Alert>
      ) : null}

      {!viewer.user ? (
        <Alert tone="info" className="mb-4">
          <Link href="/register" className="link font-medium">
            Create an account
          </Link>{' '}
          to connect YouTube or TikTok, import your own CSV data, and save settings.
        </Alert>
      ) : null}

      <Card className="mb-4">
        <SectionHeading
          title="Connected accounts"
          description="OAuth only. Platform passwords are never requested or stored."
        />
        {!isDatabaseConfigured() ? (
          <Alert tone="warn">
            No database is configured, so accounts cannot be connected yet. See the README for
            PostgreSQL setup.
          </Alert>
        ) : viewer.dataset.connectedAccounts.length === 0 ? (
          <EmptyState title="No accounts connected" description="Connect YouTube or TikTok below." />
        ) : (
          <ul className="space-y-2">
            {viewer.dataset.connectedAccounts.map((account) => (
              <li
                key={account.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-base-800 bg-base-900/50 px-3 py-2.5"
              >
                <div className="flex items-center gap-2">
                  <PlatformBadge platform={account.platform} />
                  <div>
                    <p className="text-sm font-medium">{account.accountName}</p>
                    <p className="text-xs text-ink-muted">
                      Connected {formatDateTime(account.connectedAt)}
                      {account.lastSyncedAt ? ' · last synced ' + formatDateTime(account.lastSyncedAt) : ''}
                    </p>
                  </div>
                  <Badge tone={account.status === 'CONNECTED' ? 'good' : 'bad'}>{account.status}</Badge>
                </div>
                <DisconnectButton accountId={account.id} />
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {statuses.map((status) => (
            <div key={status.platform} className="rounded-lg border border-base-800 bg-base-900/50 p-3">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-sm font-medium">{status.label}</span>
                <Badge tone={status.configured ? 'good' : status.connectable ? 'neutral' : 'warn'}>
                  {status.configured
                    ? 'Configured'
                    : status.connectable
                      ? 'Not configured'
                      : 'API not yet available'}
                </Badge>
              </div>
              {!status.connectable ? (
                <p className="text-xs text-ink-muted">
                  No live sync yet —{' '}
                  <a href="/import" className="link">
                    import a CSV
                  </a>{' '}
                  or{' '}
                  <a href="/videos/new" className="link">
                    add videos manually
                  </a>
                  .
                </p>
              ) : status.configured && viewer.user ? (
                <a
                  href={'/api/connect/' + status.platform.toLowerCase().replace('_shorts', '')}
                  className="btn-primary mt-1 px-2 py-1 text-xs"
                >
                  Connect {status.label}
                </a>
              ) : (
                <p className="text-xs text-ink-muted">
                  Missing env vars: {status.missingEnvVars.join(', ') || 'none — sign in to connect'}
                </p>
              )}
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-ink-muted">Limitations</summary>
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-ink-muted">
                  {status.limitations.map((l, i) => (
                    <li key={i}>{l}</li>
                  ))}
                </ul>
              </details>
            </div>
          ))}
        </div>
      </Card>

      <Card className="mb-4">
        <SectionHeading title="Categories" description="Custom categories used by the auto-classifier and manual overrides." />
        <div className="flex flex-wrap gap-2">
          {viewer.dataset.categories.map((cat) => (
            <Badge key={cat.slug} tone={cat.isCustom ? 'brand' : 'neutral'}>
              {cat.name}
            </Badge>
          ))}
        </div>
        <p className="mt-2 text-xs text-ink-muted">
          Categories are assigned automatically from title, caption, description and hashtags, and
          can be overridden per video from the video detail page.
        </p>
      </Card>

      <Card className="mb-4">
        <SectionHeading title="Notifications" description="Configure which alerts are generated." />
        {!viewer.user ? (
          <p className="text-sm text-ink-muted">Sign in to configure notifications.</p>
        ) : (
          <ul className="divide-y divide-base-800">
            {NOTIFICATION_TYPES.map((type) => (
              <li key={type} className="flex items-center justify-between gap-3 py-2">
                <span className="text-sm">{NOTIFICATION_TYPE_LABELS[type]}</span>
                <NotificationToggle type={type} initialEnabled={notificationSettings[type]} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <SectionHeading title="Security" />
        <ul className="space-y-1.5 text-sm text-ink-muted">
          <li>Database configured: <StatusText ok={isDatabaseConfigured()} /></li>
          <li>Token encryption configured: <StatusText ok={isEncryptionConfigured()} /></li>
          <li>Session cookie: httpOnly, SameSite=Lax{process.env.NODE_ENV === 'production' ? ', Secure' : ''}</li>
        </ul>
      </Card>
    </>
  );
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function StatusText({ ok }: { ok: boolean }) {
  return <span className={ok ? 'text-good' : 'text-bad'}>{ok ? 'Yes' : 'No'}</span>;
}
