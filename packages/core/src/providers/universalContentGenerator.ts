/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  GenerateContentResponse,
  type GenerateContentParameters,
  type CountTokensParameters,
  type CountTokensResponse,
  type EmbedContentParameters,
  type EmbedContentResponse,
  type Part,
  type GenerateContentResponseUsageMetadata,
  FinishReason,
} from '@google/genai';
import type { ContentGenerator } from '../core/contentGenerator.js';
import type { Config } from '../config/config.js';
import { LlmRole } from '../telemetry/llmRole.js';
import { ProviderManager } from './providerManager.js';
import { ProviderRouteError } from './providerRouteError.js';
import { ExternalFallbackGenerator } from './externalFallbackGenerator.js';
import { I18nManager } from '../i18n/i18nManager.js';
import type { ExternalProviderProfile } from './providerTypes.js';
import { withUltraPrompt } from './ultraPromptConfig.js';
import { LoggingContentGenerator } from '../core/loggingContentGenerator.js';
import { providerUsage } from './providerUsage.js';
import { isRecord } from '../utils/markdownUtils.js';
import type { HttpError } from '../utils/httpErrors.js';
import { consumeSwarmRequest } from '../agents/swarm.js';
import { consumeWorkflowRequest } from '../agents/workflowBudget.js';
import {
  currentAgentModel,
  normalizeAgentModel,
  observeAgentModel,
} from '../agents/agentModelRouting.js';
import {
  providerReasoningSignature,
  shouldReplayReasoning,
  stripProviderReasoning,
} from './providerReasoning.js';
import {
  chatSchema,
  responsesSchema,
  anthropicSchema,
  geminiSchema,
  parseProviderValue,
  parseProviderJson,
  providerContents,
  type ChatMessage,
  type ChatTool,
  type ChatToolCall,
} from './providerProtocol.js';

const ULTRA_EFFORT_DIRECTIVE = `

[ULTRA reasoning mode] Think as deeply as needed. For non-trivial tasks: decompose the problem, consider multiple approaches, and when independent sub-problems exist and the tool is available call \`spawn_subagents\` to investigate/implement them in parallel, then cross-check the results. Verify changes using the smallest relevant checks, respect the user's requested verification scope, and report the evidence before claiming success. Avoid redundant tests.`;

export class UniversalContentGenerator implements ContentGenerator {
  constructor(
    private readonly fallbackGenerator: ContentGenerator,
    private readonly gcConfig?: Config,
  ) {}

  private externalGenerator(
    provider: ExternalProviderProfile,
  ): ContentGenerator {
    const adapter: ContentGenerator = {
      generateContent: (request) => {
        switch (provider.protocol) {
          case 'gemini':
            return this.generateGemini(provider, request);
          case 'openai-chat':
            return this.generateOpenAIChat(provider, request);
          case 'openai-responses':
            return this.generateOpenAIResponses(provider, request);
          case 'anthropic':
            return this.generateAnthropic(provider, request);
          default:
            throw new Error('Unsupported external provider protocol.');
        }
      },
      generateContentStream: async (request) => {
        switch (provider.protocol) {
          case 'gemini':
            return this.streamGemini(provider, request);
          case 'openai-chat':
            return this.streamOpenAIChat(provider, request);
          case 'openai-responses':
            return this.streamOpenAIResponses(provider, request);
          case 'anthropic':
            return this.streamAnthropic(provider, request);
          default:
            throw new Error('Unsupported external provider protocol.');
        }
      },
      countTokens: (request) => this.countTokens(request),
      embedContent: (request) => this.embedContent(request),
    };
    return this.gcConfig
      ? new LoggingContentGenerator(adapter, this.gcConfig, provider.baseUrl)
      : adapter;
  }

  get userTier() {
    return this.fallbackGenerator.userTier;
  }
  get userTierName() {
    return this.fallbackGenerator.userTierName;
  }
  get paidTier() {
    return this.fallbackGenerator.paidTier;
  }

  /** Resolve external provider for a model; falls back to the active provider when the CLI model is still a Gemini/auto default. */
  private resolve(
    model: string,
  ): { provider: ExternalProviderProfile; modelId: string } | null {
    const selected = currentAgentModel();
    if (selected) {
      normalizeAgentModel(selected); // Deleted/renamed providers fail instead of silently rerouting.
      if (selected.startsWith('native:')) return null;
      model = selected;
    }
    const mgr = ProviderManager.getInstance();
    const hit = mgr.resolveProviderForModel(model);
    if (hit) return hit;
    if (model.trim().indexOf(':') > 0)
      throw new ProviderRouteError(
        I18nManager.getInstance().t(
          '模型供应商路由不可用。请用 /provider list 查看有效ID，再用 /model 重新选择模型；没有发起模型请求。',
          'The model provider route is unavailable. Inspect valid IDs with /provider list, then choose a model with /model. No model request was sent.',
        ),
      );
    const active = mgr.getActiveProvider();
    const activeModel = mgr.getActiveModel();
    if (active && activeModel && /^(auto|gemini-)/i.test(model.trim())) {
      return { provider: active, modelId: activeModel };
    }
    return null;
  }

  private estimateTokens(request: CountTokensParameters): number {
    const text = JSON.stringify(request.contents ?? '');
    return Math.ceil(text.length / 3);
  }

  private resolveGeneration(model: string) {
    const resolution = this.resolve(model);
    if (
      !resolution &&
      this.fallbackGenerator instanceof ExternalFallbackGenerator
    )
      throw new ProviderRouteError(
        I18nManager.getInstance().t(
          '当前仅外部网关认证，无法执行该模型。请用 /provider list 和 /model 选择已配置的供应商模型；原生 Google 模型需要先通过 /auth 配置原生认证。没有发起模型请求。',
          'This external-only session cannot dispatch this model. Select a configured provider with /provider list and /model; native Google models require native authentication through /auth first. No model request was sent.',
        ),
      );
    return resolution;
  }

