/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { convert } from 'html-to-text';
import type { Config } from '../config/config.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  type ToolResult,
  type ExecuteOptions,
} from './tools.js';
import { ToolErrorType } from './tool-error.js';
import { z } from 'zod';

const fetchSchema = z.object({
  url: z
    .string()
    .trim()
    .url()
    .refine((value) => /^https?:\/\//i.test(value), 'Use an HTTP(S) URL.'),
  depth: z.union([z.literal(1), z.literal(2)]).default(1),
  maxSubPages: z.number().int().min(0).max(10).default(3),
  timeoutMs: z.number().int().min(1).max(120000).default(12000),
});
const MAX_PAGE_BYTES = 2 * 1024 * 1024;

async function readPage(
  response: Response,
  signal: AbortSignal,
): Promise<string> {
  if (Number(response.headers.get('content-length')) > MAX_PAGE_BYTES) {
    void response.body?.cancel().catch(() => {});
    throw new Error('Deep fetch page exceeds the 2 MiB size limit.');
  }
  if (!response.body) return '';
  const reader = response.body.getReader();
  const cancel = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener('abort', cancel, { once: true });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_PAGE_BYTES)
        throw new Error('Deep fetch page exceeds the 2 MiB size limit.');
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString('utf8');
  } catch (error) {
    cancel();
    throw error;
  } finally {
    signal.removeEventListener('abort', cancel);
    reader.releaseLock();
  }
}

export interface DeepWebFetchResult {
  url: string;
  title: string;
  content: string;
  codeBlocks?: string[];
  links: string[];
  subPages?: Array<{ url: string; title: string; content: string }>;
  error?: string;
  partial?: boolean;
  subPageErrors?: Array<{ url: string; error: string }>;
}

function normalizeGitHubUrl(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    if (u.hostname === 'github.com') {
      // Convert github.com/owner/repo/blob/branch/path -> raw.githubusercontent.com/owner/repo/branch/path
      const blobMatch = u.pathname.match(/^\/([^/]+)\/([^/]+)\/blob\/(.+)$/);
      if (blobMatch) {
        return `https://raw.githubusercontent.com/${blobMatch[1]}/${blobMatch[2]}/${blobMatch[3]}`;
      }
    }
  } catch {
    // Leave invalid URLs for the request validator to diagnose.
  }
  return rawUrl;
}

