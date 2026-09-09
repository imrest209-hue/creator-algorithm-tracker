import { PrismaClient } from '@prisma/client';

/**
 * Prisma client singleton.
 *
 * Next.js dev mode re-evaluates modules on every hot reload, which would create
 * a new connection pool each time; caching on globalThis avoids exhausting the
 * database's connection limit.
 */

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

/**
 * Whether a database is configured at all. The app is designed to run in demo
 * mode without one, so callers check this before touching Prisma.
 */
export function isDatabaseConfigured(): boolean {
  const url = process.env.DATABASE_URL;
  return typeof url === 'string' && url.length > 0 && !url.includes('REPLACE_ME');
}

/** Cheap connectivity probe used by the health endpoint and setup screens. */
export async function checkDatabaseConnection(): Promise<{ ok: boolean; error: string | null }> {
  if (!isDatabaseConfigured()) {
    return { ok: false, error: 'DATABASE_URL is not set.' };
  }
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true, error: null };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Unknown database error.' };
  }
}
