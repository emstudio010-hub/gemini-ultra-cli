/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { type SkillDefinition, loadSkillsFromDir } from './skillLoader.js';
import { checkBinaryAsync, runDrillPreflight } from '../tools/drillTools.js';
import { I18nManager, type UiLocale } from '../i18n/i18nManager.js';
import { withAbortSignal } from '../utils/withAbortSignal.js';

export type UniversalSkillDomain =
  | 'design-ui'
  | 'multimedia-video'
  | 'security-reverse'
  | 'ai-workflow-mcp'
  | 'system-architecture'
  | 'specialized-domain';

export interface SkillDomainProfile {
  domain: UniversalSkillDomain;
  domainLabel: string;
  badge: string;
  confidence: number;
  coreCapabilities: string[];
  recommendedModelTier: string;
}

export interface SkillToolPreflightReport {
  domain: UniversalSkillDomain;
  readyTools: Array<{ name: string; detail: string }>;
  missingTools: Array<{ name: string; hint: string }>;
}

export function getMultiSourceSkillDirs(): string[] {
  const home = os.homedir();
  const dirs = [
    path.join(home, '.gemini', 'config', 'skills'),
    // Note: ~/.agents/skills is already loaded natively by Storage.getUserAgentSkillsDir()
    path.join(home, 'reverse-skill', 'skills'),
    path.join(home, '.dsh', 'redteam', 'skills'),
    path.join(home, '.zcode', 'skills'),
    path.join(home, '.grok', 'skills'),
    path.join(home, '.commandcode', 'skills'),
    path.join(home, '.pi', 'agent', 'skills'),
  ];
  return dirs.filter((d) => fs.existsSync(d));
}

export async function discoverAllMultiSourceSkills(signal?: AbortSignal): Promise<SkillDefinition[]> {
  signal?.throwIfAborted();
  const dirs = getMultiSourceSkillDirs();
  const all: SkillDefinition[] = [];
  const seen = new Set<string>();

  for (const dir of dirs) {
    signal?.throwIfAborted();
    try {
      const skills = await withAbortSignal(signal, () =>
        loadSkillsFromDir(dir, signal),
      );
      for (const s of skills) {
        if (!seen.has(s.name.toLowerCase())) {
          seen.add(s.name.toLowerCase());
          all.push(s);
        }
      }
    } catch {
      signal?.throwIfAborted();
      // Continue discovery in the remaining independent skill directories.
    }
  }

  return all;
}

/**
 * Universal Skill Classifier:
 * Analyzes skill metadata and full text to classify into 6 major domains.
 */