  getModelContextWindow(model: string): number | undefined {
    let resolution: ReturnType<UniversalContentGenerator['resolve']>;
    try {
      resolution = this.resolve(model);
    } catch (error) {
      // Capacity is optional display metadata. A removed route must not crash
      // the model picker/composer that the user needs to repair that route.
      // Generation still resolves strictly before any provider dispatch.
      if (error instanceof ProviderRouteError) return undefined;
      throw error;
    }
    return resolution
      ? resolution.provider.contextWindow
      : this.fallbackGenerator.getModelContextWindow?.(
          currentAgentModel()?.startsWith('native:')
            ? currentAgentModel()!.slice(7)
            : model,
        );
  }

  async countTokens(
    request: CountTokensParameters,
  ): Promise<CountTokensResponse> {
    if (this.resolve(request.model)) {
      return { totalTokens: this.estimateTokens(request) };
    }
    const selected = currentAgentModel();
    try {
      return await this.fallbackGenerator.countTokens({
        ...request,
        model: selected?.startsWith('native:')
          ? selected.slice(7)
          : request.model,
        contents: stripProviderReasoning(providerContents(request.contents)),
      });
    } catch {
      return { totalTokens: this.estimateTokens(request) };
    }
  }

  async embedContent(
    request: EmbedContentParameters,
  ): Promise<EmbedContentResponse> {
    return this.fallbackGenerator.embedContent(request);
  }

  async generateContent(
    request: GenerateContentParameters,
    userPromptId: string,
    role: LlmRole,
  ): Promise<GenerateContentResponse> {
    request.config?.abortSignal?.throwIfAborted();
    const selected = currentAgentModel();
    if (selected)
      request = {
        ...request,
        model: selected.startsWith('native:') ? selected.slice(7) : selected,
      };
    const resolution = this.resolveGeneration(request.model);
    consumeSwarmRequest(this.gcConfig?.storage?.getProjectTempDir());
    consumeWorkflowRequest(this.gcConfig?.storage?.getProjectTempDir());
    if (role === LlmRole.MAIN || role === LlmRole.SUBAGENT)
      request = withUltraPrompt(request);

    if (!resolution) {
      observeAgentModel(`native:${request.model}`);
      return this.fallbackGenerator.generateContent(
        {
          ...request,
          contents: stripProviderReasoning(providerContents(request.contents)),
        },
        userPromptId,
        role,
      );
    }

    const { provider, modelId } = resolution;
    observeAgentModel(`${provider.id}:${modelId}`);
    const modifiedRequest = this.withProviderDefaults(
      request,
      provider,
      modelId,
    );

    return this.externalGenerator(provider).generateContent(
      modifiedRequest,
      userPromptId,
      role,
    );
  }

  async generateContentStream(
    request: GenerateContentParameters,
    userPromptId: string,
    role: LlmRole,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    request.config?.abortSignal?.throwIfAborted();
    const selected = currentAgentModel();
    if (selected)
      request = {
        ...request,
        model: selected.startsWith('native:') ? selected.slice(7) : selected,
      };
    const resolution = this.resolveGeneration(request.model);
    consumeSwarmRequest(this.gcConfig?.storage?.getProjectTempDir());
    consumeWorkflowRequest(this.gcConfig?.storage?.getProjectTempDir());
    if (role === LlmRole.MAIN || role === LlmRole.SUBAGENT)
      request = withUltraPrompt(request);

    if (!resolution) {
      observeAgentModel(`native:${request.model}`);
      return this.fallbackGenerator.generateContentStream(
        {
          ...request,
          contents: stripProviderReasoning(providerContents(request.contents)),
        },
        userPromptId,
        role,
      );
    }

    const { provider, modelId } = resolution;
    observeAgentModel(`${provider.id}:${modelId}`);
    const modifiedRequest = this.withProviderDefaults(
      request,
      provider,
      modelId,
    );

    return this.externalGenerator(provider).generateContentStream(
      modifiedRequest,
      userPromptId,
      role,
    );
  }

  // --- OpenAI Chat Completions Adapter (/v1/chat/completions) ---

  private withProviderDefaults(
    request: GenerateContentParameters,
    provider: ExternalProviderProfile,
    model: string,
  ): GenerateContentParameters {
    return {
      ...request,
      model,
      ...(request.config?.maxOutputTokens === undefined &&
      provider.maxOutputTokens !== undefined
        ? {
            config: {
              ...request.config,
              maxOutputTokens: provider.maxOutputTokens,
            },
          }
        : {}),
    };
  }

