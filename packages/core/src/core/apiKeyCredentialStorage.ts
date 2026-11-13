/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { HybridTokenStorage } from '../mcp/token-storage/hybrid-token-storage.js';
import type { OAuthCredentials } from '../mcp/token-storage/types.js';
import { debugLogger } from '../utils/debugLogger.js';
import { createCache } from '../utils/cache.js';

const KEYCHAIN_SERVICE_NAME = 'gemini-cli-api-key';
const DEFAULT_API_KEY_ENTRY = 'default-api-key';

const storage = new HybridTokenStorage(KEYCHAIN_SERVICE_NAME);

// Cache to store the results of loadApiKey to avoid redundant keychain access.
const apiKeyCache = createCache<string, Promise<string | null>>({
  storage: 'map',
  defaultTtl: 30000, // 30 seconds
});

let credentialRevision = 0;
let credentialMutations: Promise<void> = Promise.resolve();

function invalidateApiKeyCache() {
  credentialRevision++;
  apiKeyCache.delete(DEFAULT_API_KEY_ENTRY);
}

/** Keep every in-process writer ordered, including callers outside the UI. */
function mutateCredentials(operation: () => Promise<void>): Promise<void> {
  invalidateApiKeyCache();
  const mutation = credentialMutations
    .then(operation)
    .finally(invalidateApiKeyCache);
  // A failed write must not prevent a later explicit save or clear.
  credentialMutations = mutation.catch(() => undefined);
  return mutation;
}

/**
 * Resets the API key cache. Used exclusively for test isolation.
 * @internal
 */
export function resetApiKeyCacheForTesting() {
  invalidateApiKeyCache();
}

/**
 * Load cached API key
 */
export async function loadApiKey(): Promise<string | null> {
  for (;;) {
    const mutations = credentialMutations;
    await mutations;
    if (mutations !== credentialMutations) continue;
    const revision = credentialRevision;
    try {
      const key = await apiKeyCache.getOrCreate(
        DEFAULT_API_KEY_ENTRY,
        async () => {
          const credentials = await storage.getCredentials(
            DEFAULT_API_KEY_ENTRY,
          );
          return credentials?.token?.accessToken || null;
        },
      );
      // A read started before a save/clear can finish after it. Re-read only
      // when locally invalidated; never publish that older credential snapshot.
      if (revision !== credentialRevision) continue;
      return key;
    } catch {
      if (revision !== credentialRevision) continue;
      // Rejected reads are evicted by CacheService. Keep the public null
      // fallback, but do not cache a storage failure or log credential details.
      debugLogger.error('Failed to load API key from storage.');
      return null;
    }
  }
}

/**
 * Save API key
 */
export async function saveApiKey(
  apiKey: string | null | undefined,
): Promise<void> {
  return mutateCredentials(async () => {
    if (!apiKey || apiKey.trim() === '') {
      try {
        await storage.deleteCredentials(DEFAULT_API_KEY_ENTRY);
      } catch (error: unknown) {
        // Ignore errors when deleting, as it might not exist
        debugLogger.warn('Failed to delete API key from storage:', error);
      }
      return;
    }

    // Wrap API key in OAuthCredentials format as required by HybridTokenStorage
    const credentials: OAuthCredentials = {
      serverName: DEFAULT_API_KEY_ENTRY,
      token: {
        accessToken: apiKey,
        tokenType: 'ApiKey',
      },
      updatedAt: Date.now(),
    };

    await storage.setCredentials(credentials);
  });
}

/**
 * Clear cached API key
 */
export async function clearApiKey(options?: {
  throwOnError?: boolean;
}): Promise<void> {
  return mutateCredentials(async () => {
    try {
      await storage.deleteCredentials(DEFAULT_API_KEY_ENTRY);
    } catch (error: unknown) {
      if (options?.throwOnError) throw error;
      debugLogger.error('Failed to clear API key from storage:', error);
    }
  });
}
