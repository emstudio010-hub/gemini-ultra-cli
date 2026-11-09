/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  saveDiagramArtifacts,
} from '@google/gemini-cli-core';
import {
  type CommandContext,
  CommandKind,
  type SlashCommand,
} from './types.js';
import { MessageType } from '../types.js';

export const diagramCommand: SlashCommand = {
  name: 'diagram',
  altNames: ['架构图', '思维导图', '导图', 'dia'],
  description: '渲染架构图与思维导图 (Mermaid/ASCII/HTML)。用法: /diagram [mindmap | flowchart | <Mermaid源码>]',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  action: async (context: CommandContext, args: string) => {
    let code = args.trim();

    if (!code || code === 'mindmap' || code === '思维导图') {
      code = `mindmap
  root((核心系统架构))
    UI前端展现
      Tailwind与组件库
      响应式布局
      交互动效
    Core核心引擎
      多协议生成网关
      长期记忆图谱
      红队演练台
    AI工具链
      Mermaid渲染
      深度链接解析
      生图模型调用`;
    } else if (code === 'flowchart' || code === '流程图') {
      code = `graph TD
  User([用户输入]) --> Gateway[Universal Content Gateway]
  Gateway --> Router{协议路由}
  Router -->|Chat| OpenAI[OpenAI / DeepSeek / ZCode]
  Router -->|Responses| Codex[Codex / v1/responses]
  Router -->|Messages| Claude[Anthropic Messages]
  Router -->|Native| Gemini[Google Gemini GenAI]
  Gateway --> Memory[(长期图谱记忆库)]
  Gateway --> Drill[(演练台事实库)]`;
    }

    const workspaceDir = context.services.agentContext?.config?.getTargetDir?.() || process.cwd();
    const artifacts = saveDiagramArtifacts({
      code,
      title: 'System_Architecture_Diagram',
      workspaceDir,
    });

    let text = `${artifacts.terminalAsciiView}\n\n`;
    text += `✓ 架构图文件已生成：\n`;
    text += `• Mermaid 源码: ${artifacts.mmdPath}\n`;
    text += `• 交互式 HTML 视窗: ${artifacts.htmlPath}\n`;
    text += `提示: 可在浏览器中打开 HTML 文件获得完整缩放与无损高精度矢量呈现。`;

    context.ui.addItem({
      type: MessageType.INFO,
      text,
    });
  },
};
