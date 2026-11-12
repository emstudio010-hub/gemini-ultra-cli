/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import {
  AuthType,
  agentModelSpecSchema,
  availableAgentModels,
  latestSwarm,
  swarmRoleSchema,
  workflowRoleSchema,
} from '@google/gemini-cli-core';
import type { CommandContext } from './types.js';

/** Local suggestions only; completing text never selects a model or starts a task. */
export function completeAgentModel(
  context: CommandContext,
  partial: string,
  swarm = false,
): string[] {
  const targets: string[] = [
    ...(swarm ? swarmRoleSchema : workflowRoleSchema).options,
  ];
  const config = context.services.agentContext?.config;
  if (swarm && config) {
    try {
      const saved = latestSwarm(config.storage.getProjectTempDir());
      targets.push(
        ...(saved?.members.map((member) => `@${member.name}`) ?? []),
      );
    } catch {
      // An unavailable roster must not prevent completing role-level settings.
    }
  }
  const text = partial.trimStart();
  if (!/\s/.test(text))
    return targets.filter((target) =>
      target.toLowerCase().startsWith(text.toLowerCase()),
    );
  const match = /^(\S+)\s+(\S*)$/.exec(text);
  if (!match) return [];
  const target = targets.find(
    (value) => value.toLowerCase() === match[1].toLowerCase(),
  );
  if (!target) return [];
  const models = ['inherit', ...availableAgentModels()];
  try {
    const auth = config?.getContentGeneratorConfig()?.authType;
    const model = config?.getModel();
    if (auth && auth !== AuthType.GATEWAY && model?.startsWith('gemini-'))
      models.push(`native:${model}`);
  } catch {
    // Authentication may still be loading. Inherit remains available.
  }
  return [...new Set(models)]
    .filter(
      (model) =>
        agentModelSpecSchema.safeParse(model).success &&
        model.toLowerCase().startsWith(match[2].toLowerCase()),
    )
    .map((model) => `${target} ${model}`);
}
