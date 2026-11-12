/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { randomUUID, createHash } from 'node:crypto';
import { lockSync } from 'proper-lockfile';
import { I18nManager } from '../i18n/i18nManager.js';
import { z } from 'zod';
import { readLocalJsonConfig } from '../utils/localJsonConfig.js';
import {
  readProviderCatalog,
  ProviderCatalogSizeError,
} from './providerCatalog.js';
import {
  type ExternalProviderProfile,
  type ProviderProtocol,
  type ProvidersConfigFile,
  type ReasoningEffortLevel,
  PROVIDER_PRESET_TEMPLATES,
} from './providerTypes.js';

function getDefaultProvidersFilePath(): string {
  const customPath = process.env['GEMINI_ULTRA_PROVIDERS_FILE'];
  if (customPath) {
    return customPath;
  }
  return path.join(os.homedir(), '.gemini', 'ultra-providers.json');
}

export function slugifyProviderId(name: string): string {
  const cleaned = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5-_]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || `provider-${Date.now()}`;
}

export function inferProtocolFromUrl(baseUrl: string): ProviderProtocol {
  const lower = baseUrl
    .trim()
    .toLowerCase()
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '');
  if (
    lower.includes('/anthropic') ||
    lower.includes('anthropic.com') ||
    lower.endsWith('/messages')
  ) {
    return 'anthropic';
  }
  if (lower.endsWith('/responses')) {
    return 'openai-responses';
  }
  if (lower.includes('generativelanguage.googleapis.com')) {
    return 'gemini';
  }
  return 'openai-chat';
}

export function normalizeProviderUrl(value: string): string {
  const url = new URL(value.trim());
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error('Use an HTTP(S) endpoint without embedded credentials.');
  url.hash = '';
  url.search = '';
  return url.href
    .replace(/\/+$/, '')
    .replace(/\/(chat\/completions|responses|messages|models)$/i, '');
}

const modelId = z.string().trim().min(1);
const MAX_PROVIDERS_FILE_BYTES = 4 * 1024 * 1024;

export class ProviderConfigConflictError extends Error {
  constructor(busy = false) {
    super(
      I18nManager.getInstance().t(
        busy
          ? '另一个 CLI 正在保存供应商配置，请稍后重试。'
          : '供应商配置已被其他 CLI 或编辑器更改。本次修改未保存，请重新打开 /provider 后重试。',
        busy
          ? 'Another CLI is saving provider configuration. Retry shortly.'
          : 'Provider configuration changed in another CLI or editor. Your change was not saved. Reopen /provider and retry.',
      ),
    );
    this.name = 'ProviderConfigConflictError';
  }
}

/** Compare bytes for normal configurations; never read an oversized recovery file. */
function providerFileRevision(file: string): string {
  try {
    const fd = fs.openSync(file, 'r');
    try {
      const info = fs.fstatSync(fd);
      if (!info.isFile() || info.size > MAX_PROVIDERS_FILE_BYTES)
        return `metadata:${info.dev}:${info.ino}:${info.size}:${info.mtimeMs}:${info.ctimeMs}`;
      const bytes = Buffer.alloc(info.size + 1);
      let read = 0;
      while (read < bytes.length) {
        const count = fs.readSync(fd, bytes, read, bytes.length - read, read);
        if (!count) break;
        read += count;
      }
      return createHash('sha256').update(bytes.subarray(0, read)).digest('hex');
    } finally {
      fs.closeSync(fd);
    }
  } catch (error) {
    if (error instanceof Error && 'code' in error) {
      if (error.code === 'ENOENT') return 'missing';
      return `unreadable:${error.code}`;
    }
    throw error;
  }
}
const protocolSchema = z.enum([
  'openai-chat',
  'openai-responses',
  'anthropic',
  'gemini',
]);
const providersSchema = z.object({
  version: z.literal(1).default(1),
  activeProviderId: modelId.optional(),
  activeModel: modelId.optional(),
  activeImageProviderId: modelId.optional(),
  activeImageModel: modelId.optional(),
  reasoningEffort: z
    .enum(['low', 'medium', 'high', 'xhigh', 'max', 'ultra'])
    .default('high'),
  providers: z
    .array(
      z.object({
        id: modelId,
        name: modelId,
        baseUrl: modelId,
        apiKey: z.string().default(''),
        protocol: protocolSchema.optional(),
        models: z.array(modelId).default([]),
        defaultModel: modelId.optional(),
        maxOutputTokens: z.number().int().positive().safe().optional(),
        contextWindow: z.number().int().positive().safe().optional(),
        reasoningReplay: z.enum(['auto', 'on', 'off']).optional(),
        imageModels: z.array(modelId).optional(),
        defaultImageModel: modelId.optional(),
        customHeaders: z.record(z.string()).optional(),
        updatedAt: z.string().default(''),
      }),
    )
    .default([]),
});

