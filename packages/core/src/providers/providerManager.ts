/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
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
  const lower = baseUrl.toLowerCase();
  if (lower.includes('/anthropic') || lower.includes('anthropic.com')) {
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

export class ProviderManager {
  private static instance: ProviderManager | null = null;
  private filePath: string;
  private data: ProvidersConfigFile;

  constructor(filePath: string = getDefaultProvidersFilePath()) {
    this.filePath = filePath;
    this.data = this.loadFromDisk();
  }

  static getInstance(filePath?: string): ProviderManager {
    if (
      !ProviderManager.instance ||
      (filePath && ProviderManager.instance.filePath !== filePath)
    ) {
      ProviderManager.instance = new ProviderManager(filePath);
    }
    return ProviderManager.instance;
  }

  static resetInstance(): void {
    ProviderManager.instance = null;
  }

  private loadFromDisk(): ProvidersConfigFile {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(raw) as Partial<ProvidersConfigFile>;
        return {
          version: 1,
          activeProviderId: parsed.activeProviderId,
          activeModel: parsed.activeModel,
          activeImageProviderId: parsed.activeImageProviderId,
          activeImageModel: parsed.activeImageModel,
          reasoningEffort: parsed.reasoningEffort ?? 'high',
          providers: Array.isArray(parsed.providers) ? parsed.providers : [],
        };
      }
    } catch {
      // Fall through to default clean config
    }
    return {
      version: 1,
      reasoningEffort: 'high',
      providers: [],
    };
  }

  saveToDisk(): void {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(
      this.filePath,
      JSON.stringify(this.data, null, 2),
      'utf-8',
    );
  }

  getPresets() {
    return PROVIDER_PRESET_TEMPLATES;
  }

  listProviders(): ExternalProviderProfile[] {
    return [...this.data.providers];
  }

  getProvider(idOrName: string): ExternalProviderProfile | undefined {
    const needle = idOrName.trim().toLowerCase();
    return this.data.providers.find(
      (p) => p.id.toLowerCase() === needle || p.name.toLowerCase() === needle,
    );
  }

  upsertProvider(input: {
    name: string;
    baseUrl: string;
    apiKey: string;
    protocol?: ProviderProtocol;
    models?: string[];
    defaultModel?: string;
    imageModels?: string[];
    defaultImageModel?: string;
    customHeaders?: Record<string, string>;
    setActive?: boolean;
  }): ExternalProviderProfile {
    const normalizedUrl = input.baseUrl.trim().replace(/\/+$/, '');
    const id = slugifyProviderId(input.name);
    const existing = this.getProvider(id) ?? this.getProvider(input.name);
    const protocol =
      input.protocol ??
      existing?.protocol ??
      inferProtocolFromUrl(normalizedUrl);

    const mergedModels = Array.from(
      new Set(
        [
          ...(input.models ?? []),
          ...(input.defaultModel ? [input.defaultModel] : []),
          ...(existing?.models ?? []),
        ]
          .map((m) => m.trim())
          .filter(Boolean),
      ),
    );

    const defaultModel =
      input.defaultModel?.trim() ||
      existing?.defaultModel ||
      mergedModels[0] ||
      undefined;

    const mergedImageModels = Array.from(
      new Set(
        [
          ...(input.imageModels ?? []),
          ...(input.defaultImageModel ? [input.defaultImageModel] : []),
          ...(existing?.imageModels ?? []),
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
      imageModels: mergedImageModels,
      defaultImageModel: input.defaultImageModel || existing?.defaultImageModel || mergedImageModels[0],
      customHeaders: input.customHeaders ?? existing?.customHeaders,
      updatedAt: new Date().toISOString(),
    };

    const idx = this.data.providers.findIndex((p) => p.id === profile.id);
    if (idx >= 0) {
      this.data.providers[idx] = profile;
    } else {
      this.data.providers.push(profile);
    }

    if (input.setActive !== false) {
      this.data.activeProviderId = profile.id;
      if (defaultModel) {
        this.data.activeModel = defaultModel;
      }
      if (profile.defaultImageModel) {
        this.data.activeImageProviderId = profile.id;
        this.data.activeImageModel = profile.defaultImageModel;
      }
    }

    this.saveToDisk();
    return profile;
  }

  removeProvider(idOrName: string): boolean {
    const existing = this.getProvider(idOrName);
    if (!existing) {
      return false;
    }
    this.data.providers = this.data.providers.filter(
      (p) => p.id !== existing.id,
    );
    if (this.data.activeProviderId === existing.id) {
      this.data.activeProviderId = this.data.providers[0]?.id;
      this.data.activeModel = this.data.providers[0]?.defaultModel;
    }
    if (this.data.activeImageProviderId === existing.id) {
      this.data.activeImageProviderId = undefined;
      this.data.activeImageModel = undefined;
    }
    this.saveToDisk();
    return true;
  }

  setActiveSelection(providerId: string | undefined, modelName?: string): void {
    this.data.activeProviderId = providerId;
    if (modelName) {
      this.data.activeModel = modelName;
      if (providerId) {
        const provider = this.getProvider(providerId);
        if (provider) {
          if (!provider.models.includes(modelName)) {
            provider.models.unshift(modelName);
          }
          provider.defaultModel = modelName;
        }
      }
    }
    this.saveToDisk();
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

  setActiveImageModel(providerId: string | undefined, modelName?: string): void {
    this.data.activeImageProviderId = providerId;
    this.data.activeImageModel = modelName;
    if (providerId && modelName) {
      const p = this.getProvider(providerId);
      if (p) {
        p.imageModels = Array.from(new Set([...(p.imageModels || []), modelName]));
        p.defaultImageModel = modelName;
      }
    }
    this.saveToDisk();
  }

  getActiveImageModel(): { provider?: ExternalProviderProfile; modelId: string } {
    const provId = this.data.activeImageProviderId;
    const provider = provId ? this.getProvider(provId) : this.getActiveProvider();
    const modelId = this.data.activeImageModel || provider?.defaultImageModel || 'dall-e-3';
    return { provider, modelId };
  }

  getReasoningEffort(): ReasoningEffortLevel {
    return this.data.reasoningEffort ?? 'high';
  }

  setReasoningEffort(effort: ReasoningEffortLevel): void {
    this.data.reasoningEffort = effort;
    this.saveToDisk();
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
        return { provider, modelId: trimmed };
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
  }): Promise<{ models: string[]; error?: string }> {
    const cleanBase = params.baseUrl
      .trim()
      .replace(/\/+(chat\/completions|responses|messages|models)\/?$/i, '')
      .replace(/\/+$/, '');
    const modelsUrl = `${cleanBase}/models`;

    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...(params.customHeaders ?? {}),
    };

    if (params.apiKey.trim()) {
      headers['Authorization'] = `Bearer ${params.apiKey.trim()}`;
      if (params.protocol === 'anthropic') {
        headers['x-api-key'] = params.apiKey.trim();
        headers['anthropic-version'] = '2023-06-01';
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      params.timeoutMs ?? 8000,
    );

    try {
      const response = await fetch(modelsUrl, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });

      if (!response.ok) {
        return {
          models: [],
          error: `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      const body = (await response.json()) as {
        data?: Array<{ id?: string; name?: string }>;
        models?: Array<{ id?: string; name?: string } | string>;
      };

      const extracted: string[] = [];
      const list = Array.isArray(body.data)
        ? body.data
        : Array.isArray(body.models)
          ? body.models
          : [];

      for (const item of list) {
        if (typeof item === 'string') {
          extracted.push(item);
        } else if (item && typeof item === 'object') {
          const rawId = item.id || item.name;
          if (typeof rawId === 'string' && rawId.trim()) {
            extracted.push(rawId.trim().replace(/^models\//, ''));
          }
        }
      }

      return {
        models: Array.from(new Set(extracted)),
      };
    } catch (err) {
      return {
        models: [],
        error: err instanceof Error ? err.message : String(err),
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
