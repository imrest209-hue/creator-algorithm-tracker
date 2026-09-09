'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Alert } from '@/components/ui/primitives';

/** Shared client form for /login and /register - only difference is the fields and endpoint. */
export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    const form = new FormData(event.currentTarget);
    const payload =
      mode === 'register'
        ? {
            email: form.get('email'),
            password: form.get('password'),
            displayName: form.get('displayName'),
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          }
        : { email: form.get('email'), password: form.get('password') };

    try {
      const response = await fetch('/api/auth/' + mode, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? 'Something went wrong.');
        setLoading(false);
        return;
      }
      router.push('/dashboard');
      router.refresh();
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
      setLoading(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <h1 className="text-lg font-semibold text-ink">
        {mode === 'login' ? 'Log in' : 'Create your account'}
      </h1>

      {error ? <Alert tone="bad">{error}</Alert> : null}

      {mode === 'register' ? (
        <div>
          <label htmlFor="displayName" className="label mb-1 block">
            Display name
          </label>
          <input
            id="displayName"
            name="displayName"
            type="text"
            required
            maxLength={80}
            className="input"
            autoComplete="name"
          />
        </div>
      ) : null}

      <div>
        <label htmlFor="email" className="label mb-1 block">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          className="input"
          autoComplete="email"
        />
      </div>

      <div>
        <label htmlFor="password" className="label mb-1 block">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={10}
          className="input"
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
        />
        {mode === 'register' ? (
          <p className="mt-1 text-xs text-ink-muted">At least 10 characters.</p>
        ) : null}
      </div>

      <button type="submit" disabled={loading} className="btn-primary w-full">
        {loading ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}
      </button>

      <p className="text-center text-xs text-ink-muted">
        {mode === 'login' ? (
          <>
            Don&apos;t have an account?{' '}
            <Link href="/register" className="link">
              Sign up
            </Link>
          </>
        ) : (
          <>
            Already have an account?{' '}
            <Link href="/login" className="link">
              Log in
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