function validateProvidersConfig(value: unknown): ProvidersConfigFile {
  const parsed = providersSchema.safeParse(value);
  if (!parsed.success)
    throw new Error(
      'Invalid provider configuration. Check provider fields and model lists.',
    );
  const ids = new Set<string>();
  const providers = parsed.data.providers.map((provider) => {
    const id = provider.id.toLowerCase();
    if (ids.has(id)) throw new Error('Provider IDs must be unique.');
    ids.add(id);
    const models = [
      ...new Set([
        ...provider.models,
        ...(provider.defaultModel ? [provider.defaultModel] : []),
      ]),
    ];
    const imageModels = [
      ...new Set([
        ...(provider.imageModels || []),
        ...(provider.defaultImageModel ? [provider.defaultImageModel] : []),
      ]),
    ];
    return {
      ...provider,
      baseUrl: normalizeProviderUrl(provider.baseUrl),
      protocol: provider.protocol ?? inferProtocolFromUrl(provider.baseUrl),
      models,
      defaultModel: provider.defaultModel ?? models[0],
      imageModels,
      defaultImageModel: provider.defaultImageModel ?? imageModels[0],
    };
  });
  const activeProvider = providers.find(
    (provider) =>
      provider.id.toLowerCase() === parsed.data.activeProviderId?.toLowerCase(),
  );
  const imageProvider = providers.find(
    (provider) =>
      provider.id.toLowerCase() ===
      parsed.data.activeImageProviderId?.toLowerCase(),
  );
  return {
    ...parsed.data,
    providers,
    activeProviderId: activeProvider?.id,
    activeModel:
      parsed.data.activeProviderId && !activeProvider
        ? undefined
        : parsed.data.activeModel,
    activeImageProviderId: imageProvider?.id,
    activeImageModel:
      parsed.data.activeImageProviderId && !imageProvider
        ? undefined
        : parsed.data.activeImageModel,
  };
}

export class ProviderManager {
  private static instance: ProviderManager | null = null;
  private filePath: string;
  private data: ProvidersConfigFile;
  private diskRevision = '';

  constructor(filePath: string = getDefaultProvidersFilePath()) {
    this.filePath = path.resolve(filePath);
    this.data = this.readSnapshot();
  }

  static getInstance(filePath?: string): ProviderManager {
    if (
      !ProviderManager.instance ||
      (filePath && ProviderManager.instance.filePath !== path.resolve(filePath))
    ) {
      ProviderManager.instance = new ProviderManager(filePath);
    }
    return ProviderManager.instance;
  }

  static resetInstance(): void {
    ProviderManager.instance = null;
  }

  private loadFromDisk(): ProvidersConfigFile {
    return readLocalJsonConfig(
      this.filePath,
      validateProvidersConfig,
      () => ({
        version: 1,
        reasoningEffort: 'high',
        providers: [],
      }),
      '/provider',
      MAX_PROVIDERS_FILE_BYTES,
    );
  }

  private readSnapshot(): ProvidersConfigFile {
    for (let attempt = 0; attempt < 2; attempt++) {
      const before = providerFileRevision(this.filePath);
      const data = this.loadFromDisk();
      const after = providerFileRevision(this.filePath);
      if (before === after) {
        this.diskRevision = after;
        return data;
      }
    }
    throw new ProviderConfigConflictError();
  }

  /** Explicitly reopen current disk settings; never silently merge a stale edit. */
  reloadFromDisk(): void {
    this.data = this.readSnapshot();
  }

