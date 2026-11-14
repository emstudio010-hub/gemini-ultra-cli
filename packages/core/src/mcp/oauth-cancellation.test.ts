/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MCPOAuthProvider } from './oauth-provider.js';
import type { MCPOAuthTokenStorage } from './oauth-token-storage.js';
import { OAuthUtils } from './oauth-utils.js';
import { DynamicStoredOAuthProvider } from './stored-token-provider.js';
import * as flow from '../utils/oauth-flow.js';
import { getConsentForOauth } from '../utils/authConsent.js';
import { openBrowserSecurely } from '../utils/secure-browser-launcher.js';

vi.mock('../utils/authConsent.js', () => ({ getConsentForOauth: vi.fn() }));
vi.mock('../utils/secure-browser-launcher.js', () => ({
  openBrowserSecurely: vi.fn(),
}));
vi.mock('./oauth-token-storage.js', () => ({ MCPOAuthTokenStorage: vi.fn() }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
const oauth = {
  clientId: 'fixture-client',
  authorizationUrl: 'http://127.0.0.1/authorize',
  tokenUrl: 'http://127.0.0.1/token',
};
const expired = {
  serverName: 'fixture',
  clientId: 'fixture-client',
  tokenUrl: oauth.tokenUrl,
  token: {
    accessToken: 'fixture-old',
    refreshToken: 'fixture-refresh',
    tokenType: 'Bearer',
  },
};

describe('OAuth lifecycle cancellation', () => {
  const tokenStorage = () => ({
    getCredentials: vi.fn().mockResolvedValue(expired),
    isTokenExpired: vi.fn().mockReturnValue(true),
    saveToken: vi.fn().mockResolvedValue(undefined),
    deleteCredentials: vi.fn().mockResolvedValue(undefined),
  });
  beforeEach(() => {
    vi.mocked(getConsentForOauth).mockResolvedValue(true);
    vi.mocked(openBrowserSecurely).mockResolvedValue(undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('aborts metadata fetch and does not fall back after cancellation', async () => {
    const controller = new AbortController();
    const response = deferred<Response>();
    const fetcher = vi.fn().mockReturnValue(response.promise);
    vi.stubGlobal('fetch', fetcher);
    const pending = OAuthUtils.discoverOAuthConfig('http://127.0.0.1/mcp', {
      signal: controller.signal,
    }).catch((error: unknown) => error);
    await tick();
    controller.abort();
    response.resolve(new Response(null, { status: 404 }));
    expect(await pending).toBe(controller.signal.reason);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0][1]?.signal).toBe(controller.signal);
  });

  it.each(['getValidToken', 'getValidTokenWithMetadata'] as const)(
    'preserves stored credentials when %s refresh is cancelled',
    async (method) => {
      const controller = new AbortController();
      const response = deferred<Response>();
      const fetcher = vi.fn().mockReturnValue(response.promise);
      vi.stubGlobal('fetch', fetcher);
      const storage = tokenStorage();
      const provider = new MCPOAuthProvider(
        storage as unknown as MCPOAuthTokenStorage,
        controller.signal,
      );
      const pending = provider[method]('fixture', {}).catch(
        (error: unknown) => error,
      );
      await tick();
      controller.abort();
      response.resolve(
        Response.json({ access_token: 'fixture-late', token_type: 'Bearer' }),
      );
      expect(await pending).toBe(controller.signal.reason);
      expect(fetcher.mock.calls[0][1]?.signal).toBe(controller.signal);
      expect(storage.saveToken).not.toHaveBeenCalled();
      expect(storage.deleteCredentials).not.toHaveBeenCalled();
    },
  );

  it('does not refresh credentials returned after cancellation', async () => {
    const controller = new AbortController();
    const read = deferred<typeof expired>();
    const storage = tokenStorage();
    storage.getCredentials.mockReturnValue(read.promise);
    const fetcher = vi
      .fn()
      .mockResolvedValue(Response.json({ access_token: 'fixture-late' }));
    vi.stubGlobal('fetch', fetcher);
    const provider = new MCPOAuthProvider(
      storage as unknown as MCPOAuthTokenStorage,
      controller.signal,
    );
    const pending = provider
      .getValidToken('fixture', {})
      .catch((error: unknown) => error);
    controller.abort();
    read.resolve(expired);
    expect(await pending).toBe(controller.signal.reason);
    expect(fetcher).not.toHaveBeenCalled();
    expect(storage.saveToken).not.toHaveBeenCalled();
  });

  it('closes the callback server while consent is pending and never opens a late browser', async () => {
    const controller = new AbortController();
    const consent = deferred<boolean>();
    const callback = deferred<flow.OAuthAuthorizationResponse>();
    const cancel = vi.fn((reason?: Error) => {
      callback.resolve({ code: 'fixture-code', state: 'fixture-state' });
      return reason;
    });
    vi.spyOn(flow, 'startCallbackServer').mockReturnValue({
      port: Promise.resolve(7777),
      response: callback.promise,
      cancel,
    });
    vi.mocked(getConsentForOauth).mockReturnValue(consent.promise);
    const storage = tokenStorage();
    const fetcher = vi
      .fn()
      .mockResolvedValue(Response.json({ access_token: 'fixture-late' }));
    vi.stubGlobal('fetch', fetcher);
    const provider = new MCPOAuthProvider(
      storage as unknown as MCPOAuthTokenStorage,
      controller.signal,
    );
    const pending = provider
      .authenticate('fixture', oauth)
      .catch((error: unknown) => error);
    await tick();
    controller.abort();
    await tick();
    const closedBeforeConsent = cancel.mock.calls.length > 0;
    consent.resolve(true);
    callback.resolve({ code: 'fixture-code', state: 'fixture-state' });
    expect(await pending).toBe(controller.signal.reason);
    expect(closedBeforeConsent).toBe(true);
    expect(openBrowserSecurely).not.toHaveBeenCalled();
    expect(storage.saveToken).not.toHaveBeenCalled();
  });

  it('aborts token exchange after callback without saving a late token', async () => {
    const controller = new AbortController();
    vi.spyOn(flow, 'startCallbackServer').mockReturnValue({
      port: Promise.resolve(7777),
      response: Promise.resolve({
        code: 'fixture-code',
        state: 'fixture-state',
      }),
      cancel: vi.fn(),
    });
    const response = deferred<Response>();
    const fetcher = vi.fn().mockReturnValue(response.promise);
    vi.stubGlobal('fetch', fetcher);
    const storage = tokenStorage();
    const provider = new MCPOAuthProvider(
      storage as unknown as MCPOAuthTokenStorage,
      controller.signal,
    );
    const pending = provider
      .authenticate('fixture', oauth)
      .catch((error: unknown) => error);
    await tick();
    controller.abort();
    response.resolve(
      Response.json({ access_token: 'fixture-late', token_type: 'Bearer' }),
    );
    expect(await pending).toBe(controller.signal.reason);
    expect(fetcher.mock.calls[0][1]?.signal).toBe(controller.signal);
    expect(storage.saveToken).not.toHaveBeenCalled();
  });

  it('cancels registration without changing configuration or requesting consent', async () => {
    const controller = new AbortController();
    const callback = deferred<flow.OAuthAuthorizationResponse>();
    const cancel = vi.fn();
    vi.spyOn(flow, 'startCallbackServer').mockReturnValue({
      port: Promise.resolve(7777),
      response: callback.promise,
      cancel,
    });
    const response = deferred<Response>();
    const fetcher = vi.fn().mockReturnValue(response.promise);
    vi.stubGlobal('fetch', fetcher);
    vi.mocked(getConsentForOauth).mockClear();
    const storage = tokenStorage();
    const provider = new MCPOAuthProvider(
      storage as unknown as MCPOAuthTokenStorage,
      controller.signal,
    );
    const config = {
      ...oauth,
      clientId: undefined,
      registrationUrl: 'http://127.0.0.1/register',
    };
    const pending = provider
      .authenticate('fixture', config)
      .catch((error: unknown) => error);
    await tick();
    controller.abort();
    response.resolve(Response.json({ client_id: 'fixture-late-client' }));
    expect(await pending).toBe(controller.signal.reason);
    expect(fetcher.mock.calls[0][1]?.signal).toBe(controller.signal);
    expect(config.clientId).toBeUndefined();
    expect(cancel).toHaveBeenCalled();
    expect(getConsentForOauth).not.toHaveBeenCalled();
    expect(storage.saveToken).not.toHaveBeenCalled();
  });

  it('does not serve a cached dynamic token after the connection is cancelled', async () => {
    const controller = new AbortController();
    const read = vi
      .spyOn(MCPOAuthProvider.prototype, 'getValidTokenWithMetadata')
      .mockResolvedValue({
        accessToken: 'fixture-cached',
        tokenType: 'Bearer',
        expiresAt: Date.now() + 3600_000,
      });
    const provider = new DynamicStoredOAuthProvider(
      'fixture',
      {},
      controller.signal,
    );
    expect((await provider.tokens())?.access_token).toBe('fixture-cached');
    controller.abort();
    expect(await provider.tokens().catch((error: unknown) => error)).toBe(
      controller.signal.reason,
    );
    expect(read).toHaveBeenCalledOnce();
  });
});