export function classifySkill(skill: SkillDefinition): SkillDomainProfile {
  const text = `${skill.name} ${skill.description} ${skill.body}`.toLowerCase();

  // 1. Frontend & UI/UX Design
  const designKeywords = [
    'frontend', 'ui', 'ux', 'css', 'tailwind', 'design', 'component', 'react-bits',
    'impeccable', 'taste', 'awwwards', 'typography', 'palette', 'layout', 'landing',
    'shadcn', 'responsive', 'animation', 'anti-slop', 'hero',
  ];
  let designHits = 0;
  for (const kw of designKeywords) {
    if (text.includes(kw)) designHits++;
  }

  // 2. Multimedia & Video Engineering
  const mediaKeywords = [
    'remotion', 'ffmpeg', 'ffprobe', 'video', 'audio', 'mediabunny', 'render',
    'tts', 'asr', 'mimo', 'subtitle', 'caption', 'hardware acceleration', 'amf',
    'transcode', 'ocr', 'frame', 'codec', 'dubbing',
  ];
  let mediaHits = 0;
  for (const kw of mediaKeywords) {
    if (text.includes(kw)) mediaHits++;
  }

  // 3. Security, RedTeam & Reverse Engineering
  const secKeywords = [
    'reverse', 'ida', 'ghidra', 'radare2', 'r2', 'frida', 'jadx', 'apk', 'dex',
    'elf', 'pe', 'mach-o', 'ollvm', 'decompile', 'disassembl', 'nuclei', 'fscan',
    'cve', 'vuln', 'redteam', 'poc', 'exploit', 'ast', '补环境', '反混淆', 'wasm',
  ];
  let secHits = 0;
  for (const kw of secKeywords) {
    if (text.includes(kw)) secHits++;
  }

  // 4. AI Agents, Workflows & MCP Automation
  const aiKeywords = [
    'agent', 'mcp', 'automation', 'cron', 'workflow', 'subagent', 'plugin',
    'customization', 'schedule', 'rule', 'hook', 'sidecar', 'orchestrat',
  ];
  let aiHits = 0;
  for (const kw of aiKeywords) {
    if (text.includes(kw)) aiHits++;
  }

  // 5. System Architecture & Deep Refactoring
  const sysKeywords = [
    'architecture', 'refactor', 'karpathy', 'performance', 'database', 'sqlite',
    'guideline', 'concurrency', 'memory', 'clean code', 'engineering',
  ];
  let sysHits = 0;
  for (const kw of sysKeywords) {
    if (text.includes(kw)) sysHits++;
  }

  // Calculate highest score
  const scores = [
    { domain: 'design-ui' as UniversalSkillDomain, hits: designHits },
    { domain: 'multimedia-video' as UniversalSkillDomain, hits: mediaHits },
    { domain: 'security-reverse' as UniversalSkillDomain, hits: secHits },
    { domain: 'ai-workflow-mcp' as UniversalSkillDomain, hits: aiHits },
    { domain: 'system-architecture' as UniversalSkillDomain, hits: sysHits },
  ].sort((a, b) => b.hits - a.hits);

  const top = scores[0];
  if (top.hits >= 2) {
    if (top.domain === 'design-ui') {
      return {
        domain: 'design-ui',
        domainLabel: '前端美学与 UI/UX 设计工程 (Frontend Design & UI/UX)',
        badge: '🎨 [设计与前端]',
        confidence: Math.min(0.98, 0.7 + top.hits * 0.05),
        coreCapabilities: ['高阶审美与 Anti-Slop 艺术指导', '组件库与现代交互规范', '响应式布局与微动效打磨'],
        recommendedModelTier: '视觉与前端感知较强的高分模型 (如 Claude 3.7 / Grok-4 / Gemini 2.5 Pro)',
      };
    }
    if (top.domain === 'multimedia-video') {
      return {
        domain: 'multimedia-video',
        domainLabel: '音视频与多媒体编排流水线 (Multimedia & Video Pipeline)',
        badge: '🎬 [音视频多媒体]',
        confidence: Math.min(0.98, 0.7 + top.hits * 0.05),
        coreCapabilities: ['Remotion 代码级动态视频渲染', 'FFmpeg GPU 硬件加速混合合成', '语音转录、配音与音轨响度母带化'],
        recommendedModelTier: '逻辑严谨、多媒体 API 理解深入的模型 (如 Gemini 2.5 Pro / ZCode GLM-5.1)',
      };
    }
    if (top.domain === 'security-reverse') {
      return {
        domain: 'security-reverse',
        domainLabel: '安全攻防与底层逆向分析 (Security & Reverse Engineering)',
        badge: '🛡️ [安全与逆向]',
        confidence: Math.min(0.98, 0.7 + top.hits * 0.05),
        coreCapabilities: ['Native 二进制/移动端反编译与符号还原', 'JS 协议逆向、AST 反混淆与补环境', '漏洞验证证据链与安全补丁事务四件套'],
        recommendedModelTier: '深度推理与极端逻辑推演模型 (高思考强度 High/XHigh，如 R1 / o3 / MimoCode)',
      };
    }
    if (top.domain === 'ai-workflow-mcp') {
      return {
        domain: 'ai-workflow-mcp',
        domainLabel: '自主 Agent、工作流与 MCP 自动化 (AI Agents & MCP Automation)',
        badge: '🤖 [AI 与自动化]',
        confidence: Math.min(0.98, 0.7 + top.hits * 0.05),
        coreCapabilities: ['MCP 外部服务调度与多工具链编排', '长效周期自动化与会话状态快照', '跨插件与技能动态扩展加载'],
        recommendedModelTier: '长上下文、工具调用极其精准的主控模型 (如 Gemini 2.5 Pro / Claude 3.7)',
      };
    }
    if (top.domain === 'system-architecture') {
      return {
        domain: 'system-architecture',
        domainLabel: '系统架构演进与全栈工程 (Architecture & System Engineering)',
        badge: '🏗️ [架构与工程]',
        confidence: Math.min(0.98, 0.7 + top.hits * 0.05),
        coreCapabilities: ['大型模块解耦与渐进式重构策略', '工程品味 (taste.md) 与严格代码纪律约束', '系统高并发与本地存储性能调优'],
        recommendedModelTier: '代码工程综合实力顶尖的高阶模型',
      };
    }
  }

  return {
    domain: 'specialized-domain',
    domainLabel: '专项垂直业务与通用知识 (Specialized Domain Skills)',
    badge: '🧩 [垂直专项]',
    confidence: 0.75,
    coreCapabilities: ['专属上下文与方法论契约注入', '领域工作流精准对齐', '定制化任务步骤编排'],
    recommendedModelTier: '通用强推理模型 (平衡型 Medium / High)',
  };
}

