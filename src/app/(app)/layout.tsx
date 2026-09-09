import type { ReactNode } from 'react';
import { getViewer } from '@/lib/data/viewer';
import { AppShell } from '@/components/layout/Shell';

/**
 * Every page under (app) renders inside the dashboard shell and shares one
 * viewer resolution, so the demo/real decision is made exactly once per request.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const viewer = await getViewer();
  return <AppShell viewer={viewer}>{children}</AppShell>;
}
