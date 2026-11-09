/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Box, Text } from 'ink';
import {
  ProviderManager,
  type ProviderProtocol,
  type ExternalProviderProfile,
} from '@google/gemini-cli-core';
import { useKeypress } from '../hooks/useKeypress.js';
import { theme } from '../semantic-colors.js';

interface ProviderConfigDialogProps {
  onClose: () => void;
}

type Step = 'list' | 'input-name' | 'input-url' | 'input-key' | 'select-protocol' | 'select-model' | 'input-image-model';

export const ProviderConfigDialog: React.FC<ProviderConfigDialogProps> = ({ onClose }) => {
  const mgr = ProviderManager.getInstance();
  const [providers, setProviders] = useState<ExternalProviderProfile[]>(() => mgr.listProviders());
  const [selectedProviderIdx, setSelectedProviderIdx] = useState(0);

  const [step, setStep] = useState<Step>(() => (providers.length === 0 ? 'input-name' : 'list'));

  // Form states for adding/editing
  const [formName, setFormName] = useState('');
  const [formUrl, setFormUrl] = useState('');
  const [formKey, setFormKey] = useState('');
  const [formProtocol, setFormProtocol] = useState<ProviderProtocol>('openai-chat');
  const [fetchedModels, setFetchedModels] = useState<string[]>([]);
  const [selectedModelIdx, setSelectedModelIdx] = useState(0);
  const [customModelInput, setCustomModelInput] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [pendingModel, setPendingModel] = useState('');
  const [imageModelInput, setImageModelInput] = useState('');

  const protocols: Array<{ id: ProviderProtocol; label: string; desc: string }> = [
    {
      id: 'openai-chat',
      label: 'Chat (OpenAI /v1/chat/completions 兼容)',
      desc: '支持 OpenAI, DeepSeek, Grok, GLM/ZCode, vLLM, OneAPI',
    },
    {
      id: 'openai-responses',
      label: 'Responses (OpenAI /v1/responses 兼容)',
      desc: '支持 OpenAI Responses 与最新 Codex 协议端点',
    },
    {
      id: 'anthropic',
      label: 'Messages (Anthropic /v1/messages 兼容)',
      desc: '支持 Claude 原生端点或兼容代理',
    },
    {
      id: 'gemini',
      label: 'Gemini (Google GenAI 兼容)',
      desc: '支持 Google 官方端点或第三方 Gemini Gateway 镜像',
    },
  ];

  const [protocolIdx, setProtocolIdx] = useState(0);

  const handleFetchModels = async (baseUrl: string, apiKey: string, protocol: ProviderProtocol) => {
    setStatusMessage('正在连接端点探测可用模型列表...');
    try {
      const res = await mgr.fetchModelsFromEndpoint({ baseUrl, apiKey, protocol, timeoutMs: 6000 });
      if (res.models && res.models.length > 0) {
        setFetchedModels(res.models);
        setStatusMessage(`成功拉取到 ${res.models.length} 个模型，可直接选择或在下方手填`);
      } else {
        setFetchedModels(['default-model']);
        setStatusMessage(res.error ? `提示: ${res.error} (请直接手动输入模型名)` : '未检测到公共模型列表，请手动输入模型名');
      }
    } catch (err: any) {
      setFetchedModels(['default-model']);
      setStatusMessage(`连接完成，请手动输入模型名 (${err.message})`);
    }
    setStep('select-model');
  };

  const handleSaveProvider = (chosenModel?: string, imageModel?: string) => {
    const finalModel = (chosenModel || customModelInput.trim() || fetchedModels[selectedModelIdx] || 'default-model').trim();
    const finalModels = Array.from(new Set([finalModel, ...fetchedModels].filter(Boolean)));

    const profile = mgr.upsertProvider({
      name: formName.trim() || 'CustomProvider',
      baseUrl: formUrl.trim(),
      apiKey: formKey.trim(),
      protocol: formProtocol,
      models: finalModels,
      defaultModel: finalModel,
      imageModels: imageModel ? [imageModel] : undefined,
      defaultImageModel: imageModel || undefined,
      setActive: true,
    });

    setProviders(mgr.listProviders());
    setStatusMessage(`✓ 供应商 [${profile.name}] 已成功保存并设为当前活跃接口！`);
    setStep('list');
  };

  useKeypress(
    (key) => {
      if (key.name === 'escape') {
        if (step !== 'list' && providers.length > 0) {
          setStep('list');
          return true;
        }
        onClose();
        return true;
      }

      // --- 1. LIST VIEW ---
      if (step === 'list') {
        if (key.name === 'up') {
          setSelectedProviderIdx((prev) => (prev > 0 ? prev - 1 : providers.length - 1));
          return true;
        }
        if (key.name === 'down') {
          setSelectedProviderIdx((prev) => (prev < providers.length - 1 ? prev + 1 : 0));
          return true;
        }
        if (key.name === 'return') {
          const chosen = providers[selectedProviderIdx];
          if (chosen) {
            mgr.setActiveSelection(chosen.id, chosen.defaultModel);
            onClose();
          }
          return true;
        }
        if (key.name === 'a' || key.name === 'n') {
          setFormName('');
          setFormUrl('');
          setFormKey('');
          setStep('input-name');
          return true;
        }
        if (key.name === 'd') {
          const chosen = providers[selectedProviderIdx];
          if (chosen) {
            mgr.removeProvider(chosen.id);
            const updated = mgr.listProviders();
            setProviders(updated);
            if (selectedProviderIdx >= updated.length) {
              setSelectedProviderIdx(Math.max(0, updated.length - 1));
            }
          }
          return true;
        }
        return false;
      }

      // --- 2. INPUT NAME ---
      if (step === 'input-name') {
        if (key.name === 'return') {
          if (formName.trim()) setStep('input-url');
          return true;
        }
        if (key.name === 'backspace') {
          setFormName((prev) => prev.slice(0, -1));
          return true;
        }
        if (key.sequence && !key.ctrl) {
          const pasted = key.sequence.replace(/[\r\n\x1b]/g, '').replace(/\[20[01]~/g, '');
          if (pasted) setFormName((prev) => prev + pasted);
          return true;
        }
      }

      // --- 3. INPUT URL ---
      if (step === 'input-url') {
        if (key.name === 'return') {
          if (formUrl.trim()) setStep('input-key');
          return true;
        }
        if (key.name === 'backspace') {
          setFormUrl((prev) => prev.slice(0, -1));
          return true;
        }
        if (key.sequence && !key.ctrl) {
          const pasted = key.sequence.replace(/[\r\n\x1b]/g, '').replace(/\[20[01]~/g, '');
          if (pasted) setFormUrl((prev) => prev + pasted);
          return true;
        }
      }

      // --- 4. INPUT KEY ---
      if (step === 'input-key') {
        if (key.name === 'return') {
          setStep('select-protocol');
          return true;
        }
        if (key.name === 'backspace') {
          setFormKey((prev) => prev.slice(0, -1));
          return true;
        }
        if (key.sequence && !key.ctrl) {
          const pasted = key.sequence.replace(/[\r\n\x1b]/g, '').replace(/\[20[01]~/g, '');
          if (pasted) setFormKey((prev) => prev + pasted);
          return true;
        }
      }

      // --- 5. SELECT PROTOCOL ---
      if (step === 'select-protocol') {
        if (key.name === 'up') {
          setProtocolIdx((prev) => (prev > 0 ? prev - 1 : protocols.length - 1));
          return true;
        }
        if (key.name === 'down') {
          setProtocolIdx((prev) => (prev < protocols.length - 1 ? prev + 1 : 0));
          return true;
        }
        if (key.name === 'return') {
          const chosenProto = protocols[protocolIdx].id;
          setFormProtocol(chosenProto);
          void handleFetchModels(formUrl, formKey, chosenProto);
          return true;
        }
      }

      // --- 6. SELECT / INPUT MODEL ---
      if (step === 'select-model') {
        if (key.name === 'up') {
          setSelectedModelIdx((prev) => (prev > 0 ? prev - 1 : fetchedModels.length - 1));
          return true;
        }
        if (key.name === 'down') {
          setSelectedModelIdx((prev) => (prev < fetchedModels.length - 1 ? prev + 1 : 0));
          return true;
        }
        if (key.name === 'return') {
          setPendingModel(
            customModelInput.trim() ||
              fetchedModels[selectedModelIdx] ||
              'default-model',
          );
          setImageModelInput('');
          setStep('input-image-model');
          return true;
        }
        if (key.name === 'backspace') {
          setCustomModelInput((prev) => prev.slice(0, -1));
          return true;
        }
        if (key.sequence && !key.ctrl) {
          const pasted = key.sequence.replace(/[\r\n\x1b]/g, '').replace(/\[20[01]~/g, '');
          if (pasted) setCustomModelInput((prev) => prev + pasted);
          return true;
        }
      }

      // --- 7. OPTIONAL IMAGE MODEL ---
      if (step === 'input-image-model') {
        if (key.name === 'return') {
          handleSaveProvider(pendingModel, imageModelInput.trim() || undefined);
          setCustomModelInput('');
          return true;
        }
        if (key.name === 'backspace') {
          setImageModelInput((prev) => prev.slice(0, -1));
          return true;
        }
        if (key.sequence && !key.ctrl) {
          const pasted = key.sequence.replace(/[\r\n\x1b]/g, '').replace(/\[20[01]~/g, '');
          if (pasted) setImageModelInput((prev) => prev + pasted);
          return true;
        }
      }

      return false;
    },
    { isActive: true },
  );

  const activeProvider = mgr.getActiveProvider();
  const windowStart = Math.max(
    0,
    Math.min(selectedModelIdx - 3, fetchedModels.length - 7),
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
          ✦ 外接供应商管理 (Provider Setup)
        </Text>
        <Text color={theme.text.secondary}>[Esc 退出/返回]</Text>
      </Box>

      {statusMessage && (
        <Box marginTop={1}>
          <Text color={theme.status.success}>{statusMessage}</Text>
        </Box>
      )}

      {/* --- LIST VIEW --- */}
      {step === 'list' && (
        <Box marginTop={1} flexDirection="column">
          <Text color={theme.text.primary} bold>
            当前配置的供应商列表 (上下移动选择激活，按 A/N 新增，按 D 删除):
          </Text>
          <Box marginTop={1} flexDirection="column">
            {providers.map((p, idx) => {
              const isSelected = idx === selectedProviderIdx;
              const isActive = p.id === activeProvider?.id;
              return (
                <Box key={p.id} flexDirection="column">
                  <Text color={isSelected ? theme.status.success : theme.text.primary}>
                    {isSelected ? ' ▶ ' : '   '}
                    <Text bold>{p.name}</Text> ({p.protocol})
                    {isActive ? ' ★ [当前激活]' : ''}
                  </Text>
                  <Box marginLeft={5}>
                    <Text color={theme.text.secondary}>
                      端点: {p.baseUrl} │ 默认模型: {p.defaultModel || '未设定'} │ 共 {p.models.length} 个模型
                    </Text>
                  </Box>
                </Box>
              );
            })}
          </Box>
          <Box marginTop={1} flexDirection="column">
            <Text color={theme.ui.comment}>
              提示: 按回车即激活所选供应商；按 A 或 N 增加新的 BaseURL / API Key。
            </Text>
          </Box>
        </Box>
      )}

      {/* --- STEP 1: NAME --- */}
      {step === 'input-name' && (
        <Box marginTop={1} flexDirection="column">
          <Text bold color={theme.text.primary}>
            步骤 1/4: 输入供应商名称 (Provider Name)
          </Text>
          <Text color={theme.text.secondary}>例如: DeepSeek, GrokBuild, ZCode, OpenRouter 等</Text>
          <Box marginTop={1}>
            <Text color={theme.text.accent}>&gt; </Text>
            <Text color={theme.text.primary}>{formName}</Text>
            <Text color={theme.text.secondary}>_</Text>
          </Box>
          <Box marginTop={1}>
            <Text color={theme.ui.comment}>(输入完毕后按 Enter 进入下一步)</Text>
          </Box>
        </Box>
      )}

      {/* --- STEP 2: URL --- */}
      {step === 'input-url' && (
        <Box marginTop={1} flexDirection="column">
          <Text bold color={theme.text.primary}>
            步骤 2/4: 输入 API 端点 Base URL
          </Text>
          <Text color={theme.text.secondary}>例如: https://api.openai.com/v1 或 https://api.deepseek.com/v1</Text>
          <Box marginTop={1}>
            <Text color={theme.text.accent}>&gt; </Text>
            <Text color={theme.text.primary}>{formUrl}</Text>
            <Text color={theme.text.secondary}>_</Text>
          </Box>
          <Box marginTop={1}>
            <Text color={theme.ui.comment}>(输入完毕后按 Enter 进入下一步)</Text>
          </Box>
        </Box>
      )}

      {/* --- STEP 3: API KEY --- */}
      {step === 'input-key' && (
        <Box marginTop={1} flexDirection="column">
          <Text bold color={theme.text.primary}>
            步骤 3/4: 输入 API Key (密钥将安全保存在本机 ~/.gemini/ultra-providers.json)
          </Text>
          <Box marginTop={1}>
            <Text color={theme.text.accent}>&gt; </Text>
            <Text color={theme.text.primary}>
              {formKey.length > 6 ? `${formKey.slice(0, 4)}...${formKey.slice(-3)}` : formKey}
            </Text>
            <Text color={theme.text.secondary}>_</Text>
          </Box>
          <Box marginTop={1}>
            <Text color={theme.ui.comment}>(输入完毕后按 Enter 选择协议)</Text>
          </Box>
        </Box>
      )}

      {/* --- STEP 4: PROTOCOL --- */}
      {step === 'select-protocol' && (
        <Box marginTop={1} flexDirection="column">
          <Text bold color={theme.text.primary}>
            步骤 4/4: 选择下发请求所使用的协议规范 (Protocol)
          </Text>
          <Box marginTop={1} flexDirection="column">
            {protocols.map((proto, idx) => {
              const isSelected = idx === protocolIdx;
              return (
                <Box key={proto.id} flexDirection="column">
                  <Text color={isSelected ? theme.status.success : theme.text.primary}>
                    {isSelected ? ' ● ' : ' ○ '}
                    <Text bold>{proto.label}</Text>
                  </Text>
                  <Box marginLeft={4}>
                    <Text color={theme.text.secondary}>{proto.desc}</Text>
                  </Box>
                </Box>
              );
            })}
          </Box>
          <Box marginTop={1}>
            <Text color={theme.ui.comment}>(方向键选择，按 Enter 探测端点模型)</Text>
          </Box>
        </Box>
      )}

      {/* --- STEP 5: SELECT / ENTER MODEL --- */}
      {step === 'select-model' && (
        <Box marginTop={1} flexDirection="column">
          <Text bold color={theme.text.primary}>
            完成配置: 选择或手动指定默认模型 (Default Model)
          </Text>
          {fetchedModels.length > 0 && (
            <Box marginTop={1} flexDirection="column">
              <Text color={theme.text.secondary}>端点模型列表 (上下键选择):</Text>
              {fetchedModels
                .map((m, idx) => ({ m, idx }))
                .slice(windowStart, windowStart + 7)
                .map(({ m, idx }) => {
                const isSelected = idx === selectedModelIdx && !customModelInput;
                return (
                  <Box key={m}>
                    <Text color={isSelected ? theme.status.success : theme.text.primary}>
                      {isSelected ? ' ▶ ' : '   '}
                      {m}
                    </Text>
                  </Box>
                );
              })}
            </Box>
          )}

          <Box marginTop={1} flexDirection="column">
            <Text color={theme.text.secondary}>或手动输入自定义模型名:</Text>
            <Box>
              <Text color={theme.text.accent}>&gt; </Text>
              <Text color={theme.text.primary}>{customModelInput}</Text>
              <Text color={theme.text.secondary}>_</Text>
            </Box>
          </Box>

          <Box marginTop={1}>
            <Text color={theme.status.success} bold>
              (按 Enter 进入下一步：可选生图模型)
            </Text>
          </Box>
        </Box>
      )}

      {/* --- STEP 6: OPTIONAL IMAGE MODEL --- */}
      {step === 'input-image-model' && (
        <Box marginTop={1} flexDirection="column">
          <Text bold color={theme.text.primary}>
            可选: 为该供应商配置生图模型 (如 dall-e-3 / flux-1 / imagen-3.0-generate-002)
          </Text>
          <Box marginTop={1}>
            <Text color={theme.text.accent}>&gt; </Text>
            <Text color={theme.text.primary}>{imageModelInput}</Text>
            <Text color={theme.text.secondary}>_</Text>
          </Box>
          <Box marginTop={1}>
            <Text color={theme.status.success} bold>
              (留空直接 Enter 跳过并保存；填写后 Enter 保存并启用生图)
            </Text>
          </Box>
        </Box>
      )}
    </Box>
  );
};
