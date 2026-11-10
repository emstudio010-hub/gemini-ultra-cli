/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { ToolResult } from '../tools/tools.js';
import { isRecord } from '../utils/markdownUtils.js';
import {
  AgentTerminateMode,
  isSubagentProgress,
  SubagentState,
} from './types.js';

interface TextContent {
  text: string;
}
function isTextContent(value: unknown): value is TextContent {
  if (!isRecord(value)) return false;
  const text = value['text'];
  return typeof text === 'string';
}
interface ResponseWrapper {
  response: string;
}
function isResponseWrapper(value: unknown): value is ResponseWrapper {
  if (!isRecord(value)) return false;
  const response = value['response'];
  return Object.keys(value).length === 1 && typeof response === 'string';
}

/** Local invocations intentionally put caught errors in llmContent, not error. */
export function localAgentOutcome(value: ToolResult, unwrapResponse: boolean) {
  const progress = isSubagentProgress(value.returnDisplay)
    ? value.returnDisplay
    : undefined;
  const completed =
    !value.error &&
    progress?.state === SubagentState.COMPLETED &&
    progress.terminateReason === AgentTerminateMode.GOAL;
  const parts = Array.isArray(value.llmContent)
    ? value.llmContent
    : [value.llmContent];
  const message = parts
    .map((part) =>
      typeof part === 'string' ? part : isTextContent(part) ? part.text : '',
    )
    .filter(Boolean)
    .join('\n');
  let text = progress?.result?.trim()
    ? progress.result
    : value.error?.message ||
      message ||
      progress?.recentActivity.findLast(
        (activity) =>
          activity.status === SubagentState.ERROR ||
          activity.status === SubagentState.CANCELLED,
      )?.content ||
      'Subagent returned no result or diagnostic details.';
  if (unwrapResponse) {
    try {
      const parsed: unknown = JSON.parse(text);
      if (isResponseWrapper(parsed)) text = parsed.response;
    } catch {
      /* Plain-text errors and interrupted results stay readable. */
    }
  }
  if (!completed) {
    if (value.error?.message && !text.includes(value.error.message))
      text += `\n${value.error.message}`;
    if (progress?.terminateReason)
      text = `Termination Reason: ${progress.terminateReason}\n${text}`;
  }
  return { completed, text };
}