/**
 * Universal Tool Preflight:
 * Probes environment and local tooling based on domain.
 */
export async function preflightSkillTools(
  domain: UniversalSkillDomain,
  signal?: AbortSignal,
  locale: UiLocale = I18nManager.getInstance().getLocale(),
): Promise<SkillToolPreflightReport> {
  signal?.throwIfAborted();
  const t = (zh: string, en: string) => (locale === 'zh' ? zh : en);
  type Probe = { keys: string[]; name: string; hint: string };
  const probe = (key: string, name: string, zh: string, en: string): Probe => ({
    keys: [key],
    name,
    hint: t(zh, en),
  });
  let probes: Probe[];
  let discovered: Record<string, { available: boolean; pathOrStatus?: string }>;
  if (domain === 'security-reverse') {
    probes = [
      probe(
        'ida-pro-mcp',
        'IDA MCP',
        '请检查 IDA MCP 服务与演练台连接设置。',
        'Check the IDA MCP service and drill connection settings.',
      ),
      probe(
        'ghidra-decompiler',
        t('Ghidra 反编译器', 'Ghidra decompiler'),
        '配置 Ghidra 安装目录和 Java；实际兼容性在使用时检查。',
        'Configure the Ghidra installation and Java; compatibility is checked on use.',
      ),
      {
        keys: ['r2', 'radare2'],
        name: 'Radare2',
        hint: t(
          '通过 /drill tools 配置 r2 路径或添加到 PATH。',
          'Configure r2 with /drill tools or add it to PATH.',
        ),
      },
      probe(
        'jadx',
        'JADX',
        '通过 /drill tools 配置 jadx 路径或添加到 PATH。',
        'Configure jadx with /drill tools or add it to PATH.',
      ),
      {
        keys: ['python3', 'python'],
        name: 'Python',
        hint: t(
          '配置 Python 路径或添加到 PATH。',
          'Configure Python or add it to PATH.',
        ),
      },
    ];
    discovered = (await runDrillPreflight(signal)).tools;
  } else {
    if (domain === 'design-ui') {
      probes = [
        probe(
          'node',
          'Node.js',
          '请将 Node.js 添加到 PATH。',
          'Add Node.js to PATH.',
        ),
        probe('npm', 'npm', '请将 npm 添加到 PATH。', 'Add npm to PATH.'),
        probe('git', 'Git', '请将 Git 添加到 PATH。', 'Add Git to PATH.'),
      ];
    } else if (domain === 'multimedia-video') {
      probes = [
        probe(
          'ffmpeg',
          'FFmpeg',
          '请将 FFmpeg 添加到 PATH。',
          'Add FFmpeg to PATH.',
        ),
        probe(
          'ffprobe',
          'FFprobe',
          '请将 FFprobe 添加到 PATH。',
          'Add FFprobe to PATH.',
        ),
        probe(
          'remotion',
          'Remotion CLI',
          '检查项目依赖或 Remotion CLI 的 PATH。',
          'Check project dependencies or Remotion CLI on PATH.',
        ),
      ];
    } else if (domain === 'ai-workflow-mcp') {
      probes = [
        probe(
          'node',
          'Node.js',
          '请将 Node.js 添加到 PATH。',
          'Add Node.js to PATH.',
        ),
        probe(
          'python',
          'Python',
          '请将 Python 添加到 PATH。',
          'Add Python to PATH.',
        ),
      ];
    } else {
      probes = [
        probe('git', 'Git', '请将 Git 添加到 PATH。', 'Add Git to PATH.'),
        probe(
          'node',
          'Node.js',
          '请将 Node.js 添加到 PATH。',
          'Add Node.js to PATH.',
        ),
      ];
    }
    discovered = Object.fromEntries(
      await Promise.all(
        probes.map(
          async (item) =>
            [
              item.keys[0],
              await checkBinaryAsync(item.keys[0], signal),
            ] as const,
        ),
      ),
    );
  }
  signal?.throwIfAborted();
  const ready: SkillToolPreflightReport['readyTools'] = [];
  const missing: SkillToolPreflightReport['missingTools'] = [];
  for (const item of probes) {
    const found = item.keys
      .map((key) => discovered[key])
      .find((result) => result?.available);
    if (found) {
      ready.push({
        name: item.name,
        detail: [
          found.pathOrStatus,
          t(
            '已发现；版本与能力未验证。',
            'Discovered; version and capabilities not verified.',
          ),
        ]
          .filter(Boolean)
          .join(' · '),
      });
    } else {
      missing.push({ name: item.name, hint: item.hint });
    }
  }
  return { domain, readyTools: ready, missingTools: missing };
}

