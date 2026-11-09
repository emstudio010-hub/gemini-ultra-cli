/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Config } from '../config/config.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  type ToolResult,
  type ExecuteOptions,
} from '../tools/tools.js';
import { ToolErrorType } from '../tools/tool-error.js';

export interface DiagramArtifacts {
  title: string;
  diagramType: string;
  mmdPath: string;
  htmlPath: string;
  terminalAsciiView: string;
}

export function detectMermaidType(code: string): string {
  const trimmed = code.trim().toLowerCase();
  if (trimmed.startsWith('graph') || trimmed.startsWith('flowchart')) return 'flowchart';
  if (trimmed.startsWith('sequencediagram')) return 'sequence';
  if (trimmed.startsWith('classdiagram')) return 'class';
  if (trimmed.startsWith('statediagram')) return 'state';
  if (trimmed.startsWith('erdiagram')) return 'er';
  if (trimmed.startsWith('mindmap')) return 'mindmap';
  if (trimmed.startsWith('gitgraph')) return 'gitgraph';
  return 'architecture';
}

function cleanNodeLabel(raw: string): string {
  const trimmed = raw.trim();
  // Match id["label"] or id[label] or id(label) or id{label}
  const match = trimmed.match(/^([A-Za-z0-9_.-]+)\s*[\[\(\{]+["']?([^\]\)\}]+?)["']?[\]\)\}]+$/);
  if (match) {
    return `${match[1]}: ${match[2]}`;
  }
  return trimmed.replace(/^[\(\[\{]+|[\)\]\}]+$/g, '');
}

/**
 * Render ASCII/Unicode representation of flowchart nodes, sequence flows, or tree mindmaps in terminal.
 */
export function renderTerminalDiagram(code: string): string {
  const rawLines = code.split('\n').filter((l) => l.trim().length > 0);
  const type = detectMermaidType(code);

  let output = `┌─ ✦ 架构拓扑与思维导图视图 (${type.toUpperCase()}) ──────────────────────────\n`;

  if (type === 'mindmap') {
    for (const rawLine of rawLines) {
      const trimmed = rawLine.trim();
      if (trimmed.toLowerCase().startsWith('mindmap')) continue;
      const leadingSpaces = rawLine.search(/\S/);
      const content = cleanNodeLabel(trimmed);
      const depth = Math.max(0, Math.floor(leadingSpaces / 2));
      const indentStr = depth === 0 ? '● ' : '  '.repeat(depth) + '├── ';
      output += `│  ${indentStr}${content}\n`;
    }
  } else if (type === 'sequence') {
    for (const rawLine of rawLines) {
      const line = rawLine.trim();
      if (line.toLowerCase().startsWith('sequencediagram')) continue;
      const seqMatch = line.match(/^([^\-:]+?)\s*(->>|-->>|->|-->)\s*([^\-:]+?)\s*:\s*(.+)$/);
      if (seqMatch) {
        const [, from, arrow, to, msg] = seqMatch;
        const sym = arrow.includes('--') ? '┈┈▶' : '──▶';
        output += `│  [${from.trim()}] ${sym} [${to.trim()}] : ${msg.trim()}\n`;
      } else if (!line.startsWith('%%')) {
        output += `│  • ${line}\n`;
      }
    }
  } else {
    // Flowchart / State / Class / Architecture
    for (const rawLine of rawLines) {
      const line = rawLine.trim();
      if (/^(graph|flowchart|statediagram|classdiagram|erdiagram)\b/i.test(line)) {
        continue;
      }
      if (line.startsWith('subgraph ')) {
        output += `│  ┌── ❖ ${line.replace(/^subgraph\s+/i, '')} ──\n`;
        continue;
      }
      if (line === 'end') {
        output += `│  └──\n`;
        continue;
      }
      const edgeWithLabel = line.match(/^(.+?)\s*--[>|]\s*([^|]+?)\s*\|\s*(.+)$/);
      if (edgeWithLabel) {
        const from = cleanNodeLabel(edgeWithLabel[1]);
        const edgeLabel = edgeWithLabel[2].trim();
        const to = cleanNodeLabel(edgeWithLabel[3]);
        output += `│  ┌─ [${from}]\n│  └──(${edgeLabel})──▶ [${to}]\n`;
      } else if (line.includes('-->') || line.includes('->') || line.includes('==>')) {
        const parts = line.split(/-->|->|==>/);
        const chain = parts.map((p) => `[${cleanNodeLabel(p)}]`).join(' ──▶ ');
        output += `│  ${chain}\n`;
      } else if (line.length > 0 && !line.startsWith('%%')) {
        output += `│  • ${cleanNodeLabel(line)}\n`;
      }
    }
  }

  output += '└────────────────────────────────────────────────────────────────────';
  return output;
}

/**
 * Generates an interactive HTML visualizer with pan/zoom and SVG download.
 */
export function generateInteractiveHtml(mermaidCode: string, title = 'Architecture Diagram'): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>${title} - Gemini Ultra Architecture Visualizer</title>
  <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
  <style>
    body {
      margin: 0;
      padding: 24px;
      background-color: #0d1117;
      color: #c9d1d9;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      min-height: 100vh;
    }
    .header {
      width: 100%;
      max-width: 1280px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid #30363d;
      padding-bottom: 16px;
      margin-bottom: 20px;
    }
    h1 {
      margin: 0;
      font-size: 20px;
      color: #58a6ff;
    }
    .toolbar {
      display: flex;
      gap: 8px;
    }
    button {
      background: #21262d;
      color: #c9d1d9;
      border: 1px solid #30363d;
      border-radius: 6px;
      padding: 6px 12px;
      cursor: pointer;
      font-size: 12px;
    }
    button:hover {
      background: #30363d;
    }
    .card {
      width: 100%;
      max-width: 1280px;
      height: 78vh;
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 8px;
      padding: 24px;
      box-sizing: border-box;
      box-shadow: 0 8px 24px rgba(0,0,0,0.4);
      display: flex;
      justify-content: center;
      align-items: center;
      overflow: hidden;
      position: relative;
      cursor: grab;
    }
    .card:active {
      cursor: grabbing;
    }
    #canvas {
      transform-origin: center center;
      transition: transform 0.05s ease-out;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>✦ ${title}</h1>
    <div class="toolbar">
      <button onclick="zoom(1.2)">放大 (+)</button>
      <button onclick="zoom(0.8)">缩小 (-)</button>
      <button onclick="resetView()">重置视图</button>
      <span style="font-size: 12px; color: #8b949e; align-self: center; margin-left: 8px;">Gemini-Ultra 架构与思维导图引擎</span>
    </div>
  </div>
  <div class="card" id="viewport">
    <div id="canvas">
      <div class="mermaid">
${mermaidCode}
      </div>
    </div>
  </div>
  <script>
    mermaid.initialize({
      startOnLoad: true,
      theme: 'dark',
      securityLevel: 'loose',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    });
    let scale = 1, panX = 0, panY = 0, dragging = false, startX = 0, startY = 0;
    const canvas = document.getElementById('canvas');
    const viewport = document.getElementById('viewport');
    function updateTransform() {
      canvas.style.transform = \`translate(\${panX}px, \${panY}px) scale(\${scale})\`;
    }
    function zoom(factor) {
      scale = Math.min(5, Math.max(0.2, scale * factor));
      updateTransform();
    }
    function resetView() {
      scale = 1; panX = 0; panY = 0;
      updateTransform();
    }
    viewport.addEventListener('wheel', (e) => {
      e.preventDefault();
      zoom(e.deltaY < 0 ? 1.1 : 0.9);
    });
    viewport.addEventListener('mousedown', (e) => {
      dragging = true; startX = e.clientX - panX; startY = e.clientY - panY;
    });
    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      panX = e.clientX - startX; panY = e.clientY - startY;
      updateTransform();
    });
    window.addEventListener('mouseup', () => { dragging = false; });
  </script>
</body>
</html>`;
}

export function saveDiagramArtifacts(params: {
  code: string;
  title?: string;
  workspaceDir?: string;
}): DiagramArtifacts {
  const title = params.title || `Diagram_${Date.now()}`;
  const baseDir = params.workspaceDir || process.cwd();
  const outDir = path.join(baseDir, '.gemini', 'diagrams');
  fs.mkdirSync(outDir, { recursive: true });

  const cleanName = title.toLowerCase().replace(/[^a-z0-9_-]+/g, '_') || `diagram_${Date.now()}`;
  const mmdPath = path.join(outDir, `${cleanName}.mmd`);
  const htmlPath = path.join(outDir, `${cleanName}.html`);

  fs.writeFileSync(mmdPath, params.code, 'utf8');
  fs.writeFileSync(htmlPath, generateInteractiveHtml(params.code, title), 'utf8');

  const terminalAsciiView = renderTerminalDiagram(params.code);

  return {
    title,
    diagramType: detectMermaidType(params.code),
    mmdPath,
    htmlPath,
    terminalAsciiView,
  };
}

export interface RenderDiagramToolParams {
  title: string;
  mermaidCode: string;
}

class RenderDiagramInvocation extends BaseToolInvocation<
  RenderDiagramToolParams,
  ToolResult
> {
  constructor(
    private readonly config: Config,
    params: RenderDiagramToolParams,
    messageBus: MessageBus,
    toolName?: string,
  ) {
    super(params, messageBus, toolName, 'Render Architecture Diagram / Mindmap');
  }

  getDescription(): string {
    return `Rendering diagram "${this.params.title}"`;
  }

  override async execute(_options: ExecuteOptions): Promise<ToolResult> {
    try {
      const artifacts = saveDiagramArtifacts({
        title: this.params.title,
        code: this.params.mermaidCode,
        workspaceDir: this.config.getTargetDir(),
      });
      const display = `${artifacts.terminalAsciiView}\n\n✦ 导图标题: ${artifacts.title} (${artifacts.diagramType})\n✦ 交互式预览 HTML: ${artifacts.htmlPath}\n✦ Mermaid 源文件: ${artifacts.mmdPath}`;
      return {
        llmContent: `Diagram "${artifacts.title}" (${artifacts.diagramType}) rendered and saved.\nHTML Viewer: ${artifacts.htmlPath}\nMermaid Source: ${artifacts.mmdPath}\n\nTerminal View:\n${artifacts.terminalAsciiView}`,
        returnDisplay: display,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        llmContent: `Failed to render diagram: ${msg}`,
        returnDisplay: `渲染导图失败: ${msg}`,
        error: {
          message: msg,
          type: ToolErrorType.EXECUTION_FAILED,
        },
      };
    }
  }
}

export class RenderDiagramTool extends BaseDeclarativeTool<
  RenderDiagramToolParams,
  ToolResult
> {
  static readonly Name = 'render_diagram';

  constructor(
    private readonly config: Config,
    messageBus: MessageBus,
  ) {
    super(
      RenderDiagramTool.Name,
      'Render Diagram & Mindmap',
      'Renders architecture diagrams, flowcharts, sequence diagrams, state machines, and mindmaps using Mermaid syntax. Outputs both a terminal ASCII/Unicode visualization and an interactive pan/zoom HTML viewer in `.gemini/diagrams/`.',
      Kind.Other,
      {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'Title of the architecture diagram or mindmap.',
          },
          mermaidCode: {
            type: 'string',
            description:
              'Valid Mermaid syntax (e.g., `flowchart TD`, `sequenceDiagram`, `mindmap`, `stateDiagram-v2`, `classDiagram`).',
          },
        },
        required: ['title', 'mermaidCode'],
      },
      messageBus,
      true,
      false,
    );
  }

  protected createInvocation(
    params: RenderDiagramToolParams,
    messageBus: MessageBus,
    toolName?: string,
  ) {
    return new RenderDiagramInvocation(this.config, params, messageBus, toolName);
  }
}
