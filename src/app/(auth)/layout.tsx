import type { ReactNode } from 'react';
import Link from 'next/link';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <Link href="/dashboard" className="mb-6 block text-center">
          <p className="text-lg font-semibold tracking-tight text-ink">Creator Algorithm</p>
          <p className="text-xs text-ink-muted">Tracker</p>
        </Link>
        <div className="card card-pad">{children}</div>
        <p className="mt-4 text-center text-xs text-ink-muted">
          You can also{' '}
          <Link href="/dashboard" className="link">
            explore the demo dashboard
          </Link>{' '}
          without an account.
        </p>
      </div>
    </div>
  );
}
