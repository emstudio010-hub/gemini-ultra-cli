/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  allowEditorTypeInSandbox,
  hasValidEditorCommandAsync,
  type EditorType,
  EDITOR_DISPLAY_NAMES,
} from '@google/gemini-cli-core';

export interface EditorDisplay {
  name: string;
  type: EditorType | 'not_set';
  disabled: boolean;
}

class EditorSettingsManager {
  async getAvailableEditorDisplays(
    signal?: AbortSignal,
  ): Promise<EditorDisplay[]> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const editorTypes = Object.keys(
      EDITOR_DISPLAY_NAMES,
    ).sort() as EditorType[];
    const availableEditors: EditorDisplay[] = [
      {
        name: 'None',
        type: 'not_set',
        disabled: false,
      },
    ];
    // Probe only when the settings dialog opens, with bounded concurrency.
    // Importing the UI must never synchronously search for every editor.
    for (let index = 0; index < editorTypes.length; index += 3) {
      signal?.throwIfAborted();
      const group = await Promise.all(
        editorTypes.slice(index, index + 3).map(async (type) => {
          const hasEditor = await hasValidEditorCommandAsync(type, signal);
          const isAllowedInSandbox = allowEditorTypeInSandbox(type);

          let labelSuffix = !isAllowedInSandbox
            ? ' (Not available in sandbox)'
            : '';
          labelSuffix = !hasEditor ? ' (Not installed)' : labelSuffix;

          return {
            name: EDITOR_DISPLAY_NAMES[type] + labelSuffix,
            type,
            disabled: !hasEditor || !isAllowedInSandbox,
          };
        }),
      );
      signal?.throwIfAborted();
      availableEditors.push(...group);
    }
    return availableEditors;
  }
}

export const editorSettingsManager = new EditorSettingsManager();
