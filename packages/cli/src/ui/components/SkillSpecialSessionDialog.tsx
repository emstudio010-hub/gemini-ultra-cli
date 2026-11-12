/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { useState, useEffect, useRef, useMemo } from 'react';
import { Box, Text } from 'ink';
import {
  classifySkill,
  getEffortOptions,
  preflightSkillTools,
  ProviderManager,
  type SkillDefinition,
  type ReasoningEffortLevel,
  type SkillToolPreflightReport,
} from '@google/gemini-cli-core';
import { useKeypress } from '../hooks/useKeypress.js';
import { useLocale } from '../hooks/useLocale.js';
import { useConfig } from '../contexts/ConfigContext.js';
import { theme } from '../semantic-colors.js';
import {
  getSkillSessionModels,
  skillSessionError,
} from '../../services/skillSession.js';

interface SkillSpecialSessionDialogProps {
  skill: SkillDefinition;
  onConfirm: (
    selectedModel: string,
    effort: ReasoningEffortLevel,
  ) => void | Promise<void>;
  onCancel: () => void;
}

export function SkillSpecialSessionDialog({
  skill,
  onConfirm,
  onCancel,
}: SkillSpecialSessionDialogProps) {
  const locale = useLocale();
  const config = useConfig();
  const zh = locale === 'zh';
  const [step, setStep] = useState<1 | 2>(1);
  const [effort, setEffort] = useState(() =>
    ProviderManager.getInstance().getReasoningEffort(),
  );
  const models = getSkillSessionModels(config);
  const [selectedModel, setSelectedModel] = useState(
    () =>
      models.find((item) => item.id === config.getModel())?.id ??
      models[0]?.id ??
      '',
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const mounted = useRef(true);
  const [inspect, setInspect] = useState(0);
  const [preflight, setPreflight] = useState<SkillToolPreflightReport>();
  const [preflightFailed, setPreflightFailed] = useState(false);
  const domain = useMemo(() => classifySkill(skill).domain, [skill]);
  const levels = getEffortOptions(locale);
  const chosenEffort = levels.find((item) => item.level === effort)!;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!inspect) return;
    let active = true;
    setPreflight(undefined);
    setPreflightFailed(false);
    void preflightSkillTools(domain)
      .then((report) => {
        if (active) setPreflight(report);
      })
      .catch(() => {
        if (active) setPreflightFailed(true);
      });
    return () => {
      active = false;
    };
  }, [domain, inspect]);

  useKeypress(
    (key) => {
      if (submitting.current) return true;
      if (key.name === 'escape' || (step === 1 && key.name === 'n')) {
        onCancel();
        return true;
      }
      if (key.name === 'p') {
        setInspect((value) => value + 1);
        return true;
      }
      const enter = key.name === 'enter' || key.name === 'return';
      if (step === 1 && (key.name === 'y' || enter)) {
        setStep(2);
        return true;
      }
      if (step !== 2) return false;
      if (key.name === 'tab') {
        setEffort(
          (previous) =>
            levels[
              (levels.findIndex((item) => item.level === previous) + 1) %
                levels.length
            ].level,
        );
        setError('');
        return true;
      }
      if (key.name === 'up' || key.name === 'down') {
        const index = models.findIndex((item) => item.id === selectedModel);
        const next = key.name === 'up' ? index - 1 : index + 1;
        setSelectedModel(
          models[(next + models.length) % models.length]?.id ?? '',
        );
        setError('');
        return true;
      }
      if (enter) {
        if (!models.some((item) => item.id === selectedModel)) {
          setError(
            zh
              ? '没有可用模型。请先用 /provider 配置供应商。'
              : 'No model is available. Configure a provider with /provider first.',
          );
          return true;
        }
        submitting.current = true;
        setBusy(true);
        setError('');
        void Promise.resolve()
          .then(() => onConfirm(selectedModel, effort))
          .catch((failure) => {
            if (mounted.current) setError(skillSessionError(failure));
          })
          .finally(() => {
            submitting.current = false;
            if (mounted.current) setBusy(false);
          });
        return true;
      }
      return false;
    },
    { isActive: true },
  );

  return (
    <Box
      borderStyle="round"
      borderColor={theme.border.default}
      flexDirection="column"
      padding={1}
      width="100%"
    >
      <Text bold color={theme.text.accent}>
        {zh ? '技能会话' : 'Skill session'} · {skill.name} · {step}/2
      </Text>
      {error ? <Text color={theme.status.error}>{error}</Text> : null}
      {step === 1 ? (
        <Box flexDirection="column" marginTop={1}>
          <Text>{skill.description}</Text>
          <Text color={theme.text.secondary}>
            {zh
              ? '将技能说明加入当前会话，保留现有任务和历史。'
              : 'Add the skill instructions to this chat, keeping the current task and history.'}
          </Text>
          <Text>
            {zh
              ? 'Enter / Y 继续 · Esc / N 取消 · P 检查本机工具'
              : 'Enter / Y Continue · Esc / N Cancel · P Inspect local tools'}
          </Text>
        </Box>
      ) : (
        <Box flexDirection="column" marginTop={1}>
          <Text color={theme.text.secondary}>
            {zh
              ? '↑↓ 选择模型 · Tab 切换强度 · Enter 激活 · Esc 取消'
              : '↑↓ Model · Tab Effort · Enter Activate · Esc Cancel'}
          </Text>
          {models.length ? (
            models.map((item) => (
              <Text
                key={item.id}
                color={
                  item.id === selectedModel
                    ? theme.status.success
                    : theme.text.primary
                }
              >
                {item.id === selectedModel ? ' ▶ ' : '   '}
                {item.name}
              </Text>
            ))
          ) : (
            <Text color={theme.status.warning}>
              {zh
                ? '请先用 /provider 添加模型。'
                : 'Add a model with /provider first.'}
            </Text>
          )}
          <Box marginTop={1} flexDirection="column">
            <Text bold>
              {zh ? '推理强度：' : 'Reasoning effort: '}
              {chosenEffort.label}
            </Text>
            <Text color={theme.text.secondary}>
              {levels.map((item) => item.label).join(' → ')}
            </Text>
            <Text color={theme.text.secondary}>{chosenEffort.description}</Text>
            <Text color={theme.text.secondary}>
              {zh
                ? '确认后模型仅用于当前会话，推理强度保存为偏好；取消不写入。'
                : 'On confirmation, the model applies to this chat and effort is saved as a preference. Cancelling writes nothing.'}
            </Text>
          </Box>
        </Box>
      )}
      {busy ? (
        <Text color={theme.text.secondary}>
          {zh ? '正在激活…' : 'Activating…'}
        </Text>
      ) : null}
      {inspect ? (
        <Box marginTop={1} flexDirection="column">
          <Text>
            {preflightFailed
              ? zh
                ? '工具检查失败。按 P 重试。'
                : 'Tool inspection failed. Press P to retry.'
              : !preflight
                ? zh
                  ? '正在检查本机工具…'
                  : 'Inspecting local tools…'
                : zh
                  ? '工具就绪 ' +
                    preflight.readyTools.length +
                    ' · 缺失 ' +
                    preflight.missingTools.length
                  : 'Tools ready ' +
                    preflight.readyTools.length +
                    ' · Missing ' +
                    preflight.missingTools.length}
          </Text>
          {preflight?.readyTools.map((item) => (
            <Text key={item.name} color={theme.status.success}>
              ✓ {item.name}: {item.detail}
            </Text>
          ))}
          {preflight?.missingTools.map((item) => (
            <Text key={item.name} color={theme.status.warning}>
              ! {item.name}: {item.hint}
            </Text>
          ))}
        </Box>
      ) : null}
    </Box>
  );
}
