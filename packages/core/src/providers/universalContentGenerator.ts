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
  type Content,
} from '@google/genai';
import type { ContentGenerator } from '../core/contentGenerator.js';
import type { Config } from '../config/config.js';
import type { LlmRole } from '../telemetry/llmRole.js';
import { ProviderManager } from './providerManager.js';
import type { ExternalProviderProfile } from './providerTypes.js';

const ULTRA_EFFORT_DIRECTIVE = `

[ULTRA reasoning mode] Think as deeply as needed. For non-trivial tasks: decompose the problem, consider multiple approaches, and when independent sub-problems exist call the \`spawn_subagents\` tool to investigate/implement them in parallel, then cross-verify the results before answering. Always verify with real evidence (build/tests) before claiming success.`;

export class UniversalContentGenerator implements ContentGenerator {
  constructor(
    private readonly fallbackGenerator: ContentGenerator,
    _gcConfig?: Config,
  ) {
    void _gcConfig;
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
    const mgr = ProviderManager.getInstance();
    const hit = mgr.resolveProviderForModel(model);
    if (hit) return hit;
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

  async countTokens(request: CountTokensParameters): Promise<CountTokensResponse> {
    if (this.resolve(request.model)) {
      return { totalTokens: this.estimateTokens(request) };
    }
    try {
      return await this.fallbackGenerator.countTokens(request);
    } catch {
      return { totalTokens: this.estimateTokens(request) };
    }
  }

  async embedContent(request: EmbedContentParameters): Promise<EmbedContentResponse> {
    return this.fallbackGenerator.embedContent(request);
  }

  async generateContent(
    request: GenerateContentParameters,
    userPromptId: string,
    role: LlmRole,
  ): Promise<GenerateContentResponse> {
    const resolution = this.resolve(request.model);

    if (!resolution) {
      return this.fallbackGenerator.generateContent(request, userPromptId, role);
    }

    const { provider, modelId } = resolution;
    const modifiedRequest = { ...request, model: modelId };

    if (provider.protocol === 'gemini') {
      return this.generateGemini(provider, modifiedRequest);
    } else if (provider.protocol === 'openai-chat') {
      return this.generateOpenAIChat(provider, modifiedRequest);
    } else if (provider.protocol === 'openai-responses') {
      return this.generateOpenAIResponses(provider, modifiedRequest);
    } else if (provider.protocol === 'anthropic') {
      return this.generateAnthropic(provider, modifiedRequest);
    }

    return this.fallbackGenerator.generateContent(request, userPromptId, role);
  }

  async generateContentStream(
    request: GenerateContentParameters,
    userPromptId: string,
    role: LlmRole,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    const resolution = this.resolve(request.model);

    if (!resolution) {
      return this.fallbackGenerator.generateContentStream(request, userPromptId, role);
    }

    const { provider, modelId } = resolution;
    const modifiedRequest = { ...request, model: modelId };

    if (provider.protocol === 'gemini') {
      return this.streamGemini(provider, modifiedRequest);
    } else if (provider.protocol === 'openai-chat') {
      return this.streamOpenAIChat(provider, modifiedRequest);
    } else if (provider.protocol === 'openai-responses') {
      return this.streamOpenAIResponses(provider, modifiedRequest);
    } else if (provider.protocol === 'anthropic') {
      return this.streamAnthropic(provider, modifiedRequest);
    }

    return this.fallbackGenerator.generateContentStream(request, userPromptId, role);
  }

  // --- OpenAI Chat Completions Adapter (/v1/chat/completions) ---

  private formatOpenAIMessages(request: GenerateContentParameters): any[] {
    const messages: any[] = [];

    // System instruction
    const sysInstruction = (request.config as any)?.systemInstruction;
    const ultra = ProviderManager.getInstance().getReasoningEffort() === 'ultra';
    if (sysInstruction || ultra) {
      let sysText = '';
      if (typeof sysInstruction === 'string') {
        sysText = sysInstruction;
      } else if (Array.isArray(sysInstruction)) {
        sysText = sysInstruction.map((p: any) => p.text || '').join('\n');
      } else if (sysInstruction?.parts) {
        sysText = sysInstruction.parts.map((p: any) => p.text || '').join('\n');
      }
      if (ultra) {
        sysText += ULTRA_EFFORT_DIRECTIVE;
      }
      if (sysText.trim()) {
        messages.push({ role: 'system', content: sysText.trim() });
      }
    }

    // Contents conversion
    const contents: Content[] = Array.isArray(request.contents)
      ? (request.contents as Content[])
      : request.contents
        ? [request.contents as Content]
        : [];

    for (const content of contents) {
      const role = content.role === 'model' ? 'assistant' : 'user';
      const parts = content.parts || [];

      let textBuffer = '';
      const toolCalls: any[] = [];
      const toolMessages: any[] = [];

      for (const part of parts) {
        if ((part as any).text) {
          textBuffer += (part as any).text;
        }
        if ((part as any).functionCall) {
          const fc = (part as any).functionCall;
          toolCalls.push({
            id: fc.id || `call_${Math.random().toString(36).slice(2, 10)}`,
            type: 'function',
            function: {
              name: fc.name,
              arguments: typeof fc.args === 'string' ? fc.args : JSON.stringify(fc.args || {}),
            },
          });
        }
        if ((part as any).functionResponse) {
          const fr = (part as any).functionResponse;
          toolMessages.push({
            role: 'tool',
            tool_call_id: fr.id || fr.name,
            content: typeof fr.response === 'string' ? fr.response : JSON.stringify(fr.response || {}),
          });
        }
      }

      if (toolMessages.length > 0) {
        for (const tm of toolMessages) {
          messages.push(tm);
        }
      } else {
        const msg: any = { role, content: textBuffer };
        if (toolCalls.length > 0) {
          msg.tool_calls = toolCalls;
        }
        messages.push(msg);
      }
    }

    return messages;
  }

  private formatOpenAITools(request: GenerateContentParameters): any[] | undefined {
    const tools = (request.config as any)?.tools;
    if (!tools || !Array.isArray(tools)) return undefined;

    const formatted: any[] = [];
    for (const tool of tools) {
      if (tool.functionDeclarations && Array.isArray(tool.functionDeclarations)) {
        for (const fd of tool.functionDeclarations) {
          formatted.push({
            type: 'function',
            function: {
              name: fd.name,
              description: fd.description,
              parameters: fd.parameters || { type: 'object', properties: {} },
            },
          });
        }
      }
    }
    return formatted.length > 0 ? formatted : undefined;
  }

  private buildGeminiResponse(parts: Part[]): GenerateContentResponse {
    const rawResp: any = {
      candidates: [
        {
          content: {
            role: 'model',
            parts,
          },
          finishReason: 'STOP',
        },
      ],
    };
    Object.setPrototypeOf(rawResp, GenerateContentResponse.prototype);
    return rawResp;
  }

  private async generateOpenAIChat(
    provider: ExternalProviderProfile,
    request: GenerateContentParameters,
  ): Promise<GenerateContentResponse> {
    const url = `${provider.baseUrl}/chat/completions`;
    const messages = this.formatOpenAIMessages(request);
    const tools = this.formatOpenAITools(request);
    const effort = ProviderManager.getInstance().getReasoningEffort();

    const payload: any = {
      model: request.model,
      messages,
      stream: false,
      reasoning_effort: effort === 'ultra' ? 'max' : effort,
    };
    if (tools) payload.tools = tools;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${provider.apiKey}`,
      ...(provider.customHeaders || {}),
    };

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenAI Provider [${provider.name}] HTTP ${res.status}: ${errText}`);
    }

