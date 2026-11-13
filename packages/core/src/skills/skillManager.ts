/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Storage } from '../config/storage.js';
import { type SkillDefinition, loadSkillsFromDir } from './skillLoader.js';
import { getMultiSourceSkillDirs } from './skillOrchestrator.js';
import type { GeminiCLIExtension } from '../config/config.js';
import { debugLogger } from '../utils/debugLogger.js';
import { mapWithConcurrency } from '../utils/asyncPool.js';
// coreEvents removed to eliminate UI skill conflict warnings
export { type SkillDefinition };

export class SkillManager {
  private skills: SkillDefinition[] = [];
  private activeSkillNames: Set<string> = new Set();
  private adminSkillsEnabled = true;
  private discoveryRevision = 0;
  private disabledSkillNames?: string[];
  private publishedWorkspaceTrusted = false;

  /**
   * Clears all discovered skills.
   */
  clearSkills(): void {
    this.discoveryRevision++;
    this.skills = [];
  }

  /**
   * Resets session-scoped state (active skill names).
   */
  reset(): void {
    this.activeSkillNames.clear();
  }

  /**
   * Sets administrative settings for skills.
   */
  setAdminSettings(enabled: boolean): void {
    if (!enabled) this.discoveryRevision++;
    this.adminSkillsEnabled = enabled;
  }

  /**
   * Returns true if skills are enabled by the admin.
   */
  isAdminEnabled(): boolean {
    return this.adminSkillsEnabled;
  }

  /**
   * Discovers skills from standard user and workspace locations, as well as extensions.
   * Precedence: Extensions (lowest) -> User -> Workspace (highest).
   */
  async discoverSkills(
    storage: Storage,
    extensions: GeminiCLIExtension[] = [],
    isTrusted: boolean = false,
  ): Promise<void> {
    const revision = ++this.discoveryRevision;
    if (!this.adminSkillsEnabled) return;
    // A trust downgrade must remove the previously trusted workspace catalog
    // immediately, rather than keeping it available during asynchronous reads.
    if (this.publishedWorkspaceTrusted && !isTrusted) this.skills = [];
    const discovered = new SkillManager();

    // 1. Built-in skills (lowest precedence)
    await this.discoverBuiltinSkills(discovered);

    // 2. Extension skills
    for (const extension of extensions) {
      if (extension.isActive && extension.skills) {
        discovered.addSkillsWithPrecedence(extension.skills);
      }
    }

    // 3. User skills
    const userDirs = [
      ...new Set([
        Storage.getUserSkillsDir(),
        Storage.getUserAgentSkillsDir(),
        ...getMultiSourceSkillDirs(),
      ]),
    ];
    const skillGroups = await mapWithConcurrency(userDirs, 3, (dir) =>
      loadSkillsFromDir(dir),
    );
    // Merge in the original precedence order, regardless of read completion order.
    for (const skills of skillGroups)
      discovered.addSkillsWithPrecedence(skills);

    // 4. Workspace skills (highest precedence)
    if (!isTrusted) {
      debugLogger.debug(
        'Workspace skills disabled because folder is not trusted.',
      );
    } else {
      const projectSkills = await loadSkillsFromDir(
        storage.getProjectSkillsDir(),
      );
      discovered.addSkillsWithPrecedence(projectSkills);

      // 4.1 Workspace agent skills alias (.agents/skills)
      const projectAgentSkills = await loadSkillsFromDir(
        storage.getProjectAgentSkillsDir(),
      );
      discovered.addSkillsWithPrecedence(projectAgentSkills);
    }
    // Publish one complete generation. Slow old refreshes and explicit clears
    // must never restore stale commands or partially replace the live catalog.
    if (revision !== this.discoveryRevision || !this.adminSkillsEnabled) return;
    if (this.disabledSkillNames)
      discovered.setDisabledSkills(this.disabledSkillNames);
    this.skills = discovered.skills;
    this.publishedWorkspaceTrusted = isTrusted;
  }

  /**
   * Discovers built-in skills.
   */
  private async discoverBuiltinSkills(
    target: SkillManager = this,
  ): Promise<void> {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const builtinDir = path.join(__dirname, 'builtin');

    const builtinSkills = await loadSkillsFromDir(builtinDir);

    for (const skill of builtinSkills) {
      skill.isBuiltin = true;
    }

    target.addSkillsWithPrecedence(builtinSkills);
  }

  /**
   * Adds skills to the manager programmatically.
   */
  addSkills(skills: SkillDefinition[]): void {
    this.discoveryRevision++;
    this.addSkillsWithPrecedence(skills);
  }

  private addSkillsWithPrecedence(newSkills: SkillDefinition[]): void {
    const skillMap = new Map<string, SkillDefinition>(
      this.skills.map((s) => [s.name.toLowerCase(), s]),
    );

    for (const newSkill of newSkills) {
      const identity = newSkill.name.toLowerCase();
      const existingSkill = skillMap.get(identity);
      if (existingSkill && existingSkill.location !== newSkill.location) {
        if (existingSkill.isBuiltin) {
          debugLogger.warn(
            `Skill "${newSkill.name}" from "${newSkill.location}" is overriding the built-in skill.`,
          );
        } else {
          // In Gemini-Ultra, ecosystem/user skill overrides are smoothly merged without spamming UI warnings
          debugLogger.debug(
            `Skill "${newSkill.name}" from "${newSkill.location}" merged (previous: "${existingSkill.location}").`,
          );
        }
      }
      skillMap.set(identity, newSkill);
    }

    this.skills = Array.from(skillMap.values());
  }

  /**
   * Returns the list of enabled discovered skills.
   */
  getSkills(): SkillDefinition[] {
    return this.skills.filter((s) => !s.disabled);
  }

  /**
   * Returns the list of enabled discovered skills that should be displayed in the UI.
   * This excludes built-in skills.
   */
  getDisplayableSkills(): SkillDefinition[] {
    return this.skills.filter((s) => !s.disabled && !s.isBuiltin);
  }

  /**
   * Returns all discovered skills, including disabled ones.
   */
  getAllSkills(): SkillDefinition[] {
    return this.skills;
  }

  /**
   * Filters discovered skills by name.
   */
  filterSkills(predicate: (skill: SkillDefinition) => boolean): void {
    this.discoveryRevision++;
    this.skills = this.skills.filter(predicate);
  }

  /**
   * Sets the list of disabled skill names.
   */
  setDisabledSkills(disabledNames: string[]): void {
    this.disabledSkillNames = [...disabledNames];
    const lowercaseDisabledNames = disabledNames.map((n) => n.toLowerCase());
    for (const skill of this.skills) {
      skill.disabled = lowercaseDisabledNames.includes(
        skill.name.toLowerCase(),
      );
    }
  }

  /**
   * Reads the full content (metadata + body) of a skill by name.
   */
  getSkill(name: string): SkillDefinition | null {
    const lowercaseName = name.toLowerCase();
    return (
      this.skills.find((s) => s.name.toLowerCase() === lowercaseName) ?? null
    );
  }

  /**
   * Activates a skill by name.
   */
  activateSkill(name: string): void {
    this.activeSkillNames.add(name.toLowerCase());
  }

  /**
   * Checks if a skill is active.
   */
  isSkillActive(name: string): boolean {
    return this.activeSkillNames.has(name.toLowerCase());
  }
}