  private formatOpenAIMessages(
    request: GenerateContentParameters,
    provider?: ExternalProviderProfile,
    hasTools = false,
  ): ChatMessage[] {
    const messages: ChatMessage[] = [];

    // System instruction
    const sysInstruction = request.config?.systemInstruction;
    const ultra =
      ProviderManager.getInstance().getReasoningEffort() === 'ultra';
    if (sysInstruction || ultra) {
      let sysText = '';
      if (sysInstruction)
        sysText = providerContents(sysInstruction)
          .flatMap((content) => content.parts ?? [])
          .map((part) => part.text ?? '')
          .join('\n');
      if (ultra) {
        sysText += ULTRA_EFFORT_DIRECTIVE;
      }
      if (sysText.trim()) {
        messages.push({ role: 'system', content: sysText.trim() });
      }
    }

    // Contents conversion
    const contents = providerContents(request.contents);
    const callsByName = new Map<string, string[]>();
    let generatedCall = 0;
    const reasoningSignature =
      provider && hasTools && shouldReplayReasoning(provider, request.model)
        ? providerReasoningSignature(provider, request.model)
        : undefined;

    for (const content of contents) {
      const role = content.role === 'model' ? 'assistant' : 'user';
      const parts = content.parts || [];

      let textBuffer = '';
      let reasoningText: string | undefined;
      const toolCalls: ChatToolCall[] = [];
      const toolMessages: ChatMessage[] = [];

      for (const part of parts) {
        if (
          role === 'assistant' &&
          reasoningSignature &&
          part.thought &&
          part.thoughtSignature === reasoningSignature &&
          typeof part.text === 'string'
        ) {
          reasoningText = (reasoningText ?? '') + part.text;
        }
        if (part.text && !part.thought) {
          textBuffer += part.text;
        }
        if (part.functionCall) {
          const fc = part.functionCall;
          if (!fc.name) throw new Error('Tool calls require a function name.');
          const callId = fc.id || `ultra_call_${generatedCall++}`;
          callsByName.set(fc.name, [
            ...(callsByName.get(fc.name) ?? []),
            callId,
          ]);
          toolCalls.push({
            id: callId,
            type: 'function',
            function: {
              name: fc.name,
              arguments:
                typeof fc.args === 'string'
                  ? fc.args
                  : JSON.stringify(fc.args || {}),
            },
          });
        }
        if (part.functionResponse) {
          const fr = part.functionResponse;
          const pending = fr.name ? callsByName.get(fr.name) : undefined;
          const callId = fr.id || pending?.shift() || fr.name;
          if (!callId)
            throw new Error('Tool results require a call ID or function name.');
          if (fr.id && pending) {
            const index = pending.indexOf(fr.id);
            if (index >= 0) pending.splice(index, 1);
          }
          toolMessages.push({
            role: 'tool',
            tool_call_id: callId,
            content:
              typeof fr.response === 'string'
                ? fr.response
                : JSON.stringify(fr.response || {}),
          });
        }
      }

      if (toolMessages.length > 0) {
        for (const tm of toolMessages) {
          messages.push(tm);
        }
        if (textBuffer || toolCalls.length)
          messages.push({
            role,
            content: textBuffer,
            ...(reasoningText !== undefined
              ? { reasoning_content: reasoningText }
              : {}),
            ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
          });
      } else {
        const msg: ChatMessage = { role, content: textBuffer };
        if (reasoningText !== undefined) msg.reasoning_content = reasoningText;
        if (toolCalls.length > 0) {
          msg.tool_calls = toolCalls;
        }
        messages.push(msg);
      }
    }

    return messages;
  }

  private formatOpenAITools(
    request: GenerateContentParameters,
  ): ChatTool[] | undefined {
    const tools = request.config?.tools;
    if (!tools || !Array.isArray(tools)) return undefined;

    const formatted: ChatTool[] = [];
    for (const tool of tools) {
      if (
        'functionDeclarations' in tool &&
        tool.functionDeclarations &&
        Array.isArray(tool.functionDeclarations)
      ) {
        for (const fd of tool.functionDeclarations) {
          // Google GenAI SDK tools store schema in parametersJsonSchema rather than parameters
          const rawSchema: unknown = fd.parametersJsonSchema ??
            fd.parameters ?? { type: 'object', properties: {} };

          const cleanSchema = this.normalizeToolSchema(rawSchema);
          if (!fd.name) throw new Error('Tool declarations require a name.');

          formatted.push({
            type: 'function',
            function: {
              name: fd.name,
              description: fd.description,
              parameters: cleanSchema,
            },
          });
        }
      }
    }
    return formatted.length > 0 ? formatted : undefined;
  }

  private normalizeToolSchema(value: unknown): Record<string, unknown> {
    const normalize = (item: unknown): unknown => {
      if (Array.isArray(item)) return item.map(normalize);
      if (!isRecord(item)) return item;
      const result = Object.fromEntries(
        Object.entries(item).map(([key, entry]) => [key, normalize(entry)]),
      );
      const schemaType = result['type'];
      if (typeof schemaType === 'string')
        result['type'] = schemaType.toLowerCase();
      return result;
    };
    const result = normalize(value);
    if (!isRecord(result))
      throw new Error('Tool parameters must be a JSON Schema object.');
    if (
      !result['type'] &&
      !result['$ref'] &&
      !result['anyOf'] &&
      !result['oneOf']
    )
      result['type'] = 'object';
    if (result['type'] === 'object' && !result['properties'])
      result['properties'] = {};
    return result;
  }

  private buildGeminiResponse(
    parts: Part[],
    usageMetadata?: GenerateContentResponseUsageMetadata,
    complete = true,
  ): GenerateContentResponse {
    const response = new GenerateContentResponse();
    response.candidates =
      parts.length || complete
        ? [
            {
              content: {
                role: 'model',
                parts,
              },
              ...(complete ? { finishReason: FinishReason.STOP } : {}),
            },
          ]
        : [];
    if (usageMetadata) response.usageMetadata = usageMetadata;
    return response;
  }

  private outputLimit(request: GenerateContentParameters): number | undefined {
    const limit = request.config?.maxOutputTokens;
    if (limit === undefined) return undefined;
    if (!Number.isSafeInteger(limit) || limit < 1)
      throw new Error('maxOutputTokens must be a positive integer.');
    return limit;
  }

  private httpError(message: string, status: number): HttpError {
    return Object.assign(new Error(message), { status });
  }

