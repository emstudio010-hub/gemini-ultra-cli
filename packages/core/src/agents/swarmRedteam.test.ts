/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AgentLoopContext } from '../config/agent-loop-context.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { writeDrillGrant } from '../drill/drillGrant.js';
import { ManageSwarmTool } from './swarmTools.js';
import {
  createSwarm,
  currentSwarmActor,
  getSwarmEngine,
  postSwarmMessage,
  readSwarm,
  readSwarmBoard,
  setSwarmModel,
  type SwarmMember,
} from './swarm.js';
import { currentAgentModel } from './agentModelRouting.js';

let root: string;
const role = 'redteam-analyst' as SwarmMember['agent'];
const signal = () => new AbortController().signal;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-swarm-redteam-'));
  vi.stubEnv('GEMINI_DRILL_DIR', path.join(root, 'drill'));
});
afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(root, { recursive: true, force: true });
});

it('advertises a redteam member and persists its independent model without changing other roles', () => {
  const tool = new ManageSwarmTool({} as AgentLoopContext, {} as MessageBus);
  expect(tool.schema.parametersJsonSchema).toMatchObject({
    properties: { agent: { enum: expect.arrayContaining([role]) } },
  });
  const swarm = createSwarm(root, 'Inspect supplied local source only');
  setSwarmModel(root, swarm.id, 'coder', 'native:gemini-coder');
  setSwarmModel(root, swarm.id, role, 'native:gemini-review');
  expect(readSwarm(root, swarm.id).roleModels).toEqual({
    coder: 'native:gemini-coder',
    [role]: 'native:gemini-review',
  });
});

it('refuses an unauthorized redteam member before changing the task or calling its runner', () => {
  const swarm = createSwarm(root, 'Local scoped review');
  const runner = vi.fn();
  const engine = getSwarmEngine(root, swarm.id, runner);
  const file = path.join(root, 'swarms', swarm.id, 'members.json');
  const before = fs.readFileSync(file);
  const board = readSwarmBoard(root, swarm.id);
  expect(() => engine.add('analyst', role, 'Read the supplied source')).toThrow(
    /authorization/i,
  );
  expect(fs.readFileSync(file)).toEqual(before);
  expect(readSwarmBoard(root, swarm.id)).toEqual(board);
  expect(runner).not.toHaveBeenCalled();
});

it('runs authorized read-only analysts concurrently and still requires a current independent verdict', async () => {
  writeDrillGrant(true);
  const swarm = createSwarm(root, 'Review two supplied local source files');
  setSwarmModel(root, swarm.id, role, 'native:gemini-review');
  let entered = 0;
  let release!: () => void;
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  const models: Array<string | undefined> = [];
  const engine = getSwarmEngine(
    root,
    swarm.id,
    async (agent, _prompt, memberSignal) => {
      if (agent === 'workflow-auditor')
        return {
          completed: true,
          text: JSON.stringify({
            passed: true,
            summary: 'Inspected both retained reports',
            evidence: ['alpha', 'beta'],
          }),
        };
      expect(agent).toBe(role);
      models.push(currentAgentModel());
      entered++;
      if (entered === 2) release();
      await Promise.race([
        barrier,
        new Promise<void>((_resolve, reject) => {
          memberSignal.addEventListener(
            'abort',
            () => reject(memberSignal.reason),
            { once: true },
          );
        }),
      ]);
      const actor = currentSwarmActor()!;
      postSwarmMessage(
        root,
        swarm.id,
        actor.name,
        'Source evidence: ' + actor.name,
      );
      return { completed: true, text: 'Bounded report: ' + actor.name };
    },
  );
  engine.add('alpha', role, 'Read alpha.ts only; return evidence');
  engine.add('beta', role, 'Read beta.ts only; return evidence');
  await engine.wait(AbortSignal.timeout(3000));
  expect(entered).toBe(2);
  expect(models).toEqual(['native:gemini-review', 'native:gemini-review']);
  expect(
    readSwarm(root, swarm.id).members.every(
      (member) =>
        member.state === 'waiting' &&
        member.result.startsWith('Bounded report:'),
    ),
  ).toBe(true);
  expect(
    readSwarmBoard(root, swarm.id).filter((post) =>
      post.text.startsWith('Source evidence:'),
    ),
  ).toHaveLength(2);
  expect(() => engine.finish()).toThrow(/independent verifier/i);
  engine.add(
    'verifier',
    'workflow-auditor',
    'Inspect both reports independently',
  );
  await engine.wait(signal());
  engine.finish();
  expect(readSwarm(root, swarm.id).phase).toBe('completed');
});

it('rechecks authorization before dispatch and pauses a mentioned analyst after revocation', async () => {
  writeDrillGrant(true);
  const swarm = createSwarm(root, 'Review supplied source');
  const runner = vi.fn(async () => ({
    completed: true,
    text: 'Evidence report',
  }));
  const engine = getSwarmEngine(root, swarm.id, runner);
  engine.add('analyst', role, 'Read local source only');
  writeDrillGrant(false); // Before the queued turn reaches the runner.
  await engine.wait(signal());
  expect(runner).not.toHaveBeenCalled();
  expect(readSwarm(root, swarm.id).members[0]).toMatchObject({
    state: 'paused',
    result: expect.stringMatching(/authorization/i),
  });
  writeDrillGrant(true);
  engine.post('coordinator', '@analyst resume the same scope');
  await engine.wait(signal());
  expect(runner).toHaveBeenCalledTimes(1);
  writeDrillGrant(false);
  engine.post('coordinator', '@analyst inspect a follow-up');
  await engine.wait(signal());
  expect(runner).toHaveBeenCalledTimes(1);
  expect(readSwarm(root, swarm.id).members[0].state).toBe('paused');
});
