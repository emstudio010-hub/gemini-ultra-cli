/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { isolateObserver } from '../utils/isolatedObserver.js';
import { debugLogger } from '../utils/debugLogger.js';

export type UiLocale = 'zh' | 'en';

function getLocaleConfigPath(): string {
  return (
    process.env['GEMINI_ULTRA_LOCALE_FILE'] ||
    path.join(os.homedir(), '.gemini', 'ultra-locale.json')
  );
}

export class I18nManager {
  private static instance: I18nManager | null = null;
  private locale: UiLocale = 'zh';
  private listeners = new Map<() => void, () => void>();
  readonly subscribe = (listener: () => void): (() => void) => {
    const observer =
      this.listeners.get(listener) ??
      isolateObserver<void>(listener, () => {
        if (this.listeners.get(listener) === observer)
          this.listeners.delete(listener);
        debugLogger.warn(
          this.t(
            '界面语言订阅器出错，已停用该订阅器。',
            'UI language listener failed and was detached.',
          ),
        );
      });
    this.listeners.set(listener, observer);
    return () => {
      if (this.listeners.get(listener) === observer)
        this.listeners.delete(listener);
    };
  };
  readonly getSnapshot = (): UiLocale => this.locale;

  constructor() {
    this.locale = this.loadLocale();
  }

  static getInstance(): I18nManager {
    if (!I18nManager.instance) {
      I18nManager.instance = new I18nManager();
    }
    return I18nManager.instance;
  }

  private loadLocale(): UiLocale {
    try {
      const p = getLocaleConfigPath();
      if (fs.existsSync(p)) {
        const parsed = z
          .object({ locale: z.enum(['zh', 'en']) })
          .safeParse(JSON.parse(fs.readFileSync(p, 'utf8')));
        if (parsed.success) return parsed.data.locale;
      }
    } catch {
      /* Missing or invalid preference uses the default locale. */
    }
    return 'zh';
  }

  getLocale(): UiLocale {
    return this.locale;
  }

  setLocale(loc: UiLocale): void {
    const file = getLocaleConfigPath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temp = `${file}.${randomUUID()}.tmp`;
    try {
      fs.writeFileSync(temp, JSON.stringify({ locale: loc }, null, 2), 'utf8');
      fs.renameSync(temp, file);
    } finally {
      if (fs.existsSync(temp)) fs.unlinkSync(temp);
    }
    this.locale = loc;
    for (const listener of [...this.listeners.values()]) listener();
  }

  toggleLocale(): UiLocale {
    const next = this.locale === 'zh' ? 'en' : 'zh';
    this.setLocale(next);
    return next;
  }

  t(zh: string, en: string): string {
    return this.locale === 'zh' ? zh : en;
  }
}