  private streamSignal(
    request: GenerateContentParameters,
    controller: AbortController,
  ): AbortSignal {
    const callerSignal = request.config?.abortSignal;
    return callerSignal
      ? AbortSignal.any([callerSignal, controller.signal])
      : controller.signal;
  }

  private chatOutputLimit(
    request: GenerateContentParameters,
  ): Record<string, number> {
    const limit = this.outputLimit(request);
    if (limit === undefined) return {};
    return /(?:^|\/)(?:o[134](?:[-.]|$)|gpt-[5-9](?:[-.]|$))/i.test(
      request.model,
    )
      ? { max_completion_tokens: limit }
      : { max_tokens: limit };
  }

  private async generateOpenAIChat(
    provider: ExternalProviderProfile,
    request: GenerateContentParameters,
  ): Promise<GenerateContentResponse> {
    const url = `${provider.baseUrl}/chat/completions`;
    const tools = this.formatOpenAITools(request);
    const messages = this.formatOpenAIMessages(request, provider, !!tools);
    const effort = ProviderManager.getInstance().getReasoningEffort();

    const payload = {
      model: request.model,
      messages,
      stream: false,
      ...this.chatOutputLimit(request),
      reasoning_effort: ['xhigh', 'max', 'ultra'].includes(effort)
        ? 'high'
        : effort,
      ...(tools ? { tools } : {}),
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${provider.apiKey}`,
      ...(provider.customHeaders || {}),
    };

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: request.config?.abortSignal,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw this.httpError(
        `OpenAI Provider [${provider.name}] HTTP ${res.status}: ${errText}`,
        res.status,
      );
    }

    const raw: unknown = await res.json();
    const data = parseProviderValue(raw, chatSchema, 'OpenAI');
    if (data.error)
      throw new Error(`OpenAI Provider error: ${JSON.stringify(data.error)}`);
    const choice = data.choices?.[0];
    if (!choice?.message)
      throw new Error('OpenAI: response contains no message.');
    if (choice?.finish_reason === 'length')
      throw new Error(
        'OpenAI output token limit reached; response is incomplete.',
      );
    if (
      choice.finish_reason &&
      !['stop', 'tool_calls'].includes(choice.finish_reason)
    )
      throw new Error(
        'OpenAI response ended abnormally; response is incomplete.',
      );
    const parts: Part[] = [];

    if (choice?.message?.reasoning_content) {
      parts.push({
        text: choice.message.reasoning_content,
        thought: true,
        ...(shouldReplayReasoning(provider, request.model)
          ? {
              thoughtSignature: providerReasoningSignature(
                provider,
                request.model,
              ),
            }
          : {}),
      });
    }
    if (choice?.message?.content) {
      parts.push({
        text: choice.message.content,
      });
    }
    if (choice?.message?.tool_calls) {
      for (const tc of choice.message.tool_calls) {
        if (!tc.id || !tc.function?.name)
          throw new Error(
            'OpenAI: tool call requires an ID and function name.',
          );
        parts.push({
          functionCall: {
            id: tc.id,
            name: tc.function.name,
            args: this.parseArgs(tc.function.arguments ?? '{}'),
          },
        });
      }
    }

    return this.buildGeminiResponse(
      parts,
      providerUsage(data.usage, 'openai-chat'),
    );
  }

  private async *streamOpenAIChat(
    provider: ExternalProviderProfile,
    request: GenerateContentParameters,
  ): AsyncGenerator<GenerateContentResponse> {
    const abortController = new AbortController();
    const url = `${provider.baseUrl}/chat/completions`;
    const reasoningSignature = shouldReplayReasoning(provider, request.model)
      ? providerReasoningSignature(provider, request.model)
      : undefined;
    const tools = this.formatOpenAITools(request);
    const messages = this.formatOpenAIMessages(request, provider, !!tools);
    const effort = ProviderManager.getInstance().getReasoningEffort();

    const payload = {
      model: request.model,
      messages,
      stream: true,
      stream_options: { include_usage: true },
      ...this.chatOutputLimit(request),
      reasoning_effort: ['xhigh', 'max', 'ultra'].includes(effort)
        ? 'high'
        : effort,
      ...(tools ? { tools } : {}),
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${provider.apiKey}`,
      ...(provider.customHeaders || {}),
    };

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: this.streamSignal(request, abortController),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw this.httpError(
        `OpenAI Provider [${provider.name}] Stream HTTP ${res.status}: ${errText}`,
        res.status,
      );
    }

