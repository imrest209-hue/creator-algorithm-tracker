'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import clsx from 'clsx';

interface NavItem {
  href: string;
  label: string;
  icon: string;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const NAV: NavGroup[] = [
  {
    title: 'Overview',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: '◎' },
      { href: '/analytics/overview', label: 'Account overview', icon: '▤' },
    ],
  },
  {
    title: 'Library',
    items: [
      { href: '/videos', label: 'Videos', icon: '▶' },
      { href: '/compare', label: 'Compare', icon: '⇄' },
      { href: '/analytics/velocity', label: 'Velocity', icon: '⚡' },
    ],
  },
  {
    title: 'Analytics',
    items: [
      { href: '/analytics/content', label: 'Content', icon: '◧' },
      { href: '/analytics/timing', label: 'Timing', icon: '◷' },
      { href: '/analytics/engagement', label: 'Engagement', icon: '♥' },
      { href: '/analytics/retention', label: 'Retention', icon: '◔' },
      { href: '/analytics/growth', label: 'Growth', icon: '↗' },
      { href: '/analytics/trends', label: 'Trends', icon: '∿' },
      { href: '/hooks', label: 'Hooks', icon: '❝' },
    ],
  },
  {
    title: 'Plan',
    items: [
      { href: '/ideas', label: 'Ideas & analyst', icon: '✦' },
      { href: '/competitors', label: 'Reference creators', icon: '◈' },
      { href: '/notifications', label: 'Notifications', icon: '🔔' },
    ],
  },
  {
    title: 'Data',
    items: [
      { href: '/import', label: 'CSV import', icon: '⇪' },
      { href: '/export', label: 'Export', icon: '⇩' },
      { href: '/settings', label: 'Settings', icon: '⚙' },
    ],
  },
];

export function Sidebar({ ownerLabel, isDemo }: { ownerLabel: string; isDemo: boolean }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);

  // Carry the active filter across navigation so a 7-day view stays 7-day.
  const query = searchParams.toString();
  const withQuery = (href: string) => (query ? href + '?' + query : href);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Toggle navigation"
        className="btn-ghost fixed left-3 top-3 z-50 lg:hidden"
      >
        ☰
      </button>

      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-base-700 bg-base-900 transition-transform lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="border-b border-base-700 px-4 py-4 pl-14 lg:pl-4">
          <Link href={withQuery('/dashboard')} className="block">
            <p className="text-sm font-semibold tracking-tight text-ink">Creator Algorithm</p>
            <p className="text-xs text-ink-muted">Tracker</p>
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-3">
          {NAV.map((group) => (
            <div key={group.title} className="mb-4">
              <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-base-600">
                {group.title}
              </p>
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const active =
                    pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
                  return (
                    <li key={item.href}>
                      <Link
                        href={withQuery(item.href)}
                        onClick={() => setOpen(false)}
                        className={clsx(
                          'flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors',
                          active
                            ? 'bg-brand-500/15 font-medium text-brand-300'
                            : 'text-ink-muted hover:bg-base-800 hover:text-ink',
                        )}
                      >
                        <span aria-hidden className="w-4 text-center text-xs">
                          {item.icon}
                        </span>
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-base-700 px-4 py-3">
          <p className="truncate text-xs font-medium text-ink">{ownerLabel}</p>
          <p className="text-[11px] text-ink-muted">{isDemo ? 'Demo dataset' : 'Live account data'}</p>
        </div>
      </aside>

      {open ? (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
        />
      ) : null}
    </>
  );
}
