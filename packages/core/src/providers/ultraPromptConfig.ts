/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { GenerateContentParameters, Part, Content } from '@google/genai';
import { z } from 'zod';
import { readUltraRuntime } from '../agents/ultraRuntime.js';
import { readDrillGrant } from '../drill/drillGrant.js';
import { readLocalJsonConfig } from '../utils/localJsonConfig.js';

// Prompt/rule management is inspired by YuJunZhiXue/dsh-purge 1.1.71.
// Source: https://github.com/YuJunZhiXue/dsh-purge
export interface UltraPromptRule {
  id: string;
  name: string;
  enabled: boolean;
  content: string;
}

export interface UltraPromptConfig {
  enabled: boolean;
  prompt: string;
  rules: UltraPromptRule[];
}

export function ultraPromptConfigPath(): string {
  return (
    process.env['GEMINI_ULTRA_PROMPTS_FILE'] ||
    path.join(os.homedir(), '.gemini', 'ultra-prompts.json')
  );
}

export function validateUltraPromptConfig(value: unknown): UltraPromptConfig {
  const parsed = z
    .object({
      enabled: z.boolean(),
      prompt: z.string(),
      rules: z
        .array(
          z.object({
            id: z.string().regex(/^[a-zA-Z0-9._-]{1,64}$/),
            name: z.string().trim().min(1).max(64),
            enabled: z.boolean(),
            content: z.string(),
          }),
        )
        .max(50),
    })
    .safeParse(value);
  if (!parsed.success)
    throw new Error(
      '提示词配置需要 enabled、prompt 和 rules；每条规则需要有效 ID、名称、正文和启停状态，最多 50 条。',
    );
  const config = parsed.data;
  const ids = new Set<string>();
  const rules = config.rules.map((rule) => {
    if (ids.has(rule.id)) {
      throw new Error('规则需要唯一 ID、名称、正文和启停状态。');
    }
    ids.add(rule.id);
    return {
      id: rule.id,
      name: rule.name.trim(),
      content: rule.content,
      enabled: rule.enabled,
    };
  });
  const result = { enabled: config.enabled, prompt: config.prompt, rules };
  if (Buffer.byteLength(JSON.stringify(result)) > 60000)
    throw new Error('提示词与规则合计不能超过 60 KB。');
  return result;
}

export function readUltraPromptConfig(): UltraPromptConfig {
  const file = ultraPromptConfigPath();
  return readLocalJsonConfig(
    file,
    validateUltraPromptConfig,
    () => ({ enabled: true, prompt: '', rules: [] }),
    '/drill',
  );
}

export function saveUltraPromptConfig(value: unknown): UltraPromptConfig {
  const config = validateUltraPromptConfig(value);
  const file = ultraPromptConfigPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temp, JSON.stringify(config, null, 2), {
      encoding: 'utf8',
      mode: 0o600,
    });
    if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.bak`);
    fs.renameSync(temp, file);
  } finally {
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
  return config;
}

export function withUltraPrompt(
  request: GenerateContentParameters,
): GenerateContentParameters {
  const config = readUltraPromptConfig();
  const runtime = readUltraRuntime();
  const directives: string[] = [];
  if (runtime.collaboration === 'single')
    directives.push(
      'Collaboration mode: single. Complete tasks directly; do not spawn parallel subagents.',
    );
  if (runtime.collaboration === 'team')
    directives.push(
      `Collaboration mode: team. For independent substantial subproblems use spawn_subagents if available, with up to ${runtime.maxParallel} active tasks. Choose researcher, coder, reviewer or writer as appropriate. Assign non-overlapping files and complete dependent work sequentially. Summarize every task result and surface failures. Do not invent agent results. After a batch settles, integrate its results into the user's requested deliverable. Reuse returned evidence and only re-investigate a specific unresolved gap. Do not treat a subtask's completion as proof that the entire user task is complete.`,
    );
  if (runtime.workflow === 'redteam') {
    const grant = readDrillGrant();
    directives.push(
      grant.granted
        ? `Authorized red-team workflow. Begin with the user's explicit target and scope. The recorded network scope is ${grant.allowedNetScope?.join(', ')}; this record is not permission to expand the user's target. Use redteam-analyst for bounded local source/sample review, record evidence with drill_record_fact and distinguish hypotheses from verified findings. Preserve artifacts and explain remediation. Bypass is not authorization.`
        : 'The red-team authorization record has been revoked. Do not begin new red-team operations until the user records authorization again.',
    );
  }
  const text = [
    ...directives,
    config.enabled ? config.prompt.trim() : '',
    ...config.rules
      .filter(() => config.enabled)
      .filter((rule) => rule.enabled && rule.content.trim())
      .map((rule) => `### ${rule.name}\n${rule.content.trim()}`),
  ]
    .filter(Boolean)
    .join('\n\n');
  if (!text) return request;
  const original = request.config?.systemInstruction;
  const rawParts =
    typeof original === 'string'
      ? [{ text: original }]
      : Array.isArray(original)
        ? original
        : original && 'parts' in original
          ? original.parts || []
          : original
            ? [original]
            : [];
  const isContent = (value: Content | Part): value is Content =>
    'parts' in value || 'role' in value;
  const parts: Part[] = rawParts.flatMap((part) =>
    typeof part === 'string'
      ? [{ text: part }]
      : isContent(part)
        ? part.parts || []
        : [part],
  );
  return {
    ...request,
    config: {
      ...request.config,
      systemInstruction: {
        parts: [...parts, { text: `[User-defined instructions]\n${text}` }],
      },
    },
  };
}
