/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import readline from 'node:readline';
import process from 'node:process';
import { coreEvents } from './events.js';
import { getConsentForOauth } from './authConsent.js';
import { FatalAuthenticationError } from './errors.js';
import { writeToStdout } from './stdio.js';
import { isHeadlessMode } from './headless.js';

vi.mock('node:readline');
vi.mock('./headless.js', () => ({
  isHeadlessMode: vi.fn(),
}));
vi.mock('./stdio.js', () => ({
  writeToStdout: vi.fn(),
  createWorkingStdio: vi.fn(() => ({
    stdout: process.stdout,
    stderr: process.stderr,
  })),
}));

describe('getConsentForOauth', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('in interactive mode', () => {
    beforeEach(() => {
      (isHeadlessMode as Mock).mockReturnValue(false);
    });

    it('cancels pending consent and ignores a late confirmation', async () => {
      const controller = new AbortController();
      let confirm!: (answer: boolean) => void;
      vi.spyOn(coreEvents, 'listenerCount').mockReturnValue(1);
      const emit = vi
        .spyOn(coreEvents, 'emitConsentRequest')
        .mockImplementation((payload) => {
          confirm = payload.onConfirm;
        });
      const pending = getConsentForOauth('fixture', controller.signal).catch(
        (error: unknown) => error,
      );
      controller.abort();
      confirm(true);
      expect(await pending).toBe(controller.signal.reason);
      expect(emit).toHaveBeenCalledWith(
        expect.objectContaining({ signal: controller.signal }),
      );
    });

    it('does not request consent when already cancelled', async () => {
      const controller = new AbortController();
      controller.abort();
      const emit = vi.spyOn(coreEvents, 'emitConsentRequest');
      await expect(
        getConsentForOauth('fixture', controller.signal),
      ).rejects.toBe(controller.signal.reason);
      expect(emit).not.toHaveBeenCalled();
    });

    it('should emit consent request when UI listeners are present', async () => {
      const mockEmitConsentRequest = vi.spyOn(coreEvents, 'emitConsentRequest');
      vi.spyOn(coreEvents, 'listenerCount').mockReturnValue(1);

      mockEmitConsentRequest.mockImplementation((payload) => {
        payload.onConfirm(true);
      });

      const result = await getConsentForOauth('Login required.');

      expect(result).toBe(true);
      expect(mockEmitConsentRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.stringContaining(
            'Login required. Opening authentication page in your browser.',
          ),
        }),
      );
    });

    it('should handle empty prompt correctly', async () => {
      const mockEmitConsentRequest = vi.spyOn(coreEvents, 'emitConsentRequest');
      vi.spyOn(coreEvents, 'listenerCount').mockReturnValue(1);

      mockEmitConsentRequest.mockImplementation((payload) => {
        payload.onConfirm(true);
      });

      await getConsentForOauth('');

      expect(mockEmitConsentRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.stringMatching(
            /^Opening authentication page in your browser\./,
          ),
        }),
      );
    });

    it('should return false when user declines via UI', async () => {
      const mockEmitConsentRequest = vi.spyOn(coreEvents, 'emitConsentRequest');
      vi.spyOn(coreEvents, 'listenerCount').mockReturnValue(1);

      mockEmitConsentRequest.mockImplementation((payload) => {
        payload.onConfirm(false);
      });

      const result = await getConsentForOauth('Login required.');

      expect(result).toBe(false);
    });

    it('should throw FatalAuthenticationError when no UI listeners are present', async () => {
      vi.spyOn(coreEvents, 'listenerCount').mockReturnValue(0);

      await expect(getConsentForOauth('Login required.')).rejects.toThrow(
        FatalAuthenticationError,
      );
    });
  });

  describe('in non-interactive mode', () => {
    beforeEach(() => {
      (isHeadlessMode as Mock).mockReturnValue(true);
    });

    it('closes the terminal prompt when consent is cancelled', async () => {
      const controller = new AbortController();
      const rl = { on: vi.fn(), close: vi.fn() };
      vi.mocked(readline.createInterface).mockReturnValue(
        rl as unknown as readline.Interface,
      );
      const pending = getConsentForOauth('fixture', controller.signal).catch(
        (error: unknown) => error,
      );
      controller.abort();
      expect(await pending).toBe(controller.signal.reason);
      expect(rl.close).toHaveBeenCalledOnce();
    });

    it('should use readline to prompt for consent', async () => {
      const mockReadline = {
        on: vi.fn((event, callback) => {
          if (event === 'line') {
            callback('y');
          }
        }),
        close: vi.fn(),
      };
      (readline.createInterface as Mock).mockReturnValue(mockReadline);

      const result = await getConsentForOauth('Login required.');

      expect(result).toBe(true);
      expect(readline.createInterface).toHaveBeenCalledWith(
        expect.objectContaining({
          terminal: true,
        }),
      );
      expect(writeToStdout).toHaveBeenCalledWith(
        expect.stringContaining('Login required.'),
      );
    });

    it('should accept empty response as "yes"', async () => {
      const mockReadline = {
        on: vi.fn((event, callback) => {
          if (event === 'line') {
            callback('');
          }
        }),
        close: vi.fn(),
      };
      (readline.createInterface as Mock).mockReturnValue(mockReadline);

      const result = await getConsentForOauth('Login required.');

      expect(result).toBe(true);
    });

    it('should return false when user declines via readline', async () => {
      const mockReadline = {
        on: vi.fn((event, callback) => {
          if (event === 'line') {
            callback('n');
          }
        }),
        close: vi.fn(),
      };
      (readline.createInterface as Mock).mockReturnValue(mockReadline);

      const result = await getConsentForOauth('Login required.');

      expect(result).toBe(false);
    });
  });
});
