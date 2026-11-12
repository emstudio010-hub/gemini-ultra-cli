/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import {
  I18nManager,
  ProviderConfigConflictError,
} from '@google/gemini-cli-core';

/** Config conflicts have safe localized guidance; filesystem errors may contain private paths. */
export function effortSaveError(error: unknown): string {
  const i18n = I18nManager.getInstance();
  const message = i18n.t('推理强度未保存。', 'Reasoning effort was not saved.');
  return error instanceof ProviderConfigConflictError
    ? `${message} ${error.message}`
    : `${message} ${i18n.t('请检查配置文件写入权限后重试。', 'Check configuration file write permissions and retry.')}`;
}