export async function deepWebFetch(
  params: {
    url: string;
    depth?: number;
    maxSubPages?: number;
    timeoutMs?: number;
  },
  signal?: AbortSignal,
): Promise<DeepWebFetchResult> {
  signal?.throwIfAborted();
  const parsed = fetchSchema.safeParse(params);
  if (!parsed.success) {
    const error = parsed.error.issues.map((issue) => issue.message).join('; ');
    return {
      url: params.url,
      title: 'Invalid request',
      content: '',
      links: [],
      error,
    };
  }
  const input = parsed.data;
  const originalUrl = input.url;
  const targetUrl = normalizeGitHubUrl(originalUrl);
  const depth = input.depth;
  const maxSub = input.maxSubPages;
  const timeoutMs = input.timeoutMs;

  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(
    () =>
      controller.abort(new Error(`Deep fetch timed out after ${timeoutMs}ms.`)),
    timeoutMs,
  );
  let partial: DeepWebFetchResult | undefined;

  try {
    controller.signal.throwIfAborted();
    const res = await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Gemini-Ultra/1.0',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,application/json;q=0.8,*/*;q=0.7',
      },
    });
    controller.signal.throwIfAborted();

    if (!res.ok) {
      void res.body?.cancel().catch(() => {});
      return {
        url: originalUrl,
        title: 'Error',
        content: `HTTP ${res.status}: ${res.statusText}`,
        links: [],
        error: `HTTP ${res.status}`,
      };
    }

    const contentType = res.headers.get('content-type') || '';
    const bodyText = await readPage(res, controller.signal);

    // Plain text / JSON / raw source code
    if (
      contentType.includes('application/json') ||
      contentType.includes('text/plain') ||
      targetUrl.includes('raw.githubusercontent.com')
    ) {
      return {
        url: originalUrl,
        title: originalUrl.split('/').pop() || originalUrl,
        content: bodyText.slice(0, 40000),
        links: [],
      };
    }

    const html = bodyText;

    // Extract title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : originalUrl;

    // Extract <pre><code> blocks explicitly so code snippets are preserved cleanly
    const codeBlocks: string[] = [];
    const codeRegex = /<pre[^>]*>([\s\S]*?)<\/pre>/gi;
    for (const match of html.matchAll(codeRegex)) {
      const cleaned = convert(match[1], { wordwrap: false }).trim();
      if (cleaned.length > 10 && codeBlocks.length < 15) {
        codeBlocks.push(cleaned);
      }
    }

    // Convert HTML to structured text
    const text = convert(html, {
      wordwrap: false,
      selectors: [
        { selector: 'nav', format: 'skip' },
        { selector: 'footer', format: 'skip' },
        { selector: 'script', format: 'skip' },
        { selector: 'style', format: 'skip' },
        { selector: 'a', options: { ignoreHref: false } },
      ],
    });

    // Extract sublinks from origin
    const urlObj = new URL(originalUrl);
    const linkMatches = html.matchAll(/href=["']([^"'>]+)["']/gi);
    const links: string[] = [];
    for (const match of linkMatches) {
      let l: string;
      try {
        const resolved = new URL(match[1], originalUrl);
        resolved.hash = '';
        l = resolved.href;
      } catch {
        continue;
      }
      if (
        /^https?:\/\//i.test(l) &&
        !links.includes(l) &&
        !/\.(png|jpg|jpeg|gif|svg|css|ico|woff2?)(\?|$)/i.test(l)
      ) {
        links.push(l);
      }
      if (links.length >= 50) break;
    }

    const subPages: Array<{ url: string; title: string; content: string }> = [];
    const subPageErrors: Array<{ url: string; error: string }> = [];
    partial = {
      url: originalUrl,
      title,
      content: text.slice(0, 35000),
      codeBlocks: codeBlocks.length ? codeBlocks : undefined,
      links,
      subPages,
      subPageErrors,
    };

    if (depth > 1) {
      const sameOriginLinks = links
        .filter((l) => {
          try {
            return new URL(l).origin === urlObj.origin && l !== originalUrl;
          } catch {
            return false;
          }
        })
        .slice(0, maxSub);

      for (const subLink of sameOriginLinks) {
        try {
          controller.signal.throwIfAborted();
          const subRes = await fetch(normalizeGitHubUrl(subLink), {
            headers: { 'User-Agent': 'Gemini-Ultra/1.0' },
            signal: controller.signal,
          });
          controller.signal.throwIfAborted();
          if (subRes.ok) {
            const subHtml = await readPage(subRes, controller.signal);
            const subTitleMatch = subHtml.match(
              /<title[^>]*>([^<]+)<\/title>/i,
            );
            const subTitle = subTitleMatch ? subTitleMatch[1].trim() : subLink;
            const subText = convert(subHtml, { wordwrap: false });
            subPages.push({
              url: subLink,
              title: subTitle,
              content: subText.slice(0, 15000),
            });
          } else {
            void subRes.body?.cancel().catch(() => {});
            subPageErrors.push({
              url: subLink,
              error: `HTTP ${subRes.status}`,
            });
          }
        } catch (error) {
          controller.signal.throwIfAborted();
          subPageErrors.push({
            url: subLink,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    return {
      url: originalUrl,
      title,
      content: text.slice(0, 35000),
      codeBlocks: codeBlocks.length > 0 ? codeBlocks : undefined,
      links: links.slice(0, 50),
      subPages: subPages.length > 0 ? subPages : undefined,
      subPageErrors: subPageErrors.length ? subPageErrors : undefined,
    };
  } catch (err: unknown) {
    signal?.throwIfAborted();
    const error: unknown = controller.signal.aborted
      ? controller.signal.reason
      : err;
    const msg = error instanceof Error ? error.message : String(error);
    if (partial) return { ...partial, partial: true, error: msg };
    return {
      url: originalUrl,
      title: 'Fetch Exception',
      content: `抓取失败: ${msg}`,
      links: [],
      error: msg,
    };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
    controller.abort();
  }
}

export interface DeepWebFetchToolParams {
  url: string;
  depth?: number;
  maxSubPages?: number;
}

class DeepWebFetchInvocation extends BaseToolInvocation<
  DeepWebFetchToolParams,
  ToolResult
> {
  constructor(
    params: DeepWebFetchToolParams,
    messageBus: MessageBus,
    toolName?: string,
  ) {
    super(params, messageBus, toolName, 'Deep Web Link Fetch');
  }

  getDescription(): string {
    return `Deep fetching URL: ${this.params.url} (depth=${this.params.depth ?? 1})`;
  }

  override async execute({ abortSignal }: ExecuteOptions): Promise<ToolResult> {
    const res = await deepWebFetch(
      {
        url: this.params.url,
        depth: this.params.depth ?? 1,
        maxSubPages: this.params.maxSubPages ?? 3,
      },
      abortSignal,
    );

    if (res.error && !res.partial) {
      return {
        llmContent: `Failed to fetch ${this.params.url}: ${res.error}`,
        returnDisplay: `深度抓取失败 (${this.params.url}): ${res.error}`,
        error: {
          message: res.error,
          type: ToolErrorType.EXECUTION_FAILED,
        },
      };
    }

    let fullReport = `### ✦ 深度网页解析: ${res.title}\n- **URL**: ${res.url}\n- **提取外链数**: ${res.links.length}\n\n#### 正文内容:\n${res.content}\n`;

    if (res.codeBlocks && res.codeBlocks.length > 0) {
      fullReport += `\n#### 页面关键代码块 (${res.codeBlocks.length}):\n`;
      res.codeBlocks.forEach((cb, idx) => {
        fullReport += `\n\`\`\`\n// Code Block #${idx + 1}\n${cb.slice(0, 2000)}\n\`\`\`\n`;
      });
    }

    if (res.subPages && res.subPages.length > 0) {
      fullReport += `\n#### 递归抓取同源子页面 (${res.subPages.length} 页):\n`;
      for (const sp of res.subPages) {
        fullReport += `\n##### [${sp.title}](${sp.url})\n${sp.content.slice(0, 4000)}\n`;
      }
    }
    if (res.subPageErrors?.length)
      fullReport += `\nIncomplete subpages:\n${res.subPageErrors.map((page) => `${page.url}: ${page.error}`).join('\n')}\n`;
    if (res.error) fullReport += `\nPartial result only: ${res.error}\n`;

    const incompleteError =
      res.error ||
      (res.subPageErrors?.length
        ? 'Some deep-fetch subpages failed; partial evidence is retained.'
        : undefined);
    return {
      llmContent: fullReport,
      returnDisplay: `${res.error || res.subPageErrors?.length ? '部分抓取' : '✓ 已深度抓取'}: ${res.title} (${res.url})\n正文长度: ${res.content.length} 字符 | 子页面: ${res.subPages?.length || 0} 个 | 外链: ${res.links.length} 条${res.error ? `\n${res.error}` : ''}`,
      ...(incompleteError
        ? {
            error: {
              message: incompleteError,
              type: ToolErrorType.EXECUTION_FAILED,
            },
          }
        : {}),
    };
  }
}

export class DeepWebFetchTool extends BaseDeclarativeTool<
  DeepWebFetchToolParams,
  ToolResult
> {
  static readonly Name = 'deep_web_fetch';

  constructor(_config: Config, messageBus: MessageBus) {
    super(
      DeepWebFetchTool.Name,
      'Deep Web Link Fetch',
      'Deeply fetches a web URL, GitHub file or documentation, extracting structured text, code blocks and links. Optional depth=2 crawls up to 10 same-origin subpages, with one 12-second total deadline, cancellation and a 2 MiB body limit per page. Reports failed subpages and retains partial root evidence on timeout.',
      Kind.Fetch,
      {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'The full HTTP/HTTPS URL to inspect and extract.',
          },
          depth: {
            type: 'integer',
            enum: [1, 2],
            description:
              'Crawl depth: 1 for single page, 2 to also crawl top same-origin linked subpages (default 1).',
          },
          maxSubPages: {
            type: 'integer',
            minimum: 0,
            maximum: 10,
            description:
              'Maximum number of same-origin subpages to crawl at depth 2 (0-10, default 3).',
          },
        },
        required: ['url'],
      },
      messageBus,
      true,
      false,
    );
  }

  protected override validateToolParamValues(
    params: DeepWebFetchToolParams,
  ): string | null {
    const parsed = fetchSchema.safeParse(params);
    return parsed.success
      ? null
      : parsed.error.issues.map((issue) => issue.message).join('; ');
  }

  protected createInvocation(
    params: DeepWebFetchToolParams,
    messageBus: MessageBus,
    toolName?: string,
  ) {
    return new DeepWebFetchInvocation(params, messageBus, toolName);
  }
}
