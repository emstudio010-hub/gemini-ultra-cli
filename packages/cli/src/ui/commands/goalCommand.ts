/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import {
  ApprovalMode,
  I18nManager,
  createDrillGoal,
  prepareDrillGoalResume,
  readAgentTaskDetails,
  listAgentTasks,
  cancelAgentWorkflow,
  exportWorkflowReports,
} from '@google/gemini-cli-core';
import {
  type CommandContext,
  CommandKind,
  type SlashCommand,
  type SlashCommandActionReturn,
} from './types.js';
import { MessageType } from '../types.js';

async function action(
  context: CommandContext,
  args: string,
  operation?: string,
): Promise<void | SlashCommandActionReturn> {
  const i18n = I18nManager.getInstance();
  const config = context.services.agentContext?.config;
  try {
    if (!config)
      throw new Error(i18n.t('配置尚未就绪。', 'Configuration is not ready.'));
    const root = config.storage.getProjectTempDir();
    const info = (text: string) =>
      context.ui.addItem({ type: MessageType.INFO, text });
    if (operation === 'list') {
      info(
        JSON.stringify(
          listAgentTasks(root, args.trim() ? Number(args) : 1),
          null,
          2,
        ),
      );
      return;
    }
    if (['status', 'pause', 'reports', 'resume'].includes(operation ?? '')) {
      const id = args.trim();
      if (!id) throw new Error('/goal ' + operation + ' <ID>');
      const details = readAgentTaskDetails(root, { mode: 'boost', id });
      if (details.kind !== 'workflow' || !details.drillGoal)
        throw new Error(
          i18n.t(
            '请使用该任务对应的原生命令。',
            'Use the native command for this task.',
          ),
        );
      if (operation === 'status') {
        info(JSON.stringify(details, null, 2));
        return;
      }
      if (operation === 'reports') {
        info(
          JSON.stringify(
            exportWorkflowReports(root, id, 'boost', i18n.getLocale()),
            null,
            2,
          ),
        );
        return;
      }
      if (operation === 'pause') {
        cancelAgentWorkflow(root, id, 'boost');
        info(
          i18n.t(
            '已请求暂停；结果保留，子任务收尾后可按 ID 续接。',
            'Pause requested. Results retained; resume by ID after children settle.',
          ),
        );
        return;
      }
      if (config.getApprovalMode() === ApprovalMode.PLAN)
        throw new Error(
          i18n.t(
            '请先退出计划模式再执行目标。',
            'Leave Plan Mode before execution.',
          ),
        );
      const prompt = prepareDrillGoalResume(root, id);
      if (!prompt) {
        info(
          i18n.t(
            '目标已完成，未重新执行。',
            'Goal already complete; no execution started.',
          ),
        );
        return;
      }
      return { type: 'submit_prompt', content: prompt };
    }
    if (!args.trim()) {
      info(
        i18n.t(
          '用法：/goal <目标> 创建并执行；/goal prepare <目标> 仅保存；/goal list；/goal status|resume|pause|reports <ID>。演练台可编辑里程碑、范围和执行预算。进度按项目保存。',
          'Usage: /goal <objective> creates and runs; /goal prepare <objective> saves only; /goal list; /goal status|resume|pause|reports <ID>. Edit milestones, scope and limits in the cockpit. Progress is saved per project.',
        ),
      );
      return;
    }
    if (config.getApprovalMode() === ApprovalMode.PLAN)
      throw new Error(
        i18n.t(
          '请先退出计划模式再创建执行目标。',
          'Leave Plan Mode before creating an executable goal.',
        ),
      );
    const record = createDrillGoal(
      root,
      { objective: args.trim() },
      config.getApprovalMode(),
      config.getSessionId(),
    );
    info(
      i18n.t('目标已保存：', 'Goal saved: ') +
        record.id +
        '\n' +
        i18n.t(
          '可在演练台查看阶段、报告与预算；进度不会因关闭页面而丢失。',
          'View milestones, reports and limits in the cockpit; closing the page retains progress.',
        ),
    );
    if (operation === 'prepare') return;
    const prompt = prepareDrillGoalResume(root, record.id);
    if (prompt) return { type: 'submit_prompt', content: prompt };
  } catch (error) {
    context.ui.addItem({
      type: MessageType.ERROR,
      text: error instanceof Error ? error.message : String(error),
    });
  }
}
export const goalCommand: SlashCommand = {
  name: 'goal',
  altNames: ['目标', '自动达标', 'g'],
  get description() {
    return I18nManager.getInstance().t(
      '创建、持续执行或续接已保存的演练台目标',
      'Create, run or resume a saved drill goal',
    );
  },
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  action: (context, args) => action(context, args),
  subCommands: [
    {
      name: 'prepare',
      zh: '保存目标与阶段，稍后执行',
      en: 'Save a goal for later execution',
    },
    {
      name: 'list',
      zh: '查看项目目标与原生任务',
      en: 'List saved goals and native tasks',
    },
    {
      name: 'status',
      zh: '按 ID 查看目标进度',
      en: 'Inspect goal progress by ID',
    },
    {
      name: 'resume',
      zh: '按 ID 续接未完成目标',
      en: 'Resume an incomplete goal by ID',
    },
    { name: 'pause', zh: '暂停并保留结果', en: 'Pause and retain results' },
    {
      name: 'reports',
      zh: '导出目标完整阶段报告',
      en: 'Export full goal reports',
    },
  ].map(({ name, zh, en }) => ({
    name,
    get description() {
      return I18nManager.getInstance().t(zh, en);
    },
    kind: CommandKind.BUILT_IN,
    autoExecute: false,
    isSafeConcurrent: ['list', 'status', 'pause'].includes(name),
    action: (context, args) => action(context, args, name),
  })),
};
