/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'node:path';
import { getFolderStructure } from '../utils/getFolderStructure.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  type ToolResult,
  type ToolCallConfirmationDetails,
  type ToolInvocation,
  ToolConfirmationOutcome,
  type ExecuteOptions,
} from './tools.js';
import type { Config } from '../config/config.js';
import { ACTIVATE_SKILL_TOOL_NAME } from './tool-names.js';
import { ToolErrorType } from './tool-error.js';
import { getActivateSkillDefinition } from './definitions/coreTools.js';
import { resolveToolDeclaration } from './definitions/resolver.js';
import {
  classifySkill,
  discoverAllMultiSourceSkills,
  getSkillLibraryEntry,
  registerSkillInLibrary,
  suggestSkillTags,
} from '../skills/skillOrchestrator.js';
import type { SkillDefinition } from '../skills/skillLoader.js';
import { I18nManager } from '../i18n/i18nManager.js';
import { withAbortSignal } from '../utils/withAbortSignal.js';

/**
 * Parameters for the ActivateSkill tool
 */
export interface ActivateSkillToolParams {
  /**
   * The name of the skill to activate
   */
  name: string;
}

class ActivateSkillToolInvocation extends BaseToolInvocation<
  ActivateSkillToolParams,
  ToolResult
> {
  private cachedFolderStructure: string | undefined;
  private cachedFolderLocation: string | undefined;
  private confirmedSkill: SkillDefinition | undefined;
  private libraryState(skillName: string) {
    try {
      return { entry: getSkillLibraryEntry(skillName), warning: '' };
    } catch {
      return {
        entry: undefined,
        warning: I18nManager.getInstance().t(
          '技能标签库不可用，原文件已保留。仅允许本次可继续使用；永久保存前请恢复标签库。',
          'Skill metadata is unavailable; the original file was retained. Allow once can continue; restore metadata before saving permanently.',
        ),
      };
    }
  }

  constructor(
    private config: Config,
    params: ActivateSkillToolParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ) {
    super(params, messageBus, _toolName, _toolDisplayName);
  }

  private async resolveSkillDefinition(
    skillName: string,
    signal: AbortSignal,
  ): Promise<SkillDefinition | undefined> {
    signal.throwIfAborted();
    const manager = this.config.getSkillManager();
    if (manager.isAdminEnabled?.() === false) return undefined;
    const existing = manager.getSkill(skillName);
    if (existing) return existing.disabled ? undefined : { ...existing };
    const multi = await discoverAllMultiSourceSkills(signal);
    signal.throwIfAborted();
    const selected = multi.find(
      (s) => !s.disabled && s.name.toLowerCase() === skillName.toLowerCase(),
    );
    return selected ? { ...selected } : undefined;
  }

  getDescription(): string {
    const skillName = this.params.name;
    const skill = this.config.getSkillManager().getSkill(skillName);
    if (skill) {
      const profile = classifySkill(skill);
      return `${profile.badge} "${skillName}": ${skill.description}`;
    }
    return `"${skillName}" (?) external/untagged skill`;
  }

  private async getOrFetchFolderStructure(
    skillLocation: string,
    signal: AbortSignal,
  ): Promise<string> {
    signal.throwIfAborted();
    if (
      this.cachedFolderStructure === undefined ||
      this.cachedFolderLocation !== skillLocation
    ) {
      const structure = await withAbortSignal(signal, () =>
        getFolderStructure(path.dirname(skillLocation), {
          signal,
          throwOnError: true,
        }),
      );
      signal.throwIfAborted();
      this.cachedFolderStructure = structure;
      this.cachedFolderLocation = skillLocation;
    }
    return this.cachedFolderStructure;
  }

  protected override async getConfirmationDetails(
    abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    abortSignal.throwIfAborted();
    if (!this.messageBus) {
      return false;
    }

    const skillName = this.params.name;
    const skill = await this.resolveSkillDefinition(skillName, abortSignal);
    abortSignal.throwIfAborted();

    if (!skill) {
      return false;
    }

    if (skill.isBuiltin) {
      return false;
    }

    const folderStructure = await this.getOrFetchFolderStructure(
      skill.location,
      abortSignal,
    );
    const { entry: libEntry, warning } = this.libraryState(skillName);
    const { tags, domainProfile } = suggestSkillTags(skill.name, skill.body);

    const isUntagged = !libEntry;
    const onboardingSection = isUntagged
      ? `\n\n---\n### ✦ 发现未挂载标签的技能 (Skill Onboarding 向导)\n- **智能识别域**: ${domainProfile.badge} ${domainProfile.domainLabel}\n- **推荐标签**: \`${tags.join('`, `')}\`\n- **推荐模型层级**: ${domainProfile.recommendedModelTier}\n- **操作说明**:\n  - 选择 **Allow always (始终允许)**：将该技能及领域标签 \`${tags.join(' ')}\` 永久挂载入库 (\`~/.gemini/config/skill-tags.json\`)；\n  - 选择 **Allow once (仅本次允许)**：不写入标签库，直接交由当前模型原生直通调用 (Native Pass-Through)。`
      : `\n\n**已挂载标签库状态:** ${libEntry.badge} \`${libEntry.tags.join(' ')}\` (${libEntry.mode})`;

    const confirmationDetails: ToolCallConfirmationDetails = {
      type: 'info',
      title: isUntagged
        ? `✦ 技能入库向导与激活: ${skillName} (${domainProfile.badge})`
        : `Activate Skill: ${skillName} (${domainProfile.badge})`,
      prompt: `即将启用专业技能 **${skillName}**.

**Description:**
${skill.description}${onboardingSection}${warning ? `\n\n${warning}` : ''}

**Resources to be shared with the model:**
${folderStructure}`,
      onConfirm: async (outcome: ToolConfirmationOutcome) => {
        if (outcome === ToolConfirmationOutcome.Cancel) return;
        abortSignal.throwIfAborted();
        const current = await this.resolveSkillDefinition(
          skillName,
          abortSignal,
        );
        if (
          !current ||
          current.location !== skill.location ||
          current.body !== skill.body
        ) {
          throw new Error(
            I18nManager.getInstance().t(
              '技能已变更或停用，请重新发起激活。',
              'The skill changed or was disabled. Request activation again.',
            ),
          );
        }
        abortSignal.throwIfAborted();
        if (isUntagged) {
          if (
            outcome === ToolConfirmationOutcome.ProceedAlways ||
            outcome === ToolConfirmationOutcome.ProceedAlwaysAndSave
          ) {
            registerSkillInLibrary({
              name: skill.name,
              domain: domainProfile.domain,
              badge: domainProfile.badge,
              tags,
              mode: 'tagged',
            });
          }
        }
        await this.publishPolicyUpdate(outcome);
        this.confirmedSkill = { ...current };
      },
    };
    return confirmationDetails;
  }

  async execute({ abortSignal }: ExecuteOptions): Promise<ToolResult> {
    abortSignal.throwIfAborted();
    const skillName = this.params.name;
    const skillManager = this.config.getSkillManager();
    const skill = await this.resolveSkillDefinition(skillName, abortSignal);
    abortSignal.throwIfAborted();

    if (!skill) {
      const skills = skillManager.getSkills();
      const availableSkills = skills.map((s) => s.name).join(', ');
      const errorMessage = `Skill "${skillName}" not found. Available skills are: ${availableSkills}`;
      return {
        llmContent: `Error: ${errorMessage}`,
        returnDisplay: `Error: ${errorMessage}`,
        error: {
          message: errorMessage,
          type: ToolErrorType.INVALID_TOOL_PARAMS,
        },
      };
    }
    if (
      this.confirmedSkill &&
      (this.confirmedSkill.location !== skill.location ||
        this.confirmedSkill.body !== skill.body)
    ) {
      throw new Error(
        I18nManager.getInstance().t(
          '技能已变更，请重新发起激活。',
          'The skill changed. Request activation again.',
        ),
      );
    }

    const folderStructure = await this.getOrFetchFolderStructure(
      skill.location,
      abortSignal,
    );
    abortSignal.throwIfAborted();
    const current = await this.resolveSkillDefinition(skillName, abortSignal);
    abortSignal.throwIfAborted();
    if (
      !current ||
      current.location !== skill.location ||
      current.body !== skill.body
    ) {
      throw new Error(
        I18nManager.getInstance().t(
          '技能已变更或停用，请重新发起激活。',
          'The skill changed or was disabled. Request activation again.',
        ),
      );
    }
    const profile = classifySkill(skill);
    const { entry: libEntry, warning } = this.libraryState(skillName);
    const tagDisplay =
      libEntry && libEntry.tags.length > 0
        ? ` | 标签: ${libEntry.tags.join(' ')}`
        : ' | 模式: 原生直通调用 (Native Pass-Through)';

    abortSignal.throwIfAborted();
    this.config
      .getWorkspaceContext()
      .addDirectory(path.dirname(skill.location));
    abortSignal.throwIfAborted();
    skillManager.activateSkill(skill.name);

    return {
      llmContent: `<activated_skill name="${skillName}" domain="${profile.domain}" badge="${profile.badge}">
  <domain_profile>
    Domain: ${profile.domainLabel}
    Capabilities: ${profile.coreCapabilities.join('; ')}
  </domain_profile>
  <instructions>
    ${skill.body}
  </instructions>

  <available_resources>
    ${folderStructure}
  </available_resources>
</activated_skill>`,
      returnDisplay: `${profile.badge} 技能 **${skillName}** 已激活 (${profile.domainLabel}${tagDisplay}).\n资源路径 \`${path.dirname(skill.location)}\`:\n\n${folderStructure}${warning ? `\n\n${warning}` : ''}`,
    };
  }
}