    const data: any = await res.json();
    const choice = data.choices?.[0];
    const parts: Part[] = [];

    if (choice?.message?.reasoning_content) {
      parts.push({
        text: choice.message.reasoning_content,
        thought: true,
      } as any);
    }
    if (choice?.message?.content) {
      parts.push({
        text: choice.message.content,
      });
    }
    if (choice?.message?.tool_calls) {
      for (const tc of choice.message.tool_calls) {
        let args = {};
        try {
          args = JSON.parse(tc.function.arguments || '{}');
        } catch {
          args = { raw: tc.function.arguments };
        }
        parts.push({
          functionCall: {
            id: tc.id,
            name: tc.function.name,
            args,
          },
        } as any);
      }
    }

    return this.buildGeminiResponse(parts);
  }

  private async *streamOpenAIChat(
    provider: ExternalProviderProfile,
    request: GenerateContentParameters,
  ): AsyncGenerator<GenerateContentResponse> {
    const url = `${provider.baseUrl}/chat/completions`;
    const messages = this.formatOpenAIMessages(request);
    const tools = this.formatOpenAITools(request);
    const effort = ProviderManager.getInstance().getReasoningEffort();

    const payload: any = {
      model: request.model,
      messages,
      stream: true,
      reasoning_effort: effort === 'ultra' ? 'max' : effort,
    };
    if (tools) payload.tools = tools;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${provider.apiKey}`,
      ...(provider.customHeaders || {}),
    };

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenAI Provider [${provider.name}] Stream HTTP ${res.status}: ${errText}`);
    }

    if (!res.body) {
      throw new Error('No response body for stream');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    const pendingToolCalls = new Map<number, { id: string; name: string; argsText: string }>();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        const dataStr = trimmed.slice(5).trim();
        if (dataStr === '[DONE]') continue;

        try {
          const chunk = JSON.parse(dataStr);
          const delta = chunk.choices?.[0]?.delta;
          if (!delta) continue;

          // 1. Reasoning content
          if (delta.reasoning_content) {
            yield this.buildGeminiResponse([
              { text: delta.reasoning_content, thought: true } as any,
            ]);
          }

          // 2. Normal text content
          if (delta.content) {
            yield this.buildGeminiResponse([
              { text: delta.content },
            ]);
          }

          // 3. Tool calls delta
          if (delta.tool_calls && Array.isArray(delta.tool_calls)) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0;
              const current = pendingToolCalls.get(idx) || { id: '', name: '', argsText: '' };
              if (tc.id) current.id = tc.id;
              if (tc.function?.name) current.name += tc.function.name;
              if (tc.function?.arguments) current.argsText += tc.function.arguments;
              pendingToolCalls.set(idx, current);
            }
          }
        } catch {
          // ignore chunk parse errors
        }
      }
    }

    // Flush any pending tool calls
    if (pendingToolCalls.size > 0) {
      const parts: Part[] = [];
      for (const [, tc] of pendingToolCalls) {
        let args = {};
        try {
          args = JSON.parse(tc.argsText || '{}');
        } catch {
          args = { raw: tc.argsText };
        }
        parts.push({
          functionCall: {
            id: tc.id,
            name: tc.name,
            args,
          },
        } as any);
      }
      yield this.buildGeminiResponse(parts);
    }
  }
  // --- Shared SSE reader ---

  private async *readSse(
    res: Response,
  ): AsyncGenerator<{ event?: string; data: string }> {
    if (!res.body) throw new Error('No response body for stream');
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let event: string | undefined;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const raw of lines) {
        const line = raw.replace(/\r$/, '');
        if (line.startsWith('event:')) {
          event = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          const data = line.slice(5).trim();
          if (data) yield { event, data };
        } else if (line === '') {
          event = undefined;
        }
      }
    }
  }

  private parseArgs(text: string): Record<string, unknown> {
    try {
      return JSON.parse(text || '{}');
    } catch {
      return { raw: text };
    }
  }

  private async collect(
    stream: AsyncGenerator<GenerateContentResponse>,
  ): Promise<GenerateContentResponse> {
    const parts: Part[] = [];
    for await (const chunk of stream) {
      for (const p of chunk.candidates?.[0]?.content?.parts ?? []) {
        parts.push(p);
      }
    }
    return this.buildGeminiResponse(parts);
  }

  // --- OpenAI Responses Adapter (/v1/responses) ---

  private buildResponsesInput(request: GenerateContentParameters): any[] {
    const input: any[] = [];
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
    const url = `${provider.baseUrl}/responses`;
    const effort = ProviderManager.getInstance().getReasoningEffort();
    const tools = this.formatOpenAITools(request)?.map((t) => ({
      type: 'function',
      name: t.function.name,
      description: t.function.description,
      parameters: t.function.parameters,
    }));

    const payload: any = {
      model: request.model,
      input: this.buildResponsesInput(request),
      instructions: this.getSystemText(request) || undefined,
      reasoning: { effort: effort === 'max' || effort === 'xhigh' || effort === 'ultra' ? 'high' : effort, summary: 'auto' },
      stream: true,
    };
    if (tools) payload.tools = tools;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provider.apiKey}`,
        ...(provider.customHeaders || {}),
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      throw new Error(
        `OpenAI Responses [${provider.name}] HTTP ${res.status}: ${await res.text()}`,
      );
    }

    const calls = new Map<string, { callId: string; name: string; args: string }>();
    for await (const { data } of this.readSse(res)) {
      if (data === '[DONE]') continue;
      let ev: any;
      try {
        ev = JSON.parse(data);
      } catch {
        continue;
      }
      switch (ev.type) {
        case 'response.output_text.delta':
          if (ev.delta) yield this.buildGeminiResponse([{ text: ev.delta }]);
          break;
        case 'response.reasoning_summary_text.delta':
        case 'response.reasoning_text.delta':
          if (ev.delta) {
            yield this.buildGeminiResponse([
              { text: ev.delta, thought: true } as any,
            ]);
          }
          break;
        case 'response.output_item.added':
          if (ev.item?.type === 'function_call') {
            calls.set(ev.item.id, {
              callId: ev.item.call_id,
              name: ev.item.name,
              args: '',
            });
          }
          break;
        case 'response.function_call_arguments.delta': {
          const c = calls.get(ev.item_id);
          if (c) c.args += ev.delta ?? '';
          break;
        }
        case 'response.function_call_arguments.done': {
          const c = calls.get(ev.item_id);
          if (c) c.args = ev.arguments ?? c.args;
          break;
        }
        case 'response.failed':
        case 'error':
          throw new Error(
            `OpenAI Responses error: ${JSON.stringify(ev.response?.error ?? ev.error ?? ev)}`,
          );
        default:
          break;
      }
    }

    if (calls.size > 0) {
      yield this.buildGeminiResponse(
        [...calls.values()].map(
          (c) =>
            ({
              functionCall: {
                id: c.callId,
                name: c.name,
                args: this.parseArgs(c.args),
              },
            }) as any,
        ),
      );
    }
  }

  // --- Anthropic Messages Adapter (/v1/messages) ---

  private buildAnthropicMessages(request: GenerateContentParameters): any[] {
    const contents: Content[] = Array.isArray(request.contents)
      ? (request.contents as Content[])
      : request.contents
        ? [request.contents as Content]
        : [];

    const messages: any[] = [];
    for (const c of contents) {
      const role = c.role === 'model' ? 'assistant' : 'user';
      const blocks: any[] = [];
      for (const p of (c.parts || []) as any[]) {
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
    const url = `${provider.baseUrl}/messages`;
    const effort = ProviderManager.getInstance().getReasoningEffort();
    const budget = this.effortToBudget(effort);
    const tools = this.formatOpenAITools(request)?.map((t) => ({
      name: t.function.name,
      description: t.function.description,
      input_schema: t.function.parameters,
    }));

    const payload: any = {
      model: request.model,
      messages: this.buildAnthropicMessages(request),
      max_tokens: budget + 8192,
      stream: true,
      thinking: { type: 'enabled', budget_tokens: budget },
    };
    const sys = this.getSystemText(request);
    if (sys) payload.system = sys;
    if (tools) payload.tools = tools;

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
    });
    if (!res.ok) {
      throw new Error(
        `Anthropic [${provider.name}] HTTP ${res.status}: ${await res.text()}`,
      );
    }

    const toolBlocks = new Map<number, { id: string; name: string; json: string }>();
    for await (const { data } of this.readSse(res)) {
      let ev: any;
      try {
        ev = JSON.parse(data);
      } catch {
        continue;
      }
      if (ev.type === 'content_block_start' && ev.content_block?.type === 'tool_use') {
        toolBlocks.set(ev.index, {
          id: ev.content_block.id,
          name: ev.content_block.name,
          json: '',
        });
      } else if (ev.type === 'content_block_delta') {
        const d = ev.delta;
        if (d?.type === 'thinking_delta' && d.thinking) {
          yield this.buildGeminiResponse([{ text: d.thinking, thought: true } as any]);
        } else if (d?.type === 'text_delta' && d.text) {
          yield this.buildGeminiResponse([{ text: d.text }]);
        } else if (d?.type === 'input_json_delta') {
          const b = toolBlocks.get(ev.index);
          if (b) b.json += d.partial_json ?? '';
        }
      } else if (ev.type === 'error') {
        throw new Error(`Anthropic stream error: ${JSON.stringify(ev.error)}`);
      }
    }

    if (toolBlocks.size > 0) {
      yield this.buildGeminiResponse(
        [...toolBlocks.values()].map(
          (b) =>
            ({
              functionCall: { id: b.id, name: b.name, args: this.parseArgs(b.json) },
            }) as any,
        ),
      );
    }
  }

  // --- Gemini-compatible custom endpoint (baseUrl + apiKey) ---

  private geminiUrl(
    provider: ExternalProviderProfile,
    model: string,
    stream: boolean,
  ): string {
    const base = provider.baseUrl.replace(/\/+$/, '');
    const method = stream ? 'streamGenerateContent?alt=sse&' : 'generateContent?';
    return `${base}/models/${model}:${method}key=${encodeURIComponent(provider.apiKey)}`;
  }

  private geminiBody(request: GenerateContentParameters): any {
    const cfg: any = request.config ?? {};
    const { abortSignal: _a, httpOptions: _h, ...rest } = cfg;
    void _a;
    void _h;
    const { systemInstruction, tools, ...generationConfig } = rest;
    return {
      contents: request.contents,
      systemInstruction:
        typeof systemInstruction === 'string'
          ? { parts: [{ text: systemInstruction }] }
          : systemInstruction,
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
      headers: { 'Content-Type': 'application/json', ...(provider.customHeaders || {}) },
      body: JSON.stringify(this.geminiBody(request)),
    });
    if (!res.ok) {
      throw new Error(`Gemini [${provider.name}] HTTP ${res.status}: ${await res.text()}`);
    }
    const raw: any = await res.json();
    Object.setPrototypeOf(raw, GenerateContentResponse.prototype);
    return raw;
  }

  private async *streamGemini(
    provider: ExternalProviderProfile,
    request: GenerateContentParameters,
  ): AsyncGenerator<GenerateContentResponse> {
    const res = await fetch(this.geminiUrl(provider, request.model, true), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(provider.customHeaders || {}) },
      body: JSON.stringify(this.geminiBody(request)),
    });
    if (!res.ok) {
      throw new Error(`Gemini [${provider.name}] HTTP ${res.status}: ${await res.text()}`);
    }
    for await (const { data } of this.readSse(res)) {
      try {
        const raw: any = JSON.parse(data);
        Object.setPrototypeOf(raw, GenerateContentResponse.prototype);
        yield raw;
      } catch {
        // skip malformed chunk
      }
    }
  }
}