    const pendingToolCalls = new Map<
      number,
      { id: string; name: string; argsText: string }
    >();
    let completed = false;
    let usage: GenerateContentResponseUsageMetadata | undefined;
    for await (const { data: dataStr } of this.readSse(
      res,
      abortController,
      () => completed,
    )) {
      if (dataStr === '[DONE]') {
        completed = true;
        break;
      }
      const chunk = parseProviderJson(dataStr, chatSchema, 'OpenAI stream');
      if (chunk.error)
        throw new Error(`OpenAI stream error: ${JSON.stringify(chunk.error)}`);
      usage = providerUsage(chunk.usage, 'openai-chat') ?? usage;
      const stopReason = chunk.choices?.[0]?.finish_reason;
      if (stopReason && !['stop', 'tool_calls'].includes(stopReason)) {
        // Some endpoints include the last visible text in the terminating
        // frame. Preserve that unaccepted draft before surfacing the failure;
        // never parse or emit tool calls from a truncated response.
        const text = chunk.choices?.[0]?.delta?.content;
        if (text) yield this.buildGeminiResponse([{ text }], undefined, false);
        throw new Error(
          stopReason === 'length'
            ? 'OpenAI output token limit reached; response is incomplete.'
            : 'OpenAI response ended abnormally; response is incomplete.',
        );
      }
      if (chunk.choices?.[0]?.finish_reason) completed = true;
      const delta = chunk.choices?.[0]?.delta;
      if (!delta) {
        continue;
      }

      // 1. Reasoning content
      if (delta.reasoning_content) {
        yield this.buildGeminiResponse(
          [
            {
              text: delta.reasoning_content,
              thought: true,
              ...(reasoningSignature
                ? { thoughtSignature: reasoningSignature }
                : {}),
            },
          ],
          undefined,
          false,
        );
      }

      // 2. Normal text content
      if (delta.content) {
        yield this.buildGeminiResponse(
          [{ text: delta.content }],
          undefined,
          false,
        );
      }

      // 3. Tool calls delta
      if (delta.tool_calls && Array.isArray(delta.tool_calls)) {
        for (const [position, tc] of delta.tool_calls.entries()) {
          const idx = tc.index ?? position;
          const current = pendingToolCalls.get(idx) || {
            id: '',
            name: '',
            argsText: '',
          };
          if (tc.id) current.id = tc.id;
          if (tc.function?.name) current.name += tc.function.name;
          if (tc.function?.arguments) current.argsText += tc.function.arguments;
          pendingToolCalls.set(idx, current);
        }
      }
    }

    if (!completed)
      throw new Error(
        'OpenAI stream ended before completion; response may be incomplete.',
      );

