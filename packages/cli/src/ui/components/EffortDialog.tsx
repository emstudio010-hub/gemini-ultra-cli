/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Box, Text } from 'ink';
import {
  ProviderManager,
  type ReasoningEffortLevel,
} from '@google/gemini-cli-core';
import { useKeypress } from '../hooks/useKeypress.js';
import { theme } from '../semantic-colors.js';

interface EffortDialogProps {
  onClose: () => void;
}

interface EffortOption {
  level: ReasoningEffortLevel;
  title: string;
  desc: string;
}

const EFFORT_OPTIONS: EffortOption[] = [
  {
    level: 'low',
    title: 'low (轻快思考)',
    desc: '耗时极短，轻量展开思维链，适合快速问答与语法修正',
  },
  {
    level: 'medium',
    title: 'medium (均衡推理)',
    desc: '平衡思考深度与响应延迟，推荐用于日常代码审查与标准重构',
  },
  {
    level: 'high',
    title: 'high (深度思考 · 推荐)',
    desc: '充分展开长思维链，深入分析全流程上下文、边界条件与潜在风险',
  },
  {
    level: 'xhigh',
    title: 'xhigh (极高强度)',
    desc: '拓展超大思考预算，专门攻坚复杂架构重构、反混淆与逆向分析',
  },
  {
    level: 'max',
    title: 'max (穷尽推理)',
    desc: '穷尽所有推导路径与安全防御分支，适用于高危红队演练与底层攻防',
  },
  {
    level: 'ultra',
    title: 'ultra (终极 · 多代理协同)',
    desc: '最大思考预算 + 自动调度并行子代理 (spawn_subagents) 多角度求解与交叉验证，耗时与消耗最高',
  },
];

export const EffortDialog: React.FC<EffortDialogProps> = ({ onClose }) => {
  const mgr = ProviderManager.getInstance();
  const currentLevel = mgr.getReasoningEffort();

  const initialIdx = Math.max(
    0,
    EFFORT_OPTIONS.findIndex((o) => o.level === currentLevel),
  );
  const [selectedIdx, setSelectedIdx] = useState(initialIdx);

  useKeypress(
    (key) => {
      if (key.name === 'escape') {
        onClose();
        return true;
      }
      if (key.name === 'up') {
        setSelectedIdx((prev) => (prev > 0 ? prev - 1 : EFFORT_OPTIONS.length - 1));
        return true;
      }
      if (key.name === 'down') {
        setSelectedIdx((prev) => (prev < EFFORT_OPTIONS.length - 1 ? prev + 1 : 0));
        return true;
      }
      if (key.name === 'return') {
        const chosen = EFFORT_OPTIONS[selectedIdx];
        if (chosen) {
          mgr.setReasoningEffort(chosen.level);
        }
        onClose();
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
      <Box flexDirection="row" justifyContent="space-between">
        <Text bold color={theme.text.accent}>
          ✦ 思考推理强度配置 (Reasoning Effort)
        </Text>
        <Text color={theme.text.secondary}>[上下键选择，Enter 确认，Esc 关闭]</Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        {EFFORT_OPTIONS.map((opt, idx) => {
          const isSelected = idx === selectedIdx;
          const isCurrent = opt.level === currentLevel;
          return (
            <Box key={opt.level} flexDirection="column" marginTop={idx > 0 ? 1 : 0}>
              <Box flexDirection="row">
                <Text color={isSelected ? theme.status.success : theme.text.primary}>
                  {isSelected ? ' ▶ ' : '   '}
                  <Text bold>{opt.title}</Text>
                  {isCurrent ? <Text color={theme.text.accent}> ★ [当前生效]</Text> : null}
                </Text>
              </Box>
              <Box marginLeft={5}>
                <Text color={theme.text.secondary}>{opt.desc}</Text>
              </Box>
            </Box>
          );
        })}
      </Box>

      <Box marginTop={1} borderStyle="single" borderTop={true} borderBottom={false} borderLeft={false} borderRight={false} borderColor={theme.border.default}>
        <Text color={theme.ui.comment}>
          注: 该设置将通过 reasoning_effort (OpenAI) / thinking (Anthropic) 协议动态注入下游所有生成请求。
        </Text>
      </Box>
    </Box>
  );
};
