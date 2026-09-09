import type { FilterState } from '@/lib/types';
import { applyFilter, parseFilter, type FilteredSet } from '@/lib/analytics/filter';
import { getViewer, type Viewer } from '@/lib/data/viewer';

/** Search params as delivered by Next.js 15 (async). */
export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export interface PageContext {
  viewer: Viewer;
  filter: FilterState;
  set: FilteredSet;
  now: Date;
}

/**
 * One call that every dashboard page starts with: resolve the viewer, parse the
 * URL filter and apply it. Keeps filter semantics identical across pages.
 */
export async function getPageContext(searchParams: SearchParams): Promise<PageContext> {
  const [viewer, params] = await Promise.all([getViewer(), searchParams]);
  const filter = parseFilter(params);
  const now = new Date();
  return { viewer, filter, set: applyFilter(viewer.dataset.videos, filter, now), now };
}