    // Emit completion only after the protocol has ended and usage is collected.
    const parts: Part[] = [];
    if (pendingToolCalls.size > 0) {
      for (const [, tc] of pendingToolCalls) {
        if (!tc.id || !tc.name)
          throw new Error(
            'OpenAI stream: tool call requires an ID and function name.',
          );
        parts.push({
          functionCall: {
            id: tc.id,
            name: tc.name,
            args: this.parseArgs(tc.argsText),
          },
        });
      }
    }
    yield this.buildGeminiResponse(parts, usage);
  }
  // --- Shared SSE reader ---

  private async *readSse(
    res: Response,
    abortController: AbortController,
    finished?: () => boolean,
  ): AsyncGenerator<{ event?: string; data: string }> {
    if (!res.body) throw new Error('No response body for stream');
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let event: string | undefined;
    let data: string[] = [];
    const configuredIdleMs = Number(process.env['GEMINI_ULTRA_STREAM_IDLE_MS']);
    const idleMs =
      Number.isFinite(configuredIdleMs) && configuredIdleMs >= 1000
        ? configuredIdleMs
        : 120000;
    let finishDeadline: number | undefined;
    let progressDeadline = Date.now() + idleMs;
    try {
      while (true) {
        // Completion is a protocol boundary. Keepalive bytes must not extend
        // the bounded wait for trailing usage metadata.
        if (finished?.() && finishDeadline === undefined)
          finishDeadline = Date.now() + Math.min(idleMs, 2000);
        const remainingMs = (finishDeadline ?? progressDeadline) - Date.now();
        if (remainingMs <= 0) {
          if (finished?.()) break;
          throw new Error(
            `Provider stream was idle for ${idleMs} ms. Retry or choose a different endpoint.`,
          );
        }
        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeout = new Promise<ReadableStreamReadResult<Uint8Array>>(
          (resolve, reject) => {
            timer = setTimeout(() => {
              if (finished?.()) resolve({ done: true, value: undefined });
              else
                reject(
                  new Error(
                    `Provider stream was idle for ${idleMs} ms. Retry or choose a different endpoint.`,
                  ),
                );
              void reader.cancel().catch(() => {});
            }, remainingMs);
          },
        );
        const chunk = await Promise.race([reader.read(), timeout]).finally(() =>
          clearTimeout(timer),
        );
        const { done, value } = chunk;
        buffer += done
          ? decoder.decode()
          : decoder.decode(value, { stream: true });
        // Flush a final event even if the endpoint omits the closing newline.
        if (done) buffer += '\n\n';
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const raw of lines) {
          const line = raw.replace(/\r$/, '');
          if (line.startsWith('event:')) {
            event = line.slice(6).trim();
          } else if (line.startsWith('data:')) {
            data.push(line.slice(5).replace(/^ /, ''));
          } else if (line === '') {
            // Transport keepalives are not model progress. A peer sending only
            // comments or named ping events must still reach the idle deadline.
            if (
              data.length &&
              !['ping', 'heartbeat', 'keepalive'].includes(
                event?.toLowerCase() ?? '',
              )
            ) {
              yield { event, data: data.join('\n') };
              progressDeadline = Date.now() + idleMs;
            }
            data = [];
            event = undefined;
          }
        }
        if (done) break;
      }
    } finally {
      // Abort the fetch as well as its reader so cloned logging branches close.
      // A source may leave cancel() pending; cleanup must not block completion.
      abortController.abort();
      void reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }

  private parseArgs(text: string): Record<string, unknown> {
    let value: unknown;
    try {
      value = JSON.parse(text || '{}');
    } catch {
      throw new Error(
        'Provider returned malformed tool argument JSON; the tool was not executed.',
      );
    }
    if (!isRecord(value))
      throw new Error('Provider tool arguments must be a JSON object.');
    return value;
  }

  private async collect(
    stream: AsyncGenerator<GenerateContentResponse>,
  ): Promise<GenerateContentResponse> {
    const parts: Part[] = [];
    let usage: GenerateContentResponseUsageMetadata | undefined;
    for await (const chunk of stream) {
      usage = chunk.usageMetadata ?? usage;
      for (const p of chunk.candidates?.[0]?.content?.parts ?? []) {
        parts.push(p);
      }
    }
    return this.buildGeminiResponse(parts, usage);
  }

  // --- OpenAI Responses Adapter (/v1/responses) ---

  private buildResponsesInput(
    request: GenerateContentParameters,
  ): Array<Record<string, unknown>> {
    const input: Array<Record<string, unknown>> = [];
    for (const m of this.formatOpenAIMessages(request)) {
      if (m.role === 'system') continue;
      if (m.role === 'tool') {
        input.push({
          type: 'function_call_output',
          call_id: m.tool_call_id,
          output: m.content,
        });
        continue;
      }
      if (m.content) {
        input.push({ role: m.role, content: m.content });
      }
      for (const tc of m.tool_calls ?? []) {
        input.push({
          type: 'function_call',
          call_id: tc.id,
          name: tc.function.name,
          arguments: tc.function.arguments,
        });
      }
    }
    return input;
  }

  private getSystemText(request: GenerateContentParameters): string {
    const sys = this.formatOpenAIMessages(request)[0];
    return sys?.role === 'system' ? sys.content : '';
  }

  private async generateOpenAIResponses(
    provider: ExternalProviderProfile,
    request: GenerateContentParameters,
  ): Promise<GenerateContentResponse> {
    return this.collect(this.streamOpenAIResponses(provider, request));
  }

  private async *streamOpenAIResponses(
    provider: ExternalProviderProfile,
    request: GenerateContentParameters,
  ): AsyncGenerator<GenerateContentResponse> {
    const abortController = new AbortController();
    const url = `${provider.baseUrl}/responses`;
    const effort = ProviderManager.getInstance().getReasoningEffort();
    const tools = this.formatOpenAITools(request)?.map((t) => ({
      type: 'function',
      name: t.function.name,
      description: t.function.description,
      parameters: t.function.parameters,
    }));

    const payload = {
      model: request.model,
      input: this.buildResponsesInput(request),
      instructions: this.getSystemText(request) || undefined,
      reasoning: {
        effort:
          effort === 'max' || effort === 'xhigh' || effort === 'ultra'
            ? 'high'
            : effort,
        summary: 'auto',
      },
      stream: true,
      ...(this.outputLimit(request) !== undefined
        ? { max_output_tokens: this.outputLimit(request) }
        : {}),
      ...(tools ? { tools } : {}),
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provider.apiKey}`,
        ...(provider.customHeaders || {}),
      },
      body: JSON.stringify(payload),
      signal: this.streamSignal(request, abortController),
    });
    if (!res.ok) {
      throw this.httpError(
        `OpenAI Responses [${provider.name}] HTTP ${res.status}: ${await res.text()}`,
        res.status,
      );
    }

    const calls = new Map<
      string,
      { callId: string; name: string; args: string }
    >();
    let completed = false;
    let usage: GenerateContentResponseUsageMetadata | undefined;
    for await (const { data } of this.readSse(res, abortController)) {
      if (data === '[DONE]') continue;
      const ev = parseProviderJson(
        data,
        responsesSchema,
        'OpenAI Responses stream',
      );
      switch (ev.type) {
        case 'response.output_text.delta':
          if (ev.delta)
            yield this.buildGeminiResponse(
              [{ text: ev.delta }],
              undefined,
              false,
            );
          break;
        case 'response.reasoning_summary_text.delta':
        case 'response.reasoning_text.delta':
          if (ev.delta) {
            yield this.buildGeminiResponse(
              [{ text: ev.delta, thought: true }],
              undefined,
              false,
            );
          }
          break;
        case 'response.output_item.added':
          if (ev.item?.type === 'function_call') {
            if (!ev.item.id || !ev.item.call_id || !ev.item.name)
              throw new Error(
                'OpenAI Responses: incomplete function call identifiers.',
              );
            calls.set(ev.item.id, {
              callId: ev.item.call_id,
              name: ev.item.name,
              args: '',
            });
          }
          break;
        case 'response.function_call_arguments.delta': {
          const c = ev.item_id ? calls.get(ev.item_id) : undefined;
          if (c) c.args += ev.delta ?? '';
          break;
        }
        case 'response.function_call_arguments.done': {
          const c = ev.item_id ? calls.get(ev.item_id) : undefined;
          if (c) c.args = ev.arguments ?? c.args;
          break;
        }
        case 'response.failed':
        case 'response.incomplete':
        case 'error':
          throw new Error(
            `OpenAI Responses error: ${JSON.stringify(ev.response?.error ?? ev.response?.incomplete_details ?? ev.error ?? ev)}`,
          );
        case 'response.completed':
          if (
            (ev.response?.status !== undefined &&
              ev.response.status !== 'completed') ||
            ev.response?.error != null ||
            ev.response?.incomplete_details != null
          )
            throw new Error(
              'OpenAI Responses returned an unsuccessful terminal state; response is incomplete.',
            );
          usage = providerUsage(ev.response?.usage, 'openai-responses');
          completed = true;
          break;
        default:
          break;
      }
      if (completed) break;
    }

    if (!completed)
      throw new Error(
        'OpenAI Responses stream ended before response.completed.',
      );
    yield this.buildGeminiResponse(
      [...calls.values()].map((c) => ({
        functionCall: {
          id: c.callId,
          name: c.name,
          args: this.parseArgs(c.args),
        },
      })),
      usage,
    );
  }

  // --- Anthropic Messages Adapter (/v1/messages) ---

  private buildAnthropicMessages(
    request: GenerateContentParameters,
  ): Array<{ role: string; content: Array<Record<string, unknown>> }> {
    const contents = providerContents(request.contents);
    const messages: Array<{
      role: string;
      content: Array<Record<string, unknown>>;
    }> = [];
    for (const c of contents) {
      const role = c.role === 'model' ? 'assistant' : 'user';
      const blocks: Array<Record<string, unknown>> = [];
      for (const p of c.parts ?? []) {
        if (p.thought) continue;
        if (p.text) blocks.push({ type: 'text', text: p.text });
        if (p.functionCall) {
          blocks.push({
            type: 'tool_use',
            id: p.functionCall.id || p.functionCall.name,
            name: p.functionCall.name,
            input: p.functionCall.args || {},
          });
        }
        if (p.functionResponse) {
          blocks.push({
            type: 'tool_result',
            tool_use_id: p.functionResponse.id || p.functionResponse.name,
            content:
              typeof p.functionResponse.response === 'string'
                ? p.functionResponse.response
                : JSON.stringify(p.functionResponse.response || {}),
          });
        }
      }
      if (blocks.length > 0) messages.push({ role, content: blocks });
    }
    return messages;
  }

  private effortToBudget(effort: string): number {
    switch (effort) {
      case 'low':
        return 2048;
      case 'medium':
        return 6000;
      case 'high':
        return 16000;
      case 'xhigh':
        return 32000;
      case 'max':
        return 48000;
      default:
        return 64000;
    }
  }

  private async generateAnthropic(
    provider: ExternalProviderProfile,
    request: GenerateContentParameters,
  ): Promise<GenerateContentResponse> {
    return this.collect(this.streamAnthropic(provider, request));
  }

  private async *streamAnthropic(
    provider: ExternalProviderProfile,
    request: GenerateContentParameters,
  ): AsyncGenerator<GenerateContentResponse> {
    const abortController = new AbortController();
    const url = `${provider.baseUrl}/messages`;
    const effort = ProviderManager.getInstance().getReasoningEffort();
    const maxTokens =
      this.outputLimit(request) ?? this.effortToBudget(effort) + 8192;
    const budget = Math.min(this.effortToBudget(effort), maxTokens - 1);
    const tools = this.formatOpenAITools(request)?.map((t) => ({
      name: t.function.name,
      description: t.function.description,
      input_schema: t.function.parameters,
    }));

    const payload = {
      model: request.model,
      messages: this.buildAnthropicMessages(request),
      max_tokens: maxTokens,
      stream: true,
      ...(budget >= 1024
        ? { thinking: { type: 'enabled', budget_tokens: budget } }
        : {}),
      ...(tools ? { tools } : {}),
      ...(this.getSystemText(request)
        ? { system: this.getSystemText(request) }
        : {}),
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': provider.apiKey,
        Authorization: `Bearer ${provider.apiKey}`,
        'anthropic-version': '2023-06-01',
        ...(provider.customHeaders || {}),
      },
      body: JSON.stringify(payload),
      signal: this.streamSignal(request, abortController),
    });
    if (!res.ok) {
      throw this.httpError(
        `Anthropic [${provider.name}] HTTP ${res.status}: ${await res.text()}`,
        res.status,
      );
    }

    const toolBlocks = new Map<
      number,
      {
        id: string;
        name: string;
        json: string;
        initialInput?: Record<string, unknown>;
      }
    >();
    let completed = false;
    let usageData: Record<string, unknown> = {};
    for await (const { data } of this.readSse(res, abortController)) {
      const ev = parseProviderJson(data, anthropicSchema, 'Anthropic stream');
      const startUsage: unknown =
        ev.type === 'message_start' ? ev.message?.usage : undefined;
      const deltaUsage: unknown =
        ev.type === 'message_delta' ? ev.usage : undefined;
      if (isRecord(startUsage)) usageData = { ...usageData, ...startUsage };
      if (isRecord(deltaUsage)) usageData = { ...usageData, ...deltaUsage };
      if (
        ev.type === 'content_block_start' &&
        ev.content_block?.type === 'tool_use'
      ) {
        if (
          ev.index === undefined ||
          !ev.content_block.id ||
          !ev.content_block.name
        )
          throw new Error('Anthropic: incomplete tool block identifiers.');
        toolBlocks.set(ev.index, {
          id: ev.content_block.id,
          name: ev.content_block.name,
          json: '',
          initialInput: ev.content_block.input,
        });
      } else if (ev.type === 'content_block_delta') {
        const d = ev.delta;
        if (d?.type === 'thinking_delta' && d.thinking) {
          yield this.buildGeminiResponse(
            [{ text: d.thinking, thought: true }],
            undefined,
            false,
          );
        } else if (d?.type === 'text_delta' && d.text) {
          yield this.buildGeminiResponse([{ text: d.text }], undefined, false);
        } else if (d?.type === 'input_json_delta') {
          const b =
            ev.index !== undefined ? toolBlocks.get(ev.index) : undefined;
          if (b) b.json += d.partial_json ?? '';
        }
      } else if (ev.type === 'error') {
        throw new Error(`Anthropic stream error: ${JSON.stringify(ev.error)}`);
      } else if (
        ev.type === 'message_delta' &&
        ev.delta?.stop_reason &&
        !['end_turn', 'tool_use', 'stop_sequence'].includes(
          ev.delta.stop_reason,
        )
      ) {
        throw new Error(
          ev.delta.stop_reason === 'max_tokens'
            ? 'Anthropic output token limit reached; response is incomplete.'
            : 'Anthropic response ended abnormally; response is incomplete.',
        );
      } else if (ev.type === 'message_stop') {
        completed = true;
        break;
      }
    }

    if (!completed)
      throw new Error('Anthropic stream ended before message_stop.');
    const usage = providerUsage(usageData, 'anthropic');
    yield this.buildGeminiResponse(
      [...toolBlocks.values()].map((b) => ({
        functionCall: {
          id: b.id,
          name: b.name,
          args: this.parseArgs(b.json || JSON.stringify(b.initialInput ?? {})),
        },
      })),
      usage,
    );
  }

  // --- Gemini-compatible custom endpoint (baseUrl + apiKey) ---

  private geminiUrl(
    provider: ExternalProviderProfile,
    model: string,
    stream: boolean,
  ): string {
    const base = provider.baseUrl.replace(/\/+$/, '');
    const method = stream
      ? 'streamGenerateContent?alt=sse&'
      : 'generateContent?';
    return `${base}/models/${model}:${method}key=${encodeURIComponent(provider.apiKey)}`;
  }

  private geminiBody(request: GenerateContentParameters) {
    const cfg = request.config ?? {};
    const { abortSignal: _a, httpOptions: _h, ...rest } = cfg;
    void _a;
    void _h;
    const { systemInstruction, tools, ...generationConfig } = rest;
    return {
      contents: stripProviderReasoning(providerContents(request.contents)),
      systemInstruction: systemInstruction
        ? {
            parts: providerContents(systemInstruction).flatMap(
              (content) => content.parts ?? [],
            ),
          }
        : undefined,
      tools,
      generationConfig,
    };
  }

  private async generateGemini(
    provider: ExternalProviderProfile,
    request: GenerateContentParameters,
  ): Promise<GenerateContentResponse> {
    const res = await fetch(this.geminiUrl(provider, request.model, false), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(provider.customHeaders || {}),
      },
      body: JSON.stringify(this.geminiBody(request)),
      signal: request.config?.abortSignal,
    });
    if (!res.ok) {
      throw this.httpError(
        `Gemini [${provider.name}] HTTP ${res.status}: ${await res.text()}`,
        res.status,
      );
    }
    const value: unknown = await res.json();
    const raw = parseProviderValue(value, geminiSchema, 'Gemini');
    if (raw.error)
      throw new Error(`Gemini error: ${JSON.stringify(raw.error)}`);
    if (
      raw.candidates?.some(
        (candidate) =>
          candidate.finishReason &&
          candidate.finishReason !== FinishReason.STOP,
      )
    )
      throw new Error(
        raw.candidates?.some(
          (candidate) => candidate.finishReason === FinishReason.MAX_TOKENS,
        )
          ? 'Gemini output token limit reached; response is incomplete.'
          : 'Gemini response ended abnormally; response is incomplete.',
      );
    return Object.assign(new GenerateContentResponse(), raw);
  }

  private async *streamGemini(
    provider: ExternalProviderProfile,
    request: GenerateContentParameters,
  ): AsyncGenerator<GenerateContentResponse> {
    const abortController = new AbortController();
    const res = await fetch(this.geminiUrl(provider, request.model, true), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(provider.customHeaders || {}),
      },
      body: JSON.stringify(this.geminiBody(request)),
      signal: this.streamSignal(request, abortController),
    });
    if (!res.ok) {
      throw this.httpError(
        `Gemini [${provider.name}] HTTP ${res.status}: ${await res.text()}`,
        res.status,
      );
    }
    let completed = false;
    type Candidate = NonNullable<
      ReturnType<typeof geminiSchema.parse>['candidates']
    >[number];
    type CandidatePart = NonNullable<
      NonNullable<Candidate['content']>['parts']
    >[number];
    const pendingCalls = new Map<number, CandidatePart[]>();
    for await (const { data } of this.readSse(res, abortController)) {
      const raw = parseProviderJson(data, geminiSchema, 'Gemini stream');
      if (raw.error)
        throw new Error(`Gemini stream error: ${JSON.stringify(raw.error)}`);
      if (
        raw.candidates?.some(
          (candidate) =>
            candidate.finishReason &&
            candidate.finishReason !== FinishReason.STOP,
        )
      ) {
        const visible =
          raw.candidates?.[0]?.content?.parts?.filter(
            (part) =>
              typeof part.text === 'string' &&
              !part.thought &&
              !part.functionCall &&
              !part.functionResponse,
          ) ?? [];
        if (visible.length)
          yield this.buildGeminiResponse(visible, undefined, false);
        throw new Error(
          raw.candidates?.some(
            (candidate) => candidate.finishReason === FinishReason.MAX_TOKENS,
          )
            ? 'Gemini output token limit reached; response is incomplete.'
            : 'Gemini response ended abnormally; response is incomplete.',
        );
      }
      if (raw.candidates?.some((candidate) => candidate.finishReason))
        completed = true;
      // Hold complete SDK call parts until protocol completion, matching the
      // other adapters. A later MAX_TOKENS/EOF must not release earlier calls.
      raw.candidates = raw.candidates?.map((candidate, index) => {
        const parts = candidate.content?.parts ?? [];
        const calls = pendingCalls.get(index) ?? [];
        calls.push(...parts.filter((part) => !!part.functionCall));
        pendingCalls.set(index, calls);
        return {
          ...candidate,
          ...(candidate.content || (completed && calls.length)
            ? {
                content: {
                  ...candidate.content,
                  parts: [
                    ...parts.filter((part) => !part.functionCall),
                    ...(completed ? calls : []),
                  ],
                },
              }
            : {}),
        };
      });
      yield Object.assign(new GenerateContentResponse(), raw);
      if (completed) break;
    }
    if (!completed) throw new Error('Gemini stream ended before completion.');
  }
}
