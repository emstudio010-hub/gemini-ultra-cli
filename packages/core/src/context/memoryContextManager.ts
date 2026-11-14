/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  loadJitSubdirectoryMemory,
  concatenateInstructions,
  getGlobalMemoryPaths,
  getUserProjectMemoryPaths,
  getExtensionMemoryPaths,
  getEnvironmentMemoryPaths,
  readGeminiMdFiles,
  categorizeAndConcatenate,
  type GeminiFileContent,
  deduplicatePathsByFileIdentity,
} from '../utils/memoryDiscovery.js';
import type { Config } from '../config/config.js';
import { coreEvents, CoreEvent } from '../utils/events.js';
import { withAbortSignal } from '../utils/withAbortSignal.js';
import { I18nManager } from '../i18n/i18nManager.js';

export class MemoryRefreshTimeoutError extends Error {
  override name = 'MemoryRefreshTimeoutError';
  constructor() {
    super(
      I18nManager.getInstance().t(
        '记忆加载超过 10 秒，原有上下文已保留。请检查记忆文件后运行 /memory refresh；若正在启动，请修复后重新启动 CLI。',
        'Memory loading exceeded 10 seconds; prior context was retained. Check memory files and retry /memory refresh, or restart the CLI if initialization failed.',
      ),
    );
  }
}

export class MemoryContextManager {
  private readonly loadedPaths: Set<string> = new Set();
  private readonly loadedFileIdentities: Set<string> = new Set();
  private readonly config: Config;
  private globalMemory: string = '';
  private extensionMemory: string = '';
  private projectMemory: string = '';
  private userProjectMemoryContent: string = '';
  private refreshController?: AbortController;

  constructor(config: Config) {
    this.config = config;
  }

  /**
   * Refreshes the memory by reloading global, extension, and project memory.
   */
  async refresh(signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    this.refreshController?.abort(
      new DOMException('Memory refresh superseded.', 'AbortError'),
    );
    const controller = new AbortController();
    this.refreshController = controller;
    const refreshSignal = signal
      ? AbortSignal.any([signal, controller.signal])
      : controller.signal;
    const timer = setTimeout(
      () => controller.abort(new MemoryRefreshTimeoutError()),
      10_000,
    );
    try {
      const paths = await withAbortSignal(refreshSignal, () =>
        this.discoverMemoryPaths(),
      );
      const loaded = await withAbortSignal(refreshSignal, () =>
        this.loadMemoryContents(paths, refreshSignal),
      );
      const memory = this.categorizeMemoryContents(paths, loaded.contentsMap);
      refreshSignal.throwIfAborted();
      this.globalMemory = memory.global;
      this.extensionMemory = memory.extension;
      this.projectMemory = memory.project;
      this.userProjectMemoryContent = memory.userProjectMemory;
      this.loadedPaths.clear();
      this.loadedFileIdentities.clear();
      this.markAsLoaded(loaded.paths);
      for (const identity of loaded.identities)
        this.loadedFileIdentities.add(identity);
      this.emitMemoryChanged();
    } finally {
      clearTimeout(timer);
      if (this.refreshController === controller)
        this.refreshController = undefined;
    }
  }

  private async discoverMemoryPaths() {
    const [global, extension, project, userProjectMemory] = await Promise.all([
      getGlobalMemoryPaths(),
      Promise.resolve(
        getExtensionMemoryPaths(this.config.getExtensionLoader()),
      ),
      this.config.isTrustedFolder()
        ? getEnvironmentMemoryPaths(
            [...this.config.getWorkspaceContext().getDirectories()],
            this.config.getMemoryBoundaryMarkers(),
          )
        : Promise.resolve([]),
      getUserProjectMemoryPaths(this.config.storage.getProjectMemoryDir()),
    ]);

    return { global, extension, project, userProjectMemory };
  }

  private async loadMemoryContents(
    paths: {
      global: string[];
      extension: string[];
      project: string[];
      userProjectMemory: string[];
    },
    signal: AbortSignal,
  ) {
    const allPathsStringDeduped = Array.from(
      new Set([
        ...paths.global,
        ...paths.extension,
        ...paths.project,
        ...paths.userProjectMemory,
      ]),
    );

    // deduplicate by file identity to handle case-insensitive filesystems
    const { paths: allPaths, identityMap: pathIdentityMap } =
      await withAbortSignal(signal, () =>
        deduplicatePathsByFileIdentity(allPathsStringDeduped),
      );

    const allContents = await withAbortSignal(signal, () =>
      readGeminiMdFiles(
        allPaths,
        this.config.getImportFormat(),
        this.config.getMemoryBoundaryMarkers(),
      ),
    );

    const loadedFilePaths = allContents
      .filter((c) => c.content !== null)
      .map((c) => c.filePath);
    return {
      contentsMap: new Map(allContents.map((c) => [c.filePath, c])),
      paths: loadedFilePaths,
      identities: loadedFilePaths.flatMap((file) =>
        pathIdentityMap.has(file) ? [pathIdentityMap.get(file)!] : [],
      ),
    };
  }

  private categorizeMemoryContents(
    paths: {
      global: string[];
      extension: string[];
      project: string[];
      userProjectMemory: string[];
    },
    contentsMap: Map<string, GeminiFileContent>,
  ) {
    const hierarchicalMemory = categorizeAndConcatenate(paths, contentsMap);

    const mcpInstructions =
      this.config.getMcpClientManager()?.getMcpInstructions() || '';
    const projectMemoryWithMcp = [
      hierarchicalMemory.project,
      mcpInstructions.trimStart(),
    ]
      .filter(Boolean)
      .join('\n\n');

    return {
      global: hierarchicalMemory.global || '',
      extension: hierarchicalMemory.extension || '',
      userProjectMemory: hierarchicalMemory.userProjectMemory || '',
      project: this.config.isTrustedFolder() ? projectMemoryWithMcp : '',
    };
  }

  /**
   * Discovers and loads context for a specific accessed path (Tier 3 - JIT).
   * Traverses upwards from the accessed path to the project root.
   */
  async discoverContext(
    accessedPath: string,
    trustedRoots: string[],
  ): Promise<string> {
    if (!this.config.isTrustedFolder()) {
      return '';
    }
    const result = await loadJitSubdirectoryMemory(
      accessedPath,
      trustedRoots,
      this.loadedPaths,
      this.loadedFileIdentities,
      this.config.getMemoryBoundaryMarkers(),
    );

    if (result.files.length === 0) {
      return '';
    }

    const newFilePaths = result.files.map((f) => f.path);
    this.markAsLoaded(newFilePaths);

    // Cache identities for newly loaded files
    if (result.fileIdentities) {
      for (const identity of result.fileIdentities) {
        this.loadedFileIdentities.add(identity);
      }
    }
    return concatenateInstructions(
      result.files.map((f) => ({ filePath: f.path, content: f.content })),
    );
  }

  private emitMemoryChanged(): void {
    coreEvents.emit(CoreEvent.MemoryChanged, {
      fileCount: this.loadedPaths.size,
    });
  }

  getGlobalMemory(): string {
    return this.globalMemory;
  }

  getExtensionMemory(): string {
    return this.extensionMemory;
  }

  getEnvironmentMemory(): string {
    return this.config.isTrustedFolder() ? this.projectMemory : '';
  }

  getUserProjectMemory(): string {
    return this.userProjectMemoryContent;
  }

  private markAsLoaded(paths: string[]): void {
    paths.forEach((p) => this.loadedPaths.add(p));
  }

  getLoadedPaths(): ReadonlySet<string> {
    return this.loadedPaths;
  }
}