  saveToDisk(next: ProvidersConfigFile = this.data): void {
    const validated = validateProvidersConfig(next);
    const content = JSON.stringify(validated, null, 2);
    if (Buffer.byteLength(content) > MAX_PROVIDERS_FILE_BYTES)
      throw new Error('Provider configuration exceeds the 4 MiB limit.');
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    let release: () => void;
    try {
      release = lockSync(
        path.join(fs.realpathSync(dir), path.basename(this.filePath)),
        { realpath: false, retries: 0, stale: 30000 },
      );
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ELOCKED')
        throw new ProviderConfigConflictError(true);
      throw error;
    }
    const temp = `${this.filePath}.${randomUUID()}.tmp`;
    try {
      if (providerFileRevision(this.filePath) !== this.diskRevision)
        throw new ProviderConfigConflictError();
      fs.writeFileSync(temp, content, {
        encoding: 'utf8',
        mode: 0o600,
      });
      if (fs.existsSync(this.filePath))
        fs.copyFileSync(this.filePath, `${this.filePath}.bak`);
      fs.renameSync(temp, this.filePath);
      this.data = validated;
      this.diskRevision = createHash('sha256').update(content).digest('hex');
    } finally {
      try {
        if (fs.existsSync(temp)) fs.unlinkSync(temp);
      } finally {
        release();
      }
    }
  }

  getPresets() {
    return PROVIDER_PRESET_TEMPLATES;
  }

  listProviders(): ExternalProviderProfile[] {
    return structuredClone(this.data.providers);
  }

  getProvider(idOrName: string): ExternalProviderProfile | undefined {
    const needle = idOrName.trim().toLowerCase();
    const provider = this.data.providers.find(
      (p) => p.id.toLowerCase() === needle || p.name.toLowerCase() === needle,
    );
    return provider ? structuredClone(provider) : undefined;
  }

  upsertProvider(input: {
    id?: string;
    name: string;
    baseUrl: string;
    apiKey: string;
    protocol?: ProviderProtocol;
    models?: string[];
    defaultModel?: string;
    maxOutputTokens?: number;
    contextWindow?: number;
    reasoningReplay?: 'auto' | 'on' | 'off';
    imageModels?: string[];
    defaultImageModel?: string;
    customHeaders?: Record<string, string>;
    setActive?: boolean;
  }): ExternalProviderProfile {
    const normalizedUrl = normalizeProviderUrl(input.baseUrl);
    let id = slugifyProviderId(input.name);
    const existing = input.id
      ? this.getProvider(input.id)
      : this.data.providers.find(
          (provider) =>
            provider.name.toLowerCase() === input.name.trim().toLowerCase(),
        );
    if (input.id && !existing) throw new Error('Provider no longer exists.');
    if (
      this.data.providers.some(
        (provider) =>
          provider.id !== existing?.id &&
          provider.name.toLowerCase() === input.name.trim().toLowerCase(),
      )
    ) {
      throw new Error('A provider with this name already exists.');
    }
    if (
      !existing &&
      this.data.providers.some(
        (provider) => provider.id.toLowerCase() === id.toLowerCase(),
      )
    )
      id = `${id}-${randomUUID().slice(0, 8)}`;
    const protocol =
      input.protocol ??
      existing?.protocol ??
      inferProtocolFromUrl(input.baseUrl);

    const mergedModels = Array.from(
      new Set(
        [
          ...(input.models ?? []),
          ...(input.defaultModel ? [input.defaultModel] : []),
          ...(input.models === undefined ? (existing?.models ?? []) : []),
        ]
          .map((m) => m.trim())
          .filter(Boolean),
      ),
    );

    const defaultModel =
      input.defaultModel?.trim() ||
      (existing?.defaultModel && mergedModels.includes(existing.defaultModel)
        ? existing.defaultModel
        : undefined) ||
      mergedModels[0] ||
      undefined;

    const mergedImageModels = Array.from(
      new Set(
        [
          ...(input.imageModels ?? []),
          ...(input.defaultImageModel ? [input.defaultImageModel] : []),
          ...(input.imageModels === undefined
            ? (existing?.imageModels ?? [])
            : []),
        ]
          .map((m) => m.trim())
          .filter(Boolean),
      ),
    );

    const profile: ExternalProviderProfile = {
      id: existing?.id ?? id,
      name: input.name.trim(),
      baseUrl: normalizedUrl,
      apiKey: input.apiKey.trim(),
      protocol,
      models: mergedModels,
      defaultModel,
      maxOutputTokens: Object.prototype.hasOwnProperty.call(
        input,
        'maxOutputTokens',
      )
        ? input.maxOutputTokens
        : existing?.maxOutputTokens,
      contextWindow: Object.prototype.hasOwnProperty.call(
        input,
        'contextWindow',
      )
        ? input.contextWindow
        : existing?.contextWindow,
      reasoningReplay: input.reasoningReplay ?? existing?.reasoningReplay,
      imageModels: mergedImageModels,
      defaultImageModel:
        input.defaultImageModel ||
        (existing?.defaultImageModel &&
        mergedImageModels.includes(existing.defaultImageModel)
          ? existing.defaultImageModel
          : undefined) ||
        mergedImageModels[0],
      customHeaders: input.customHeaders ?? existing?.customHeaders,
      updatedAt: new Date().toISOString(),
    };

    const next = structuredClone(this.data);
    const idx = next.providers.findIndex((p) => p.id === profile.id);
    if (idx >= 0) {
      next.providers[idx] = profile;
    } else {
      next.providers.push(profile);
    }

    if (input.setActive !== false) {
      next.activeProviderId = profile.id;
      next.activeModel = defaultModel;
      if (profile.defaultImageModel) {
        next.activeImageProviderId = profile.id;
        next.activeImageModel = profile.defaultImageModel;
      }
    }
    if (
      next.activeProviderId === profile.id &&
      (!next.activeModel || !mergedModels.includes(next.activeModel))
    )
      next.activeModel = defaultModel;
    if (
      next.activeImageProviderId === profile.id &&
      (!next.activeImageModel ||
        !mergedImageModels.includes(next.activeImageModel))
    )
      next.activeImageModel = profile.defaultImageModel;
    this.saveToDisk(next);
    return structuredClone(profile);
  }

