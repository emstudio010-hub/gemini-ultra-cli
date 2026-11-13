/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  loadApiKey,
  saveApiKey,
  clearApiKey,
  resetApiKeyCacheForTesting,
} from './apiKeyCredentialStorage.js';
import { debugLogger } from '../utils/debugLogger.js';

const getCredentialsMock = vi.hoisted(() => vi.fn());
const setCredentialsMock = vi.hoisted(() => vi.fn());
const deleteCredentialsMock = vi.hoisted(() => vi.fn());

vi.mock('../mcp/token-storage/hybrid-token-storage.js', () => ({
  HybridTokenStorage: vi.fn().mockImplementation(() => ({
    getCredentials: getCredentialsMock,
    setCredentials: setCredentialsMock,
    deleteCredentials: deleteCredentialsMock,
  })),
}));

describe('ApiKeyCredentialStorage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetApiKeyCacheForTesting();
  });

  it('should load an API key and cache it', async () => {
    getCredentialsMock.mockResolvedValue({
      serverName: 'default-api-key',
      token: {
        accessToken: 'test-key',
        tokenType: 'ApiKey',
      },
      updatedAt: Date.now(),
    });

    const apiKey1 = await loadApiKey();
    expect(apiKey1).toBe('test-key');
    expect(getCredentialsMock).toHaveBeenCalledTimes(1);

    const apiKey2 = await loadApiKey();
    expect(apiKey2).toBe('test-key');
    expect(getCredentialsMock).toHaveBeenCalledTimes(1); // Should be cached
  });

  it('should return null if no API key is stored and cache it', async () => {
    getCredentialsMock.mockResolvedValue(null);
    const apiKey1 = await loadApiKey();
    expect(apiKey1).toBeNull();
    expect(getCredentialsMock).toHaveBeenCalledTimes(1);

    const apiKey2 = await loadApiKey();
    expect(apiKey2).toBeNull();
    expect(getCredentialsMock).toHaveBeenCalledTimes(1); // Should be cached
  });

  it('should save an API key and clear cache', async () => {
    getCredentialsMock.mockResolvedValue({
      serverName: 'default-api-key',
      token: {
        accessToken: 'old-key',
        tokenType: 'ApiKey',
      },
      updatedAt: Date.now(),
    });

    await loadApiKey();
    expect(getCredentialsMock).toHaveBeenCalledTimes(1);

    await saveApiKey('new-key');
    expect(setCredentialsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        serverName: 'default-api-key',
        token: expect.objectContaining({
          accessToken: 'new-key',
          tokenType: 'ApiKey',
        }),
      }),
    );

    getCredentialsMock.mockResolvedValue({
      serverName: 'default-api-key',
      token: {
        accessToken: 'new-key',
        tokenType: 'ApiKey',
      },
      updatedAt: Date.now(),
    });

    await loadApiKey();
    expect(getCredentialsMock).toHaveBeenCalledTimes(2); // Should have fetched again
  });

  it('should clear an API key and clear cache', async () => {
    getCredentialsMock.mockResolvedValue({
      serverName: 'default-api-key',
      token: {
        accessToken: 'old-key',
        tokenType: 'ApiKey',
      },
      updatedAt: Date.now(),
    });

    await loadApiKey();
    expect(getCredentialsMock).toHaveBeenCalledTimes(1);

    await clearApiKey();
    expect(deleteCredentialsMock).toHaveBeenCalledWith('default-api-key');

    getCredentialsMock.mockResolvedValue(null);
    await loadApiKey();
    expect(getCredentialsMock).toHaveBeenCalledTimes(2); // Should have fetched again
  });

  it('should clear an API key and cache when saving empty key', async () => {
    await saveApiKey('');
    expect(deleteCredentialsMock).toHaveBeenCalledWith('default-api-key');
    expect(setCredentialsMock).not.toHaveBeenCalled();
  });

  it('should clear an API key and cache when saving null key', async () => {
    await saveApiKey(null);
    expect(deleteCredentialsMock).toHaveBeenCalledWith('default-api-key');
    expect(setCredentialsMock).not.toHaveBeenCalled();
  });

  it('should not throw when clearing an API key fails during saveApiKey', async () => {
    deleteCredentialsMock.mockRejectedValueOnce(new Error('Failed to delete'));
    await expect(saveApiKey('')).resolves.not.toThrow();
    expect(deleteCredentialsMock).toHaveBeenCalledWith('default-api-key');
  });

  it('should not throw when clearing an API key fails during clearApiKey', async () => {
    deleteCredentialsMock.mockRejectedValueOnce(new Error('Failed to delete'));
    await expect(clearApiKey()).resolves.not.toThrow();
    expect(deleteCredentialsMock).toHaveBeenCalledWith('default-api-key');
  });

  it('rejects an explicit strict clear when credential deletion fails', async () => {
    const failure = new Error('Controlled credential deletion failure');
    deleteCredentialsMock.mockRejectedValueOnce(failure);
    await expect(clearApiKey({ throwOnError: true })).rejects.toBe(failure);
    expect(deleteCredentialsMock).toHaveBeenCalledWith('default-api-key');
  });

  it('does not cache a value read while a save is pending', async () => {
    let stored = 'old-key';
    let release!: () => void;
    setCredentialsMock.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = () => {
            stored = 'new-key';
            resolve();
          };
        }),
    );
    getCredentialsMock.mockImplementation(async () => ({
      token: { accessToken: stored },
    }));
    const save = saveApiKey('new-key');
    await vi.waitFor(() => expect(setCredentialsMock).toHaveBeenCalledOnce());
    const read = loadApiKey();
    await Promise.resolve();
    const readStartedDuringSave = getCredentialsMock.mock.calls.length;
    release();
    await save;
    const result = await read;
    expect(readStartedDuringSave).toBe(0);
    expect(result).toBe('new-key');
    expect(await loadApiKey()).toBe('new-key');
    expect(getCredentialsMock).toHaveBeenCalledOnce();
  });

  it('does not publish a late old read after strict clear completes', async () => {
    let release!: () => void;
    getCredentialsMock
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            release = () => resolve({ token: { accessToken: 'old-key' } });
          }),
      )
      .mockResolvedValue(null);
    const read = loadApiKey();
    await vi.waitFor(() => expect(getCredentialsMock).toHaveBeenCalledOnce());
    await clearApiKey({ throwOnError: true });
    release();
    expect(await read).toBeNull();
    expect(await loadApiKey()).toBeNull();
    expect(getCredentialsMock).toHaveBeenCalledTimes(2);
  });

  it('orders direct saves and clears so the last request wins', async () => {
    let release!: () => void;
    const operations: string[] = [];
    setCredentialsMock.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = () => {
            operations.push('save');
            resolve();
          };
        }),
    );
    deleteCredentialsMock.mockImplementationOnce(async () => {
      operations.push('clear');
    });
    const save = saveApiKey('old-key');
    await vi.waitFor(() => expect(setCredentialsMock).toHaveBeenCalledOnce());
    const clear = clearApiKey({ throwOnError: true });
    await Promise.resolve();
    const deletesBeforeSaveEnds = deleteCredentialsMock.mock.calls.length;
    release();
    await Promise.all([save, clear]);
    expect(deletesBeforeSaveEnds).toBe(0);
    expect(operations).toEqual(['save', 'clear']);
  });

  it('does not cache storage failures or log private details when loading', async () => {
    const log = vi.spyOn(debugLogger, 'error').mockImplementation(() => {});
    getCredentialsMock
      .mockRejectedValueOnce(new Error('FAKE_PRIVATE_DETAIL'))
      .mockResolvedValueOnce({ token: { accessToken: 'new-key' } });
    try {
      expect(await loadApiKey()).toBeNull();
      expect(await loadApiKey()).toBe('new-key');
      expect(getCredentialsMock).toHaveBeenCalledTimes(2);
      expect(
        log.mock.calls
          .flat()
          .some((value) => String(value).includes('FAKE_PRIVATE_DETAIL')),
      ).toBe(false);
    } finally {
      log.mockRestore();
    }
  });

  it('invalidates reads from a failed mutation and leaves later writes usable', async () => {
    let release!: () => void;
    getCredentialsMock
      .mockResolvedValueOnce({ token: { accessToken: 'old-key' } })
      .mockResolvedValueOnce({ token: { accessToken: 'new-key' } });
    setCredentialsMock.mockImplementationOnce(
      () =>
        new Promise<void>((_resolve, reject) => {
          release = () => reject(new Error('Controlled failure'));
        }),
    );
    const save = saveApiKey('failed-key');
    const rejected = save.then(
      () => undefined,
      (error: unknown) => error,
    );
    await vi.waitFor(() => expect(setCredentialsMock).toHaveBeenCalledOnce());
    const read = loadApiKey();
    await Promise.resolve();
    release();
    expect(await rejected).toEqual(new Error('Controlled failure'));
    await read;
    await saveApiKey('new-key');
    expect(await loadApiKey()).toBe('new-key');
  });

  it('shares concurrent reads after an in-flight clear and a queued new save', async () => {
    let release!: () => void;
    let stored: string | null = 'old-key';
    deleteCredentialsMock.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = () => {
            stored = null;
            resolve();
          };
        }),
    );
    setCredentialsMock.mockImplementationOnce(async () => {
      stored = 'new-key';
    });
    getCredentialsMock.mockImplementation(async () =>
      stored ? { token: { accessToken: stored } } : null,
    );
    const clear = clearApiKey({ throwOnError: true });
    await vi.waitFor(() =>
      expect(deleteCredentialsMock).toHaveBeenCalledOnce(),
    );
    const save = saveApiKey('new-key');
    const reads = [loadApiKey(), loadApiKey()];
    await Promise.resolve();
    const writesBeforeClearEnds = setCredentialsMock.mock.calls.length;
    const readsBeforeClearEnds = getCredentialsMock.mock.calls.length;
    release();
    await Promise.all([clear, save]);
    expect(await Promise.all(reads)).toEqual(['new-key', 'new-key']);
    expect(writesBeforeClearEnds).toBe(0);
    expect(readsBeforeClearEnds).toBe(0);
    expect(getCredentialsMock).toHaveBeenCalledOnce();
  });
});
