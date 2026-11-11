/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { A2AClientManager } from './a2a-client-manager.js';
import type { AgentCard } from '@a2a-js/sdk';
import {
  ClientFactory,
  DefaultAgentCardResolver,
  createAuthenticatingFetchWithRetry,
  ClientFactoryOptions,
  type AuthenticationHandler,
  type Client,
} from '@a2a-js/sdk/client';
import type { Config } from '../config/config.js';
import { Agent as UndiciAgent, ProxyAgent } from 'undici';
import { debugLogger } from '../utils/debugLogger.js';

interface MockClient {
  sendMessageStream: ReturnType<typeof vi.fn>;
  getTask: ReturnType<typeof vi.fn>;
  cancelTask: ReturnType<typeof vi.fn>;
}

vi.mock('@a2a-js/sdk/client', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as Record<string, unknown>),
    createAuthenticatingFetchWithRetry: vi.fn(),
    ClientFactory: vi.fn(),
    DefaultAgentCardResolver: vi.fn(),
    ClientFactoryOptions: {
      createFrom: vi.fn(),
      default: {},
    },
  };
});

vi.mock('../utils/debugLogger.js', () => ({
  debugLogger: {
    debug: vi.fn(),
  },
}));

describe('A2AClientManager', () => {
  let manager: A2AClientManager;
  const mockAgentCard: AgentCard = {
    name: 'test-agent',
    description: 'A test agent',
    url: 'http://test.agent',
    version: '1.0.0',
    protocolVersion: '0.1.0',
    capabilities: {},
    skills: [],
    defaultInputModes: [],
    defaultOutputModes: [],
  };

  const mockClient: MockClient = {
    sendMessageStream: vi.fn(),
    getTask: vi.fn(),
    cancelTask: vi.fn(),
  };

  const authFetchMock = vi.fn();
  const mockConfig = {
    getProxy: vi.fn(),
  } as unknown as Config;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new A2AClientManager(mockConfig);

    // Re-create the instances as plain objects that can be spied on
    const factoryInstance = {
      createFromUrl: vi.fn(),
      createFromAgentCard: vi.fn(),
    };
    const resolverInstance = {
      resolve: vi.fn(),
    };

    vi.mocked(ClientFactory).mockReturnValue(
      factoryInstance as unknown as ClientFactory,
    );
    vi.mocked(DefaultAgentCardResolver).mockReturnValue(
      resolverInstance as unknown as DefaultAgentCardResolver,
    );

    vi.spyOn(factoryInstance, 'createFromUrl').mockResolvedValue(
      mockClient as unknown as Client,
    );
    vi.spyOn(factoryInstance, 'createFromAgentCard').mockResolvedValue(
      mockClient as unknown as Client,
    );
    vi.spyOn(resolverInstance, 'resolve').mockResolvedValue({
      ...mockAgentCard,
      url: 'http://test.agent/real/endpoint',
    } as AgentCard);

    vi.spyOn(ClientFactoryOptions, 'createFrom').mockImplementation(
      (_defaults, overrides) => overrides as unknown as ClientFactoryOptions,
    );

    vi.mocked(createAuthenticatingFetchWithRetry).mockImplementation(() =>
      authFetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({}),
      } as Response),
    );

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({}),
      } as Response),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('getInstance / dispatcher initialization', () => {
    it('should use UndiciAgent when no proxy is configured', async () => {
      await manager.loadAgent('TestAgent', {
        type: 'url',
        url: 'http://test.agent/card',
      });

      const resolverOptions = vi.mocked(DefaultAgentCardResolver).mock
        .calls[0][0];
      const cardFetch = resolverOptions?.fetchImpl as typeof fetch;
      await cardFetch('http://test.agent/card');

      const fetchCall = vi
        .mocked(fetch)
        .mock.calls.find((call) => call[0] === 'http://test.agent/card');
      expect(fetchCall).toBeDefined();
      expect(
        (fetchCall![1] as { dispatcher?: unknown })?.dispatcher,
      ).toBeInstanceOf(UndiciAgent);
      expect(
        (fetchCall![1] as { dispatcher?: unknown })?.dispatcher,
      ).not.toBeInstanceOf(ProxyAgent);
    });

    it('should use ProxyAgent when a proxy is configured via Config', async () => {
      const mockConfigWithProxy = {
        getProxy: () => 'http://my-proxy:8080',
      } as Config;

      manager = new A2AClientManager(mockConfigWithProxy);
      await manager.loadAgent('TestProxyAgent', {
        type: 'url',
        url: 'http://test.proxy.agent/card',
      });

      const resolverOptions = vi.mocked(DefaultAgentCardResolver).mock
        .calls[0][0];
      const cardFetch = resolverOptions?.fetchImpl as typeof fetch;
      await cardFetch('http://test.proxy.agent/card');

      const fetchCall = vi
        .mocked(fetch)
        .mock.calls.find((call) => call[0] === 'http://test.proxy.agent/card');
      expect(fetchCall).toBeDefined();
      expect(
        (fetchCall![1] as { dispatcher?: unknown })?.dispatcher,
      ).toBeInstanceOf(ProxyAgent);
    });
  });

  describe('loadAgent', () => {
    it('preserves cancellation supplied by a Request object to the cached resolver', async () => {
      await manager.loadAgent('RequestSignal', {
        type: 'url',
        url: 'http://local/card',
      });
      const options = vi.mocked(DefaultAgentCardResolver).mock.calls[0][0];
      const controller = new AbortController();
      const request = new Request('http://local/card', {
        signal: controller.signal,
      });
      await options!.fetchImpl!(request);
      const signal = vi.mocked(fetch).mock.calls.at(-1)?.[1]?.signal;
      expect(signal?.aborted).toBe(false);
      controller.abort();
      expect(signal?.aborted).toBe(true);
    });

    it('does not repeat an unauthenticated 401 request without an auth handler', async () => {
      await manager.loadAgent('Unauthenticated', {
        type: 'url',
        url: 'http://local/card',
      });
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 401,
      } as Response);
      const options = vi.mocked(DefaultAgentCardResolver).mock.calls[0][0];
      const response = await options!.fetchImpl!('http://local/card');
      expect(response.status).toBe(401);
      expect(fetch).toHaveBeenCalledOnce();
      expect(authFetchMock).not.toHaveBeenCalled();
    });

    it('bounds a stalled resolver without caching a late result', async () => {
      vi.useFakeTimers();
      let release!: (card: AgentCard) => void;
      vi.mocked(DefaultAgentCardResolver).mockReturnValue({
        resolve: () =>
          new Promise<AgentCard>((resolve) => {
            release = resolve;
          }),
      } as unknown as DefaultAgentCardResolver);
      const pending = manager
        .loadAgent('SlowCard', { type: 'url', url: 'http://local/card' })
        .catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(10001);
      expect(await pending).toMatchObject({
        message: expect.stringContaining(
          'Agent card discovery exceeded 10 seconds',
        ),
      });
      release(mockAgentCard);
      await Promise.resolve();
      expect(manager.getClient('SlowCard')).toBeUndefined();
      expect(manager.getAgentCard('SlowCard')).toBeUndefined();
      expect(ClientFactory).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    });

    it('bounds response body parsing after headers and aborts its request', async () => {
      vi.useFakeTimers();
      let requestSignal: AbortSignal | undefined;
      vi.mocked(fetch).mockImplementation(async (_input, init) => {
        requestSignal = init?.signal ?? undefined;
        return { ok: true, json: () => new Promise(() => {}) } as Response;
      });
      vi.mocked(DefaultAgentCardResolver).mockReturnValue({
        resolve: async (url: string) => {
          const options = vi
            .mocked(DefaultAgentCardResolver)
            .mock.calls.at(-1)?.[0];
          const response = await options!.fetchImpl!(url);
          return response.json();
        },
      } as unknown as DefaultAgentCardResolver);
      const pending = manager
        .loadAgent('BodyCard', { type: 'url', url: 'http://local/card' })
        .catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(9999);
      expect(requestSignal?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(2);
      expect(await pending).toMatchObject({
        message: expect.stringContaining('exceeded 10 seconds'),
      });
      expect(requestSignal?.aborted).toBe(true);
      expect(manager.getClient('BodyCard')).toBeUndefined();
    });

    it('shares one discovery deadline across 401 retry and a stalled auth callback', async () => {
      vi.useFakeTimers();
      const cancel = vi.fn().mockResolvedValue(undefined);
      let requestSignal: AbortSignal | undefined;
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 401,
        body: { cancel },
      } as unknown as Response);
      authFetchMock.mockImplementationOnce(async (_input, init) => {
        requestSignal = init.signal;
        return new Promise(() => {});
      });
      vi.mocked(DefaultAgentCardResolver).mockReturnValue({
        resolve: async (url: string) => {
          const options = vi
            .mocked(DefaultAgentCardResolver)
            .mock.calls.at(-1)?.[0];
          const response = await options!.fetchImpl!(url);
          return response.json();
        },
      } as unknown as DefaultAgentCardResolver);
      const pending = manager
        .loadAgent(
          'AuthCard',
          { type: 'url', url: 'http://local/card' },
          {} as AuthenticationHandler,
        )
        .catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(6000);
      expect(cancel).toHaveBeenCalledOnce();
      expect(requestSignal?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(4001);
      expect(await pending).toMatchObject({
        message: expect.stringContaining('exceeded 10 seconds'),
      });
      expect(requestSignal?.aborted).toBe(true);
      expect(manager.getClient('AuthCard')).toBeUndefined();
    });

    it('leaves task transport signals independent of completed card discovery', async () => {
      await manager.loadAgent(
        'Transport',
        { type: 'url', url: 'http://local/card' },
        {} as AuthenticationHandler,
      );
      const transportFetch = vi.mocked(createAuthenticatingFetchWithRetry).mock
        .calls[0][0];
      const controller = new AbortController();
      await transportFetch('http://local/task', { signal: controller.signal });
      expect(fetch).toHaveBeenCalledWith(
        'http://local/task',
        expect.objectContaining({ signal: controller.signal }),
      );
      expect(controller.signal.aborted).toBe(false);
    });

    it('should create and cache an A2AClient', async () => {
      const agentCard = await manager.loadAgent('TestAgent', {
        type: 'url',
        url: 'http://test.agent/card',
      });
      expect(manager.getAgentCard('TestAgent')).toBe(agentCard);
      expect(manager.getClient('TestAgent')).toBeDefined();
    });

    it('should configure ClientFactory with REST, JSON-RPC, and gRPC transports', async () => {
      await manager.loadAgent('TestAgent', {
        type: 'url',
        url: 'http://test.agent/card',
      });
      expect(ClientFactoryOptions.createFrom).toHaveBeenCalled();
    });

    it('should throw an error if an agent with the same name is already loaded', async () => {
      await manager.loadAgent('TestAgent', {
        type: 'url',
        url: 'http://test.agent/card',
      });
      await expect(
        manager.loadAgent('TestAgent', {
          type: 'url',
          url: 'http://test.agent/card',
        }),
      ).rejects.toThrow("Agent with name 'TestAgent' is already loaded.");
    });

    it('should use native fetch by default', async () => {
      await manager.loadAgent('TestAgent', {
        type: 'url',
        url: 'http://test.agent/card',
      });
      expect(createAuthenticatingFetchWithRetry).not.toHaveBeenCalled();
    });

    it('should use provided custom authentication handler for transports only', async () => {
      const customAuthHandler = {
        headers: vi.fn(),
        shouldRetryWithHeaders: vi.fn(),
      };
      await manager.loadAgent(
        'TestAgent',
        { type: 'url', url: 'http://test.agent/card' },
        customAuthHandler as unknown as AuthenticationHandler,
      );

      // Card resolver should NOT use the authenticated fetch by default.
      const resolverOptions = vi.mocked(DefaultAgentCardResolver).mock
        .calls[0][0];
      expect(resolverOptions?.fetchImpl).not.toBe(authFetchMock);
    });

    it('should use unauthenticated fetch for card resolver and avoid authenticated fetch if success', async () => {
      const customAuthHandler = {
        headers: vi.fn(),
        shouldRetryWithHeaders: vi.fn(),
      };
      await manager.loadAgent(
        'AuthCardAgent',
        { type: 'url', url: 'http://authcard.agent/card' },
        customAuthHandler as unknown as AuthenticationHandler,
      );

      const resolverOptions = vi.mocked(DefaultAgentCardResolver).mock
        .calls[0][0];
      const cardFetch = resolverOptions?.fetchImpl as typeof fetch;

      expect(cardFetch).toBeDefined();

      await cardFetch('http://test.url');

      expect(fetch).toHaveBeenCalledWith('http://test.url', expect.anything());
      expect(authFetchMock).not.toHaveBeenCalled();
    });

    it('should retry with authenticating fetch if agent card fetch returns 401', async () => {
      const customAuthHandler = {
        headers: vi.fn(),
        shouldRetryWithHeaders: vi.fn(),
      };

      // Mock the initial unauthenticated fetch to fail with 401
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({}),
      } as Response);

      await manager.loadAgent(
        'AuthCardAgent401',
        { type: 'url', url: 'http://authcard.agent/card' },
        customAuthHandler as unknown as AuthenticationHandler,
      );

      const resolverOptions = vi.mocked(DefaultAgentCardResolver).mock
        .calls[0][0];
      const cardFetch = resolverOptions?.fetchImpl as typeof fetch;

      await cardFetch('http://test.url');

      expect(fetch).toHaveBeenCalledWith('http://test.url', expect.anything());
      expect(authFetchMock).toHaveBeenCalledWith(
        'http://test.url',
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    it('should log a debug message upon loading an agent', async () => {
      await manager.loadAgent('TestAgent', {
        type: 'url',
        url: 'http://test.agent/card',
      });
      expect(debugLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining("Loaded agent 'TestAgent'"),
      );
    });

    it('should clear the cache', async () => {
      await manager.loadAgent('TestAgent', {
        type: 'url',
        url: 'http://test.agent/card',
      });
      manager.clearCache();
      expect(manager.getAgentCard('TestAgent')).toBeUndefined();
      expect(manager.getClient('TestAgent')).toBeUndefined();
    });

    it('should load an agent from inline JSON without calling resolver', async () => {
      const inlineJson = JSON.stringify(mockAgentCard);
      const agentCard = await manager.loadAgent('JsonAgent', {
        type: 'json',
        json: inlineJson,
      });
      expect(agentCard).toBeDefined();
      expect(agentCard.name).toBe('test-agent');
      expect(manager.getAgentCard('JsonAgent')).toBe(agentCard);
      expect(manager.getClient('JsonAgent')).toBeDefined();
      // Resolver should not have been called for inline JSON
      const resolverInstance = vi.mocked(DefaultAgentCardResolver).mock
        .results[0]?.value;
      if (resolverInstance) {
        expect(resolverInstance.resolve).not.toHaveBeenCalled();
      }
    });

    it('should throw a descriptive error for invalid inline JSON', async () => {
      await expect(
        manager.loadAgent('BadJsonAgent', {
          type: 'json',
          json: 'not valid json {{',
        }),
      ).rejects.toThrow(
        /Failed to parse inline agent card JSON for agent 'BadJsonAgent'/,
      );
    });

    it('should log "inline JSON" for JSON-loaded agents', async () => {
      const inlineJson = JSON.stringify(mockAgentCard);
      await manager.loadAgent('JsonLogAgent', {
        type: 'json',
        json: inlineJson,
      });
      expect(debugLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('inline JSON'),
      );
    });

    it('should throw if resolveAgentCard fails', async () => {
      const resolverInstance = {
        resolve: vi.fn().mockRejectedValue(new Error('Resolution failed')),
      };
      vi.mocked(DefaultAgentCardResolver).mockReturnValue(
        resolverInstance as unknown as DefaultAgentCardResolver,
      );

      await expect(
        manager.loadAgent('FailAgent', {
          type: 'url',
          url: 'http://fail.agent',
        }),
      ).rejects.toThrow('Resolution failed');
    });

    it('should throw if factory.createFromAgentCard fails', async () => {
      const factoryInstance = {
        createFromAgentCard: vi
          .fn()
          .mockRejectedValue(new Error('Factory failed')),
      };
      vi.mocked(ClientFactory).mockReturnValue(
        factoryInstance as unknown as ClientFactory,
      );

      await expect(
        manager.loadAgent('FailAgent', {
          type: 'url',
          url: 'http://fail.agent',
        }),
      ).rejects.toThrow('Factory failed');
    });
  });

  describe('getAgentCard and getClient', () => {
    it('should return undefined if agent is not found', () => {
      expect(manager.getAgentCard('Unknown')).toBeUndefined();
      expect(manager.getClient('Unknown')).toBeUndefined();
    });
  });

  describe('sendMessageStream', () => {
    beforeEach(async () => {
      await manager.loadAgent('TestAgent', {
        type: 'url',
        url: 'http://test.agent/card',
      });
    });

    it('should send a message and return a stream', async () => {
      mockClient.sendMessageStream.mockReturnValue(
        (async function* () {
          yield { kind: 'message' };
        })(),
      );

      const stream = manager.sendMessageStream('TestAgent', 'Hello');
      const results = [];
      for await (const result of stream) {
        results.push(result);
      }

      expect(results).toHaveLength(1);
      expect(mockClient.sendMessageStream).toHaveBeenCalled();
    });

    it('should use contextId and taskId when provided', async () => {
      mockClient.sendMessageStream.mockReturnValue(
        (async function* () {
          yield { kind: 'message' };
        })(),
      );

      const stream = manager.sendMessageStream('TestAgent', 'Hello', {
        contextId: 'ctx123',
        taskId: 'task456',
      });
      // trigger execution
      for await (const _ of stream) {
        break;
      }

      expect(mockClient.sendMessageStream).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.objectContaining({
            contextId: 'ctx123',
            taskId: 'task456',
          }),
        }),
        expect.any(Object),
      );
    });

    it('should correctly propagate AbortSignal to the stream', async () => {
      mockClient.sendMessageStream.mockReturnValue(
        (async function* () {
          yield { kind: 'message' };
        })(),
      );

      const controller = new AbortController();
      const stream = manager.sendMessageStream('TestAgent', 'Hello', {
        signal: controller.signal,
      });
      // trigger execution
      for await (const _ of stream) {
        break;
      }

      expect(mockClient.sendMessageStream).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ signal: controller.signal }),
      );
    });

    it('should handle a multi-chunk stream with different event types', async () => {
      mockClient.sendMessageStream.mockReturnValue(
        (async function* () {
          yield { kind: 'message', messageId: 'm1' };
          yield { kind: 'status-update', taskId: 't1' };
        })(),
      );

      const stream = manager.sendMessageStream('TestAgent', 'Hello');
      const results = [];
      for await (const result of stream) {
        results.push(result);
      }

      expect(results).toHaveLength(2);
      expect(results[0].kind).toBe('message');
      expect(results[1].kind).toBe('status-update');
    });

    it('should throw prefixed error on failure', async () => {
      mockClient.sendMessageStream.mockImplementation(() => {
        throw new Error('Network failure');
      });

      const stream = manager.sendMessageStream('TestAgent', 'Hello');
      await expect(async () => {
        for await (const _ of stream) {
          // empty
        }
      }).rejects.toThrow(
        '[A2AClientManager] sendMessageStream Error [TestAgent]: Network failure',
      );
    });

    it('should throw an error if the agent is not found', async () => {
      const stream = manager.sendMessageStream('NonExistentAgent', 'Hello');
      await expect(async () => {
        for await (const _ of stream) {
          // empty
        }
      }).rejects.toThrow("Agent 'NonExistentAgent' not found.");
    });
  });

  describe('getTask', () => {
    beforeEach(async () => {
      await manager.loadAgent('TestAgent', {
        type: 'url',
        url: 'http://test.agent/card',
      });
    });

    it('should get a task from the correct agent', async () => {
      const mockTask = { id: 'task123', kind: 'task' };
      mockClient.getTask.mockResolvedValue(mockTask);

      const result = await manager.getTask('TestAgent', 'task123');
      expect(result).toBe(mockTask);
      expect(mockClient.getTask).toHaveBeenCalledWith({ id: 'task123' });
    });

    it('should throw prefixed error on failure', async () => {
      mockClient.getTask.mockRejectedValue(new Error('Not found'));

      await expect(manager.getTask('TestAgent', 'task123')).rejects.toThrow(
        'A2AClient getTask Error [TestAgent]: Not found',
      );
    });

    it('should throw an error if the agent is not found', async () => {
      await expect(
        manager.getTask('NonExistentAgent', 'task123'),
      ).rejects.toThrow("Agent 'NonExistentAgent' not found.");
    });
  });

  describe('cancelTask', () => {
    beforeEach(async () => {
      await manager.loadAgent('TestAgent', {
        type: 'url',
        url: 'http://test.agent/card',
      });
    });

    it('should cancel a task on the correct agent', async () => {
      const mockTask = { id: 'task123', kind: 'task' };
      mockClient.cancelTask.mockResolvedValue(mockTask);

      const result = await manager.cancelTask('TestAgent', 'task123');
      expect(result).toBe(mockTask);
      expect(mockClient.cancelTask).toHaveBeenCalledWith({ id: 'task123' });
    });

    it('should throw prefixed error on failure', async () => {
      mockClient.cancelTask.mockRejectedValue(new Error('Cannot cancel'));

      await expect(manager.cancelTask('TestAgent', 'task123')).rejects.toThrow(
        'A2AClient cancelTask Error [TestAgent]: Cannot cancel',
      );
    });

    it('should throw an error if the agent is not found', async () => {
      await expect(
        manager.cancelTask('NonExistentAgent', 'task123'),
      ).rejects.toThrow("Agent 'NonExistentAgent' not found.");
    });
  });
});
