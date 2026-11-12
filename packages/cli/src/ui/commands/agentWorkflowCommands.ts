/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import {
  ApprovalMode,
  I18nManager,
  createAgentWorkflow,
  latestAgentWorkflow,
  readAgentWorkflow,
  saveAgentWorkflow,
  cancelAgentWorkflow,
  isAgentWorkflowRunning,
  workflowBudgetSummary,
  savedWorkflowBudgetSummary,
  setWorkflowBudget,
  activateWorkflowBudget,
  closeWorkflowBudget,
  availableAgentModels,
  setWorkflowRoleModel,
  agentWorktreeCommand,
  assertWorkflowBudgetOwnership,
  exportWorkflowReports,
  type AgentWorkflow,
  type AgentWorkflowMode,
} from '@google/gemini-cli-core';
import {
  CommandKind,
  type CommandContext,
  type SlashCommand,
  type SlashCommandActionReturn,
} from './types.js';
import { MessageType } from '../types.js';
import { agentTaskCatalogText } from './agentTaskCatalog.js';

function interviewPrompt(record: AgentWorkflow): string {
  return `Workflow ${record.id} (${record.mode}), phase ${record.phase}.\nObjective: ${record.objective}\nExisting brief: ${record.brief}\nRead relevant workspace sources first; never ask the user what the code already answers. Ask ONE focused question at a time using ask_user, with 2-4 concrete options and the recommended option first, plus the existing free-text facility. Respect answered questions, stated constraints, and the user's language. Do not ask redundant approval questions. Clarify outcome, boundaries, compatibility and objective acceptance. You are in read-only Plan Mode: no implementation, commands that modify files, or worker launch. When aligned, call draft_agent_workflow with workflow_id=${record.id}, an agreed brief and bounded milestones each with explicit acceptance criteria. Present the draft and await ${record.mode === 'grill-me' ? '/grill-me finish' : '/teamwork approve'}. Run only necessary relevant validation when implementation is later approved; no unsolicited full or smoke suites.`;
}
function executionPrompt(record: AgentWorkflow): string {
  return `Run the approved ${record.mode} workflow ${record.id} using run_agent_workflow({"workflow_id":"${record.id}"}). The native tool owns investigation, serial implementation, independent acceptance review and persisted milestone progress. Do not create duplicate ad hoc batches or reimplement this orchestration yourself. Honor the user's validation scope. On return, integrate stage evidence and deliverables into a concise response. A blocked or cancelled run is not completion; do not automatically retry it.\nObjective: ${record.objective}\nAgreed brief: ${record.brief}`;
}
function workflowCommand(
  mode: AgentWorkflowMode,
  altNames: string[],
): SlashCommand {
  const action = async (
    context: CommandContext,
    args: string,
    operation?: string,
  ): Promise<void | SlashCommandActionReturn> => {
    const i18n = I18nManager.getInstance();
    const config = context.services.agentContext?.config;
    const info = (text: string) =>
      context.ui.addItem({ type: MessageType.INFO, text });
    try {
      if (!config)
        throw new Error(
          i18n.t('当前配置尚未就绪。', 'Configuration is not ready.'),
        );
      const root = config.storage.getProjectTempDir();
      if (operation === 'list') {
        info(agentTaskCatalogText(root, args, mode));
        return;
      }
      if (operation === 'prepare') {
        if (!args.trim())
          throw new Error(
            i18n.t(
              `用法：/${mode} prepare <任务>`,
              `Usage: /${mode} prepare <task>`,
            ),
          );
        if (mode === 'boost' && config.getApprovalMode() === ApprovalMode.PLAN)
          throw new Error(
            i18n.t('请先退出计划模式。', 'Leave Plan Mode first.'),
          );
        if (isAgentWorkflowRunning(root))
          throw new Error(
            i18n.t(
              '当前项目已有工作流正在执行。',
              'A workflow is already running in this project.',
            ),
          );
        const prepared = createAgentWorkflow(
          root,
          mode,
          args.trim(),
          config.getApprovalMode(),
        );
        if (mode === 'teamwork') config.setApprovalMode(ApprovalMode.PLAN);
        info(
          i18n.t(
            `任务已准备：${prepared.id}。先用 /${mode} model 配置角色，再 /${mode} resume 开始；尚未调用模型。`,
            `Task prepared: ${prepared.id}. Configure roles with /${mode} model, then start with /${mode} resume. No model call made.`,
          ),
        );
        return;
      }
      if (operation === 'model' && !args.trim()) {
        info(
          i18n.t(
            `用法：/${mode} model <researcher|coder|workflow-auditor> <供应商ID:模型|native:gemini-模型|inherit>\n已配置模型：`,
            `Usage: /${mode} model <researcher|coder|workflow-auditor> <provider:model|native:gemini-model|inherit>\nConfigured models:`,
          ) +
            '\n' +
            availableAgentModels().join('\n'),
        );
        return;
      }
      const text =
        args.trim() ||
        (!operation && mode === 'grill-me'
          ? i18n.t(
              '澄清当前工作区要完成的目标',
              'Clarify the intended task for this workspace',
            )
          : '');
      if (!operation && !text) {
        info(
          i18n.t(
            `用法：/${mode} <任务>；/${mode} list|status|reports|budget|resume [ID]|cancel${mode === 'teamwork' ? '|approve' : mode === 'grill-me' ? '|finish' : ''}`,
            `Usage: /${mode} <task>; /${mode} list|status|reports|budget|resume [ID]|cancel${mode === 'teamwork' ? '|approve' : mode === 'grill-me' ? '|finish' : ''}`,
          ),
        );
        return;
      }
      if (operation === 'reports' && args.trim()) {
        info(
          JSON.stringify(
            exportWorkflowReports(root, args.trim(), mode, i18n.getLocale()),
            null,
            2,
          ),
        );
        return;
      }
      const requestedCancellation = operation === 'cancel' ? args.trim() : '';
      const requestedStatus = operation === 'status' ? args.trim() : '';
      const requestedResume = operation === 'resume' ? args.trim() : '';
      let record = requestedStatus
        ? readAgentWorkflow(root, requestedStatus)
        : requestedCancellation
          ? cancelAgentWorkflow(root, requestedCancellation, mode)
          : requestedResume
            ? readAgentWorkflow(root, requestedResume)
            : latestAgentWorkflow(root, mode, (id) => {
                context.ui.addItem({
                  type: MessageType.WARNING,
                  text: i18n.t(
                    `工作流记录损坏：${id}。可用对应模式的 cancel <ID> 保留并取消；原文件未修改。`,
                    `Damaged workflow record: ${id}. Use its mode's cancel <ID> to preserve and cancel; original file unchanged.`,
                  ),
                });
              });
      if ((requestedStatus || requestedResume) && record?.mode !== mode)
        throw new Error(
          i18n.t(
            '任务模式不匹配，请使用记录对应的命令。',
            'Task mode does not match this command. Use the recorded task mode.',
          ),
        );
      const restoreApproval = (entry: AgentWorkflow) => {
        if (config.getApprovalMode() === ApprovalMode.PLAN) {
          const previous = Object.values(ApprovalMode).find(
            (value) => value === entry.previousApprovalMode,
          );
          config.setApprovalMode(previous || ApprovalMode.DEFAULT);
        }
      };
      if (operation === 'reports') {
        if (!record)
          throw new Error(
            i18n.t(
              '当前没有该工作流，请指定历史任务ID。',
              'No workflow found; specify a saved task ID.',
            ),
          );
        info(
          JSON.stringify(
            exportWorkflowReports(root, record.id, mode, i18n.getLocale()),
            null,
            2,
          ),
        );
        return;
      }
      if (operation === 'status') {
        let statusBudget;
        if (record) {
          try {
            statusBudget = requestedStatus
              ? savedWorkflowBudgetSummary(root, record.id)
              : workflowBudgetSummary(root, record);
          } catch (error) {
            if (!requestedStatus) throw error;
            statusBudget = {
              available: false,
              note: i18n.t(
                '保存的预算不可用；查看状态不会初始化或修复账本。',
                'Saved budget unavailable; inspection does not initialize or repair a ledger.',
              ),
            };
          }
        }
        info(
          record
            ? `${record.mode}: ${record.phase}\n${record.objective}\n${record.stage}\n${i18n.t('角色模型', 'Role models')}: ${JSON.stringify(record.roleModels)}\n${i18n.t('累计预算', 'Cumulative budget')}: ${JSON.stringify(statusBudget)}\n${record.milestones.map((item, index) => `${index + 1}. [${item.completed ? 'x' : ' '}] ${item.title}\n${item.acceptance}`).join('\n')}\nID: ${record.id}`
            : i18n.t(
                '当前项目没有该工作流。',
                'No workflow of this kind in this project.',
              ),
        );
        return;
      }
      if (operation) {
        if (!record)
          throw new Error(i18n.t('请先创建任务。', 'Create a task first.'));
        if (operation === 'cancel') {
          if (!requestedCancellation)
            record = cancelAgentWorkflow(root, record.id, mode);
          restoreApproval(record);
          info(
            i18n.t(
              '已请求停止；阶段结果保留，运行中的子任务清理结束后释放工作区。',
              'Stop requested; stage results are retained. The workspace is released after running children settle.',
            ),
          );
          if (record.budgetUnavailable)
            info(
              i18n.t(
                `旧用量不可确认，原状态已保留：${record.budgetRecoveryPath || '账本缺失'}。请创建新任务；不能恢复此旧任务。`,
                `Historical usage is unavailable; original state retained: ${record.budgetRecoveryPath || 'ledger missing'}. Create a new task; this task cannot resume.`,
              ),
            );
          if (record.recordUnavailable)
            info(
              i18n.t(
                `原任务记录不可用，原文件已保留：${record.recordRecoveryPath || '记录缺失'}。累计预算保留；请创建新任务，不能恢复此记录。`,
                `Original task record unavailable; preserved at: ${record.recordRecoveryPath || 'record missing'}. Cumulative budget retained; create a new task instead of resuming this record.`,
              ),
            );
          return;
        }
        if (operation === 'resume' && record.phase === 'completed') {
          info(
            i18n.t(
              `任务 ${record.id} 已完成，结果与报告已保留；未重新执行。`,
              `Task ${record.id} is already complete; results and reports are retained. No execution started.`,
            ),
          );
          return;
        }
        if (isAgentWorkflowRunning(root))
          throw new Error(
            i18n.t(
              '当前项目已有工作流正在执行，可查看状态或取消。',
              'A workflow is running in this project; inspect its status or cancel it.',
            ),
          );
        if (operation === 'workspace') {
          assertWorkflowBudgetOwnership(root, record);
          const state = agentWorktreeCommand(
            root,
            record.id,
            config.getTargetDir(),
            args,
            record.reports.length === 0 && record.phase !== 'completed',
            record.phase === 'completed',
          );
          if (args.trim() === 'on') {
            record.worktreeRequired = true;
            saveAgentWorkflow(root, record);
          }
          info(
            state
              ? JSON.stringify(state, null, 2)
              : i18n.t(
                  `当前使用共享工作区。可在启动前用 /${mode} workspace on 启用隔离。`,
                  `Using the shared workspace. Enable isolation with /${mode} workspace on before starting.`,
                ),
          );
          return;
        }
        if (record.phase === 'completed') {
          info(
            i18n.t(
              '该工作流已完成，结果保留。',
              'This workflow is complete; its results are retained.',
            ),
          );
          return;
        }
        if (operation === 'budget') {
          const values = args.trim().split(/\s+/);
          if (
            values.length !== 3 ||
            values.some((value) => !/^[1-9]\d*$/.test(value))
          )
            throw new Error(
              i18n.t(
                `用法：/${mode} budget <模型调度上限> <失败阶段上限> <每里程碑实施轮数上限>，例如 240 4 2。累计用量不会清零。`,
                `Usage: /${mode} budget <model-dispatch-limit> <failed-stage-limit> <rounds-per-milestone>, e.g. 240 4 2. Cumulative usage is retained.`,
              ),
            );
          const [maxRequests, maxFailedStages, maxImplementationRounds] =
            values.map(Number);
          setWorkflowBudget(root, record, {
            maxRequests,
            maxFailedStages,
            maxImplementationRounds,
          });
          info(
            i18n.t(
              '预算已保存，累计用量保留。受阻任务需显式 resume。',
              'Budget saved; cumulative usage retained. Explicitly resume a blocked task.',
            ),
          );
          return;
        }
        if (operation === 'model') {
          const values = args.trim().split(/\s+/);
          if (values.length !== 2)
            throw new Error(
              i18n.t(
                `用法：/${mode} model <角色> <供应商ID:模型|native:gemini-模型|inherit>`,
                `Usage: /${mode} model <role> <provider:model|native:gemini-model|inherit>`,
              ),
            );
          setWorkflowRoleModel(root, record.id, values[0], values[1]);
          info(
            i18n.t(
              '角色模型已保存，后续阶段生效；全局模型与累计用量保持。',
              'Role model saved for future stages; global model and cumulative usage retained.',
            ),
          );
          return;
        }
        if (operation === 'approve' || operation === 'finish') {
          if (record.phase !== 'ready' || record.approved)
            throw new Error(
              i18n.t(
                '请先完成需求对齐并保存草案。',
                'Finish scoping and save the draft first.',
              ),
            );
          record.approved = true;
          if (mode === 'grill-me') {
            // Close first: a rejected close must not persist false completion.
            // If the record save fails, the ready draft can retry this local finish.
            closeWorkflowBudget(root, record);
            record.phase = 'completed';
            saveAgentWorkflow(root, record);
            restoreApproval(record);
            return {
              type: 'submit_prompt',
              content: `Requirements interview complete. Continue the agreed task under the current permissions and user constraints.\n${record.brief}\nAcceptance:\n${record.milestones.map((item) => `${item.title}: ${item.acceptance}`).join('\n')}`,
            };
          }
          activateWorkflowBudget(root, record);
          restoreApproval(record);
        } else if (operation === 'resume') {
          activateWorkflowBudget(root, record);
          if (!record.approved) {
            record.phase = 'scoping';
            saveAgentWorkflow(root, record);
            config.setApprovalMode(ApprovalMode.PLAN);
            return { type: 'submit_prompt', content: interviewPrompt(record) };
          }
          restoreApproval(record);
          record.phase = 'ready';
        }
        saveAgentWorkflow(root, record);
        return { type: 'submit_prompt', content: executionPrompt(record) };
      }
      if (isAgentWorkflowRunning(root))
        throw new Error(
          i18n.t(
            '当前项目已有工作流正在执行。',
            'A workflow is running in this project.',
          ),
        );
      for (const kind of ['teamwork', 'grill-me'] as const) {
        const unfinished = latestAgentWorkflow(root, kind);
        if (
          unfinished &&
          !unfinished.approved &&
          ['scoping', 'ready'].includes(unfinished.phase)
        )
          throw new Error(
            i18n.t(
              `请先用 /${kind} resume 继续对齐，或 /${kind} cancel 取消当前访谈。`,
              `Use /${kind} resume or /${kind} cancel to resolve the current interview first.`,
            ),
          );
      }
      if (mode === 'boost' && config.getApprovalMode() === ApprovalMode.PLAN)
        throw new Error(
          i18n.t(
            '请先退出计划模式，再启动 Boost 执行。',
            'Leave Plan Mode before starting Boost execution.',
          ),
        );
      record = createAgentWorkflow(root, mode, text, config.getApprovalMode());
      if (mode !== 'boost') config.setApprovalMode(ApprovalMode.PLAN);
      info(
        i18n.t(
          `${mode} 已创建：${record.id}；进度按项目保存。`,
          `${mode} created: ${record.id}; progress is saved for this project.`,
        ),
      );
      return {
        type: 'submit_prompt',
        content:
          mode === 'boost' ? executionPrompt(record) : interviewPrompt(record),
      };
    } catch (error) {
      context.ui.addItem({
        type: MessageType.ERROR,
        text:
          error instanceof Error ? error.message : 'Workflow command failed.',
      });
      return;
    }
  };
  const operations = [
    'list',
    'status',
    'reports',
    ...(mode === 'grill-me' ? [] : ['model']),
    ...(mode === 'grill-me' ? [] : ['workspace']),
    ...(mode !== 'grill-me' ? ['prepare'] : []),
    'budget',
    'resume',
    'cancel',
    ...(mode === 'teamwork'
      ? ['approve']
      : mode === 'grill-me'
        ? ['finish']
        : []),
  ];
  return {
    name: mode,
    altNames,
    kind: CommandKind.BUILT_IN,
    get description() {
      return I18nManager.getInstance().t(
        `${mode}：有界 Agent 工作流`,
        `${mode}: scoped agent workflow`,
      );
    },
    autoExecute: false,
    action: (context, args) => action(context, args),
    subCommands: operations.map((name) => ({
      name,
      get description() {
        const labels: Record<string, [string, string]> = {
          list: [
            '查看当前项目所有 Agent 历史任务，可指定页码',
            'List saved Agent tasks in this project; optional page number',
          ],
          status: [
            '查看阶段与里程碑，可指定任务ID',
            'Show stages and milestones; optional task ID',
          ],
          reports: [
            '导出完整阶段报告索引，可指定任务ID',
            'Export full report index; optional task ID',
          ],
          budget: ['设置累计执行预算', 'Set cumulative execution limits'],
          model: ['设置协作角色模型', 'Choose collaboration role models'],
          workspace: [
            '管理隔离工作树与成果补丁',
            'Manage isolated worktree and result patch',
          ],
          prepare: [
            '先创建任务，配置模型后再开始',
            'Prepare a task before choosing models and starting',
          ],
          resume: [
            '恢复已保存任务，可指定任务ID',
            'Resume a saved workflow; optional task ID',
          ],
          cancel: [
            '取消并保留结果，可指定任务 ID',
            'Cancel and retain results; optional workflow ID',
          ],
          approve: ['按已对齐的草案执行', 'Execute the scoped draft'],
          finish: ['结束访谈并继续任务', 'Finish the interview and continue'],
        };
        return I18nManager.getInstance().t(...labels[name]);
      },
      kind: CommandKind.BUILT_IN,
      autoExecute: ![
        'budget',
        'cancel',
        'model',
        'prepare',
        'workspace',
        'reports',
        'list',
        'status',
      ].includes(name),
      isSafeConcurrent: ['list', 'status', 'cancel'].includes(name),
      action: (context, args) => action(context, args, name),
    })),
  };
}
export const boostCommand = workflowCommand('boost', ['强化', '攻坚']);
export const teamworkCommand = workflowCommand('teamwork', ['团队任务']);
export const grillMeCommand = workflowCommand('grill-me', [
  'grillme',
  'grill',
  '需求对齐',
]);
