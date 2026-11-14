/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import {
  FinishReason,
  type Content,
  type ContentListUnion,
  type Part,
} from '@google/genai';
import { z } from 'zod';

const text = z.string().nullable().optional();
const call = z.object({
  index: z.number().int().nonnegative().optional(),
  id: z.string().optional(),
  function: z
    .object({ name: z.string().optional(), arguments: z.string().optional() })
    .optional(),
});
const message = z.object({
  content: text,
  reasoning_content: text,
  tool_calls: z.array(call).optional(),
});
export const chatSchema = z.object({
  error: z.unknown().optional(),
  usage: z.unknown().optional(),
  choices: z
    .array(
      z.object({
        index: z.number().int().nonnegative().optional(),
        finish_reason: text,
        message: message.optional(),
        delta: message.optional(),
      }),
    )
    .optional(),
});

/** Select the requested default candidate without mixing alternative streams. */
export function selectChatChoice<T extends { index?: number }>(
  choices?: T[],
): T | undefined {
  if (!choices?.length) return undefined;
  // Some compatible endpoints omit the index when only one choice is sent.
  if (choices.length === 1 && choices[0].index === undefined) return choices[0];
  const indices = new Set<number>();
  for (const choice of choices) {
    if (choice.index === undefined || indices.has(choice.index))
      throw new Error('OpenAI: response contains ambiguous candidate indices.');
    indices.add(choice.index);
  }
  return choices.find((choice) => choice.index === 0);
}
export const responsesSchema = z.object({
  type: z.string(),
  delta: z.string().optional(),
  item_id: z.string().optional(),
  arguments: z.string().optional(),
  item: z
    .object({
      type: z.string(),
      id: z.string().optional(),
      call_id: z.string().optional(),
      name: z.string().optional(),
    })
    .optional(),
  response: z
    .object({
      status: z.string().optional(),
      usage: z.unknown().optional(),
      error: z.unknown().optional(),
      incomplete_details: z.unknown().optional(),
    })
    .optional(),
  error: z.unknown().optional(),
});
export const anthropicSchema = z.object({
  type: z.string(),
  index: z.number().int().nonnegative().optional(),
  message: z.object({ usage: z.unknown().optional() }).optional(),
  usage: z.unknown().optional(),
  error: z.unknown().optional(),
  content_block: z
    .object({
      type: z.string(),
      id: z.string().optional(),
      name: z.string().optional(),
      input: z.record(z.unknown()).optional(),
    })
    .optional(),
  delta: z
    .object({
      type: z.string().optional(),
      thinking: z.string().optional(),
      text: z.string().optional(),
      partial_json: z.string().optional(),
      stop_reason: text,
    })
    .optional(),
});
const partSchema = z
  .object({
    text: z.string().optional(),
    thought: z.boolean().optional(),
    thoughtSignature: z.string().optional(),
    functionCall: z
      .object({
        id: z.string().optional(),
        name: z.string().optional(),
        args: z.record(z.unknown()).optional(),
      })
      .passthrough()
      .optional(),
    functionResponse: z
      .object({
        id: z.string().optional(),
        name: z.string().optional(),
        response: z.record(z.unknown()).optional(),
      })
      .passthrough()
      .optional(),
    inlineData: z
      .object({
        data: z.string().optional(),
        mimeType: z.string().optional(),
        displayName: z.string().optional(),
      })
      .passthrough()
      .optional(),
    fileData: z
      .object({
        fileUri: z.string().optional(),
        mimeType: z.string().optional(),
        displayName: z.string().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();
export const geminiSchema = z
  .object({
    error: z.unknown().optional(),
    candidates: z
      .array(
        z
          .object({
            content: z
              .object({
                role: z.string().optional(),
                parts: z.array(partSchema).optional(),
              })
              .passthrough()
              .optional(),
            finishReason: z
              .union([
                z.nativeEnum(FinishReason),
                z.string().transform(() => FinishReason.OTHER),
              ])
              .optional(),
          })
          .passthrough(),
      )
      .optional(),
    usageMetadata: z
      .object({
        promptTokenCount: z.number().nonnegative().optional(),
        candidatesTokenCount: z.number().nonnegative().optional(),
        totalTokenCount: z.number().nonnegative().optional(),
        cachedContentTokenCount: z.number().nonnegative().optional(),
        thoughtsTokenCount: z.number().nonnegative().optional(),
        toolUsePromptTokenCount: z.number().nonnegative().optional(),
      })
      .passthrough()
      .optional(),
    modelVersion: z.string().optional(),
    responseId: z.string().optional(),
  })
  .passthrough();

/** Reject corrupted events before they can become model text or tool invocations. */
export function parseProviderValue<T>(
  value: unknown,
  schema: z.ZodType<T>,
  label: string,
): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new Error(`${label}: invalid response structure.`);
  return parsed.data;
}
export function parseProviderJson<T>(
  value: string,
  schema: z.ZodType<T>,
  label: string,
): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(`${label}: invalid JSON response.`);
  }
  return parseProviderValue(parsed, schema, label);
}

export interface ChatToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  reasoning_content?: string;
  tool_calls?: ChatToolCall[];
  tool_call_id?: string;
}
export interface ChatTool {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
  };
}

function isContent(value: Content | Part): value is Content {
  return 'parts' in value || 'role' in value;
}

/** Normalize SDK input unions without changing thought flags or signatures. */
export function providerContents(value: ContentListUnion): Content[] {
  const result: Content[] = [];
  let parts: Part[] = [];
  const flush = () => {
    if (parts.length) {
      result.push({ role: 'user', parts });
      parts = [];
    }
  };
  for (const item of Array.isArray(value) ? value : [value]) {
    if (typeof item === 'string') parts.push({ text: item });
    else if (!item)
      throw new Error('Provider request contains an invalid content item.');
    else if (isContent(item)) {
      flush();
      result.push(item);
    } else parts.push(item);
  }
  flush();
  return result;
}
