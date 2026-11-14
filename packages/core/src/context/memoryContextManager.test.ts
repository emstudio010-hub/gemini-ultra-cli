/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryContextManager } from './memoryContextManager.js';
import * as memoryDiscovery from '../utils/memoryDiscovery.js';
import type { Config } from '../config/config.js';
import { coreEvents, CoreEvent } from '../utils/events.js';

// Mock memoryDiscovery module
vi.mock('../utils/memoryDiscovery.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../utils/memoryDiscovery.js')>();
  return {
    ...actual,
    getGlobalMemoryPaths: vi.fn(),
    getUserProjectMemoryPaths: vi.fn(),
    getExtensionMemoryPaths: vi.fn(),
    getEnvironmentMemoryPaths: vi.fn(),
    readGeminiMdFiles: vi.fn(),
    loadJitSubdirectoryMemory: vi.fn(),
    deduplicatePathsByFileIdentity: vi.fn(),
    concatenateInstructions: vi
      .fn()
      .mockImplementation(actual.concatenateInstructions),
  };
});

describe('MemoryContextManager', () => {
  let memoryContextManager: MemoryContextManager;
  let mockConfig: Config;
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    mockConfig = {
      getWorkingDir: vi.fn().mockReturnValue('/app'),
      getImportFormat: vi.fn().mockReturnValue('tree'),
      getWorkspaceContext: vi.fn().mockReturnValue({
        getDirectories: vi.fn().mockReturnValue(['/app']),
      }),
      getExtensionLoader: vi.fn().mockReturnValue({
        getExtensions: vi.fn().mockReturnValue([]),
      }),
      getMcpClientManager: vi.fn().mockReturnValue({
        getMcpInstructions: vi.fn().mockReturnValue('MCP Instructions'),
      }),
      isTrustedFolder: vi.fn().mockReturnValue(true),
      getMemoryBoundaryMarkers: vi.fn().mockReturnValue(['.git']),
      storage: {
        getProjectMemoryDir: vi
          .fn()
          .mockReturnValue('/home/user/.gemini/memory/test-project'),
      },
    } as unknown as Config;

    memoryContextManager = new MemoryContextManager(mockConfig);
    vi.clearAllMocks();
    vi.spyOn(coreEvents, 'emit');
    vi.mocked(memoryDiscovery.getExtensionMemoryPaths).mockReturnValue([]);
    vi.mocked(memoryDiscovery.getUserProjectMemoryPaths).mockResolvedValue([]);
    // default mock: deduplication returns paths as-is (no deduplication)
    vi.mocked(
      memoryDiscovery.deduplicatePathsByFileIdentity,
    ).mockImplementation(async (paths: string[]) => ({
      paths,
      identityMap: new Map<string, string>(),
    }));
  });

  describe('refresh', () => {
    it('should load and format global and environment memory', async () => {
      const globalPaths = ['/home/user/.gemini/GEMINI.md'];
      const envPaths = ['/app/GEMINI.md'];

      vi.mocked(memoryDiscovery.getGlobalMemoryPaths).mockResolvedValue(
        globalPaths,
      );
      vi.mocked(memoryDiscovery.getEnvironmentMemoryPaths).mockResolvedValue(
        envPaths,
      );

      vi.mocked(memoryDiscovery.readGeminiMdFiles).mockResolvedValue([
        { filePath: globalPaths[0], content: 'Global Content' },
        { filePath: envPaths[0], content: 'Env Content' },
      ]);

      await memoryContextManager.refresh();

      expect(memoryDiscovery.getGlobalMemoryPaths).toHaveBeenCalled();
      expect(memoryDiscovery.getEnvironmentMemoryPaths).toHaveBeenCalledWith(
        ['/app'],
        ['.git'],
      );
      expect(memoryDiscovery.readGeminiMdFiles).toHaveBeenCalledWith(
        expect.arrayContaining([...globalPaths, ...envPaths]),
        'tree',
        ['.git'],
      );

      expect(memoryContextManager.getGlobalMemory()).toContain(
        'Global Content',
      );
      expect(memoryContextManager.getEnvironmentMemory()).toContain(
        'Env Content',
      );
      expect(memoryContextManager.getEnvironmentMemory()).toContain(
        'MCP Instructions',
      );

      expect(memoryContextManager.getLoadedPaths()).toContain(globalPaths[0]);
      expect(memoryContextManager.getLoadedPaths()).toContain(envPaths[0]);
    });

    it('should emit MemoryChanged event when memory is refreshed', async () => {
      vi.mocked(memoryDiscovery.getGlobalMemoryPaths).mockResolvedValue([
        '/app/GEMINI.md',
      ]);
      vi.mocked(memoryDiscovery.getEnvironmentMemoryPaths).mockResolvedValue([
        '/app/src/GEMINI.md',
      ]);
      vi.mocked(memoryDiscovery.readGeminiMdFiles).mockResolvedValue([
        { filePath: '/app/GEMINI.md', content: 'content' },
        { filePath: '/app/src/GEMINI.md', content: 'env content' },
      ]);

      await memoryContextManager.refresh();

      expect(coreEvents.emit).toHaveBeenCalledWith(CoreEvent.MemoryChanged, {
        fileCount: 2,
      });
    });

    it('should not load environment memory if folder is not trusted', async () => {
      vi.mocked(mockConfig.isTrustedFolder).mockReturnValue(false);
      vi.mocked(memoryDiscovery.getGlobalMemoryPaths).mockResolvedValue([
        '/home/user/.gemini/GEMINI.md',
      ]);
      vi.mocked(memoryDiscovery.readGeminiMdFiles).mockResolvedValue([
        { filePath: '/home/user/.gemini/GEMINI.md', content: 'Global Content' },
      ]);

      await memoryContextManager.refresh();

      expect(memoryDiscovery.getEnvironmentMemoryPaths).not.toHaveBeenCalled();
      expect(memoryContextManager.getEnvironmentMemory()).toBe('');
      expect(memoryContextManager.getGlobalMemory()).toContain(
        'Global Content',
      );
    });

    it('should deduplicate files by file identity in case-insensitive filesystems', async () => {
      const globalPaths = ['/home/user/.gemini/GEMINI.md'];
      const envPaths = ['/app/gemini.md', '/app/GEMINI.md'];

      vi.mocked(memoryDiscovery.getGlobalMemoryPaths).mockResolvedValue(
        globalPaths,
      );
      vi.mocked(memoryDiscovery.getEnvironmentMemoryPaths).mockResolvedValue(
        envPaths,
      );

      // mock deduplication to return deduplicated paths (simulating same file)
      vi.mocked(
        memoryDiscovery.deduplicatePathsByFileIdentity,
      ).mockResolvedValue({
        paths: ['/home/user/.gemini/GEMINI.md', '/app/gemini.md'],
        identityMap: new Map<string, string>(),
      });

      vi.mocked(memoryDiscovery.readGeminiMdFiles).mockResolvedValue([
        { filePath: '/home/user/.gemini/GEMINI.md', content: 'Global Content' },
        { filePath: '/app/gemini.md', content: 'Project Content' },
      ]);

      await memoryContextManager.refresh();

      expect(
        memoryDiscovery.deduplicatePathsByFileIdentity,
      ).toHaveBeenCalledWith(
        expect.arrayContaining([
          '/home/user/.gemini/GEMINI.md',
          '/app/gemini.md',
          '/app/GEMINI.md',
        ]),
      );
      expect(memoryDiscovery.readGeminiMdFiles).toHaveBeenCalledWith(
        ['/home/user/.gemini/GEMINI.md', '/app/gemini.md'],
        'tree',
        ['.git'],
      );
      expect(memoryContextManager.getEnvironmentMemory()).toContain(
        'Project Content',
      );
    });
  });

  describe('refresh transaction', () => {
    const file = '/home/user/.gemini/GEMINI.md';
    async function seed() {
      vi.mocked(memoryDiscovery.getGlobalMemoryPaths).mockResolvedValue([file]);
      vi.mocked(memoryDiscovery.getEnvironmentMemoryPaths).mockResolvedValue(
        [],
      );
      vi.mocked(memoryDiscovery.readGeminiMdFiles).mockResolvedValue([
        { filePath: file, content: 'Retained instruction' },
      ]);
      await memoryContextManager.refresh();
      vi.mocked(coreEvents.emit).mockClear();
    }
    it('retains content, loaded paths and change notifications when discovery fails', async () => {
      await seed();
      vi.mocked(memoryDiscovery.getGlobalMemoryPaths).mockRejectedValueOnce(
        new Error('Discovery failed'),
      );
      await expect(memoryContextManager.refresh()).rejects.toThrow(
        'Discovery failed',
      );
      expect(memoryContextManager.getGlobalMemory()).toContain(
        'Retained instruction',
      );
      expect([...memoryContextManager.getLoadedPaths()]).toEqual([file]);
      expect(coreEvents.emit).not.toHaveBeenCalled();
    });
    it.each(['en', 'zh'] as const)(
      'times out in %s without discarding or later replacing prior context',
      async (locale) => {
        await seed();
        vi.useFakeTimers();
        const { I18nManager } = await import('../i18n/i18nManager.js');
        const translate = vi
          .spyOn(I18nManager.getInstance(), 't')
          .mockImplementation((zh, en) => (locale === 'zh' ? zh : en));
        let release!: (value: memoryDiscovery.GeminiFileContent[]) => void;
        vi.mocked(memoryDiscovery.readGeminiMdFiles).mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              release = resolve;
            }),
        );
        const loading = memoryContextManager.refresh().catch((error) => error);
        await vi.advanceTimersByTimeAsync(10_001);
        const error = await loading;
        expect(error.name).toBe('MemoryRefreshTimeoutError');
        expect(error.message).toContain('/memory refresh');
        expect(error.message).toContain(
          locale === 'zh' ? '超过 10 秒' : 'exceeded 10 seconds',
        );
        expect(memoryContextManager.getGlobalMemory()).toContain(
          'Retained instruction',
        );
        expect([...memoryContextManager.getLoadedPaths()]).toEqual([file]);
        release([{ filePath: '/late/GEMINI.md', content: 'Late instruction' }]);
        await vi.advanceTimersByTimeAsync(0);
        expect(memoryContextManager.getGlobalMemory()).not.toContain(
          'Late instruction',
        );
        expect(coreEvents.emit).not.toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);
        translate.mockRestore();
      },
    );
    it('rejects a superseded refresh while publishing only the newest content and paths', async () => {
      await seed();
      let release!: (value: string[]) => void;
      vi.mocked(memoryDiscovery.getGlobalMemoryPaths).mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      );
      const older = memoryContextManager.refresh().catch((error) => error);
      vi.mocked(memoryDiscovery.getGlobalMemoryPaths).mockResolvedValue([
        '/new/GEMINI.md',
      ]);
      vi.mocked(memoryDiscovery.readGeminiMdFiles).mockResolvedValue([
        { filePath: '/new/GEMINI.md', content: 'Newest instruction' },
      ]);
      await memoryContextManager.refresh();
      expect((await older).name).toBe('AbortError');
      release(['/old/GEMINI.md']);
      await new Promise((resolve) => setImmediate(resolve));
      expect(memoryContextManager.getGlobalMemory()).toContain(
        'Newest instruction',
      );
      expect([...memoryContextManager.getLoadedPaths()]).toEqual([
        '/new/GEMINI.md',
      ]);
      expect(coreEvents.emit).toHaveBeenCalledTimes(1);
    });
    it('propagates explicit cancellation without clearing the previous loaded paths', async () => {
      await seed();
      const controller = new AbortController();
      const reason = new Error('Cancelled by caller');
      vi.mocked(memoryDiscovery.getGlobalMemoryPaths).mockReturnValueOnce(
        new Promise(() => {}),
      );
      const loading = memoryContextManager
        .refresh(controller.signal)
        .catch((error) => error);
      controller.abort(reason);
      expect(await loading).toBe(reason);
      expect([...memoryContextManager.getLoadedPaths()]).toEqual([file]);
      expect(coreEvents.emit).not.toHaveBeenCalled();
    });
    it('keeps the previous snapshot if categorization fails and gates retained project memory after trust is removed', async () => {
      await seed();
      vi.mocked(mockConfig.getMcpClientManager).mockImplementationOnce(() => {
        throw new Error('MCP instructions unavailable');
      });
      await expect(memoryContextManager.refresh()).rejects.toThrow(
        'MCP instructions unavailable',
      );
      expect([...memoryContextManager.getLoadedPaths()]).toEqual([file]);
      expect(memoryContextManager.getGlobalMemory()).toContain(
        'Retained instruction',
      );
      vi.mocked(mockConfig.isTrustedFolder).mockReturnValue(false);
      expect(memoryContextManager.getEnvironmentMemory()).toBe('');
      expect(coreEvents.emit).not.toHaveBeenCalled();
    });
  });

  describe('discoverContext', () => {
    const file = '/app/src/GEMINI.md';
    const loaded = {
      files: [{ path: file, content: 'Scoped rule' }],
      fileIdentities: ['dev:1'],
    };
    function deferred<T>() {
      let resolve!: (value: T) => void;
      const promise = new Promise<T>((done) => {
        resolve = done;
      });
      return { promise, resolve };
    }

    it.each(['en', 'zh'] as const)(
      'bounds %s JIT waits and ignores late reads without poisoning retry',
      async (locale) => {
        const { I18nManager } = await import('../i18n/i18nManager.js');
        const i18n = I18nManager.getInstance();
        const previousLocale = i18n.getLocale();
        i18n.setLocale(locale);
        vi.useFakeTimers();
        const pending = deferred<memoryDiscovery.MemoryLoadResult>();
        vi.mocked(memoryDiscovery.loadJitSubdirectoryMemory)
          .mockReturnValueOnce(pending.promise)
          .mockResolvedValue(loaded);
        try {
          const outcome = memoryContextManager
            .discoverContext('/app/src/a.ts', ['/app'])
            .catch((error) => error);
          await vi.advanceTimersByTimeAsync(10_000);
          const error = await outcome;
          expect(error).toMatchObject({ name: 'MemoryContextTimeoutError' });
          expect(error.message).toContain(
            locale === 'zh' ? '子目录记忆' : 'Subdirectory memory',
          );
          pending.resolve(loaded);
          await Promise.resolve();
          expect(memoryContextManager.getLoadedPaths().size).toBe(0);
          expect(
            await memoryContextManager.discoverContext('/app/src/a.ts', [
              '/app',
            ]),
          ).toContain('Scoped rule');
        } finally {
          i18n.setLocale(previousLocale);
        }
      },
    );

    it('serializes JIT discovery using the last committed identity snapshot', async () => {
      const pending = deferred<memoryDiscovery.MemoryLoadResult>();
      const entered = deferred<void>();
      let secondSnapshot: { path: boolean; identity: boolean } | undefined;
      vi.mocked(memoryDiscovery.loadJitSubdirectoryMemory)
        .mockImplementationOnce(() => {
          entered.resolve();
          return pending.promise;
        })
        .mockImplementationOnce(async (_path, _roots, paths, identities) => {
          secondSnapshot = {
            path: paths.has(file),
            identity: identities?.has('dev:1') ?? false,
          };
          return { files: [] };
        });
      const first = memoryContextManager.discoverContext('/app/src/a.ts', [
        '/app',
      ]);
      await entered.promise;
      const second = memoryContextManager.discoverContext('/app/src/b.ts', [
        '/app',
      ]);
      expect(memoryDiscovery.loadJitSubdirectoryMemory).toHaveBeenCalledTimes(
        1,
      );
      pending.resolve(loaded);
      expect(await first).toContain('Scoped rule');
      expect(await second).toBe('');
      expect(secondSnapshot).toEqual({ path: true, identity: true });
    });

    it('cancels queued JIT work before reading and leaves later work runnable', async () => {
      const pending = deferred<memoryDiscovery.MemoryLoadResult>();
      const entered = deferred<void>();
      vi.mocked(memoryDiscovery.loadJitSubdirectoryMemory)
        .mockImplementationOnce(() => {
          entered.resolve();
          return pending.promise;
        })
        .mockResolvedValue({ files: [] });
      const first = memoryContextManager.discoverContext('/app/src/a.ts', [
        '/app',
      ]);
      await entered.promise;
      const controller = new AbortController();
      const second = memoryContextManager
        .discoverContext('/app/src/b.ts', ['/app'], controller.signal)
        .catch((error) => error);
      controller.abort();
      expect(await second).toMatchObject({ name: 'AbortError' });
      expect(memoryDiscovery.loadJitSubdirectoryMemory).toHaveBeenCalledTimes(
        1,
      );
      const third = memoryContextManager.discoverContext('/app/src/c.ts', [
        '/app',
      ]);
      await new Promise((resolve) => setImmediate(resolve));
      expect(memoryDiscovery.loadJitSubdirectoryMemory).toHaveBeenCalledTimes(
        1,
      );
      pending.resolve(loaded);
      await first;
      await third;
      expect(memoryDiscovery.loadJitSubdirectoryMemory).toHaveBeenCalledTimes(
        2,
      );
    });

    it('invalidates old JIT on refresh and waits for the new refresh snapshot', async () => {
      const pending = deferred<memoryDiscovery.MemoryLoadResult>();
      const entered = deferred<void>();
      vi.mocked(memoryDiscovery.loadJitSubdirectoryMemory)
        .mockImplementationOnce(() => {
          entered.resolve();
          return pending.promise;
        })
        .mockResolvedValue({ files: [] });
      const old = memoryContextManager
        .discoverContext('/app/src/a.ts', ['/app'])
        .catch((error) => error);
      await entered.promise;
      const discovered = deferred<string[]>();
      vi.mocked(memoryDiscovery.getGlobalMemoryPaths).mockReturnValueOnce(
        discovered.promise,
      );
      vi.mocked(memoryDiscovery.getEnvironmentMemoryPaths).mockResolvedValue(
        [],
      );
      vi.mocked(memoryDiscovery.readGeminiMdFiles).mockResolvedValue([]);
      const refresh = memoryContextManager.refresh();
      expect(await old).toMatchObject({ name: 'AbortError' });
      const fresh = memoryContextManager.discoverContext('/app/src/b.ts', [
        '/app',
      ]);
      await Promise.resolve();
      expect(memoryDiscovery.loadJitSubdirectoryMemory).toHaveBeenCalledTimes(
        1,
      );
      discovered.resolve([]);
      await refresh;
      await fresh;
      pending.resolve(loaded);
      await Promise.resolve();
      expect(memoryContextManager.getLoadedPaths().size).toBe(0);
    });

    it('dispose cancels active JIT and refresh and rejects future operations', async () => {
      const pending = deferred<memoryDiscovery.MemoryLoadResult>();
      const entered = deferred<void>();
      vi.mocked(
        memoryDiscovery.loadJitSubdirectoryMemory,
      ).mockImplementationOnce(() => {
        entered.resolve();
        return pending.promise;
      });
      const old = memoryContextManager
        .discoverContext('/app/src/a.ts', ['/app'])
        .catch((error) => error);
      await entered.promise;
      memoryContextManager.dispose();
      expect(await old).toMatchObject({ name: 'AbortError' });
      pending.resolve(loaded);
      await expect(memoryContextManager.refresh()).rejects.toMatchObject({
        name: 'AbortError',
      });
      await expect(
        memoryContextManager.discoverContext('/app/src/a.ts', ['/app']),
      ).rejects.toMatchObject({ name: 'AbortError' });
      expect(memoryContextManager.getLoadedPaths().size).toBe(0);

      const another = new MemoryContextManager(mockConfig);
      vi.mocked(memoryDiscovery.getGlobalMemoryPaths).mockReturnValue(
        new Promise(() => {}),
      );
      const refresh = another.refresh().catch((error) => error);
      another.dispose();
      expect(await refresh).toMatchObject({ name: 'AbortError' });
    });

    it('does not publish or mark rules loaded after trust is revoked', async () => {
      const pending = deferred<memoryDiscovery.MemoryLoadResult>();
      const entered = deferred<void>();
      vi.mocked(
        memoryDiscovery.loadJitSubdirectoryMemory,
      ).mockImplementationOnce(() => {
        entered.resolve();
        return pending.promise;
      });
      const operation = memoryContextManager.discoverContext('/app/src/a.ts', [
        '/app',
      ]);
      await entered.promise;
      vi.mocked(mockConfig.isTrustedFolder).mockReturnValue(false);
      pending.resolve(loaded);
      expect(await operation).toBe('');
      expect(memoryContextManager.getLoadedPaths().size).toBe(0);
    });

    it('should discover and load new context', async () => {
      const mockResult: memoryDiscovery.MemoryLoadResult = {
        files: [{ path: '/app/src/GEMINI.md', content: 'Src Content' }],
      };
      vi.mocked(memoryDiscovery.loadJitSubdirectoryMemory).mockResolvedValue(
        mockResult,
      );

      const result = await memoryContextManager.discoverContext(
        '/app/src/file.ts',
        ['/app'],
      );

      expect(memoryDiscovery.loadJitSubdirectoryMemory).toHaveBeenCalledWith(
        '/app/src/file.ts',
        ['/app'],
        expect.any(Set),
        expect.any(Set),
        ['.git'],
      );
      expect(result).toMatch(/--- Context from: \/app\/src\/GEMINI\.md ---/);
      expect(result).toContain('Src Content');
      expect(memoryContextManager.getLoadedPaths()).toContain(
        '/app/src/GEMINI.md',
      );
    });

    it('should return empty string if no new files found', async () => {
      const mockResult: memoryDiscovery.MemoryLoadResult = { files: [] };
      vi.mocked(memoryDiscovery.loadJitSubdirectoryMemory).mockResolvedValue(
        mockResult,
      );

      const result = await memoryContextManager.discoverContext(
        '/app/src/file.ts',
        ['/app'],
      );

      expect(result).toBe('');
    });

    it('should return empty string if folder is not trusted', async () => {
      vi.mocked(mockConfig.isTrustedFolder).mockReturnValue(false);

      const result = await memoryContextManager.discoverContext(
        '/app/src/file.ts',
        ['/app'],
      );

      expect(memoryDiscovery.loadJitSubdirectoryMemory).not.toHaveBeenCalled();
      expect(result).toBe('');
    });

    it('should pass custom boundary markers from config', async () => {
      const customMarkers = ['.monorepo-root', 'package.json'];
      vi.mocked(mockConfig.getMemoryBoundaryMarkers).mockReturnValue(
        customMarkers,
      );
      vi.mocked(memoryDiscovery.loadJitSubdirectoryMemory).mockResolvedValue({
        files: [],
      });

      await memoryContextManager.discoverContext('/app/src/file.ts', ['/app']);

      expect(memoryDiscovery.loadJitSubdirectoryMemory).toHaveBeenCalledWith(
        '/app/src/file.ts',
        ['/app'],
        expect.any(Set),
        expect.any(Set),
        customMarkers,
      );
    });
  });
});
