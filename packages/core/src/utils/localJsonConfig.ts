/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'node:fs';
import { coreEvents } from './events.js';
import { I18nManager } from '../i18n/i18nManager.js';

const warnedFiles = new Set<string>();

/** Read optional user preferences without letting a damaged file stop the agent. */
export function readLocalJsonConfig<T>(
  file: string,
  validate: (value: unknown) => T,
  defaults: () => T,
  recoveryCommand: string,
  maxBytes = 65536,
): T {
  try {
    if (fs.statSync(file).size > maxBytes)
      throw new Error('Configuration is too large');
    const result = validate(
      JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')),
    );
    warnedFiles.delete(file);
    return result;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      warnedFiles.delete(file);
      return defaults();
    }
    if (!warnedFiles.has(file)) {
      warnedFiles.add(file);
      coreEvents.emitFeedback(
        'warning',
        I18nManager.getInstance().t(
          `无法读取配置 ${file}，暂时使用默认设置，原文件未改动。请检查文件内容与权限，或通过 ${recoveryCommand} 重新保存；保存前会备份旧文件为 .bak。`,
          `Cannot read configuration ${file}. Using defaults without changing the original. Check its contents and permissions, or save it again through ${recoveryCommand}; the previous file is backed up as .bak before saving.`,
        ),
      );
    }
    return defaults();
  }
}
