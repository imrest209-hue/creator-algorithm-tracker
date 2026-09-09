import type { ConnectedAccount } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { decryptSecret, encryptSecret } from '@/lib/auth/crypto';
import { ApiError } from '@/lib/integrations/http';
import { getIntegration } from '@/lib/integrations/registry';
import type { OAuthTokens, PlatformIntegration } from '@/lib/integrations/types';
import { upsertVideo } from '@/lib/videos/persist';

/** Shared by first connection and subsequent refreshes. Mark success only after saving. */
export async function importAccountVideos(
  account: Pick<ConnectedAccount, 'id' | 'userId' | 'platform' | 'externalId'>,
  integration: PlatformIntegration,
  tokens: OAuthTokens,
) {
  try {
    const sync = await integration.fetchVideos(tokens, { limit: 500 });
    if (sync.externalId !== account.externalId) throw new Error('The platform returned a different account.');
    const source = account.platform === 'TIKTOK' ? 'TIKTOK_API'
      : account.platform === 'TWITCH' ? 'TWITCH_API' : 'YOUTUBE_API';
    for (const video of sync.videos) {
      await upsertVideo(account.userId, { ...video, ...video.metrics }, source, account.id);
    }
    await prisma.connectedAccount.update({
      where: { id: account.id },
      data: { lastSyncedAt: new Date(), status: 'CONNECTED', statusMessage: sync.warnings.join(' ') || null },
    });
    return { imported: sync.videos.length, warnings: sync.warnings };
  } catch (error) {
    await recordSyncFailure(account.id, error);
    throw error;
  }
}

async function recordSyncFailure(accountId: string, error: unknown) {
  await prisma.connectedAccount.update({
    where: { id: accountId },
    data: {
      status: error instanceof ApiError && error.kind === 'AUTH' ? 'EXPIRED' : 'ERROR',
      statusMessage: error instanceof ApiError ? error.userMessage : 'Sync did not finish. Retry to update the remaining videos.',
    },
  });
}

// Coalesce repeated clicks for one account, including refresh-token rotation.
const activeSyncs = new Map<string, Promise<{ imported: number; warnings: string[] }>>();

export function syncConnectedAccount(account: ConnectedAccount) {
  const pending = activeSyncs.get(account.id);
  if (pending) return pending;
  const work = runSync(account).finally(() => activeSyncs.delete(account.id));
  activeSyncs.set(account.id, work);
  return work;
}

/**
 * Decrypts an account's stored tokens and refreshes them first if they're
 * about to expire, persisting the rotated credentials before returning -
 * shared by the read-only sync path and Studio's publish job runner so both
 * follow the exact same "refresh before use, save before proceeding" order.
 */
export async function resolveAccountTokens(
  account: ConnectedAccount,
  integration: PlatformIntegration,
): Promise<OAuthTokens> {
  let tokens: OAuthTokens = {
    accessToken: decryptSecret(account.accessTokenEncrypted),
    refreshToken: account.refreshTokenEncrypted ? decryptSecret(account.refreshTokenEncrypted) : null,
    expiresAt: account.tokenExpiresAt,
    scopes: account.scopes,
  };
  if (tokens.expiresAt && tokens.expiresAt.getTime() <= Date.now() + 60_000) {
    if (!tokens.refreshToken) throw new ApiError('Reconnect this account.', 401, 'AUTH');
    const refreshed = await integration.refresh(tokens.refreshToken);
    tokens = { ...refreshed, refreshToken: refreshed.refreshToken ?? tokens.refreshToken };
    // Save rotated credentials before the caller uses them so a later failure cannot lose them.
    await prisma.connectedAccount.update({
      where: { id: account.id },
      data: {
        accessTokenEncrypted: encryptSecret(tokens.accessToken),
        refreshTokenEncrypted: tokens.refreshToken ? encryptSecret(tokens.refreshToken) : null,
        tokenExpiresAt: tokens.expiresAt,
        scopes: tokens.scopes,
      },
    });
  }
  return tokens;
}

async function runSync(account: ConnectedAccount) {
  const integration = getIntegration(account.platform);
  if (!integration || !integration.isConfigured()) throw new Error('This integration is not configured.');
  let tokens: OAuthTokens;
  try {
    tokens = await resolveAccountTokens(account, integration);
  } catch (error) {
    await recordSyncFailure(account.id, error);
    throw error;
  }
  return importAccountVideos(account, integration, tokens);
}
