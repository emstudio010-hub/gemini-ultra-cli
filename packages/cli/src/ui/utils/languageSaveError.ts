/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { I18nManager } from '@google/gemini-cli-core';

/** Keep file paths and low-level storage errors out of user-facing output. */
export function languageSaveError(): string {
  return I18nManager.getInstance().t(
    '语言设置未保存。请检查配置文件写入权限后重试，当前语言保持不变。',
    'Language preference was not saved. Check configuration file write permissions and retry; the current language is unchanged.',
  );
}
