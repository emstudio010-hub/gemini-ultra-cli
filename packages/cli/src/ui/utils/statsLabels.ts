/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { LlmRole } from '@google/gemini-cli-core';

const chineseRoles: Record<LlmRole, string> = {
  [LlmRole.MAIN]: '主代理',
  [LlmRole.SUBAGENT]: '子代理',
  [LlmRole.UTILITY_TOOL]: '工具辅助',
  [LlmRole.UTILITY_COMPRESSOR]: '上下文压缩',
  [LlmRole.UTILITY_SUMMARIZER]: '摘要生成',
  [LlmRole.UTILITY_ROUTER]: '模型路由',
  [LlmRole.UTILITY_LOOP_DETECTOR]: '循环检测',
  [LlmRole.UTILITY_NEXT_SPEAKER]: '发言调度',
  [LlmRole.UTILITY_EDIT_CORRECTOR]: '编辑校正',
  [LlmRole.UTILITY_AUTOCOMPLETE]: '自动补全',
  [LlmRole.UTILITY_FAST_ACK_HELPER]: '快速响应',
  [LlmRole.UTILITY_STATE_SNAPSHOT_PROCESSOR]: '状态快照',
};

export function statsRoleLabel(role: string, chinese: boolean): string {
  return chinese ? (roleLabels.get(role) ?? role) : role;
}

const roleLabels = new Map<string, string>(Object.entries(chineseRoles));
