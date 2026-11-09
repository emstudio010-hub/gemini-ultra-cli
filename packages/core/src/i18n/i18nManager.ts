/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

export type UiLocale = 'zh' | 'en';

function getLocaleConfigPath(): string {
  const dir = path.join(os.homedir(), '.gemini');
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'ultra-locale.json');
}

export class I18nManager {
  private static instance: I18nManager | null = null;
  private locale: UiLocale = 'zh';

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
        const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (raw.locale === 'en' || raw.locale === 'zh') {
          return raw.locale;
        }
      }
    } catch {}
    return 'zh';
  }

  getLocale(): UiLocale {
    return this.locale;
  }

  setLocale(loc: UiLocale): void {
    this.locale = loc;
    try {
      fs.writeFileSync(getLocaleConfigPath(), JSON.stringify({ locale: loc }, null, 2), 'utf8');
    } catch {}
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
