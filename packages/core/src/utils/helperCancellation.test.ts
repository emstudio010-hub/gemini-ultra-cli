/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { GenerateContentResponse } from '@google/genai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContentGenerator } from '../core/contentGenerator.js';
import type { Config } from '../config/config.js';
import type {
  BrowserManager,
  McpToolCallResult,
} from '../agents/browser/browserManager.js';
import { createAnalyzeScreenshotTool } from '../agents/browser/analyzeScreenshot.js';
import { makeFakeConfig } from '../test-utils/config.js';
import { generatePolicy } from '../safety/conseca/policy-generator.js';
import { enforcePolicy } from '../safety/conseca/policy-enforcer.js';
import { ConsecaSafetyChecker } from '../safety/conseca/conseca.js';
import { calculateRequestTokenCount } from './tokenCalculation.js';

let config: Config;
let generator: ContentGenerator;
const policy = {
  read_file: {
    permissions: 'allow',
    constraints: 'fixture only',
    rationale: 'fixture',
  },
};
const policyResponse = Object.assign(new GenerateContentResponse(), {
  candidates: [
    {
      content: {
        parts: [
          {
            text: JSON.stringify({
              policies: [{ tool_name: 'read_file', policy: policy.read_file }],
            }),
          },
        ],
      },
    },
  ],
});
const screenshot: McpToolCallResult = {
  content: [{ type: 'image', data: 'fixture', mimeType: 'image/png' }],
};
const media = [{ inlineData: { data: 'fixture', mimeType: 'image/png' } }];
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
beforeEach(() => {
  ConsecaSafetyChecker.resetInstance();
  config = makeFakeConfig({ enableConseca: true });
  generator = {
    generateContent: vi.fn().mockResolvedValue(policyResponse),
    generateContentStream: vi.fn(),
    countTokens: vi.fn().mockResolvedValue({ totalTokens: 7 }),
    embedContent: vi.fn(),
  };
  vi.spyOn(config, 'getContentGenerator').mockReturnValue(generator);
});
afterEach(async () => {
  await config.dispose();
  ConsecaSafetyChecker.resetInstance();
  vi.restoreAllMocks();
});
describe('helper lifecycle', () => {
  it.each(['generate', 'enforce', 'cache'] as const)(
    'cancels pending Conseca %s instead of returning a fallback or saving a late policy',
    async (operation) => {
      const held = deferred<GenerateContentResponse>();
      vi.mocked(generator.generateContent).mockReturnValueOnce(held.promise);
      const checker = ConsecaSafetyChecker.getInstance();
      const invoke = () =>
        operation === 'generate'
          ? generatePolicy('fixture', '', config)
          : operation === 'enforce'
            ? enforcePolicy({}, { name: 'read_file' }, config)
            : checker.getPolicy('fixture', '', config);
      let error: unknown;
      const pending = invoke().catch((failure) => {
        error = failure;
      });
      await vi.waitFor(() =>
        expect(generator.generateContent).toHaveBeenCalledTimes(1),
      );
      try {
        await config.dispose();
        await vi.waitFor(
          () => expect(error).toBe(config.getLifecycleSignal().reason),
          { timeout: 200 },
        );
      } finally {
        held.resolve(policyResponse);
        await pending;
      }
      expect(checker.getCurrentPolicy()).toBeNull();
      expect(checker.getActiveUserPrompt()).toBeNull();
      await expect(invoke()).rejects.toBe(config.getLifecycleSignal().reason);
      expect(generator.generateContent).toHaveBeenCalledTimes(1);
    },
  );
  it.each(['caller', 'dispose'] as const)(
    'stops screenshot capture on %s without dispatching a late model call',
    async (cancellation) => {
      const held = deferred<McpToolCallResult>();
      const browser = {
        callTool: vi.fn().mockReturnValueOnce(held.promise),
      } as unknown as BrowserManager;
      const invocation = createAnalyzeScreenshotTool(
        browser,
        config,
        config.getMessageBus(),
      ).build({ instruction: 'fixture' });
      const caller = new AbortController();
      const reason = new DOMException(
        'Explicit capture cancellation',
        'AbortError',
      );
      let error: unknown;
      const pending = invocation
        .execute({ abortSignal: caller.signal })
        .catch((failure) => {
          error = failure;
        });
      await vi.waitFor(() => expect(browser.callTool).toHaveBeenCalledTimes(1));
      try {
        if (cancellation === 'caller') caller.abort(reason);
        else await config.dispose();
        await vi.waitFor(
          () =>
            expect(error).toBe(
              cancellation === 'caller'
                ? reason
                : config.getLifecycleSignal().reason,
            ),
          { timeout: 200 },
        );
      } finally {
        held.resolve(screenshot);
        await pending;
      }
      expect(generator.generateContent).not.toHaveBeenCalled();
      expect(vi.mocked(browser.callTool).mock.calls[0][2]?.aborted).toBe(true);
      await expect(
        invocation.execute({ abortSignal: caller.signal }),
      ).rejects.toBe(error);
      expect(browser.callTool).toHaveBeenCalledTimes(1);
    },
  );
  it('stops pending screenshot model analysis without converting cancellation into a fallback result', async () => {
    const held = deferred<GenerateContentResponse>();
    vi.mocked(generator.generateContent).mockReturnValueOnce(held.promise);
    const browser = {
      callTool: vi.fn().mockResolvedValue(screenshot),
    } as unknown as BrowserManager;
    const invocation = createAnalyzeScreenshotTool(
      browser,
      config,
      config.getMessageBus(),
    ).build({ instruction: 'fixture' });
    let error: unknown;
    const pending = invocation
      .execute({ abortSignal: new AbortController().signal })
      .catch((failure) => {
        error = failure;
      });
    await vi.waitFor(() =>
      expect(generator.generateContent).toHaveBeenCalledTimes(1),
    );
    try {
      await config.dispose();
      await vi.waitFor(
        () => expect(error).toBe(config.getLifecycleSignal().reason),
        { timeout: 200 },
      );
    } finally {
      held.resolve(policyResponse);
      await pending;
    }
  });
  it('cancels non-cooperative media counting and preserves the caller reason instead of estimating', async () => {
    const held = deferred<{ totalTokens: number }>();
    vi.mocked(generator.countTokens).mockReturnValueOnce(held.promise);
    const caller = new AbortController();
    const reason = new DOMException('Media count cancelled', 'AbortError');
    let error: unknown;
    const pending = calculateRequestTokenCount(
      media,
      generator,
      'fixture',
      caller.signal,
    ).catch((failure) => {
      error = failure;
    });
    await vi.waitFor(() =>
      expect(generator.countTokens).toHaveBeenCalledTimes(1),
    );
    try {
      caller.abort(reason);
      await vi.waitFor(() => expect(error).toBe(reason), { timeout: 200 });
    } finally {
      held.resolve({ totalTokens: 7 });
      await pending;
    }
    expect(
      vi.mocked(generator.countTokens).mock.calls[0][0].config?.abortSignal,
    ).toBe(caller.signal);
    await expect(
      calculateRequestTokenCount(
        'local text',
        generator,
        'fixture',
        caller.signal,
      ),
    ).rejects.toBe(reason);
    await expect(
      calculateRequestTokenCount(media, generator, 'fixture'),
    ).resolves.toBe(7);
  });
  it('propagates generator cancellation even without its own token-count signal', async () => {
    const reason = new DOMException('Generator lifecycle ended', 'AbortError');
    vi.mocked(generator.countTokens).mockRejectedValueOnce(reason);
    await expect(
      calculateRequestTokenCount(media, generator, 'fixture'),
    ).rejects.toBe(reason);
  });
  it('does not reuse a cached Conseca policy after its Config closes', async () => {
    const checker = ConsecaSafetyChecker.getInstance();
    await expect(checker.getPolicy('fixture', '', config)).resolves.toEqual(
      policy,
    );
    await config.dispose();
    await expect(checker.getPolicy('fixture', '', config)).rejects.toBe(
      config.getLifecycleSignal().reason,
    );
    expect(generator.generateContent).toHaveBeenCalledTimes(1);
  });
});
