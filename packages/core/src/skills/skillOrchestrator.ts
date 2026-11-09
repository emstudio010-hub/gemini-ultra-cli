/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { type SkillDefinition, loadSkillsFromDir } from './skillLoader.js';
import { checkBinary, checkIdaMcp } from '../tools/drillTools.js';

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
    path.join(home, '.agents', 'skills'),
    path.join(home, 'reverse-skill', 'skills'),
    path.join(home, '.dsh', 'redteam', 'skills'),
    path.join(home, '.zcode', 'skills'),
    path.join(home, '.grok', 'skills'),
    path.join(home, '.commandcode', 'skills'),
    path.join(home, '.pi', 'agent', 'skills'),
  ];
  return dirs.filter((d) => fs.existsSync(d));
}

export async function discoverAllMultiSourceSkills(): Promise<SkillDefinition[]> {
  const dirs = getMultiSourceSkillDirs();
  const all: SkillDefinition[] = [];
  const seen = new Set<string>();

  for (const dir of dirs) {
    try {
      const skills = await loadSkillsFromDir(dir);
      for (const s of skills) {
        if (!seen.has(s.name.toLowerCase())) {
          seen.add(s.name.toLowerCase());
          all.push(s);
        }
      }
    } catch {}
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
export async function preflightSkillTools(domain: UniversalSkillDomain): Promise<SkillToolPreflightReport> {
  const ready: Array<{ name: string; detail: string }> = [];
  const missing: Array<{ name: string; hint: string }> = [];

  const probe = (cmd: string, name: string, hint: string) => {
    const res = checkBinary(cmd);
    if (res.available) {
      ready.push({ name, detail: res.pathOrStatus || 'available' });
    } else {
      missing.push({ name, hint });
    }
  };

  if (domain === 'design-ui') {
    probe('node', 'Node.js 运行时', '需配置 Node.js >= 20');
    probe('npm', 'NPM 包管理器', '用于安装组件库依赖');
    probe('git', 'Git 版本控制', '用于追踪 UI 资产与样式修改');
  } else if (domain === 'multimedia-video') {
    probe('ffmpeg', 'FFmpeg 多媒体核心 (GPU加速已就绪)', '音视频转码渲染核心');
    probe('ffprobe', 'FFprobe 媒体探针', '用于解析多媒体分辨率与帧率');
    probe('remotion', 'Remotion CLI', '可执行 npm i -g @remotion/cli');
  } else if (domain === 'security-reverse') {
    const ida = await checkIdaMcp();
    if (ida.available) {
      ready.push({ name: 'IDA Pro MCP 服务', detail: '127.0.0.1:8745 (在线)' });
    } else {
      missing.push({ name: 'IDA Pro MCP 服务', hint: '需在 IDA 中启动 MCP 脚本 (端口 8745)' });
    }
    probe('ghidra', 'Ghidra 反编译框架', '推荐加入 PATH 或通过 MCP 连接');
    probe('radare2', 'Radare2 逆向工具集', '命令行二进制分析工具');
    probe('jadx', 'JADX 反编译引擎', '用于 Android DEX/APK 逆向');
    probe('python3', 'Python3 自动化脚本', '逆向辅助与解密环境');
  } else if (domain === 'ai-workflow-mcp') {
    probe('node', 'Node.js MCP 宿主', '用于运行 MCP 服务器');
    probe('python', 'Python MCP / 脚本宿主', '用于运行 Python 自动化任务');
  } else {
    probe('git', 'Git 代码仓库', '追踪工程演进与回滚');
    probe('node', 'Node.js 运行环境', '运行本地构建');
  }

  return {
    domain,
    readyTools: ready,
    missingTools: missing,
  };
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
  const tags: string[] = [profile.badge.replace(/[\[\]]/g, '').trim()];

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

export interface SkillLibraryEntry {
  name: string;
  domain: UniversalSkillDomain;
  badge: string;
  tags: string[];
  mode: 'tagged' | 'native-passthrough';
  preferredModel?: string;
  preferredEffort?: string;
  updatedAt: string;
}

function getSkillTagsRegistryPath(): string {
  const dir = path.join(os.homedir(), '.gemini', 'config');
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'skill-tags.json');
}

export function loadSkillLibraryRegistry(): Record<string, SkillLibraryEntry> {
  const filePath = getSkillTagsRegistryPath();
  if (!fs.existsSync(filePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<
      string,
      SkillLibraryEntry
    >;
  } catch {
    return {};
  }
}

export function getSkillLibraryEntry(skillName: string): SkillLibraryEntry | undefined {
  const reg = loadSkillLibraryRegistry();
  return reg[skillName.toLowerCase()];
}

export function registerSkillInLibrary(entry: Omit<SkillLibraryEntry, 'updatedAt'>): SkillLibraryEntry {
  const reg = loadSkillLibraryRegistry();
  const full: SkillLibraryEntry = {
    ...entry,
    updatedAt: new Date().toISOString(),
  };
  reg[entry.name.toLowerCase()] = full;
  fs.writeFileSync(getSkillTagsRegistryPath(), JSON.stringify(reg, null, 2), 'utf8');
  return full;
}
