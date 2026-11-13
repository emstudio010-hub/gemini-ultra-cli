/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { expect, it } from 'vitest';
import { SkillManager, type SkillDefinition } from './skillManager.js';
const skill = (name: string, source: string): SkillDefinition => ({
  name,
  description: source,
  location: `/${source}/SKILL.md`,
  body: `Instructions from ${source}`,
});

it('merges case aliases with the same identity used by lookup and disable without duplicate menu entries', () => {
  const manager = new SkillManager();
  manager.addSkills([skill('Writer', 'first'), skill('Other', 'other')]);
  manager.addSkills([skill('writer', 'override')]);
  expect(manager.getAllSkills()).toHaveLength(2);
  expect(manager.getDisplayableSkills().map((item) => item.name)).toEqual([
    'writer',
    'Other',
  ]);
  expect(manager.getSkill('WRITER')?.description).toBe('override');
  manager.setDisabledSkills(['WrItEr']);
  expect(manager.getSkills().map((item) => item.name)).toEqual(['Other']);
});

it('treats activation names as case aliases and preserves non-alias names', () => {
  const manager = new SkillManager();
  manager.activateSkill('Writer');
  expect(manager.isSkillActive('writer')).toBe(true);
  expect(manager.isSkillActive('WRITER')).toBe(true);
  expect(manager.isSkillActive('writer-tools')).toBe(false);
  manager.reset();
  expect(manager.isSkillActive('writer')).toBe(false);
});
