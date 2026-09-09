import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-sm font-semibold uppercase tracking-wide text-ink-muted">404</p>
      <h1 className="text-xl font-semibold">That page does not exist.</h1>
      <Link href="/dashboard" className="btn-primary mt-2">
        Back to dashboard
      </Link>
    </div>
  );
}