  removeProvider(idOrName: string): boolean {
    const existing = this.getProvider(idOrName);
    if (!existing) {
      return false;
    }
    const next = structuredClone(this.data);
    next.providers = next.providers.filter((p) => p.id !== existing.id);
    if (next.activeProviderId === existing.id) {
      next.activeProviderId = next.providers[0]?.id;
      next.activeModel = next.providers[0]?.defaultModel;
    }
    if (next.activeImageProviderId === existing.id) {
      next.activeImageProviderId = undefined;
      next.activeImageModel = undefined;
    }
    this.saveToDisk(next);
    return true;
  }

  setActiveSelection(providerId: string | undefined, modelName?: string): void {
    const next = structuredClone(this.data);
    const provider = providerId
      ? next.providers.find((item) => item.id === providerId)
      : undefined;
    if (providerId && !provider) throw new Error('Provider no longer exists.');
    const selected =
      modelName?.trim() || provider?.defaultModel || provider?.models[0];
    next.activeProviderId = providerId;
    next.activeModel = selected;
    if (provider && selected) {
      if (!provider.models.includes(selected))
        provider.models.unshift(selected);
      provider.defaultModel = selected;
    }
    this.saveToDisk(next);
  }

  getActiveProvider(): ExternalProviderProfile | undefined {
    if (!this.data.activeProviderId) {
      return undefined;
    }
    return this.getProvider(this.data.activeProviderId);
  }

  getActiveModel(): string | undefined {
    return this.data.activeModel ?? this.getActiveProvider()?.defaultModel;
  }

  setActiveImageModel(
    providerId: string | undefined,
    modelName?: string,
  ): void {
    const next = structuredClone(this.data);
    const provider = providerId
      ? next.providers.find((item) => item.id === providerId)
      : undefined;
    if (providerId && !provider) throw new Error('Provider no longer exists.');
    const selected =
      modelName?.trim() ||
      provider?.defaultImageModel ||
      provider?.imageModels?.[0];
    next.activeImageProviderId = providerId;
    next.activeImageModel = selected;
    if (provider && selected) {
      provider.imageModels = [
        ...new Set([...(provider.imageModels || []), selected]),
      ];
      provider.defaultImageModel = selected;
    }
    this.saveToDisk(next);
  }

  getActiveImageModel(): {
    provider?: ExternalProviderProfile;
    modelId: string;
  } {
    const provId = this.data.activeImageProviderId;
    const provider = provId
      ? this.getProvider(provId)
      : this.getActiveProvider();
    const modelId =
      this.data.activeImageModel ||
      provider?.defaultImageModel ||
      provider?.imageModels?.[0] ||
      '';
    return { provider, modelId };
  }

  getReasoningEffort(): ReasoningEffortLevel {
    return this.data.reasoningEffort ?? 'high';
  }

  setReasoningEffort(effort: ReasoningEffortLevel): void {
    this.saveToDisk({ ...this.data, reasoningEffort: effort });
  }

  resolveProviderForModel(modelSpec: string): {
    provider: ExternalProviderProfile;
    modelId: string;
  } | null {
    const trimmed = modelSpec.trim();
    if (!trimmed) {
      return null;
    }

    // 1. Explicit prefix: "provider:model"
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx > 0) {
      const prefix = trimmed.slice(0, colonIdx);
      const modelId = trimmed.slice(colonIdx + 1);
      const provider = this.getProvider(prefix);
      if (provider && modelId) {
        return { provider, modelId };
      }
    }

