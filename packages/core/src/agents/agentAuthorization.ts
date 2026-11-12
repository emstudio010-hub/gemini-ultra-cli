/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { readDrillGrant } from '../drill/drillGrant.js';
import { I18nManager } from '../i18n/i18nManager.js';

/** Apply the same local red-team prerequisite to every delegation entry point. */
export function assertAgentAuthorization(agent: string): void {
  if (agent === 'redteam-analyst' && !readDrillGrant().granted)
    throw new Error(
      I18nManager.getInstance().t(
        '红队成员需要演练授权；请在 /drill 中记录授权后重试。',
        'Red-team member requires drill authorization; record it in /drill before retrying.',
      ),
    );
}