/**
 * Checks if a skill is registered in known skills.
 */
export function isSkillRegistered(name: string, knownSkills: SkillDefinition[]): boolean {
  const lower = name.trim().toLowerCase();
  return knownSkills.some((s) => s.name.toLowerCase() === lower);
}

/**
 * Suggests tags for newly discovered external skills.
 */
export function suggestSkillTags(name: string, content: string): {
  tags: string[];
  domainProfile: SkillDomainProfile;
} {
  const mockSkill: SkillDefinition = {
    name,
    description: name,
    location: '',
    body: content,
  };
  const profile = classifySkill(mockSkill);
  const tags: string[] = [profile.badge.replace(/[[\]]/g, '').trim()];

  if (profile.domain === 'design-ui') tags.push('#UI设计', '#前端工程', '#组件美学');
  else if (profile.domain === 'multimedia-video') tags.push('#音视频', '#Remotion', '#FFmpeg');
  else if (profile.domain === 'security-reverse') tags.push('#逆向分析', '#安全审计', '#底层协议');
  else if (profile.domain === 'ai-workflow-mcp') tags.push('#AI智能体', '#MCP调度', '#自动化');
  else if (profile.domain === 'system-architecture') tags.push('#系统重构', '#工程纪律', '#性能调优');
  else tags.push('#垂直专项', '#定制领域');

  return { tags, domainProfile: profile };
}

/**
 * Saves and tags a newly discovered skill into user config.
 */
export function saveSkillWithTags(params: {
  name: string;
  body: string;
  description?: string;
  tags?: string[];
}): string {
  const home = os.homedir();
  const targetDir = path.join(home, '.gemini', 'config', 'skills', params.name);
  fs.mkdirSync(targetDir, { recursive: true });

  const targetFile = path.join(targetDir, 'SKILL.md');
  const frontmatter = [
    '---',
    `name: ${params.name}`,
    `description: ${params.description || params.name}`,
    `tags: [${(params.tags || []).map((t) => JSON.stringify(t)).join(', ')}]`,
    '---',
    '',
    params.body,
  ].join('\n');

  fs.writeFileSync(targetFile, frontmatter, 'utf8');
  return targetFile;
}

export { loadSkillLibraryRegistry, getSkillLibraryEntry, registerSkillInLibrary } from './skillLibrary.js';
export type { SkillLibraryEntry } from './skillLibrary.js';
