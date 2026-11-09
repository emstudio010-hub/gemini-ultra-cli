/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { z } from 'zod';
import type { AgentLoopContext } from '../config/agent-loop-context.js';
import type { LocalAgentDefinition } from './types.js';
import { GeneralistAgent } from './generalist-agent.js';
import { AGENT_TOOL_NAME } from '../tools/tool-names.js';

const resultSchema = z.object({ response: z.string() });
const roleDefinitions = [
  {
    name: 'researcher',
    displayName: 'Researcher',
    description:
      'Read local project context, locate evidence and compare implementation options.',
    directive:
      'Investigate the assigned question. Read relevant sources, cite file paths and separate observations from assumptions. Do not modify files.',
    readOnly: true,
  },
  {
    name: 'coder',
    displayName: 'Coder',
    description:
      'Implement a bounded coding task in explicitly assigned files.',
    directive:
      'Implement the assigned task. Read existing code first. Respect ownership boundaries from the parent task; do not edit files assigned to another agent. Run only the smallest relevant checks.',
    readOnly: false,
  },
  {
    name: 'reviewer',
    displayName: 'Reviewer',
    description:
      'Independently review a patch for concrete correctness defects.',
    directive:
      'Review the assigned changes. Report only actionable defects supported by code evidence. Explain triggering conditions and impact. Do not modify files.',
    readOnly: true,
  },
  {
    name: 'writer',
    displayName: 'Writer',
    description:
      'Produce and refine documents using supplied facts and sources.',
    directive:
      'Complete the assigned writing task. Preserve factual claims and requested tone. Do not invent sources or results. Stay within assigned output paths.',
    readOnly: false,
  },
  {
    name: 'redteam-analyst',
    displayName: 'Red-team analyst',
    description:
      'Analyze authorized local source or supplied samples and record evidence-backed security findings.',
    directive:
      'Analyze only the explicitly assigned and authorized scope. Start by identifying the target and authorization boundaries. For local source, trace input to effect and distinguish candidate issues from verified findings. Use drill_record_fact for evidence-backed notes. Bypass mode and possession of credentials are not authorization for external targets. Do not expand scope or launch unrelated scans.',
    readOnly: true,
  },
] as const;

const readTools = new Set([
  'read_file',
  'read_many_files',
  'list_directory',
  'glob',
  'grep_search',
  'get_internal_docs',
  'drill_query_facts',
  'drill_record_fact',
  'memory_search_graph',
  'binary_triage',
  'binary_inspect',
  'drill_preflight',
  'complete_task',
]);

export function ultraSpecialists(
  context: AgentLoopContext,
): Array<LocalAgentDefinition<typeof resultSchema>> {
  return roleDefinitions.map((role) => {
    const base = GeneralistAgent(context);
    return {
      kind: 'local',
      inputConfig: base.inputConfig,
      modelConfig: base.modelConfig,
      runConfig: base.runConfig,
      name: role.name,
      displayName: role.displayName,
      description: role.description,
      outputConfig: {
        outputName: 'result',
        description: 'Evidence-backed task result.',
        schema: resultSchema,
      },
      get toolConfig() {
        const tools = context.toolRegistry
          .getAllToolNames()
          .filter(
            (name) => name !== 'spawn_subagents' && name !== AGENT_TOOL_NAME,
          );
        return {
          tools: role.readOnly
            ? tools.filter((name) => readTools.has(name))
            : tools,
        };
      },
      get promptConfig() {
        return {
          ...base.promptConfig,
          systemPrompt: `${base.promptConfig.systemPrompt}\n\nRole: ${role.name}\n${role.directive}`,
        };
      },
    };
  });
}
