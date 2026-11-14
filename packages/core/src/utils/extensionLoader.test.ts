/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  describe,
  expect,
  it,
  vi,
  beforeEach,
  afterEach,
  type MockInstance,
} from 'vitest';
import { SimpleExtensionLoader } from './extensionLoader.js';
import { PolicyDecision } from '../policy/types.js';
import type { Config, GeminiCLIExtension } from '../config/config.js';
import { type McpClientManager } from '../tools/mcp-client-manager.js';
import type { GeminiClient } from '../core/client.js';
import { EventEmitter } from 'node:events';
import type { ExtensionEvents } from './extensionLoader.js';

describe('SimpleExtensionLoader', () => {
  let mockConfig: Config;
  let extensionReloadingEnabled: boolean;
  let mockMcpClientManager: McpClientManager;
  let mockGeminiClientSetTools: MockInstance<
    typeof GeminiClient.prototype.setTools
  >;
  let mockGeminiClientUpdateSystemInstruction: MockInstance;
  let mockMemoryRefresh: MockInstance;
  let mockHookSystemInit: MockInstance;
  let mockAgentRegistryReload: MockInstance;
  let mockSkillsReload: MockInstance;
  let mockPolicyEngine: {
    addRule: MockInstance;
    addChecker: MockInstance;
    removeRulesBySource: MockInstance;
    removeCheckersBySource: MockInstance;
  };

  const activeExtension: GeminiCLIExtension = {
    name: 'test-extension',
    isActive: true,
    version: '1.0.0',
    path: '/path/to/extension',
    contextFiles: [],
    excludeTools: ['some-tool'],
    id: '123',
    rules: [
      {
        toolName: 'test-tool',
        decision: PolicyDecision.ALLOW,
        source: 'Extension (test-extension): policies.toml',
      },
    ],
    checkers: [
      {
        toolName: 'test-tool',
        checker: { type: 'external', name: 'test-checker' },
        source: 'Extension (test-extension): policies.toml',
      },
    ],
  };

  const inactiveExtension: GeminiCLIExtension = {
    name: 'test-extension',
    isActive: false,
    version: '1.0.0',
    path: '/path/to/extension',
    contextFiles: [],
    id: '123',
  };

  beforeEach(() => {
    mockMcpClientManager = {
      startExtension: vi.fn(),
      stopExtension: vi.fn(),
    } as unknown as McpClientManager;
    extensionReloadingEnabled = false;
    mockGeminiClientSetTools = vi.fn();
    mockGeminiClientUpdateSystemInstruction = vi.fn();
    mockMemoryRefresh = vi.fn();
    mockHookSystemInit = vi.fn();
    mockAgentRegistryReload = vi.fn();
    mockSkillsReload = vi.fn();
    mockPolicyEngine = {
      addRule: vi.fn(),
      addChecker: vi.fn(),
      removeRulesBySource: vi.fn(),
      removeCheckersBySource: vi.fn(),
    };
    mockConfig = {
      getMcpClientManager: () => mockMcpClientManager,
      getEnableExtensionReloading: () => extensionReloadingEnabled,
      geminiClient: {
        isInitialized: () => true,
        setTools: mockGeminiClientSetTools,
        updateSystemInstruction: mockGeminiClientUpdateSystemInstruction,
      },
      getGeminiClient: vi.fn(() => ({
        isInitialized: () => true,
        setTools: mockGeminiClientSetTools,
        updateSystemInstruction: mockGeminiClientUpdateSystemInstruction,
      })),
      getMemoryContextManager: vi.fn(() => ({
        refresh: mockMemoryRefresh,
      })),
      getHookSystem: () => ({
        initialize: mockHookSystemInit,
      }),
      getAgentRegistry: () => ({
        reload: mockAgentRegistryReload,
      }),
      reloadSkills: mockSkillsReload,
      getPolicyEngine: () => mockPolicyEngine,
    } as unknown as Config;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('loader disposal', () => {
    function deferred() {
      let release!: () => void;
      let enter!: () => void;
      const entered = new Promise<void>((resolve) => {
        enter = resolve;
      });
      const pending = new Promise<void>((resolve) => {
        release = resolve;
      });
      return { release, enter, entered, pending };
    }

    it('cancels initial extension startup before late policies and completion events', async () => {
      const gate = deferred();
      const events = new EventEmitter<ExtensionEvents>();
      const emit = vi.spyOn(events, 'emit');
      vi.mocked(mockMcpClientManager.startExtension).mockImplementationOnce(
        async () => {
          gate.enter();
          await gate.pending;
        },
      );
      const loader = new SimpleExtensionLoader([activeExtension], events);
      let settled = false;
      const outcome = loader
        .start(mockConfig)
        .catch((error) => error)
        .then((value) => {
          settled = true;
          return value;
        });
      await gate.entered;
      const eventCount = emit.mock.calls.length;
      loader.dispose();
      await new Promise((resolve) => setImmediate(resolve));
      const cancelledBeforeRelease = settled;
      gate.release();
      expect(await outcome).toMatchObject({ name: 'AbortError' });
      expect(cancelledBeforeRelease).toBe(true);
      expect(mockPolicyEngine.addRule).not.toHaveBeenCalled();
      expect(mockPolicyEngine.addChecker).not.toHaveBeenCalled();
      expect(mockGeminiClientSetTools).not.toHaveBeenCalled();
      expect(emit.mock.calls.length).toBe(eventCount);
    });

    it('stops dynamic tool refresh before policies and memory are published', async () => {
      const gate = deferred();
      const loader = new SimpleExtensionLoader([]);
      await loader.start(mockConfig);
      extensionReloadingEnabled = true;
      mockGeminiClientSetTools.mockImplementationOnce(async () => {
        gate.enter();
        await gate.pending;
      });
      const outcome = loader
        .loadExtension(activeExtension)
        .catch((error) => error);
      await gate.entered;
      loader.dispose();
      expect(await outcome).toMatchObject({ name: 'AbortError' });
      gate.release();
      await new Promise((resolve) => setImmediate(resolve));
      expect(mockPolicyEngine.addRule).not.toHaveBeenCalled();
      expect(mockPolicyEngine.addChecker).not.toHaveBeenCalled();
      expect(mockMemoryRefresh).not.toHaveBeenCalled();
    });

    it('does not advance memory refresh into prompts hooks agents or skills after disposal', async () => {
      const gate = deferred();
      const loader = new SimpleExtensionLoader([]);
      await loader.start(mockConfig);
      extensionReloadingEnabled = true;
      mockMemoryRefresh.mockImplementationOnce(async () => {
        gate.enter();
        await gate.pending;
      });
      const outcome = loader
        .loadExtension(activeExtension)
        .catch((error) => error);
      await gate.entered;
      loader.dispose();
      expect(await outcome).toMatchObject({ name: 'AbortError' });
      gate.release();
      await new Promise((resolve) => setImmediate(resolve));
      expect(mockGeminiClientUpdateSystemInstruction).not.toHaveBeenCalled();
      expect(mockHookSystemInit).not.toHaveBeenCalled();
      expect(mockAgentRegistryReload).not.toHaveBeenCalled();
      expect(mockSkillsReload).not.toHaveBeenCalled();
    });

    it('rejects closed loader entrypoints before changing its extension catalog', async () => {
      const loader = new SimpleExtensionLoader([activeExtension]);
      loader.dispose();
      await expect(loader.start(mockConfig)).rejects.toMatchObject({
        name: 'AbortError',
      });
      await expect(
        loader.loadExtension(inactiveExtension),
      ).rejects.toMatchObject({ name: 'AbortError' });
      await expect(
        loader.unloadExtension(activeExtension),
      ).rejects.toMatchObject({ name: 'AbortError' });
      await expect(
        loader.restartExtension(activeExtension),
      ).rejects.toMatchObject({ name: 'AbortError' });
      expect(loader.getExtensions()).toEqual([activeExtension]);
      expect(mockMcpClientManager.startExtension).not.toHaveBeenCalled();
      expect(mockMcpClientManager.stopExtension).not.toHaveBeenCalled();
    });
  });

  it('should register policies when an extension starts', async () => {
    const loader = new SimpleExtensionLoader([activeExtension]);
    await loader.start(mockConfig);
    expect(mockPolicyEngine.addRule).toHaveBeenCalledWith(
      activeExtension.rules![0],
    );
    expect(mockPolicyEngine.addChecker).toHaveBeenCalledWith(
      activeExtension.checkers![0],
    );
  });

  it('should unregister policies when an extension stops', async () => {
    const loader = new TestingSimpleExtensionLoader([activeExtension]);
    await loader.start(mockConfig);
    await loader.stopExtension(activeExtension);
    expect(mockPolicyEngine.removeRulesBySource).toHaveBeenCalledWith(
      'Extension (test-extension): policies.toml',
    );
    expect(mockPolicyEngine.removeCheckersBySource).toHaveBeenCalledWith(
      'Extension (test-extension): policies.toml',
    );
  });

  it('should start active extensions', async () => {
    const loader = new SimpleExtensionLoader([activeExtension]);
    await loader.start(mockConfig);
    expect(mockMcpClientManager.startExtension).toHaveBeenCalledExactlyOnceWith(
      activeExtension,
    );
  });

  it('should not start inactive extensions', async () => {
    const loader = new SimpleExtensionLoader([inactiveExtension]);
    await loader.start(mockConfig);
    expect(mockMcpClientManager.startExtension).not.toHaveBeenCalled();
  });

  describe('interactive extension loading and unloading', () => {
    it('should not call `start` or `stop` if the loader is not already started', async () => {
      const loader = new SimpleExtensionLoader([]);
      await loader.loadExtension(activeExtension);
      expect(mockMcpClientManager.startExtension).not.toHaveBeenCalled();
      await loader.unloadExtension(activeExtension);
      expect(mockMcpClientManager.stopExtension).not.toHaveBeenCalled();
    });

    it('should start extensions that were explicitly loaded prior to initializing the loader', async () => {
      const loader = new SimpleExtensionLoader([]);
      await loader.loadExtension(activeExtension);
      expect(mockMcpClientManager.startExtension).not.toHaveBeenCalled();
      await loader.start(mockConfig);
      expect(
        mockMcpClientManager.startExtension,
      ).toHaveBeenCalledExactlyOnceWith(activeExtension);
    });

    describe.each([true, false])(
      'when enableExtensionReloading === $i',
      (reloadingEnabled) => {
        beforeEach(() => {
          extensionReloadingEnabled = reloadingEnabled;
        });

        it(`should ${reloadingEnabled ? '' : 'not '}reload extension features`, async () => {
          const loader = new SimpleExtensionLoader([]);
          await loader.start(mockConfig);
          expect(mockMcpClientManager.startExtension).not.toHaveBeenCalled();
          await loader.loadExtension(activeExtension);
          if (reloadingEnabled) {
            expect(
              mockMcpClientManager.startExtension,
            ).toHaveBeenCalledExactlyOnceWith(activeExtension);
            expect(mockMemoryRefresh).toHaveBeenCalledOnce();
            expect(
              mockGeminiClientUpdateSystemInstruction,
            ).toHaveBeenCalledOnce();
            expect(mockHookSystemInit).toHaveBeenCalledOnce();
            expect(mockGeminiClientSetTools).toHaveBeenCalledOnce();
            expect(mockAgentRegistryReload).toHaveBeenCalledOnce();
            expect(mockSkillsReload).toHaveBeenCalledOnce();
          } else {
            expect(mockMcpClientManager.startExtension).not.toHaveBeenCalled();
            expect(mockMemoryRefresh).not.toHaveBeenCalled();
            expect(
              mockGeminiClientUpdateSystemInstruction,
            ).not.toHaveBeenCalled();
            expect(mockHookSystemInit).not.toHaveBeenCalled();
            expect(mockGeminiClientSetTools).not.toHaveBeenCalledOnce();
            expect(mockAgentRegistryReload).not.toHaveBeenCalled();
            expect(mockSkillsReload).not.toHaveBeenCalled();
          }
          mockMemoryRefresh.mockClear();
          mockGeminiClientUpdateSystemInstruction.mockClear();
          mockHookSystemInit.mockClear();
          mockGeminiClientSetTools.mockClear();
          mockAgentRegistryReload.mockClear();
          mockSkillsReload.mockClear();

          await loader.unloadExtension(activeExtension);
          if (reloadingEnabled) {
            expect(
              mockMcpClientManager.stopExtension,
            ).toHaveBeenCalledExactlyOnceWith(activeExtension);
            expect(mockMemoryRefresh).toHaveBeenCalledOnce();
            expect(
              mockGeminiClientUpdateSystemInstruction,
            ).toHaveBeenCalledOnce();
            expect(mockHookSystemInit).toHaveBeenCalledOnce();
            expect(mockGeminiClientSetTools).toHaveBeenCalledOnce();
            expect(mockAgentRegistryReload).toHaveBeenCalledOnce();
            expect(mockSkillsReload).toHaveBeenCalledOnce();
          } else {
            expect(mockMcpClientManager.stopExtension).not.toHaveBeenCalled();
            expect(mockMemoryRefresh).not.toHaveBeenCalled();
            expect(
              mockGeminiClientUpdateSystemInstruction,
            ).not.toHaveBeenCalled();
            expect(mockHookSystemInit).not.toHaveBeenCalled();
            expect(mockGeminiClientSetTools).not.toHaveBeenCalledOnce();
            expect(mockAgentRegistryReload).not.toHaveBeenCalled();
            expect(mockSkillsReload).not.toHaveBeenCalled();
          }
        });

        it.runIf(reloadingEnabled)(
          'Should only reload memory once all extensions are done',
          async () => {
            const anotherExtension = {
              ...activeExtension,
              name: 'another-extension',
            };
            const loader = new SimpleExtensionLoader([]);
            await loader.loadExtension(activeExtension);
            await loader.start(mockConfig);
            expect(mockMemoryRefresh).not.toHaveBeenCalled();
            await Promise.all([
              loader.unloadExtension(activeExtension),
              loader.loadExtension(anotherExtension),
            ]);
            expect(mockMemoryRefresh).toHaveBeenCalledOnce();
            expect(
              mockGeminiClientUpdateSystemInstruction,
            ).toHaveBeenCalledOnce();
            expect(mockHookSystemInit).toHaveBeenCalledOnce();
            expect(mockAgentRegistryReload).toHaveBeenCalledOnce();
            expect(mockSkillsReload).toHaveBeenCalledOnce();
          },
        );
      },
    );
  });

  describe('restartExtension', () => {
    it('should stop and then start the extension', async () => {
      const loader = new TestingSimpleExtensionLoader([activeExtension]);
      vi.spyOn(loader, 'stopExtension');
      vi.spyOn(loader, 'startExtension');
      await loader.start(mockConfig);
      await loader.restartExtension(activeExtension);
      expect(loader.stopExtension).toHaveBeenCalledWith(activeExtension);
      expect(loader.startExtension).toHaveBeenCalledWith(activeExtension);
      expect(mockSkillsReload).toHaveBeenCalledTimes(2);
    });
  });
});

// Adding these overrides allows us to access the protected members.
class TestingSimpleExtensionLoader extends SimpleExtensionLoader {
  override async startExtension(extension: GeminiCLIExtension): Promise<void> {
    await super.startExtension(extension);
  }

  override async stopExtension(extension: GeminiCLIExtension): Promise<void> {
    await super.stopExtension(extension);
  }
}
