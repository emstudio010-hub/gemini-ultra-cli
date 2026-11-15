/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  ApprovalMode,
  I18nManager,
  drillGoalInputSchema,
  createDrillGoal,
  readAgentTaskDetails,
  cancelAgentWorkflow,
  cancelSavedSwarm,
  exportWorkflowReports,
  exportSwarmReports,
  readAgentWorkflow,
  setWorkflowBudget,
  isAgentWorkflowRunning,
  type Config,
} from '@google/gemini-cli-core';

const selection = z.object({
  mode: z.enum(['boost', 'teamwork', 'grill-me', 'swarm']),
  id: z.string().uuid(),
});
const actionSchema = selection
  .extend({
    action: z.enum(['resume', 'pause', 'reports', 'budget']),
    limits: z
      .object({
        maxRequests: z.number().int().min(1).max(10000),
        maxFailedStages: z.number().int().min(1).max(100),
        maxImplementationRounds: z.number().int().min(1).max(100),
      })
      .strict()
      .optional(),
  })
  .strict();

export function createCockpitGoal(config: Config, body: unknown) {
  if (config.getApprovalMode() === ApprovalMode.PLAN)
    throw new Error('请先退出计划模式。 / Leave Plan Mode first.');
  const { start, ...input } = drillGoalInputSchema
    .extend({ start: z.boolean().default(false) })
    .parse(body);
  const record = createDrillGoal(
    config.storage.getProjectTempDir(),
    input,
    config.getApprovalMode(),
    config.getSessionId(),
  );
  return {
    result: {
      id: record.id,
      mode: record.mode,
      message: I18nManager.getInstance().t(
        start
          ? '目标已保存并送入 CLI 执行，进度与报告会持续保存。'
          : '目标与计划已保存，可稍后按 ID 续接。',
        start
          ? 'Goal saved and sent to the CLI. Progress and reports are persisted.'
          : 'Goal and plan saved; resume later by ID.',
      ),
    },
    submission: start ? '/goal resume ' + record.id : undefined,
  };
}

export function cockpitTaskAction(
  config: Config,
  body: unknown,
): { result: Record<string, unknown>; submission?: string } {
  const input = actionSchema.parse(body);
  const root = config.storage.getProjectTempDir();
  // Validate bounded regular records and mode before any action.
  const details = readAgentTaskDetails(root, {
    mode: input.mode,
    id: input.id,
  });
  if (input.action === 'pause') {
    if (input.mode === 'swarm') cancelSavedSwarm(root, input.id);
    else cancelAgentWorkflow(root, input.id, input.mode);
    return {
      result: {
        message: I18nManager.getInstance().t(
          '已请求暂停，阶段结果保留；等待运行中的子任务收尾后再续接。',
          'Pause requested. Results retained; wait for running children to settle before resuming.',
        ),
      },
    };
  }
  if (input.action === 'budget') {
    if (isAgentWorkflowRunning(root))
      throw new Error(
        '请先暂停执行并等待子任务收尾。 / Pause execution and wait for children to settle first.',
      );
    if (input.mode === 'swarm' || !input.limits)
      throw new Error(
        '此处支持工作流预算；Swarm 请使用终端预算命令。 / Use the native Swarm budget command.',
      );
    setWorkflowBudget(root, readAgentWorkflow(root, input.id), input.limits);
    return {
      result: {
        message: I18nManager.getInstance().t(
          '预算已保存，累计用量保留；需手动续接。',
          'Limits saved; cumulative usage retained. Resume explicitly.',
        ),
      },
    };
  }
  if (input.action === 'resume') {
    if (details.phase === 'completed')
      return {
        result: {
          message: I18nManager.getInstance().t(
            '任务已完成，未重新执行。',
            'Task already complete; no execution started.',
          ),
        },
      };
    return {
      result: {
        message: I18nManager.getInstance().t(
          '续接命令已送入 CLI，请查看终端执行与审批。',
          'Resume sent to the CLI; follow execution and approvals in the terminal.',
        ),
      },
      submission:
        '/' +
        ('drillGoal' in details && details.drillGoal ? 'goal' : input.mode) +
        ' resume ' +
        input.id,
    };
  }
  const exported =
    input.mode === 'swarm'
      ? exportSwarmReports(
          root,
          input.id,
          I18nManager.getInstance().getLocale(),
        )
      : exportWorkflowReports(
          root,
          input.id,
          input.mode,
          I18nManager.getInstance().getLocale(),
        );
  const directory = path.dirname(exported.manifestPath);
  const manifest = z
    .object({
      reports: z.array(
        z.object({
          file: z.string().regex(/^\d+\.md$/),
          bytes: z.number().int().nonnegative(),
          sha256: z.string().regex(/^[a-f0-9]{64}$/),
          label: z.string(),
        }),
      ),
    })
    .passthrough()
    .parse(JSON.parse(fs.readFileSync(exported.manifestPath, 'utf8')));
  // The on-disk full export remains available if it exceeds browser download size.
  if (
    manifest.reports.reduce((total, item) => total + item.bytes, 0) >
    16 * 1024 * 1024
  )
    return {
      result: {
        ...exported,
        message:
          '完整报告已导出到本地，超过浏览器 16 MiB 下载限额。 / Full reports exported locally; browser limit is 16 MiB.',
      },
    };
  const reports = manifest.reports.map((item) => {
    if (!/^\d+\.md$/.test(item.file)) throw new Error('Invalid report file.');
    const file = path.join(directory, item.file);
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== item.bytes)
      throw new Error('Exported report changed.');
    const data = fs.readFileSync(file);
    if (createHash('sha256').update(data).digest('hex') !== item.sha256)
      throw new Error('Exported report changed.');
    return { ...item, text: data.toString('utf8') };
  });
  return {
    result: {
      ...exported,
      filename: 'drill-' + input.id + '.json',
      download: JSON.stringify(
        {
          manifest,
          snapshot: JSON.parse(
            fs.readFileSync(path.join(directory, 'snapshot.json'), 'utf8'),
          ) as unknown,
          reports,
        },
        null,
        2,
      ),
      message: I18nManager.getInstance().t(
        '完整阶段报告已导出并下载；导出不改变任务状态。',
        'Full stage reports exported and downloaded; task state unchanged.',
      ),
    },
  };
}
