/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { useSyncExternalStore } from 'react';
import { I18nManager } from '@google/gemini-cli-core';

export function useLocale() {
  const manager = I18nManager.getInstance();
  return useSyncExternalStore(
    manager.subscribe,
    manager.getSnapshot,
    manager.getSnapshot,
  );
}
