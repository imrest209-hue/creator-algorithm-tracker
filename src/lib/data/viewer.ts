import { cookies } from 'next/headers';
import type { Dataset } from '@/lib/types';
import { getCurrentUser, type SessionUser } from '@/lib/auth/session';
import { loadDataset } from '@/lib/data/provider';
import { buildDemoDataset } from '@/lib/demo/generator';
import { isDatabaseConfigured } from '@/lib/db/prisma';
import { logger } from '@/lib/util/logger';

/**
 * Resolves what the current viewer should see.
 *
 * Signed-out visitors (and anyone who has explicitly switched demo mode on) get
 * the synthetic demo catalogue. A signed-in user gets their own rows. There is
 * no third state where the two are combined.
 */

export const DEMO_COOKIE = 'cat_demo';

export interface Viewer {
  user: SessionUser | null;
  dataset: Dataset;
  /** True when the dataset is synthetic. */
  isDemo: boolean;
  /** True when a signed-in user is deliberately previewing demo data. */
  demoPreview: boolean;
  databaseConfigured: boolean;
  /** Set when real data was requested but could not be loaded. */
  loadError: string | null;
}

export async function getViewer(): Promise<Viewer> {
  const databaseConfigured = isDatabaseConfigured();
  const user = await getCurrentUser();
  const store = await cookies();
  const demoRequested = store.get(DEMO_COOKIE)?.value === '1';

  if (!user || demoRequested) {
    return {
      user,
      dataset: buildDemoDataset(),
      isDemo: true,
      demoPreview: Boolean(user) && demoRequested,
      databaseConfigured,
      loadError: null,
    };
  }

  try {
    const dataset = await loadDataset({ kind: 'user', userId: user.id, timezone: user.timezone });
    return {
      user,
      dataset,
      isDemo: false,
      demoPreview: false,
      databaseConfigured,
      loadError: null,
    };
  } catch (error) {
    // Never fall back to demo data silently for a signed-in user - that would
    // present synthetic numbers as if they were their own.
    logger.error('viewer.dataset_load_failed', { error, userId: user.id });
    return {
      user,
      dataset: {
        isDemo: false,
        ownerLabel: user.displayName,
        timezone: user.timezone,
        videos: [],
        categories: [],
        connectedAccounts: [],
      },
      isDemo: false,
      demoPreview: false,
      databaseConfigured,
      loadError:
        error instanceof Error ? error.message : 'Could not load your account data from the database.',
    };
  }
}
