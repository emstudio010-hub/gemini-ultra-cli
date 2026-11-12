/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { I18nManager } from '@google/gemini-cli-core';

export function modelSaveError(): string {
  return I18nManager.getInstance().t(
    '模型偏好未保存，当前模型保持不变。请检查配置文件写入权限后重试，或关闭“记住”仅用于本次会话。',
    'Model preference was not saved; the current model is unchanged. Check configuration file write permissions and retry, or use a temporary selection without Remember or --persist.',
  );
}
