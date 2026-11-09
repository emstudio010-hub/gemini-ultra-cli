/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Box, Text } from 'ink';
import {
  suggestSkillTags,
  saveSkillWithTags,
  type SkillDomainProfile,
} from '@google/gemini-cli-core';
import { useKeypress } from '../hooks/useKeypress.js';
import { theme } from '../semantic-colors.js';

interface SkillOnboardingDialogProps {
  skillName: string;
  skillContent: string;
  sourceLocation?: string;
  onConfirmTagging: (savedPath: string, tags: string[]) => void;
  onPassThroughNative: () => void;
  onClose: () => void;
}

export const SkillOnboardingDialog: React.FC<SkillOnboardingDialogProps> = ({
  skillName,
  skillContent,
  sourceLocation,
  onConfirmTagging,
  onPassThroughNative,
  onClose,
}) => {
  const [selectedAction, setSelectedAction] = useState<0 | 1>(0);

  const { tags, domainProfile }: { tags: string[]; domainProfile: SkillDomainProfile } =
    suggestSkillTags(skillName, skillContent);

  useKeypress(
    (key) => {
      if (key.name === 'escape') {
        onClose();
        return true;
      }
      if (key.name === 'y') {
        const savedPath = saveSkillWithTags({
          name: skillName,
          body: skillContent,
          description: domainProfile.domainLabel,
          tags,
        });
        onConfirmTagging(savedPath, tags);
        return true;
      }
      if (key.name === 'n') {
        onPassThroughNative();
        return true;
      }
      if (key.name === 'up' || key.name === 'down') {
        setSelectedAction((prev) => (prev === 0 ? 1 : 0));
        return true;
      }
      if (key.name === 'return') {
        if (selectedAction === 0) {
          const savedPath = saveSkillWithTags({
            name: skillName,
            body: skillContent,
            description: domainProfile.domainLabel,
            tags,
          });
          onConfirmTagging(savedPath, tags);
        } else {
          onPassThroughNative();
        }
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
          ✦ 发现未入库新技能 (New Skill Detected)
        </Text>
        <Text color={theme.text.secondary}>[按 Y / N 或上下键回车选择，Esc 关闭]</Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Box>
          <Text bold color={theme.text.primary}>
            技能标识:{' '}
          </Text>
          <Text bold color={theme.status.success}>
            [{skillName}]
          </Text>
          {sourceLocation && (
            <Text color={theme.text.secondary}> (来源: {sourceLocation})</Text>
          )}
        </Box>
        <Box>
          <Text color={theme.text.primary}>
            领域归属: <Text bold color={theme.text.accent}>{domainProfile.domainLabel}</Text>{' '}
            <Text color={theme.text.secondary}>{domainProfile.badge}</Text>
          </Text>
        </Box>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text bold color={theme.text.primary}>
          系统自动智能分析推荐标签:
        </Text>
        <Box marginLeft={2} flexDirection="row" flexWrap="wrap">
          {tags.map((t) => (
            <Box key={t} marginRight={1}>
              <Text color={theme.status.success} bold>
                {t}
              </Text>
            </Box>
          ))}
        </Box>
      </Box>

      <Box marginTop={1} flexDirection="column" borderStyle="single" borderTop={true} borderBottom={false} borderLeft={false} borderRight={false} borderColor={theme.border.default}>
        <Text bold color={theme.text.primary}>
          请选择处理策略:
        </Text>
        <Box marginTop={1} flexDirection="column">
          <Text color={selectedAction === 0 ? theme.status.success : theme.text.primary}>
            {selectedAction === 0 ? '  ● ' : '  ○ '}
            <Text bold>[Y] 加载标签并永久入库</Text> (持久化至用户技能库，挂载全套领域规范与工具链)
          </Text>
          <Text color={selectedAction === 1 ? theme.status.success : theme.text.primary}>
            {selectedAction === 1 ? '  ● ' : '  ○ '}
            <Text bold>[N] 不加标签，原生透传直接调用</Text> (保持当前会话内存直接读取，不修改全局技能库)
          </Text>
        </Box>
      </Box>
    </Box>
  );
};
