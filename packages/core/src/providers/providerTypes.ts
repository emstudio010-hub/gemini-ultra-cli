/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export type ProviderProtocol =
  | 'openai-chat'
  | 'openai-responses'
  | 'anthropic'
  | 'gemini';

export type ReasoningEffortLevel =
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh'
  | 'max'
  | 'ultra';

export interface ExternalProviderProfile {
  /** Unique identifier (slug of name) */
  id: string;
  /** User-facing provider name (e.g., ZCode, GrokBuild, MimoCode, OpenCode) */
  name: string;
  /** API Endpoint Base URL (e.g., https://api.x.ai/v1) */
  baseUrl: string;
  /** API Key for authentication */
  apiKey: string;
  /** Wire protocol used by the endpoint */
  protocol: ProviderProtocol;
  /** List of model IDs fetched from endpoint or manually entered */
  models: string[];
  /** Currently selected default model for this provider */
  defaultModel?: string;
  /** Optional output token limit; individual generation requests take priority. */
  maxOutputTokens?: number;
  /** Optional context capacity in tokens, used for local budgeting and compression. */
  contextWindow?: number;
  /** Replay provider reasoning for Chat tool conversations; auto detects DeepSeek. */
  reasoningReplay?: 'auto' | 'on' | 'off';
  /** Supported image generation models (e.g. dall-e-3, flux-1, recraft-v3, imagen-3) */
  imageModels?: string[];
  /** Default image generation model */
  defaultImageModel?: string;
  /** Optional custom HTTP headers */
  customHeaders?: Record<string, string>;
  /** Timestamp when created/updated */
  updatedAt: string;
}

export interface ProviderPresetTemplate {
  id: string;
  name: string;
  description: string;
  defaultBaseUrl: string;
  protocol: ProviderProtocol;
  suggestedModels: string[];
}

export interface ProvidersConfigFile {
  version: 1;
  activeProviderId?: string;
  activeModel?: string;
  activeImageProviderId?: string;
  activeImageModel?: string;
  reasoningEffort: ReasoningEffortLevel;
  providers: ExternalProviderProfile[];
}

export const PROVIDER_PRESET_TEMPLATES: readonly ProviderPresetTemplate[] = [
  {
    id: 'zcode',
    name: 'ZCode',
    description: 'ZCode / Z.ai / GLM Coding Plan 极速编程与逆向端点',
    defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    protocol: 'openai-chat',
    suggestedModels: ['glm-5.1', 'glm-5-turbo', 'glm-4.7'],
  },
  {
    id: 'grokbuild',
    name: 'GrokBuild',
    description: 'xAI GrokBuild 高速推理与极客代码生成端点',
    defaultBaseUrl: 'https://api.x.ai/v1',
    protocol: 'openai-chat',
    suggestedModels: [
      'grok-4.7-build-fast',
      'grok-build',
      'grok-4-latest',
      'grok-code-fast-1',
    ],
  },
  {
    id: 'mimocode',
    name: 'MimoCode',
    description: 'Xiaomi MiMo 深度思考与代码生成端点',
    defaultBaseUrl: 'https://api.xiaomimimo.com/v1',
    protocol: 'openai-chat',
    suggestedModels: ['mimo-v2-pro', 'mimo-v2-flash', 'mimo-coding'],
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    description: 'OpenCode Zen / 聚合编码网关端点',
    defaultBaseUrl: 'https://opencode.ai/zen/v1',
    protocol: 'openai-chat',
    suggestedModels: ['claude-sonnet-4-6', 'gpt-5.4', 'deepseek-r1'],
  },
  {
    id: 'openai-responses',
    name: 'Codex / OpenAI Responses',
    description: 'OpenAI Responses (/v1/responses) 协议端点',
    defaultBaseUrl: 'https://api.openai.com/v1',
    protocol: 'openai-responses',
    suggestedModels: ['gpt-5.4', 'codex-mini-latest', 'o3-pro'],
  },
  {
    id: 'anthropic',
    name: 'Anthropic Claude',
    description: 'Anthropic Messages (/v1/messages) 原生端点与中转',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    protocol: 'anthropic',
    suggestedModels: [
      'claude-sonnet-4-6',
      'claude-opus-4-6',
      'claude-3-7-sonnet-latest',
    ],
  },
  {
    id: 'custom-openai',
    name: 'Custom (自定义端点)',
    description: '任意兼容 OpenAI / NewAPI / OneAPI / vLLM / Ollama 的端点',
    defaultBaseUrl: 'https://api.openai.com/v1',
    protocol: 'openai-chat',
    suggestedModels: [],
  },
];