    // 2. Active provider match if model matches activeModel or is in active provider's models
    const activeProvider = this.getActiveProvider();
    if (
      activeProvider &&
      (this.data.activeModel === trimmed ||
        activeProvider.models.includes(trimmed))
    ) {
      return { provider: activeProvider, modelId: trimmed };
    }

    // 3. Any registered provider that lists this modelId
    for (const provider of this.data.providers) {
      if (
        provider.models.includes(trimmed) ||
        provider.defaultModel === trimmed
      ) {
        return { provider: structuredClone(provider), modelId: trimmed };
      }
    }

    return null;
  }

  getAllExternalModelItems(): Array<{
    providerId: string;
    providerName: string;
    modelId: string;
    qualifiedId: string;
    protocol: ProviderProtocol;
    baseUrl: string;
  }> {
    const items: Array<{
      providerId: string;
      providerName: string;
      modelId: string;
      qualifiedId: string;
      protocol: ProviderProtocol;
      baseUrl: string;
    }> = [];

    for (const p of this.data.providers) {
      for (const m of p.models) {
        items.push({
          providerId: p.id,
          providerName: p.name,
          modelId: m,
          qualifiedId: `${p.id}:${m}`,
          protocol: p.protocol,
          baseUrl: p.baseUrl,
        });
      }
    }
    return items;
  }

  async fetchModelsFromEndpoint(params: {
    baseUrl: string;
    apiKey: string;
    protocol?: ProviderProtocol;
    customHeaders?: Record<string, string>;
    timeoutMs?: number;
    signal?: AbortSignal;
  }): Promise<{ models: string[]; error?: string }> {
    let cleanBase: string;
    try {
      cleanBase = normalizeProviderUrl(params.baseUrl);
    } catch {
      return { models: [], error: 'Invalid HTTP(S) endpoint URL.' };
    }
    const modelsUrl = `${cleanBase}/models`;
    const protocol = params.protocol ?? inferProtocolFromUrl(params.baseUrl);

    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...(params.customHeaders ?? {}),
    };

    if (params.apiKey.trim()) {
      if (protocol === 'gemini')
        headers['x-goog-api-key'] = params.apiKey.trim();
      else if (protocol === 'anthropic')
        headers['x-api-key'] = params.apiKey.trim();
      else headers['Authorization'] = `Bearer ${params.apiKey.trim()}`;
    }
    if (protocol === 'anthropic') headers['anthropic-version'] ??= '2023-06-01';

    const controller = new AbortController();
    const onAbort = () => controller.abort(params.signal?.reason);
    if (params.signal?.aborted) onAbort();
    else params.signal?.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(
      () => controller.abort(),
      params.timeoutMs ?? 8000,
    );

    try {
      controller.signal.throwIfAborted();
      const response = await fetch(modelsUrl, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });

      if (!response.ok) {
        void response.body?.cancel().catch(() => {});
        return {
          models: [],
          error: `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      const body = z
        .object({
          data: z.array(z.unknown()).optional(),
          models: z.array(z.unknown()).optional(),
        })
        .safeParse(await readProviderCatalog(response, controller.signal));
      if (!body.success)
        return { models: [], error: 'Invalid model catalog response.' };

      const extracted: string[] = [];
      const list = body.data.data ?? body.data.models ?? [];

      for (const item of list) {
        if (typeof item === 'string') {
          extracted.push(item.trim().replace(/^models\//, ''));
        } else if (item && typeof item === 'object') {
          const rawId =
            'id' in item && typeof item.id === 'string'
              ? item.id
              : 'name' in item && typeof item.name === 'string'
                ? item.name
                : undefined;
          if (typeof rawId === 'string' && rawId.trim()) {
            extracted.push(rawId.trim().replace(/^models\//, ''));
          }
        }
      }

      return {
        models: Array.from(new Set(extracted.filter(Boolean))),
      };
    } catch (err) {
      return {
        models: [],
        error:
          err instanceof ProviderCatalogSizeError
            ? err.message
            : controller.signal.aborted
              ? params.signal?.aborted
                ? 'Model discovery cancelled.'
                : 'Model discovery timed out.'
              : `Model discovery failed (${err instanceof Error ? err.name : 'network error'}). Check the endpoint, headers and network.`,
      };
    } finally {
      clearTimeout(timer);
      params.signal?.removeEventListener('abort', onAbort);
    }
  }
}
