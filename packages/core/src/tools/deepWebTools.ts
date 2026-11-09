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

export interface DeepWebFetchResult {
  url: string;
  title: string;
  content: string;
  codeBlocks?: string[];
  links: string[];
  subPages?: Array<{ url: string; title: string; content: string }>;
  error?: string;
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
  } catch {}
  return rawUrl;
}

export async function deepWebFetch(params: {
  url: string;
  depth?: number;
  maxSubPages?: number;
  timeoutMs?: number;
}): Promise<DeepWebFetchResult> {
  const originalUrl = params.url.trim();
  const targetUrl = normalizeGitHubUrl(originalUrl);
  const depth = params.depth ?? 1;
  const maxSub = params.maxSubPages ?? 3;
  const timeoutMs = params.timeoutMs ?? 12000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Gemini-Ultra/1.0',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,application/json;q=0.8,*/*;q=0.7',
      },
    });

    if (!res.ok) {
      return {
        url: originalUrl,
        title: 'Error',
        content: `HTTP ${res.status}: ${res.statusText}`,
        links: [],
        error: `HTTP ${res.status}`,
      };
    }

    const contentType = res.headers.get('content-type') || '';
    const bodyText = await res.text();

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
    const linkMatches = html.matchAll(/href=["'](https?:\/\/[^"'>]+|\/[^"'>]+)["']/gi);
    const links: string[] = [];
    for (const match of linkMatches) {
      let l = match[1];
      if (l.startsWith('/')) {
        l = `${urlObj.origin}${l}`;
      }
      if (
        l.startsWith('http') &&
        !links.includes(l) &&
        !/\.(png|jpg|jpeg|gif|svg|css|ico|woff2?)(\?|$)/i.test(l)
      ) {
        links.push(l);
      }
    }

    const subPages: Array<{ url: string; title: string; content: string }> = [];

    if (depth > 1) {
      const sameOriginLinks = links
        .filter((l) => {
          try {
            return new URL(l).hostname === urlObj.hostname && l !== originalUrl;
          } catch {
            return false;
          }
        })
        .slice(0, maxSub);

      for (const subLink of sameOriginLinks) {
        try {
          const subRes = await fetch(normalizeGitHubUrl(subLink), {
            headers: { 'User-Agent': 'Gemini-Ultra/1.0' },
          });
          if (subRes.ok) {
            const subHtml = await subRes.text();
            const subTitleMatch = subHtml.match(/<title[^>]*>([^<]+)<\/title>/i);
            const subTitle = subTitleMatch ? subTitleMatch[1].trim() : subLink;
            const subText = convert(subHtml, { wordwrap: false });
            subPages.push({
              url: subLink,
              title: subTitle,
              content: subText.slice(0, 15000),
            });
          }
        } catch {}
      }
    }

    return {
      url: originalUrl,
      title,
      content: text.slice(0, 35000),
      codeBlocks: codeBlocks.length > 0 ? codeBlocks : undefined,
      links: links.slice(0, 50),
      subPages: subPages.length > 0 ? subPages : undefined,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      url: originalUrl,
      title: 'Fetch Exception',
      content: `抓取失败: ${msg}`,
      links: [],
      error: msg,
    };
  } finally {
    clearTimeout(timer);
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

  override async execute(_options: ExecuteOptions): Promise<ToolResult> {
    const res = await deepWebFetch({
      url: this.params.url,
      depth: this.params.depth ?? 1,
      maxSubPages: this.params.maxSubPages ?? 3,
    });

    if (res.error) {
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

    return {
      llmContent: fullReport,
      returnDisplay: `✓ 已深度抓取: ${res.title} (${res.url})\n正文长度: ${res.content.length} 字符 | 子页面: ${res.subPages?.length || 0} 个 | 外链: ${res.links.length} 条`,
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
      'Deeply fetches and parses a web URL, GitHub file/repository, or documentation link, extracting clean structured text, code blocks, links, and optionally crawling same-origin subpages (when depth=2).',
      Kind.Fetch,
      {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'The full HTTP/HTTPS URL to inspect and extract.',
          },
          depth: {
            type: 'number',
            description:
              'Crawl depth: 1 for single page, 2 to also crawl top same-origin linked subpages (default 1).',
          },
          maxSubPages: {
            type: 'number',
            description: 'Maximum number of subpages to crawl when depth > 1 (default 3).',
          },
        },
        required: ['url'],
      },
      messageBus,
      true,
      false,
    );
  }

  protected createInvocation(
    params: DeepWebFetchToolParams,
    messageBus: MessageBus,
    toolName?: string,
  ) {
    return new DeepWebFetchInvocation(params, messageBus, toolName);
  }
}
