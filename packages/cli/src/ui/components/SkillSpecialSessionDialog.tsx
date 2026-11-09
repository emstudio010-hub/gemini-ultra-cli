/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import {
  type SkillDefinition,
  classifySkill,
  preflightSkillTools,
  type SkillDomainProfile,
  type SkillToolPreflightReport,
  ProviderManager,
  type ReasoningEffortLevel,
} from '@google/gemini-cli-core';
import { useKeypress } from '../hooks/useKeypress.js';
import { theme } from '../semantic-colors.js';

interface SkillSpecialSessionDialogProps {
  skill: SkillDefinition;
  onConfirm: (selectedModel: string, effort: ReasoningEffortLevel) => void;
  onCancel: () => void;
}

export const SkillSpecialSessionDialog: React.FC<SkillSpecialSessionDialogProps> = ({
  skill,
  onConfirm,
  onCancel,
}) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedModelIdx, setSelectedModelIdx] = useState(0);

  const mgr = ProviderManager.getInstance();
  const [effort, setEffort] = useState<ReasoningEffortLevel>(() => mgr.getReasoningEffort());

  const profile: SkillDomainProfile = classifySkill(skill);
  const [preflightReport, setPreflightReport] = useState<SkillToolPreflightReport | null>(null);

  useEffect(() => {
    let active = true;
    void preflightSkillTools(profile.domain).then((report) => {
      if (active) setPreflightReport(report);
    });
    return () => {
      active = false;
    };
  }, [profile.domain]);

  // Merge Gemini native models with external models
  const externalItems = mgr.getAllExternalModelItems();
  const availableModels: Array<{ id: string; name: string; tag: string }> = [
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro (原生高阶)', tag: 'Native' },
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash (原生极速)', tag: 'Native' },
  ];

  for (const item of externalItems) {
    availableModels.push({
      id: item.qualifiedId,
      name: `${item.providerName}: ${item.modelId}`,
      tag: item.protocol,
    });
  }

  const effortLevels: ReasoningEffortLevel[] = ['low', 'medium', 'high', 'xhigh', 'max'];

  useKeypress(
    (key) => {
      if (key.name === 'escape') {
        onCancel();
        return true;
      }

      // Step 1: Confirm special session
      if (step === 1) {
        if (key.name === 'y' || key.name === 'return') {
          setStep(2);
          return true;
        }
        if (key.name === 'n') {
          onCancel();
          return true;
        }
      }

      // Step 2: Choose model and effort
      if (step === 2) {
        if (key.name === 'up') {
          setSelectedModelIdx((prev) => (prev > 0 ? prev - 1 : availableModels.length - 1));
          return true;
        }
        if (key.name === 'down') {
          setSelectedModelIdx((prev) => (prev < availableModels.length - 1 ? prev + 1 : 0));
          return true;
        }
        if (key.name === 'tab') {
          setEffort((prev) => {
            const nextIdx = (effortLevels.indexOf(prev) + 1) % effortLevels.length;
            const chosen = effortLevels[nextIdx];
            mgr.setReasoningEffort(chosen);
            return chosen;
          });
          return true;
        }
        if (key.name === 'return') {
          const chosenModel = availableModels[selectedModelIdx] || availableModels[0];
          mgr.setReasoningEffort(effort);
          onConfirm(chosenModel.id, effort);
          return true;
        }
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
      {/* --- STEP 1: SKILL INSIGHT & CLASSIFICATION --- */}
      {step === 1 ? (
        <Box flexDirection="column">
          <Box flexDirection="row" justifyContent="space-between">
            <Text bold color={theme.text.accent}>
              ✦ 全生态技能智能洞察 (Skill Insight & Orchestrator)
            </Text>
            <Text color={theme.text.secondary}>[按 Y 或 Enter 继续 / N 取消]</Text>
          </Box>

          <Box marginTop={1} flexDirection="column">
            <Box>
              <Text bold color={theme.text.primary}>
                检测到技能:{' '}
              </Text>
              <Text bold color={theme.status.success}>
                [{skill.name}]
              </Text>
              <Text color={theme.text.secondary}> - {profile.badge}</Text>
            </Box>
            <Box>
              <Text color={theme.text.primary}>
                领域画像: <Text bold color={theme.text.accent}>{profile.domainLabel}</Text>{' '}
                <Text color={theme.ui.comment}>(置信度: {Math.round(profile.confidence * 100)}%)</Text>
              </Text>
            </Box>
          </Box>

          {/* Capabilities */}
          <Box marginTop={1} flexDirection="column">
            <Text bold color={theme.text.primary}>
              智能提炼的核心能力与方法论矩阵:
            </Text>
            {profile.coreCapabilities.map((cap) => (
              <Box key={cap} marginLeft={2}>
                <Text color={theme.status.success}>• </Text>
                <Text color={theme.text.primary}>{cap}</Text>
              </Box>
            ))}
          </Box>

          {/* Tools Preflight */}
          {preflightReport && (
            <Box marginTop={1} flexDirection="column">
              <Text bold color={theme.text.primary}>
                关联环境与本机工具就绪状态:
              </Text>
              <Box marginLeft={2} flexDirection="column">
                {preflightReport.readyTools.map((t) => (
                  <Text key={t.name} color={theme.status.success}>
                    ✓ {t.name}: {t.detail}
                  </Text>
                ))}
                {preflightReport.missingTools.map((t) => (
                  <Text key={t.name} color={theme.status.warning}>
                    ! {t.name} (缺席 - {t.hint})
                  </Text>
                ))}
              </Box>
            </Box>
          )}

          <Box marginTop={1} flexDirection="column" borderStyle="single" borderTop={true} borderBottom={false} borderLeft={false} borderRight={false} borderColor={theme.border.default}>
            <Text bold color={theme.text.primary}>
              是否以此技能为专项上下文，开启「专属特殊会话 (Special Session)」？
            </Text>
            <Box marginTop={1} flexDirection="column">
              <Text color={theme.status.success}>
                {'  ● [Y] 开启专属特殊会话并选择匹配的大模型 (Enter / Y)'}
              </Text>
              <Text color={theme.ui.comment}>
                {'  ○ [N] 保持当前常规对话上下文 (Esc / N)'}
              </Text>
            </Box>
          </Box>
        </Box>
      ) : (
        /* --- STEP 2: MODEL & REASONING EFFORT SELECTION --- */
        <Box flexDirection="column">
          <Box flexDirection="row" justifyContent="space-between">
            <Text bold color={theme.text.accent}>
              ✦ 选择特殊会话主控大模型与思考强度 (Step 2/2)
            </Text>
            <Text color={theme.text.secondary}>[上下键切模型，Tab 切换深度，Enter 启动]</Text>
          </Box>

          <Box marginTop={1} flexDirection="column">
            <Text color={theme.text.secondary}>
              领域推荐算力: {profile.recommendedModelTier}
            </Text>
          </Box>

          <Box marginTop={1} flexDirection="column">
            <Text bold color={theme.text.primary}>
              可用模型列表 (原生与已配置的外接供应商):
            </Text>
            {availableModels.map((m, idx) => {
              const isSelected = idx === selectedModelIdx;
              return (
                <Box key={m.id}>
                  <Text color={isSelected ? theme.status.success : theme.text.primary}>
                    {isSelected ? ' ▶ ' : '   '}
                    <Text bold>{m.name}</Text> <Text color={theme.ui.comment}>[{m.tag}]</Text>
                  </Text>
                </Box>
              );
            })}
          </Box>

          <Box marginTop={1} flexDirection="column">
            <Box>
              <Text bold color={theme.text.primary}>
                当前推理思考强度 (Reasoning Effort):{' '}
              </Text>
              <Text bold color={theme.status.success}>
                [{effort.toUpperCase()}]
              </Text>
              <Text color={theme.text.secondary}> (按 Tab 键循环切换: low &gt; medium &gt; high &gt; xhigh &gt; max)</Text>
            </Box>
          </Box>

          <Box marginTop={1} borderStyle="single" borderTop={true} borderBottom={false} borderLeft={false} borderRight={false} borderColor={theme.border.default}>
            <Text color={theme.status.success} bold>
              按 Enter 立即初始化特殊会话，挂载全套领域规范与工具链！
            </Text>
          </Box>
        </Box>
      )}
    </Box>
  );
};
