/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { Buffer } from 'node:buffer';
import { I18nManager } from '../i18n/i18nManager.js';
import type { ProviderProtocol } from './providerTypes.js';
import { isRecord } from '../utils/markdownUtils.js';

/** Diagnostic metadata only: never retain arguments, parser messages or causes. */
export class ProviderToolArgumentsError extends Error {
  override readonly name = 'ProviderToolArgumentsError';
  constructor(
    readonly protocol: ProviderProtocol,
    readonly toolName: string | undefined,
    readonly argumentBytes: number,
    readonly argumentChars: number,
    readonly reason: 'invalid-json' | 'non-object',
    readonly jsonPosition?: number,
  ) {
    const details = `protocol=${protocol}; tool=${toolName ?? 'unknown'}; bytes=${argumentBytes}; UTF-16=${argumentChars}${jsonPosition === undefined ? '' : `; UTF-16 position=${jsonPosition}`}`;
    super(
      I18nManager.getInstance().t(
        `供应商工具参数${reason === 'invalid-json' ? '不是有效 JSON' : '必须是 JSON 对象'}；该响应的工具未执行。${details}。请检查供应商响应格式后再显式重试；参数正文未显示。`,
        `Provider returned ${reason === 'invalid-json' ? 'malformed tool argument JSON' : 'tool arguments that are not a JSON object'}; tools from this response were not executed. ${details}. Check the provider response format before explicitly retrying; argument contents are omitted.`,
      ),
    );
  }
}

export function parseProviderToolArguments(
  text: string,
  protocol: ProviderProtocol,
  name: string,
  declaredNames: string[],
): Record<string, unknown> {
  // A provider can put arbitrary data in a function name. Only expose a
  // bounded identifier already present in this request's tool declaration.
  const toolName =
    /^[A-Za-z0-9_.:-]{1,128}$/.test(name) && declaredNames.includes(name)
      ? name
      : undefined;
  const fail = (
    reason: 'invalid-json' | 'non-object',
    jsonPosition?: number,
  ): never => {
    throw new ProviderToolArgumentsError(
      protocol,
      toolName,
      Buffer.byteLength(text),
      text.length,
      reason,
      jsonPosition,
    );
  };
  let value: unknown;
  try {
    value = JSON.parse(text || '{}');
  } catch (error) {
    // Runtime JSON diagnostics may quote secrets. Extract only a checked
    // numeric offset, then discard the original error without chaining it.
    const message = error instanceof SyntaxError ? error.message : '';
    const match = message.match(/\bposition (\d+)\b/);
    const offset = match
      ? Number(match[1])
      : message === 'Unexpected end of JSON input'
        ? text.length
        : undefined;
    return fail(
      'invalid-json',
      offset !== undefined &&
        Number.isSafeInteger(offset) &&
        offset >= 0 &&
        offset <= text.length
        ? offset
        : undefined,
    );
  }
  if (!isRecord(value)) return fail('non-object');
  return value;
}
