/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { I18nManager } from '@google/gemini-cli-core';
import type { SlashCommand } from '../ui/commands/types.js';

const descriptions: Record<string, [string, string]> = {
  about: ['查看版本和项目信息', 'Show version and project information'],
  agents: ['管理协作代理', 'Manage collaboration agents'],
  auth: ['管理登录与认证', 'Manage authentication'],
  bug: ['报告问题', 'Report a problem'],
  'bug-memory': ['诊断会话记忆', 'Diagnose session memory'],
  chat: ['保存、恢复和管理对话', 'Save, resume and manage chats'],
  clear: ['清空当前对话显示', 'Clear the conversation display'],
  commands: ['管理自定义命令', 'Manage custom commands'],
  compress: ['压缩当前会话上下文', 'Compress conversation context'],
  copy: ['复制最近回复', 'Copy the latest response'],
  docs: ['打开使用文档', 'Open documentation'],
  export: ['导出当前会话', 'Export this session'],
  directory: ['管理工作目录', 'Manage workspace directories'],
  editor: ['选择编辑器', 'Choose an editor'],
  extensions: ['管理扩展', 'Manage extensions'],
  footer: ['设置终端状态栏', 'Configure the status bar'],
  help: ['查看命令帮助', 'Show command help'],
  shortcuts: ['查看快捷键', 'Show keyboard shortcuts'],
  rewind: ['回退会话状态', 'Rewind the session'],
  hooks: ['管理事件钩子', 'Manage hooks'],
  ide: ['管理编辑器连接', 'Manage editor integration'],
  init: ['生成项目说明', 'Create project instructions'],
  mcp: ['管理工具服务器', 'Manage MCP servers'],
  memory: ['管理会话与项目记忆', 'Manage session and project memory'],
  model: ['切换当前模型', 'Choose the active model'],
  provider: ['添加和配置模型供应商', 'Add and configure model providers'],
  effort: ['选择六档推理强度', 'Choose one of six reasoning levels'],
  drill: ['打开演练台控制中心', 'Open the drill control center'],
  redteam: ['切换授权红队工作流', 'Configure the authorized red-team workflow'],
  team: ['设置多代理协作模式', 'Configure multi-agent collaboration'],
  swarm: [
    '启动具名蜂群与共享留言板',
    'Coordinate named swarm members on a shared board',
  ],
  boost: [
    '启动难题调查、实施与独立复核',
    'Investigate, implement and independently review a difficult task',
  ],
  teamwork: [
    '对齐需求并按里程碑协作推进',
    'Scope and execute a milestone-based team workflow',
  ],
  'grill-me': [
    '逐题澄清需求并保存约定',
    'Clarify requirements one question at a time',
  ],
  branch: ['分支与上下文管理', 'Manage branches and context'],
  taste: ['设置写作和代码偏好', 'Configure writing and coding preferences'],
  inspect: ['查看当前系统状态', 'Inspect the current system state'],
  image: [
    '生成图片和配置生图模型',
    'Generate images and configure image models',
  ],
  diagram: ['生成结构图', 'Generate diagrams'],
  fetch: ['读取网页内容', 'Fetch web content'],
  goal: ['设定持续执行目标', 'Set a persistent task goal'],
  bypass: ['切换人工审批设置', 'Configure manual approvals'],
  language: ['切换中文或英文界面', 'Choose Chinese or English'],
  permissions: ['管理工作区权限', 'Manage workspace permissions'],
  plan: ['进入计划模式', 'Enter plan mode'],
  policies: ['查看生效策略', 'Show active policies'],
  privacy: ['查看隐私设置', 'Show privacy settings'],
  profile: ['查看性能信息', 'Show performance information'],
  quit: ['保存并退出', 'Save and exit'],
  restore: ['恢复文件检查点', 'Restore file checkpoints'],
  resume: ['恢复已有对话', 'Resume an existing chat'],
  stats: ['查看会话用量', 'Show session usage'],
  theme: ['选择终端配色', 'Choose the terminal theme'],
  tools: ['查看可用工具', 'List available tools'],
  skills: ['管理技能', 'Manage skills'],
  settings: ['修改设置', 'Edit settings'],
  tasks: ['查看后台任务', 'Show background tasks'],
  vim: ['切换编辑快捷键模式', 'Toggle Vim editing'],
  voice: ['设置语音输入', 'Configure voice input'],
  upgrade: ['查看账户方案', 'View account plans'],
};

export function localizeCommand(command: SlashCommand): SlashCommand {
  const translated = descriptions[command.name];
  return {
    ...command,
    get description() {
      return translated
        ? I18nManager.getInstance().t(...translated)
        : command.description;
    },
    ...(command.subCommands
      ? { subCommands: command.subCommands.map(localizeCommand) }
      : {}),
  };
}
