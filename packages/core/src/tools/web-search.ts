/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { WEB_SEARCH_TOOL_NAME, WEB_SEARCH_DISPLAY_NAME } from './tool-names.js';
import type { GroundingMetadata } from '@google/genai';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  type ToolInvocation,
  type ToolResult,
  type ExecuteOptions,
} from './tools.js';
import { ToolErrorType } from './tool-error.js';

import { getErrorMessage, isAbortError } from '../utils/errors.js';
import { getResponseText } from '../utils/partUtils.js';
import { debugLogger } from '../utils/debugLogger.js';
import { WEB_SEARCH_DEFINITION } from './definitions/coreTools.js';
import { resolveToolDeclaration } from './definitions/resolver.js';
import { LlmRole } from '../telemetry/llmRole.js';
import type { AgentLoopContext } from '../config/agent-loop-context.js';
import { wrapUntrusted, cleanDsmlAndRawTokens } from '../utils/textUtils.js';

interface GroundingChunkWeb {
  uri?: string;
  title?: string;
}

interface GroundingChunkItem {
  web?: GroundingChunkWeb;
  // Other properties might exist if needed in the future
}

async function fetchDuckDuckGoSearchResults(
  query: string,
  signal?: AbortSignal,
): Promise<{ text: string; sources: GroundingChunkItem[] }> {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'text/html',
      },
    });
    if (!res.ok) {
      return { text: `Search request failed with HTTP ${res.status}`, sources: [] };
    }
    const html = await res.text();
    const resultBlocks = html.split('<div class="result results_links');
    const items: Array<{ title: string; snippet: string; url: string }> = [];

    for (const block of resultBlocks.slice(1, 8)) {
      const urlMatch =
        block.match(/href="([^"]+)" class="result__url"/i) ||
        block.match(/class="result__snippet"[^>]*href="([^"]+)"/i) ||
        block.match(/<a[^>]*class="[^"]*result__url[^"]*"[^>]*href="([^"]+)"/i);
      const titleMatch =
        block.match(/<a[^>]*class="result__title"[^>]*>([\s\S]*?)<\/a>/i) ||
        block.match(/<h2[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i);
      const snippetMatch =
        block.match(/<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i) ||
        block.match(/<div[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/div>/i);

      if (urlMatch || titleMatch) {
        let rawUrl = urlMatch ? urlMatch[1] : '';
        if (rawUrl.includes('uddg=')) {
          const match = rawUrl.match(/uddg=([^&]+)/);
          if (match) rawUrl = decodeURIComponent(match[1]);
        }
        const cleanTitle = (titleMatch ? titleMatch[1] : 'Result')
          .replace(/<[^>]+>/g, '')
          .trim();
        const cleanSnippet = (snippetMatch ? snippetMatch[1] : '')
          .replace(/<[^>]+>/g, '')
          .trim();
        if (cleanTitle || cleanSnippet) {
          items.push({
            title: cleanTitle || rawUrl,
            snippet: cleanSnippet,
            url: rawUrl,
          });
        }
      }
    }

    if (items.length === 0) {
      return { text: `No direct search results found for: "${query}"`, sources: [] };
    }

    const sources: GroundingChunkItem[] = items.map((it) => ({
      web: { title: it.title, uri: it.url },
    }));

    const textLines = items.map((it, idx) => {
      return `[${idx + 1}] ${it.title}\n    URL: ${it.url}\n    Snippet: ${it.snippet}`;
    });

    return {
      text: `Live Web Search Results for "${query}":\n\n` + textLines.join('\n\n'),
      sources,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { text: `Search error: ${msg}`, sources: [] };
  }
}

interface GroundingSupportSegment {
  startIndex: number;
  endIndex: number;
  text?: string; // text is optional as per the example
}

interface GroundingSupportItem {
  segment?: GroundingSupportSegment;
  groundingChunkIndices?: number[];
  confidenceScores?: number[]; // Optional as per example
}

/**
 * Parameters for the WebSearchTool.
 */
export interface WebSearchToolParams {
  /**
   * The search query.
   */

  query: string;
}

/**
 * Extends ToolResult to include sources for web search.
 */
export interface WebSearchToolResult extends ToolResult {
  sources?: GroundingMetadata extends { groundingChunks: GroundingChunkItem[] }
    ? GroundingMetadata['groundingChunks']
    : GroundingChunkItem[];
}

class WebSearchToolInvocation extends BaseToolInvocation<
  WebSearchToolParams,
  WebSearchToolResult
