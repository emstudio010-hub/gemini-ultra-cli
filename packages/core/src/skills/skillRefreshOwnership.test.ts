/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { afterEach, expect, it, vi } from 'vitest';
import { SkillManager, type SkillDefinition } from './skillManager.js';
import { Storage } from '../config/storage.js';
import { loadSkillsFromDir } from './skillLoader.js';
vi.mock('./skillLoader.js', () => ({ loadSkillsFromDir: vi.fn() }));
vi.mock('./skillOrchestrator.js', () => ({
  getMultiSourceSkillDirs: () => [],
}));
afterEach(() => {
  vi.restoreAllMocks();
});
const definition = (name: string): SkillDefinition => ({
  name,
  description: name,
  body: name,
  location: `/${name}/SKILL.md`,
});
function setup() {
  vi.spyOn(Storage, 'getUserSkillsDir').mockReturnValue('/fixture-user');
  vi.spyOn(Storage, 'getUserAgentSkillsDir').mockReturnValue(
    '/fixture-user-agent',
  );
  const storage = {
    getProjectSkillsDir: () => '/fixture-project',
    getProjectAgentSkillsDir: () => '/fixture-project-agent',
  } as Storage;
  const manager = new SkillManager();
  manager.addSkills([definition('saved')]);
  let release!: (value: SkillDefinition[]) => void;
  let fail!: (error: Error) => void;
  const gate = new Promise<SkillDefinition[]>((resolve, reject) => {
    release = resolve;
    fail = reject;
  });
  let userCalls = 0;
  vi.mocked(loadSkillsFromDir).mockImplementation(async (directory) =>
    directory === '/fixture-user'
      ? ++userCalls === 1
        ? gate
        : [definition('newest')]
      : [],
  );
  return {
    manager,
    storage,
    release,
    fail,
    started: () => vi.waitFor(() => expect(userCalls).toBeGreaterThan(0)),
  };
}
it('keeps the published skill list available until a complete refresh is ready', async () => {
  const f = setup();
  const pending = f.manager.discoverSkills(f.storage);
  await f.started();
  const during = f.manager.getAllSkills().map((skill) => skill.name);
  f.release([definition('replacement')]);
  await pending;
  expect(during).toEqual(['saved']);
  expect(f.manager.getAllSkills().map((skill) => skill.name)).toEqual([
    'replacement',
  ]);
});
it('discards a late old refresh instead of mixing it into the newer list', async () => {
  const f = setup();
  const old = f.manager.discoverSkills(f.storage);
  await f.started();
  await f.manager.discoverSkills(f.storage);
  f.release([definition('stale')]);
  await old;
  expect(f.manager.getAllSkills().map((skill) => skill.name)).toEqual([
    'newest',
  ]);
});
it('preserves the previous list after an unexpected discovery failure', async () => {
  const f = setup();
  const pending = f.manager.discoverSkills(f.storage);
  const observed = pending.then(
    () => ({ error: undefined }),
    (error: unknown) => ({ error }),
  );
  await f.started();
  f.fail(new Error('Controlled discovery failure'));
  expect((await observed).error).toMatchObject({
    message: 'Controlled discovery failure',
  });
  expect(f.manager.getAllSkills().map((skill) => skill.name)).toEqual([
    'saved',
  ]);
});
it.each(['clear', 'disable-admin'] as const)(
  'does not republish pending discovery after %s',
  async (action) => {
    const f = setup();
    const pending = f.manager.discoverSkills(f.storage);
    await f.started();
    if (action === 'clear') f.manager.clearSkills();
    else {
      f.manager.setAdminSettings(false);
      f.manager.clearSkills();
    }
    f.release([definition('stale')]);
    await pending;
    expect(f.manager.getAllSkills()).toEqual([]);
  },
);
it('applies a disabled-name update made while discovery is pending to the newly published list', async () => {
  const f = setup();
  const pending = f.manager.discoverSkills(f.storage);
  await f.started();
  f.manager.setDisabledSkills(['REPLACEMENT']);
  f.release([definition('replacement')]);
  await pending;
  expect(f.manager.getSkills()).toEqual([]);
  expect(f.manager.getAllSkills()[0]).toMatchObject({
    name: 'replacement',
    disabled: true,
  });
});

it('removes trusted workspace skills immediately during a trust downgrade refresh', async () => {
  const f = setup();
  vi.mocked(loadSkillsFromDir).mockImplementation(async (directory) =>
    directory === '/fixture-project' ? [definition('trusted-project')] : [],
  );
  await f.manager.discoverSkills(f.storage, [], true);
  expect(f.manager.getSkill('trusted-project')).not.toBeNull();
  let release!: (skills: SkillDefinition[]) => void;
  const gate = new Promise<SkillDefinition[]>((resolve) => {
    release = resolve;
  });
  vi.mocked(loadSkillsFromDir).mockImplementation(async (directory) =>
    directory === '/fixture-user' ? gate : [],
  );
  const downgraded = f.manager.discoverSkills(f.storage, [], false);
  expect(f.manager.getSkill('trusted-project')).toBeNull();
  release([definition('user-only')]);
  await downgraded;
  expect(f.manager.getAllSkills().map((skill) => skill.name)).toEqual([
    'user-only',
  ]);
});
