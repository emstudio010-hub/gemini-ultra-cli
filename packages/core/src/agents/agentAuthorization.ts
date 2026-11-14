/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { readDrillGrant } from '../drill/drillGrant.js';
import { I18nManager } from '../i18n/i18nManager.js';
import { ApprovalMode } from '../policy/types.js';
import { swarmRoleSchema } from './agentModelRouting.js';

/** Recheck native-role admission and red-team prerequisites at delegation boundaries. */
export function assertAgentAuthorization(
  agent: string,
  approvalMode?: ApprovalMode,
): void {
  if (
    approvalMode === ApprovalMode.PLAN &&
    swarmRoleSchema.safeParse(agent).success
  )
    throw new Error(
      I18nManager.getInstance().t(
        '请先退出计划模式，再执行原生协作成员；此成员尚未启动。',
        'Leave Plan Mode before executing native workflow or swarm members; this member has not started.',
      ),
    );
  if (agent === 'redteam-analyst' && !readDrillGrant().granted)
    throw new Error(
      I18nManager.getInstance().t(
        '红队成员需要演练授权；请在 /drill 中记录授权后重试。',
        'Red-team member requires drill authorization; record it in /drill before retrying.',
      ),
    );
}
