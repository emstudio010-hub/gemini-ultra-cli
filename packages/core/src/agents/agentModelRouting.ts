/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { z } from 'zod';
import { ProviderManager } from '../providers/providerManager.js';

export const workflowRoleSchema = z.enum([
  'researcher',
  'coder',
  'workflow-auditor',
]);
export const agentModelSpecSchema = z
  .string()
  .trim()
  .min(1)
  .max(240)
  .regex(/^[\p{L}\p{N}][\p{L}\p{N}._/:@+-]*$/u);
export const agentRoleModelsSchema = z.object({
  researcher: agentModelSpecSchema.optional(),
  coder: agentModelSpecSchema.optional(),
  'workflow-auditor': agentModelSpecSchema.optional(),
});
interface ModelScope {
  model?: string;
  used: Set<string>;
}
const scopes = new AsyncLocalStorage<ModelScope>();

/** Resolves an explicit provider route without mutating the shared provider selection. */
export function normalizeAgentModel(value: string): string | undefined {
  if (value === 'inherit') return undefined;
  const spec = agentModelSpecSchema.parse(value);
  if (spec.startsWith('native:')) {
    if (!/^native:gemini-[a-zA-Z0-9._-]+$/.test(spec))
      throw new Error('Native member models use native:gemini-<model-id>.');
    return spec;
  }
  const separator = spec.indexOf(':');
  if (separator < 1)
    throw new Error(
      'Choose an explicit provider:model route, native:gemini-<model-id>, or inherit.',
    );
  const provider = ProviderManager.getInstance().getProvider(
    spec.slice(0, separator),
  );
  if (!provider || !spec.slice(separator + 1))
    throw new Error(
      'Selected member provider is unavailable. Configure it locally or choose inherit.',
    );
  return `${provider.id}:${spec.slice(separator + 1)}`;
}
export function currentAgentModel(): string | undefined {
  return scopes.getStore()?.model;
}
export function agentExecutionModel(fallback: string): string {
  const selected = currentAgentModel();
  return selected?.startsWith('native:')
    ? selected.slice(7)
    : (selected ?? fallback);
}
export function observeAgentModel(model: string): void {
  // Inherited provider model names are user data and may exceed the selector
  // limit. Bound only the display record, never change the dispatched model.
  scopes
    .getStore()
    ?.used.add(
      model.length > 512 ? `${model.slice(0, 490)} [route truncated]` : model,
    );
}
export async function withAgentModel<T>(
  model: string | undefined,
  run: () => Promise<T>,
  onModels: (used: string[]) => void,
): Promise<T> {
  const scope: ModelScope = {
    model: model ? normalizeAgentModel(model) : undefined,
    used: new Set(),
  };
  try {
    return await scopes.run(scope, run);
  } finally {
    onModels([...scope.used].slice(-16));
  }
}
/** Safe catalog: no credentials, endpoint URLs, or custom headers. */
export function availableAgentModels(): string[] {
  return ProviderManager.getInstance()
    .getAllExternalModelItems()
    .map((item) => item.qualifiedId);
}
