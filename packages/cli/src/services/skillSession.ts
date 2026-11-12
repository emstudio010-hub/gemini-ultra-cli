/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import path from 'node:path';
import {
  AuthType,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GEMINI_FLASH_MODEL,
  GEMINI_MODEL_ALIAS_AUTO,
  I18nManager,
  ProviderManager,
  ProviderConfigConflictError,
  getDisplayString,
  type Config,
  type ReasoningEffortLevel,
} from '@google/gemini-cli-core';

export class SkillSessionError extends Error {}

export function skillSessionError(error: unknown): string {
  return error instanceof SkillSessionError
    ? error.message
    : I18nManager.getInstance().t(
        '技能会话未激活。请检查会话状态后重试。',
        'The skill session was not activated. Check the session state and retry.',
      );
}

/** Local models only; gateway authentication does not provide native access. */
export function getSkillSessionModels(config: Config) {
  const models = ProviderManager.getInstance()
    .getAllExternalModelItems()
    .map((item) => ({
      id: item.qualifiedId,
      name: `${item.providerName} · ${item.modelId}`,
    }));
  const auth = config.getContentGeneratorConfig()?.authType;
  if (auth && auth !== AuthType.GATEWAY) {
    for (const id of [
      config.getModel(),
      GEMINI_MODEL_ALIAS_AUTO,
      DEFAULT_GEMINI_MODEL,
      DEFAULT_GEMINI_FLASH_MODEL,
    ]) {
      if (id && !id.includes(':') && !models.some((model) => model.id === id))
        models.push({ id, name: getDisplayString(id) });
    }
  }
  return models;
}

/** Configure the current chat and deliver the skill body without a model request. */
export async function startSkillSession(
  config: Config,
  name: string,
  model: string,
  effort: ReasoningEffortLevel,
): Promise<void> {
  const i18n = I18nManager.getInstance();
  const manager = config.getSkillManager();
  const skill = manager.getSkill(name);
  if (
    !config.isSkillsSupportEnabled() ||
    !manager.isAdminEnabled() ||
    !skill ||
    skill.disabled
  ) {
    throw new SkillSessionError(
      i18n.t(
        '此技能已不可用。请用 /skills list 刷新后重试。',
        'This skill is unavailable. Refresh with /skills list and retry.',
      ),
    );
  }
  if (!getSkillSessionModels(config).some((item) => item.id === model)) {
    throw new SkillSessionError(
      i18n.t(
        '所选模型已不可用。请重新打开技能会话并选择模型。',
        'The selected model is unavailable. Reopen the skill session and choose a model.',
      ),
    );
  }
  const client = config.getGeminiClient();
  if (!client.isInitialized()) {
    throw new SkillSessionError(
      i18n.t(
        '当前会话尚未就绪，请稍后重试。',
        'The current chat is not ready. Try again shortly.',
      ),
    );
  }
  try {
    ProviderManager.getInstance().setReasoningEffort(effort);
  } catch (error) {
    // The provider manager preserves its previous value if the write fails.
    throw new SkillSessionError(
      `${i18n.t('推理强度未保存，技能尚未激活。', 'Reasoning effort was not saved and the skill is not active.')} ${error instanceof ProviderConfigConflictError ? error.message : i18n.t('请检查配置写入权限后重试。', 'Check configuration write permissions and retry.')}`,
      { cause: error },
    );
  }
  try {
    config.getWorkspaceContext().addDirectory(path.dirname(skill.location));
    await client.addHistory({
      role: 'user',
      parts: [
        {
          text: `Use the following user-selected skill in this conversation. Keep the existing task and conversation history.\nSkill name: ${JSON.stringify(skill.name)}\nSkill file: ${JSON.stringify(skill.location)}\n\n${skill.body}`,
        },
      ],
    });
    config.setModel(model, true);
    manager.activateSkill(skill.name);
  } catch (error) {
    throw new SkillSessionError(
      i18n.t(
        '技能上下文未完成激活。推理强度可能已保存，请检查会话状态后重试。',
        'Skill context activation did not finish. Reasoning effort may already be saved; check the chat state and retry.',
      ),
      { cause: error },
    );
  }
}