/**
 * Implementation of the ActivateSkill tool logic
 */
export class ActivateSkillTool extends BaseDeclarativeTool<
  ActivateSkillToolParams,
  ToolResult
> {
  static readonly Name = ACTIVATE_SKILL_TOOL_NAME;

  constructor(
    private config: Config,
    messageBus: MessageBus,
  ) {
    const skills = config.getSkillManager().getSkills();
    const skillNames = skills.map((s) => s.name);
    const definition = getActivateSkillDefinition(skillNames);

    super(
      ActivateSkillTool.Name,
      'Activate Skill',
      definition.base.description!,
      Kind.Other,
      definition.base.parametersJsonSchema,
      messageBus,
      true,
      false,
    );
  }

  protected createInvocation(
    params: ActivateSkillToolParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ): ToolInvocation<ActivateSkillToolParams, ToolResult> {
    return new ActivateSkillToolInvocation(
      this.config,
      params,
      messageBus,
      _toolName,
      _toolDisplayName ?? 'Activate Skill',
    );
  }

  override getSchema(modelId?: string) {
    const skills = this.config.getSkillManager().getSkills();
    const skillNames = skills.map((s) => s.name);
    return resolveToolDeclaration(
      getActivateSkillDefinition(skillNames),
      modelId,
    );
  }
}
