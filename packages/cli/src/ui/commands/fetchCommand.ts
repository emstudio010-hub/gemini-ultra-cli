/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { deepWebFetch } from '@google/gemini-cli-core';
import {
  type CommandContext,
  CommandKind,
  type SlashCommand,
} from './types.js';
import { MessageType } from '../types.js';

export const fetchCommand: SlashCommand = {
  name: 'fetch',
  altNames: ['抓取', '链接', 'url'],
  description:
    '深度抓取与分析外部网页链接/技术文档/GitHub。用法: /fetch <URL> [--depth=1|2]',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  action: async (context: CommandContext, args: string) => {
    const parts = args.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) {
      context.ui.addItem({
        type: MessageType.ERROR,
        text: '用法: /fetch <URL> [--depth=1|2]',
      });
      return;
    }

    const url = parts[0];
    const depth = parts.includes('--depth=2') ? 2 : 1;

    context.ui.addItem({
      type: MessageType.INFO,
      text: `正在深度抓取链接内容: ${url} (深度: ${depth})...`,
    });

    const res = await deepWebFetch({
      url,
      depth,
    });

    if (res.error && !res.partial) {
      context.ui.addItem({
        type: MessageType.ERROR,
        text: `抓取失败: ${res.error}`,
      });
      return;
    }

    let text = `=== 网页深度抓取结果: ${res.title} ===\n来源: ${res.url}\n\n`;
    text += `${res.content.slice(0, 1500)}${res.content.length > 1500 ? '\n\n... (正文过长已截断)' : ''}\n`;
    if (res.error) text += `\n部分抓取：${res.error}\n`;
    if (res.subPageErrors?.length)
      text += `\n未完成的子页面：\n${res.subPageErrors.map((page) => `${page.url}: ${page.error}`).join('\n')}\n`;

    if (res.subPages && res.subPages.length > 0) {
      text += `\n--- 关联深度子页面 (共 ${res.subPages.length} 页) ---\n`;
      for (const sp of res.subPages) {
        text += `• [${sp.title}] (${sp.url}): 提取 ${sp.content.length} 字符\n`;
      }
    }

    context.ui.addItem({
      type: MessageType.INFO,
      text,
    });
  },
};