> {
  constructor(
    private readonly context: AgentLoopContext,
    params: WebSearchToolParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ) {
    super(params, messageBus, _toolName, _toolDisplayName);
  }

  override getDescription(): string {
    return `Searching the web for: "${this.params.query}"`;
  }

  async execute({
    abortSignal: signal,
  }: ExecuteOptions): Promise<WebSearchToolResult> {
    const geminiClient = this.context.geminiClient;

    try {
      let isDsmlGarbage = false;
      let rawText = '';
      let response: any = null;
      try {
        response = await geminiClient.generateContent(
          { model: 'web-search' },
          [{ role: 'user', parts: [{ text: this.params.query }] }],
          signal,
          LlmRole.UTILITY_TOOL,
        );
        rawText = getResponseText(response) || '';
        if (
          rawText.includes('DSML') ||
          rawText.includes('<｜｜') ||
          rawText.includes('<invoke') ||
          rawText.includes('functionCall')
        ) {
          isDsmlGarbage = true;
        }
      } catch {
        isDsmlGarbage = true;
      }

      // If upstream model emitted DSML tool tokens or failed, fallback to direct search engine
      if (isDsmlGarbage || !rawText.trim()) {
        const direct = await fetchDuckDuckGoSearchResults(
          this.params.query,
          signal,
        );
        return {
          llmContent: `Web search results for "${this.params.query}":\n\n${wrapUntrusted(direct.text)}`,
          returnDisplay: `Live search results for "${this.params.query}" (${direct.sources.length} sources).`,
          sources: direct.sources,
        };
      }

      const responseText = cleanDsmlAndRawTokens(rawText);
      if (!responseText.trim()) {
        const direct = await fetchDuckDuckGoSearchResults(
          this.params.query,
          signal,
        );
        return {
          llmContent: `Web search results for "${this.params.query}":\n\n${wrapUntrusted(direct.text)}`,
          returnDisplay: `Live search results for "${this.params.query}" (${direct.sources.length} sources).`,
          sources: direct.sources,
        };
      }

      const groundingMetadata = response?.candidates?.[0]?.groundingMetadata;
      const sources = groundingMetadata?.groundingChunks as
        | GroundingChunkItem[]
        | undefined;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      const groundingSupports = groundingMetadata?.groundingSupports as
        | GroundingSupportItem[]
        | undefined;

      if (!responseText || !responseText.trim()) {
        return {
          llmContent: `No search results or information found for query: "${this.params.query}"`,
          returnDisplay: 'No information found.',
        };
      }

      let modifiedResponseText = responseText;
      const sourceListFormatted: string[] = [];

      if (sources && sources.length > 0) {
        sources.forEach((source: GroundingChunkItem, index: number) => {
          const title = source.web?.title || 'Untitled';
          const uri = source.web?.uri || 'No URI';
          sourceListFormatted.push(`[${index + 1}] ${title} (${uri})`);
        });

        if (groundingSupports && groundingSupports.length > 0) {
          const insertions: Array<{ index: number; marker: string }> = [];
          groundingSupports.forEach((support: GroundingSupportItem) => {
            if (support.segment && support.groundingChunkIndices) {
              const citationMarker = support.groundingChunkIndices
                .map((chunkIndex: number) => `[${chunkIndex + 1}]`)
                .join('');
              insertions.push({
                index: support.segment.endIndex,
                marker: citationMarker,
              });
            }
          });

          // Sort insertions by index in descending order to avoid shifting subsequent indices
          insertions.sort((a, b) => b.index - a.index);

          // Use TextEncoder/TextDecoder since segment indices are UTF-8 byte positions
          const encoder = new TextEncoder();
          const responseBytes = encoder.encode(modifiedResponseText);
          const parts: Uint8Array[] = [];
          let lastIndex = responseBytes.length;
          for (const ins of insertions) {
            const pos = Math.min(ins.index, lastIndex);
            parts.unshift(responseBytes.subarray(pos, lastIndex));
            parts.unshift(encoder.encode(ins.marker));
            lastIndex = pos;
          }
          parts.unshift(responseBytes.subarray(0, lastIndex));

          // Concatenate all parts into a single buffer
          const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
          const finalBytes = new Uint8Array(totalLength);
          let offset = 0;
          for (const part of parts) {
            finalBytes.set(part, offset);
            offset += part.length;
          }
          modifiedResponseText = new TextDecoder().decode(finalBytes);
        }

        if (sourceListFormatted.length > 0) {
          modifiedResponseText +=
            '\n\nSources:\n' + sourceListFormatted.join('\n');
        }
      }

      return {
        llmContent: `Web search results for "${this.params.query}":\n\n${wrapUntrusted(modifiedResponseText)}`,
        returnDisplay: `Search results for "${this.params.query}" returned.`,
        sources,
      };
    } catch (error: unknown) {
      if (isAbortError(error)) {
        return {
          llmContent: 'Web search was cancelled.',
          returnDisplay: 'Search cancelled.',
        };
      }
      const errorMessage = `Error during web search for query "${
        this.params.query
      }": ${getErrorMessage(error)}`;
      debugLogger.warn(errorMessage, error);
      return {
        llmContent: `Error: ${errorMessage}`,
        returnDisplay: `Error performing web search.`,
        error: {
          message: errorMessage,
          type: ToolErrorType.WEB_SEARCH_FAILED,
        },
      };
    }
  }
}

/**
 * A tool to perform web searches using Google Search via the Gemini API.
 */
export class WebSearchTool extends BaseDeclarativeTool<
  WebSearchToolParams,
  WebSearchToolResult
> {
  static readonly Name = WEB_SEARCH_TOOL_NAME;

  constructor(
    private readonly context: AgentLoopContext,
    messageBus: MessageBus,
  ) {
    super(
      WebSearchTool.Name,
      WEB_SEARCH_DISPLAY_NAME,
      WEB_SEARCH_DEFINITION.base.description!,
      Kind.Search,
      WEB_SEARCH_DEFINITION.base.parametersJsonSchema,
      messageBus,
      true, // isOutputMarkdown
      false, // canUpdateOutput
    );
  }

  /**
   * Validates the parameters for the WebSearchTool.
   * @param params The parameters to validate
   * @returns An error message string if validation fails, null if valid
   */
  protected override validateToolParamValues(
    params: WebSearchToolParams,
  ): string | null {
    if (!params.query || params.query.trim() === '') {
      return "The 'query' parameter cannot be empty.";
    }
    return null;
  }

  protected createInvocation(
    params: WebSearchToolParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ): ToolInvocation<WebSearchToolParams, WebSearchToolResult> {
    return new WebSearchToolInvocation(
      this.context.config,
      params,
      messageBus ?? this.messageBus,
      _toolName,
      _toolDisplayName,
    );
  }

  override getSchema(modelId?: string) {
    return resolveToolDeclaration(WEB_SEARCH_DEFINITION, modelId);
  }
}
