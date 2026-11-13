/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderWithProviders } from '../../test-utils/render.js';
import { waitFor } from '../../test-utils/async.js';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { ApiAuthDialog } from './ApiAuthDialog.js';
import { useKeypress } from '../hooks/useKeypress.js';
import {
  useTextBuffer,
  type TextBuffer,
} from '../components/shared/text-buffer.js';
import { act } from 'react';
import { KeypressPriority } from '../contexts/KeypressContext.js';

// Mocks
vi.mock('../hooks/useKeypress.js', () => ({
  useKeypress: vi.fn(),
}));

vi.mock('../components/shared/text-buffer.js', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../components/shared/text-buffer.js')
    >();
  return {
    ...actual,
    useTextBuffer: vi.fn(),
  };
});

vi.mock('../contexts/UIStateContext.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../contexts/UIStateContext.js')>();
  return {
    ...actual,
    useUIState: vi.fn(() => ({
      terminalWidth: 80,
    })),
  };
});

const mockedUseKeypress = useKeypress as Mock;
const mockedUseTextBuffer = useTextBuffer as Mock;
const locale = vi.hoisted(() => ({ value: 'en' as 'en' | 'zh' }));
vi.mock('../hooks/useLocale.js', () => ({ useLocale: () => locale.value }));

describe('ApiAuthDialog', () => {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  const onClear = vi.fn<() => Promise<boolean>>();
  let mockBuffer: TextBuffer;

  beforeEach(() => {
    vi.clearAllMocks();
    locale.value = 'en';
    onClear.mockReset().mockResolvedValue(true);
    vi.stubEnv('GEMINI_API_KEY', '');
    mockBuffer = {
      text: '',
      lines: [''],
      cursor: [0, 0],
      visualCursor: [0, 0],
      viewportVisualLines: [''],
      handleInput: vi.fn(),
      setText: vi.fn((newText) => {
        mockBuffer.text = newText;
        mockBuffer.viewportVisualLines = [newText];
      }),
    } as unknown as TextBuffer;
    mockedUseTextBuffer.mockReturnValue(mockBuffer);
  });

  it('renders correctly', async () => {
    const { lastFrame, unmount } = await renderWithProviders(
      <ApiAuthDialog
        onSubmit={onSubmit}
        onCancel={onCancel}
        onClear={onClear}
      />,
    );
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('switches key instructions between Chinese and English while preserving input', async () => {
    const screen = await renderWithProviders(
      <ApiAuthDialog
        onSubmit={onSubmit}
        onCancel={onCancel}
        onClear={onClear}
      />,
    );
    try {
      mockBuffer.text = 'FAKE_TYPED_KEY';
      mockBuffer.viewportVisualLines = ['FAKE_TYPED_KEY'];
      locale.value = 'zh';
      await act(async () =>
        screen.rerender(
          <ApiAuthDialog
            onSubmit={onSubmit}
            onCancel={onCancel}
            onClear={onClear}
          />,
        ),
      );
      await screen.waitUntilReady();
      expect(screen.lastFrame()).toContain('输入 Gemini API 密钥');
      expect(screen.lastFrame()).toContain('Ctrl+C 清除已保存的密钥');
      expect(screen.lastFrame()).not.toContain('Enter Gemini API Key');
      expect(mockBuffer.text).toBe('FAKE_TYPED_KEY');
      locale.value = 'en';
      await act(async () =>
        screen.rerender(
          <ApiAuthDialog
            onSubmit={onSubmit}
            onCancel={onCancel}
            onClear={onClear}
          />,
        ),
      );
      await screen.waitUntilReady();
      expect(screen.lastFrame()).toContain('Enter Gemini API Key');
      expect(mockBuffer.text).toBe('FAKE_TYPED_KEY');
      expect(mockBuffer.setText).not.toHaveBeenCalled();
    } finally {
      screen.unmount();
    }
  });

  it('preserves typed input when a saved default arrives later', async () => {
    const screen = await renderWithProviders(
      <ApiAuthDialog
        onSubmit={onSubmit}
        onCancel={onCancel}
        onClear={onClear}
      />,
    );
    try {
      mockBuffer.text = 'FAKE_USER_INPUT';
      await act(async () =>
        screen.rerender(
          <ApiAuthDialog
            onSubmit={onSubmit}
            onCancel={onCancel}
            onClear={onClear}
            defaultValue="FAKE_LATE_DEFAULT"
          />,
        ),
      );
      expect(mockBuffer.setText).not.toHaveBeenCalledWith('FAKE_LATE_DEFAULT');
      expect(mockBuffer.text).toBe('FAKE_USER_INPUT');
    } finally {
      screen.unmount();
    }
  });

  it('fills an untouched input when its saved default arrives later', async () => {
    const screen = await renderWithProviders(
      <ApiAuthDialog
        onSubmit={onSubmit}
        onCancel={onCancel}
        onClear={onClear}
      />,
    );
    try {
      await act(async () =>
        screen.rerender(
          <ApiAuthDialog
            onSubmit={onSubmit}
            onCancel={onCancel}
            onClear={onClear}
            defaultValue="FAKE_LATE_DEFAULT"
          />,
        ),
      );
      expect(mockBuffer.setText).toHaveBeenCalledWith('FAKE_LATE_DEFAULT');
      expect(mockBuffer.text).toBe('FAKE_LATE_DEFAULT');
    } finally {
      screen.unmount();
    }
  });

  it('renders with a defaultValue', async () => {
    const { unmount } = await renderWithProviders(
      <ApiAuthDialog
        onSubmit={onSubmit}
        onCancel={onCancel}
        onClear={onClear}
        defaultValue="test-key"
      />,
    );
    expect(mockedUseTextBuffer).toHaveBeenCalledWith(
      expect.objectContaining({
        initialText: 'test-key',
        viewport: expect.objectContaining({
          height: 4,
        }),
      }),
    );
    unmount();
  });

  it.each([
    {
      keyName: 'enter',
      sequence: '\r',
      expectedCall: onSubmit,
      args: ['submitted-key'],
    },
    { keyName: 'escape', sequence: '\u001b', expectedCall: onCancel, args: [] },
  ])(
    'calls $expectedCall.name when $keyName is pressed',
    async ({ keyName, sequence, expectedCall, args }) => {
      mockBuffer.text = 'submitted-key'; // Set for the onSubmit case
      const { unmount } = await renderWithProviders(
        <ApiAuthDialog
          onSubmit={onSubmit}
          onCancel={onCancel}
          onClear={onClear}
        />,
      );
      // calls[0] is the ApiAuthDialog's useKeypress (Ctrl+C handler)
      // calls[1] is the TextInput's useKeypress (typing handler)
      const keypressHandler = mockedUseKeypress.mock.calls[1][0];

      keypressHandler({
        name: keyName,
        shift: false,
        alt: false,
        ctrl: false,
        cmd: false,
        sequence,
      });

      expect(expectedCall).toHaveBeenCalledWith(...args);
      unmount();
    },
  );

  it('displays an error message', async () => {
    const { lastFrame, unmount } = await renderWithProviders(
      <ApiAuthDialog
        onSubmit={onSubmit}
        onCancel={onCancel}
        onClear={onClear}
        error="Invalid API Key"
      />,
    );

    expect(lastFrame()).toContain('Invalid API Key');
    unmount();
  });

  it('calls clearApiKey and clears buffer when Ctrl+C is pressed', async () => {
    const { unmount } = await renderWithProviders(
      <ApiAuthDialog
        onSubmit={onSubmit}
        onCancel={onCancel}
        onClear={onClear}
      />,
    );
    // Call 0 is ApiAuthDialog (isActive: true)
    // Call 1 is TextInput (isActive: true, priority: true)
    const keypressHandler = mockedUseKeypress.mock.calls[0][0];

    expect(mockedUseKeypress.mock.calls[0][1]).toEqual({
      isActive: true,
      priority: KeypressPriority.Critical,
    });

    keypressHandler({
      name: 'c',
      shift: false,
      ctrl: true,
      cmd: false,
    });

    await waitFor(() => {
      expect(onClear).toHaveBeenCalled();
      expect(mockBuffer.setText).toHaveBeenCalledWith('');
    });
    unmount();
  });

  it.each(['edit', 'submit', 'cancel', 'unmount', 'unsuccessful'] as const)(
    'does not erase newer input after a pending clear and %s',
    async (action) => {
      let release!: () => void;
      onClear.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            release = () => resolve(action !== 'unsuccessful');
          }),
      );
      mockBuffer.text = 'FAKE_ORIGINAL';
      const { unmount } = await renderWithProviders(
        <ApiAuthDialog
          onSubmit={onSubmit}
          onCancel={onCancel}
          onClear={onClear}
        />,
      );
      try {
        const clearHandler = mockedUseKeypress.mock.calls[0][0];
        const inputHandler = mockedUseKeypress.mock.calls[1][0];
        clearHandler({ name: 'c', ctrl: true });
        expect(onClear).toHaveBeenCalledOnce();
        if (action === 'edit') mockBuffer.text = 'FAKE_NEW_INPUT';
        else if (action === 'submit')
          inputHandler({ name: 'enter', sequence: '\r' });
        else if (action === 'cancel')
          inputHandler({ name: 'escape', sequence: '\u001b' });
        else if (action === 'unmount') unmount();
        await act(async () => release());
        expect(mockBuffer.setText).not.toHaveBeenCalled();
      } finally {
        unmount();
      }
    },
  );
});
