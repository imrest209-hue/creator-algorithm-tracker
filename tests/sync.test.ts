import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConnectedAccount } from '@prisma/client';
import { ApiError } from '@/lib/integrations/http';

const mocks = vi.hoisted(() => ({ update: vi.fn(), upsert: vi.fn(), fetch: vi.fn(), refresh: vi.fn() }));
vi.mock('@/lib/db/prisma', () => ({ prisma: { connectedAccount: { update: mocks.update } } }));
vi.mock('@/lib/videos/persist', () => ({ upsertVideo: mocks.upsert }));
vi.mock('@/lib/auth/crypto', () => ({ decryptSecret: (s: string) => s, encryptSecret: (s: string) => `encrypted:${s}` }));
vi.mock('@/lib/integrations/registry', () => ({ getIntegration: () => ({ isConfigured: () => true, fetchVideos: mocks.fetch, refresh: mocks.refresh }) }));
import { syncConnectedAccount } from '@/lib/integrations/sync';

const account = {
  id: 'account', userId: 'owner', platform: 'TIKTOK', externalId: 'external',
  accessTokenEncrypted: 'access', refreshTokenEncrypted: 'refresh',
  tokenExpiresAt: new Date('2099-01-01'), scopes: [],
} as unknown as ConnectedAccount;
const result = { externalId: 'external', videos: [], warnings: [] };

beforeEach(() => { vi.resetAllMocks(); mocks.update.mockResolvedValue({}); mocks.fetch.mockResolvedValue(result); });

describe('connected account sync', () => {
  it('refreshes expiring tokens and saves rotation before importing', async () => {
    mocks.refresh.mockResolvedValue({ accessToken: 'new-access', refreshToken: 'new-refresh', expiresAt: new Date('2099-01-01'), scopes: [] });
    await syncConnectedAccount({ ...account, tokenExpiresAt: new Date(0) });
    expect(mocks.refresh).toHaveBeenCalledWith('refresh');
    expect(mocks.update.mock.calls[0][0].data).toMatchObject({ accessTokenEncrypted: 'encrypted:new-access', refreshTokenEncrypted: 'encrypted:new-refresh' });
    expect(mocks.update.mock.invocationCallOrder[0]).toBeLessThan(mocks.fetch.mock.invocationCallOrder[0]);
  });
  it('does not advance last synced when saving fails', async () => {
    mocks.fetch.mockResolvedValue({ ...result, videos: [{ metrics: {}, title: 'A video' }] });
    mocks.upsert.mockRejectedValue(new Error('Database offline'));
    await expect(syncConnectedAccount(account)).rejects.toThrow('Database offline');
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.update.mock.calls[0][0].data).toMatchObject({ status: 'ERROR' });
    expect(mocks.update.mock.calls[0][0].data).not.toHaveProperty('lastSyncedAt');
  });
  it('marks rejected credentials expired', async () => {
    mocks.fetch.mockRejectedValue(new ApiError('Rejected', 401, 'AUTH'));
    await expect(syncConnectedAccount(account)).rejects.toThrow('Rejected');
    expect(mocks.update.mock.calls[0][0].data.status).toBe('EXPIRED');
  });
  it('rejects data from a different platform account', async () => {
    mocks.fetch.mockResolvedValue({ ...result, externalId: 'other' });
    await expect(syncConnectedAccount(account)).rejects.toThrow('different account');
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it('coalesces repeated sync requests and records a completed sync', async () => {
    await Promise.all([syncConnectedAccount(account), syncConnectedAccount(account)]);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.update.mock.calls[0][0].data).toMatchObject({ status: 'CONNECTED', lastSyncedAt: expect.any(Date) });
  });
});
