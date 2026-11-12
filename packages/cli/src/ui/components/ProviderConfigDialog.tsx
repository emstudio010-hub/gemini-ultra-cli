/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useState, useRef, useEffect } from 'react';
import { Box, Text } from 'ink';
import {
  ProviderManager,
  type ProviderProtocol,
  type ExternalProviderProfile,
  I18nManager,
} from '@google/gemini-cli-core';
import { useKeypress } from '../hooks/useKeypress.js';
import { theme } from '../semantic-colors.js';
import { useLocale } from '../hooks/useLocale.js';

function isEnter(key: { name?: string; sequence?: string }): boolean {
  return (
    key.name === 'return' ||
    key.name === 'enter' ||
    key.sequence === '\r' ||
    key.sequence === '\n' ||
    key.sequence === '\r\n'
  );
}

interface ProviderConfigDialogProps {
  onClose: () => void;
}

type MenuPage =
  | 'main-menu'
  | 'list-activate'
  | 'edit-basics'
  | 'select-protocol-option'
  | 'select-models-checklist'
  | 'edit-image-model'
  | 'edit-output-limit'
  | 'edit-context-window'
  | 'select-reasoning-replay'
  | 'confirm-delete';

const PROTOCOLS: Array<{ id: ProviderProtocol; name: string; desc: string }> = [
  {
    id: 'openai-chat',
    name: '1. Chat 协议 (/v1/chat/completions)',
    desc: '推荐！通用标准对话接口 (适用于 OpenAI, DeepSeek, Grok, GLM, OneAPI, vLLM 等几乎所有平台)',
  },
  {
    id: 'openai-responses',
    name: '2. Responses 协议 (/v1/responses)',
    desc: '最新 OpenAI Responses 与 Codex 专用流式端点',
  },
  {
    id: 'anthropic',
    name: '3. Anthropic Messages 协议 (/v1/messages)',
    desc: '适用于 Claude 官方 API 端点或第三方兼容中转代理',
  },
  {
    id: 'gemini',
    name: '4. Gemini 官方/镜像协议 (Google GenAI)',
    desc: '适用于 Google 官方 generativelanguage.googleapis.com 或第三方反代镜像',
  },
];

const REASONING_REPLAY_MODES = ['auto', 'on', 'off'] as const;

export const ProviderConfigDialog: React.FC<ProviderConfigDialogProps> = ({
  onClose,
}) => {
  const mgr = ProviderManager.getInstance();
  const i18n = I18nManager.getInstance();
  const locale = useLocale();
  const t = (zh: string, en: string) => (locale === 'zh' ? zh : en);

  const [providers, setProviders] = useState<ExternalProviderProfile[]>(() =>
    mgr.listProviders(),
  );
  const activeProvider = mgr.getActiveProvider();

  const [page, setPage] = useState<MenuPage>(() =>
    providers.length === 0 ? 'edit-basics' : 'main-menu',
  );
  const [mainMenuCursor, setMainMenuCursor] = useState(0);

  // Focus provider
  const [focusedProviderId, setFocusedProviderId] = useState<string | null>(
    () => activeProvider?.id || providers[0]?.id || null,
  );
  const focusedProvider =
    providers.find((p) => p.id === focusedProviderId) || providers[0];

  // List cursors
  const [listCursor, setListCursor] = useState(0);
  const [protocolCursor, setProtocolCursor] = useState(0);

  // Form buffer
  const [formName, setFormName] = useState('');
  const [formUrl, setFormUrl] = useState('');
  const [formKey, setFormKey] = useState('');
  const [formField, setFormField] = useState<'name' | 'url' | 'key'>('name');

  // Model checklist buffer
  const [modelPool, setModelPool] = useState<string[]>([]);
  const [selectedModelsSet, setSelectedModelsSet] = useState<Set<string>>(
    new Set(),
  );
  const [modelCursor, setModelCursor] = useState(0);
  const [customModelInput, setCustomModelInput] = useState('');
  const [isFetching, setIsFetching] = useState(false);

  // Image model buffer
  const [imageModelInput, setImageModelInput] = useState('');
  const [outputLimitInput, setOutputLimitInput] = useState('');
  const [reasoningReplayCursor, setReasoningReplayCursor] = useState(0);

  const [statusMessage, setStatusMessage] = useState('');
  const [editingProviderId, setEditingProviderId] = useState<string | null>(
    null,
  );
  const catalogRequest = useRef<AbortController | undefined>(undefined);
  useEffect(() => () => catalogRequest.current?.abort(), []);

  const mainMenuItems = [
    {
      id: 'switch-active',
      label: t(
        '1. [切换当前激活供应商] - 选择哪个供应商作为当前会话的核心后端',
        '1. [Switch Active Provider] - Select which provider to use',
      ),
    },
    {
      id: 'quick-protocol',
      label: t(
        '2. [切换通信协议] - 随时将端点在 Chat / Responses / Anthropic / Gemini 之间变更',
        '2. [Change Wire Protocol] - Switch between Chat / Responses / Anthropic / Gemini',
      ),
    },
    {
      id: 'pick-models',
      label: t(
        '3. [挑选可用模型清单] - 多选勾选模型、一键全选或手动追加自定义模型',
        '3. [Pick Model Catalog] - Multi-select, select all, or type custom models',
      ),
    },
    {
      id: 'edit-params',
      label: t(
        '4. [修改端点与密钥参数] - 修改供应商名称、Base URL 端点地址与 API Key',
        '4. [Edit Endpoint & Key] - Modify provider name, baseUrl, and apiKey',
      ),
    },
    {
      id: 'edit-image',
      label: t(
        '5. [配置生图模型] - 指定该端点的 DALL-E / Flux / Recraft / Imagen 生图模型',
        '5. [Configure Image Model] - Set image generation model',
      ),
    },
    {
      id: 'add-new',
      label: t(
        '6. [添加新的外接供应商] - 录入一个新的大模型供应商配置',
        '6. [Add New Provider] - Register a new provider',
      ),
    },
    {
      id: 'delete',
      label: t(
        '7. [删除当前供应商] - 从配置文件中移除当前选中的供应商',
        '7. [Delete Provider] - Remove provider from configuration',
      ),
    },
    {
      id: 'lang',
      label: t(
        `8. [切换界面语言] - 当前: ${locale === 'zh' ? '简体中文' : 'English'}`,
        `8. [Toggle Language] - Current: ${locale.toUpperCase()}`,
      ),
    },
    {
      id: 'edit-output-limit',
      label: t(
        '9. [输出上限] - 设置生成的 Token 上限，留空使用默认值',
        '9. [Output Limit] - Set output token limit, empty for default',
      ),
    },
    {
      id: 'reasoning-replay',
      label: t(
        '10. [推理续接] - 为 Chat 工具对话保留原始推理内容',
        '10. [Reasoning Replay] - Preserve reasoning for Chat tool conversations',
      ),
    },
    {
      id: 'edit-context-window',
      label: t(
        '11. [上下文容量] - 按供应商实际容量调整自动压缩与用量提示',
        '11. [Context Window] - Set capacity for compression and usage display',
      ),
    },
    {
      id: 'exit',
      label: t('12. [保存并返回终端]', '12. [Save and Return to Terminal]'),
    },
  ];

  const startEditBasics = (prov?: ExternalProviderProfile) => {
    catalogRequest.current?.abort();
    setEditingProviderId(prov?.id || null);
    setModelPool([]);
    setSelectedModelsSet(new Set());
    setCustomModelInput('');
    if (prov) {
      setFormName(prov.name);
      setFormUrl(prov.baseUrl);
      setFormKey(prov.apiKey);
    } else {
      setFormName('');
      setFormUrl('');
      setFormKey('');
    }
    setFormField('name');
    setPage('edit-basics');
  };

  const handleFetchModels = async (
    baseUrl: string,
    apiKey: string,
    protocol: ProviderProtocol,
  ) => {
    catalogRequest.current?.abort();
    const controller = new AbortController();
    catalogRequest.current = controller;
    setIsFetching(true);
    setStatusMessage(
      t('正在向端点 /models 请求模型列表...', 'Fetching /models catalog...'),
    );
    try {
      const res = await mgr.fetchModelsFromEndpoint({
        baseUrl,
        apiKey,
        protocol,
        timeoutMs: 7000,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      if (res.models && res.models.length > 0) {
        const unique = Array.from(new Set(res.models));
        setModelPool(unique);
        setSelectedModelsSet(new Set(unique));
        setStatusMessage(
          t(
            `已加载 ${unique.length} 个模型。空格勾选，Ctrl+A 全选。`,
            `Loaded ${unique.length} models. Space to toggle, Ctrl+A for all.`,
          ),
        );
      } else {
        setStatusMessage(
          res.error
            ? t(`提示：${res.error}`, `Notice: ${res.error}`)
            : t(
                '端点未返回模型，请在下方手动输入模型名称',
                'No models returned, please type manually below',
              ),
        );
      }
    } catch (e: unknown) {
      if (!controller.signal.aborted)
        setStatusMessage(
          t('拉取失败：', 'Request failed: ') +
            (e instanceof Error ? e.message : String(e)),
        );
    } finally {
      if (catalogRequest.current === controller) setIsFetching(false);
    }
  };

  useKeypress(
    (key) => {
      try {
        // ------------------------------------------------------------------
        // ESC navigation: back to previous menu, only exit on top menu
        // ------------------------------------------------------------------
        if (key.name === 'escape') {
          catalogRequest.current?.abort();
          setIsFetching(false);
          if (page === 'main-menu') {
            onClose();
            return true;
          }
          setPage('main-menu');
          return true;
        }

        // ------------------------------------------------------------------
        // 1. MAIN MENU
        // ------------------------------------------------------------------
        if (page === 'main-menu') {
          if (key.name === 'up') {
            setMainMenuCursor((p) =>
              p > 0 ? p - 1 : mainMenuItems.length - 1,
            );
            return true;
          }
          if (key.name === 'down') {
            setMainMenuCursor((p) =>
              p < mainMenuItems.length - 1 ? p + 1 : 0,
            );
            return true;
          }
          if (isEnter(key)) {
            const selected = mainMenuItems[mainMenuCursor].id;
            if (selected === 'switch-active') {
              setListCursor(
                Math.max(
                  0,
                  providers.findIndex((p) => p.id === activeProvider?.id),
                ),
              );
              setPage('list-activate');
            } else if (selected === 'quick-protocol') {
              if (!focusedProvider) {
                setStatusMessage(
                  t('请先添加供应商！', 'Please add a provider first!'),
                );
                return true;
              }
              setProtocolCursor(
                Math.max(
                  0,
                  PROTOCOLS.findIndex((p) => p.id === focusedProvider.protocol),
                ),
              );
              setEditingProviderId(focusedProvider.id);
              setPage('select-protocol-option');
            } else if (selected === 'pick-models') {
              if (!focusedProvider) return true;
              setModelPool(focusedProvider.models || []);
              setEditingProviderId(focusedProvider.id);
              setSelectedModelsSet(new Set(focusedProvider.models || []));
              setCustomModelInput('');
              setPage('select-models-checklist');
            } else if (selected === 'edit-params') {
              if (!focusedProvider) return true;
              startEditBasics(focusedProvider);
            } else if (selected === 'edit-image') {
              if (!focusedProvider) return true;
              setImageModelInput(focusedProvider.defaultImageModel || '');
              setPage('edit-image-model');
            } else if (selected === 'add-new') {
              startEditBasics();
            } else if (selected === 'edit-output-limit') {
              if (!focusedProvider) return true;
              setOutputLimitInput(
                focusedProvider.maxOutputTokens?.toString() ?? '',
              );
              setStatusMessage('');
              setPage('edit-output-limit');
            } else if (selected === 'edit-context-window') {
              if (!focusedProvider) return true;
              setOutputLimitInput(
                focusedProvider.contextWindow?.toString() ?? '',
              );
              setStatusMessage('');
              setPage('edit-context-window');
            } else if (selected === 'delete') {
              if (focusedProvider) setPage('confirm-delete');
            } else if (selected === 'lang') {
              i18n.toggleLocale();
            } else if (selected === 'reasoning-replay') {
              if (!focusedProvider) return true;
              setReasoningReplayCursor(
                REASONING_REPLAY_MODES.indexOf(
                  focusedProvider.reasoningReplay ?? 'auto',
                ),
              );
              setStatusMessage('');
              setPage('select-reasoning-replay');
            } else if (selected === 'exit') {
              onClose();
            }
            return true;
          }
          return false;
        }

        // ------------------------------------------------------------------
        // 2. LIST AND ACTIVATE
        // ------------------------------------------------------------------
        if (page === 'list-activate') {
          if (key.name === 'up') {
            setListCursor((p) => (p > 0 ? p - 1 : providers.length - 1));
            return true;
          }
          if (key.name === 'down') {
            setListCursor((p) => (p < providers.length - 1 ? p + 1 : 0));
            return true;
          }
          if (isEnter(key)) {
            const prov = providers[listCursor];
            if (prov) {
              mgr.setActiveSelection(prov.id, prov.defaultModel);
              setFocusedProviderId(prov.id);
              setStatusMessage(
                t(
                  `✓ 已将 [${prov.name}] 设为当前激活供应商！`,
                  `✓ Activated provider: [${prov.name}]`,
                ),
              );
              setPage('main-menu');
            }
            return true;
          }
          return false;
        }

        // ------------------------------------------------------------------
        // 3. EDIT BASICS: NAME, URL, API KEY
        // ------------------------------------------------------------------
        if (page === 'edit-basics') {
          if (key.name === 'tab') {
            setFormField((prev) =>
              prev === 'name' ? 'url' : prev === 'url' ? 'key' : 'name',
            );
            return true;
          }
          if (isEnter(key)) {
            if (formField === 'name') {
              if (formName.trim()) setFormField('url');
            } else if (formField === 'url') {
              if (formUrl.trim()) setFormField('key');
            } else {
              if (editingProviderId && focusedProvider) {
                mgr.upsertProvider({
                  id: editingProviderId,
                  name: formName.trim() || focusedProvider.name,
                  baseUrl: formUrl.trim() || focusedProvider.baseUrl,
                  apiKey: formKey.trim() || focusedProvider.apiKey,
                  protocol: focusedProvider.protocol,
                  models: focusedProvider.models,
                  defaultModel: focusedProvider.defaultModel,
                  imageModels: focusedProvider.imageModels,
                  defaultImageModel: focusedProvider.defaultImageModel,
                  setActive: activeProvider?.id === focusedProvider.id,
                });
                setProviders(mgr.listProviders());
                setStatusMessage(
                  t(
                    '✓ 基础参数修改已保存！',
                    '✓ Parameters updated successfully!',
                  ),
                );
                setPage('main-menu');
              } else {
                setProtocolCursor(0);
                setPage('select-protocol-option');
              }
            }
            return true;
          }
          if (key.name === 'backspace') {
            if (formField === 'name') setFormName((p) => p.slice(0, -1));
            else if (formField === 'url') setFormUrl((p) => p.slice(0, -1));
            else setFormKey((p) => p.slice(0, -1));
            return true;
          }
          if (key.sequence && !key.ctrl) {
            const pasted = key.sequence
              .replaceAll('\x1b', '')
              .replace(/[\r\n]/g, '')
              .replace(/\[20[01]~/g, '');
            if (pasted) {
              if (formField === 'name') setFormName((p) => p + pasted);
              else if (formField === 'url') setFormUrl((p) => p + pasted);
              else setFormKey((p) => p + pasted);
            }
            return true;
          }
          return false;
        }

        // ------------------------------------------------------------------
        // 4. PROTOCOL OPTION SELECTION (Radio List)
        // ------------------------------------------------------------------
        if (page === 'select-protocol-option') {
          if (key.name === 'up') {
            setProtocolCursor((p) => (p > 0 ? p - 1 : PROTOCOLS.length - 1));
            return true;
          }
          if (key.name === 'down') {
            setProtocolCursor((p) => (p < PROTOCOLS.length - 1 ? p + 1 : 0));
            return true;
          }
          if (isEnter(key)) {
            const chosen = PROTOCOLS[protocolCursor].id;
            if (editingProviderId && focusedProvider) {
              mgr.upsertProvider({
                id: editingProviderId,
                name: focusedProvider.name,
                baseUrl: focusedProvider.baseUrl,
                apiKey: focusedProvider.apiKey,
                protocol: chosen,
                models: focusedProvider.models,
                defaultModel: focusedProvider.defaultModel,
                imageModels: focusedProvider.imageModels,
                defaultImageModel: focusedProvider.defaultImageModel,
                setActive: activeProvider?.id === focusedProvider.id,
              });
              setProviders(mgr.listProviders());
              setStatusMessage(
                t(
                  `✓ 协议已更新为: ${chosen}`,
                  `✓ Protocol updated to: ${chosen}`,
                ),
              );
              setPage('main-menu');
            } else {
              setPage('select-models-checklist');
              void handleFetchModels(formUrl, formKey, chosen);
            }
            return true;
          }
          return false;
        }

        // ------------------------------------------------------------------
        // 5. MODEL CHECKLIST (Multi-select, Select All, Custom)
        // ------------------------------------------------------------------
        if (page === 'select-models-checklist') {
          if (key.name === 'up') {
            setModelCursor((p) =>
              p > 0 ? p - 1 : Math.max(0, modelPool.length - 1),
            );
            return true;
          }
          if (key.name === 'down') {
            setModelCursor((p) => (p < modelPool.length - 1 ? p + 1 : 0));
            return true;
          }
          if (key.name === 'space' || key.sequence === ' ') {
            const cur = modelPool[modelCursor];
            if (cur) {
              setSelectedModelsSet((prev) => {
                const next = new Set(prev);
                if (next.has(cur)) next.delete(cur);
                else next.add(cur);
                return next;
              });
            }
            return true;
          }
          if (key.ctrl && key.name === 'a') {
            if (
              selectedModelsSet.size === modelPool.length &&
              modelPool.length > 0
            ) {
              setSelectedModelsSet(new Set());
            } else {
              setSelectedModelsSet(new Set(modelPool));
            }
            return true;
          }
          if (key.name === 'backspace') {
            setCustomModelInput((p) => p.slice(0, -1));
            return true;
          }
          if (isEnter(key)) {
            const finalModels = [
              ...customModelInput.split(/[,\s]+/).filter(Boolean),
              ...selectedModelsSet,
            ];
            const cleanModels = Array.from(
              new Set(finalModels.filter(Boolean)),
            );
            if (cleanModels.length === 0) {
              setStatusMessage(
                t(
                  '请选择或输入至少一个模型。',
                  'Select or enter at least one model.',
                ),
              );
              return true;
            }
            const targetProv = editingProviderId
              ? mgr.getProvider(editingProviderId)
              : undefined;

            if (targetProv) {
              mgr.upsertProvider({
                id: targetProv.id,
                name: targetProv.name,
                baseUrl: targetProv.baseUrl,
                apiKey: targetProv.apiKey,
                protocol: targetProv.protocol,
                models: cleanModels,
                defaultModel:
                  targetProv.defaultModel &&
                  cleanModels.includes(targetProv.defaultModel)
                    ? targetProv.defaultModel
                    : cleanModels[0],
                imageModels: targetProv.imageModels,
                defaultImageModel: targetProv.defaultImageModel,
                setActive: activeProvider?.id === targetProv.id,
              });
              setProviders(mgr.listProviders());
              setStatusMessage(
                t(
                  `✓ 模型配置完成，已保留 ${cleanModels.length} 个模型！`,
                  `✓ Models saved: ${cleanModels.length} selected!`,
                ),
              );
              setPage('main-menu');
            } else {
              const newP = mgr.upsertProvider({
                name: formName.trim() || 'CustomProvider',
                baseUrl: formUrl.trim(),
                apiKey: formKey.trim(),
                protocol: PROTOCOLS[protocolCursor].id,
                models: cleanModels,
                defaultModel: cleanModels[0],
                setActive: true,
              });
              setProviders(mgr.listProviders());
              setFocusedProviderId(newP.id);
              setStatusMessage(
                t(
                  `✓ 供应商 [${newP.name}] 创建成功并激活！`,
                  `✓ Provider [${newP.name}] created & activated!`,
                ),
              );
              setPage('main-menu');
            }
            return true;
          }
          if (key.sequence && !key.ctrl && key.sequence !== ' ') {
            const pasted = key.sequence
              .replaceAll('\x1b', '')
              .replace(/[\r\n]/g, '')
              .replace(/\[20[01]~/g, '');
            if (pasted) setCustomModelInput((p) => p + pasted);
            return true;
          }
          return false;
        }

        // ------------------------------------------------------------------
        // Reasoning replay is a provider compatibility setting.
        // ------------------------------------------------------------------
        if (page === 'select-reasoning-replay') {
          if (key.name === 'up' || key.name === 'down') {
            setReasoningReplayCursor(
              (p) => (p + (key.name === 'up' ? 2 : 1)) % 3,
            );
            return true;
          }
          if (isEnter(key) && focusedProvider) {
            mgr.upsertProvider({
              ...focusedProvider,
              reasoningReplay: REASONING_REPLAY_MODES[reasoningReplayCursor],
              setActive: activeProvider?.id === focusedProvider.id,
            });
            setProviders(mgr.listProviders());
            setStatusMessage(
              t('✓ 推理续接已更新。', '✓ Reasoning replay updated.'),
            );
            setPage('main-menu');
            return true;
          }
          return false;
        }

        // ------------------------------------------------------------------
        // Output limit is optional and does not add a step to provider creation.
        // ------------------------------------------------------------------
        if (page === 'edit-output-limit' || page === 'edit-context-window') {
          if (isEnter(key)) {
            const value = outputLimitInput.trim();
            const limit = value ? Number(value) : undefined;
            if (
              value &&
              (!/^[0-9]+$/.test(value) ||
                !Number.isSafeInteger(limit) ||
                Number(value) <= 0)
            ) {
              setStatusMessage(
                t(
                  '请输入正整数，或留空使用默认值。',
                  'Enter a positive integer, or leave empty for default.',
                ),
              );
              return true;
            }
            if (focusedProvider) {
              mgr.upsertProvider({
                ...focusedProvider,
                ...(page === 'edit-context-window'
                  ? { contextWindow: limit }
                  : { maxOutputTokens: limit }),
                setActive: activeProvider?.id === focusedProvider.id,
              });
              setProviders(mgr.listProviders());
              setStatusMessage(
                page === 'edit-context-window'
                  ? t('✓ 上下文容量已更新。', '✓ Context window updated.')
                  : t('✓ 输出上限已更新。', '✓ Output limit updated.'),
              );
              setPage('main-menu');
            }
            return true;
          }
          if (key.name === 'backspace') {
            setOutputLimitInput((p) => p.slice(0, -1));
            setStatusMessage('');
            return true;
          }
          if (key.sequence && !key.ctrl) {
            const pasted = key.sequence
              .replaceAll('\x1b', '')
              .replace(/[\r\n]/g, '')
              .replace(/\[20[01]~/g, '');
            if (pasted) {
              setOutputLimitInput((p) => p + pasted);
              setStatusMessage('');
            }
            return true;
          }
          return false;
        }

        // ------------------------------------------------------------------
        // 6. EDIT IMAGE MODEL
        // ------------------------------------------------------------------
        if (page === 'edit-image-model') {
          if (isEnter(key)) {
            if (focusedProvider) {
              mgr.upsertProvider({
                id: focusedProvider.id,
                name: focusedProvider.name,
                baseUrl: focusedProvider.baseUrl,
                apiKey: focusedProvider.apiKey,
                protocol: focusedProvider.protocol,
                models: focusedProvider.models,
                defaultModel: focusedProvider.defaultModel,
                imageModels: imageModelInput.trim()
                  ? [imageModelInput.trim()]
                  : [],
                defaultImageModel: imageModelInput.trim() || undefined,
                setActive: activeProvider?.id === focusedProvider.id,
              });
              setProviders(mgr.listProviders());
              setStatusMessage(
                t('✓ 生图模型设置已更新！', '✓ Image model updated!'),
              );
              setPage('main-menu');
            }
            return true;
          }
          if (key.name === 'backspace') {
            setImageModelInput((p) => p.slice(0, -1));
            return true;
          }
          if (key.sequence && !key.ctrl) {
            const pasted = key.sequence
              .replaceAll('\x1b', '')
              .replace(/[\r\n]/g, '')
              .replace(/\[20[01]~/g, '');
            if (pasted) setImageModelInput((p) => p + pasted);
            return true;
          }
          return false;
        }

        // ------------------------------------------------------------------
        // 7. CONFIRM DELETE
        // ------------------------------------------------------------------
        if (page === 'confirm-delete') {
          if (isEnter(key)) {
            if (focusedProvider) {
              mgr.removeProvider(focusedProvider.id);
              const updated = mgr.listProviders();
              setProviders(updated);
              setFocusedProviderId(updated[0]?.id || null);
              setStatusMessage(
                t(
                  `✓ 已删除供应商 [${focusedProvider.name}]`,
                  `✓ Deleted provider [${focusedProvider.name}]`,
                ),
              );
              setPage('main-menu');
            }
            return true;
          }
          return false;
        }

        return false;
      } catch (error) {
        setStatusMessage(
          t('配置未保存：', 'Configuration not saved: ') +
            (error instanceof Error ? error.message : String(error)),
        );
        return true;
      }
    },
    { isActive: true },
  );

  const windowStart = Math.max(
    0,
    Math.min(modelCursor - 3, modelPool.length - 8),
  );
  const protocolCopy = {
    'openai-chat': [
      'Chat protocol (/v1/chat/completions)',
      'Compatible with OpenAI, DeepSeek, Grok, GLM, vLLM and most gateways.',
    ],
    'openai-responses': [
      'Responses protocol (/v1/responses)',
      'OpenAI Responses and compatible coding endpoints.',
    ],
    anthropic: [
      'Anthropic Messages (/v1/messages)',
      'Native Claude endpoints and compatible gateways.',
    ],
    gemini: [
      'Gemini protocol (Google GenAI)',
      'Google Gemini endpoints and compatible mirrors.',
    ],
  };
  const windowedPool = modelPool.slice(windowStart, windowStart + 8);

  return (
    <Box
      borderStyle="round"
      borderColor={theme.border.default}
      flexDirection="column"
      padding={1}
      width="100%"
    >
      {/* Top Header */}
      <Box flexDirection="row" justifyContent="space-between" marginBottom={1}>
        <Box flexDirection="row">
          <Text bold color={theme.text.accent}>
            ✦ Gemini-Ultra-CLI{' '}
          </Text>
          <Text color={theme.text.secondary}>
            {page === 'main-menu' &&
              t('› 供应商核心配置菜单', '› Provider Configuration Menu')}
            {page === 'list-activate' &&
              t('› 选择激活目标供应商', '› Switch Active Provider')}
            {page === 'edit-basics' &&
              t('› 端点与密钥参数录入', '› Endpoint & Key')}
            {page === 'select-protocol-option' &&
              t('› 切换通信协议', '› Select Wire Protocol')}
            {page === 'select-models-checklist' &&
              t('› 模型清单多选勾选', '› Model Checklist')}
            {page === 'edit-image-model' &&
              t('› 生图模型参数设置', '› Image Generation Model')}
            {page === 'edit-output-limit' && t('› 输出上限', '› Output Limit')}
            {page === 'edit-context-window' &&
              t('› 上下文容量', '› Context Window')}
            {page === 'select-reasoning-replay' &&
              t('› 推理续接', '› Reasoning Replay')}
            {page === 'confirm-delete' &&
              t('› 确认删除供应商', '› Confirm Deletion')}
          </Text>
        </Box>
        <Box flexDirection="row">
          <Text color={theme.ui.comment}>[{locale.toUpperCase()}] </Text>
          <Text color={theme.text.secondary}>
            [Esc: {t('返回/退出', 'Back/Exit')}]
          </Text>
        </Box>
      </Box>

      {statusMessage ? (
        <Box
          marginBottom={1}
          paddingX={1}
          borderStyle="single"
          borderColor={theme.border.default}
        >
          <Text
            color={
              page === 'edit-output-limit'
                ? theme.status.error
                : theme.status.success
            }
          >
            {statusMessage}
          </Text>
        </Box>
      ) : null}

      {/* PAGE 1: MAIN MENU */}
      {page === 'main-menu' && (
        <Box flexDirection="column">
          <Box
            borderStyle="round"
            borderColor={theme.text.accent}
            flexDirection="column"
            paddingX={1}
            marginBottom={1}
          >
            <Box flexDirection="row" justifyContent="space-between">
              <Text bold color={theme.text.accent}>
                {t('当前配置目标:', 'Active Target:')}{' '}
                {focusedProvider ? focusedProvider.name : t('未配置', 'None')}
              </Text>
              <Text color={theme.status.success}>
                {focusedProvider && activeProvider?.id === focusedProvider.id
                  ? t('[当前使用中]', '[ACTIVE]')
                  : ''}
              </Text>
            </Box>
            {focusedProvider && (
              <Text color={theme.text.secondary}>
                {t('通信协议:', 'Protocol:')}{' '}
                <Text bold color={theme.status.success}>
                  {focusedProvider.protocol}
                </Text>
                {'  |  '}
                {t('端点:', 'Endpoint:')} {focusedProvider.baseUrl}
                {'  |  '}
                {t('已选模型:', 'Models:')}{' '}
                {focusedProvider.models?.length || 0} {t('个', '')}
              </Text>
            )}
          </Box>

          <Box marginBottom={1}>
            <Text bold color={theme.text.primary}>
              {t(
                '请使用键盘上下键选择操作选项，按 Enter 回车执行:',
                'Please use Up/Down arrow keys to select option, press Enter:',
              )}
            </Text>
          </Box>

          {mainMenuItems.map((item, idx) => {
            const isCursor = idx === mainMenuCursor;
            return (
              <Box
                key={item.id}
                flexDirection="row"
                paddingLeft={1}
                marginY={0}
              >
                <Text
                  bold={isCursor}
                  color={isCursor ? theme.status.success : theme.text.primary}
                >
                  {isCursor ? '▶ ' : '  '}
                  {item.label}
                </Text>
              </Box>
            );
          })}

          <Box
            marginTop={1}
            paddingX={1}
            borderStyle="single"
            borderColor={theme.border.default}
          >
            <Text color={theme.ui.comment}>
              {t(
                '【操作指南】所有配置均走选项式菜单，回车修改并立即保存。按 [Esc] 可直接退出并返回控制台。',
                '[Guide] Menu & options driven, press Enter to modify & save. Press [Esc] to exit.',
              )}
            </Text>
          </Box>
        </Box>
      )}

      {/* PAGE 2: LIST AND ACTIVATE */}
      {page === 'list-activate' && (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text bold color={theme.text.primary}>
              {t(
                '请选择要激活为全局后端的供应商 (回车确定):',
                'Select provider to activate as global backend:',
              )}
            </Text>
          </Box>
          {providers.map((p, idx) => {
            const isCursor = idx === listCursor;
            const isActive = activeProvider?.id === p.id;
            return (
              <Box key={p.id} flexDirection="row" paddingLeft={1}>
                <Text
                  bold={isCursor}
                  color={isCursor ? theme.status.success : theme.text.primary}
                >
                  {isCursor ? '▶ ' : '  '}
                  {isActive ? '(*) ' : '( ) '}
                  {p.name} ({p.protocol}) - {p.baseUrl}
                  {isActive ? (
                    <Text color={theme.status.success}>
                      {' '}
                      [{t('生效中', 'Active')}]
                    </Text>
                  ) : null}
                </Text>
              </Box>
            );
          })}
          <Box marginTop={1}>
            <Text color={theme.ui.comment}>
              {t(
                '[↑/↓] 移动光标 | [Enter] 确认激活 | [Esc] 返回主菜单',
                '[Up/Down] Move | [Enter] Activate | [Esc] Back',
              )}
            </Text>
          </Box>
        </Box>
      )}

      {/* PAGE 3: PROTOCOL OPTIONS */}
      {page === 'select-protocol-option' && (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text bold color={theme.text.primary}>
              {t(
                '请选择该供应商使用的通信协议 (回车即可完成修改并保存):',
                'Select wire protocol (Press Enter to apply & save):',
              )}
            </Text>
          </Box>

          {PROTOCOLS.map((p, idx) => {
            const isCursor = idx === protocolCursor;
            const isCurrent = focusedProvider?.protocol === p.id;
            return (
              <Box
                key={p.id}
                flexDirection="column"
                paddingLeft={1}
                marginY={0}
              >
                <Text
                  bold={isCursor}
                  color={isCursor ? theme.status.success : theme.text.primary}
                >
                  {isCursor ? '▶ ' : '  '}
                  {isCurrent ? '(*) ' : '( ) '}
                  {locale === 'zh' ? p.name : protocolCopy[p.id][0]}
                  {isCurrent ? (
                    <Text color={theme.status.success}>
                      {' '}
                      [{t('当前协议', 'Current')}]
                    </Text>
                  ) : null}
                </Text>
                <Box paddingLeft={4}>
                  <Text color={theme.text.secondary} dimColor>
                    {locale === 'zh' ? p.desc : protocolCopy[p.id][1]}
                  </Text>
                </Box>
              </Box>
            );
          })}

          <Box marginTop={1}>
            <Text color={theme.ui.comment}>
              {t(
                '【提示】切换为 Chat 协议后将调用标准的 /chat/completions。按 [Enter] 保存生效，按 [Esc] 返回。',
                '[Tip] Chat protocol uses standard /chat/completions. Press [Enter] to save, [Esc] to cancel.',
              )}
            </Text>
          </Box>
        </Box>
      )}

      {/* PAGE 4: MODEL CHECKLIST */}
      {page === 'select-models-checklist' && (
        <Box flexDirection="column">
          <Box flexDirection="row" justifyContent="space-between">
            <Text bold color={theme.text.primary}>
              {t(
                '空格勾选，Ctrl+A 全选或清空',
                'Space to toggle, Ctrl+A for all or none',
              )}
            </Text>
            <Text bold color={theme.status.success}>
              {selectedModelsSet.size}/{modelPool.length}{' '}
              {t('已勾选', 'selected')}
            </Text>
          </Box>

          {isFetching ? (
            <Box paddingY={1}>
              <Text color={theme.text.accent}>
                {t('正在连接端点抓取模型清单...', 'Fetching model list...')}
              </Text>
            </Box>
          ) : (
            <Box flexDirection="column" marginTop={1}>
              {modelPool.length === 0 ? (
                <Text color={theme.ui.comment}>
                  {t(
                    '尚未拉取到模型列表，请直接在下方手动输入常用模型名',
                    'No remote models detected, type below:',
                  )}
                </Text>
              ) : (
                windowedPool.map((m) => {
                  const isChecked = selectedModelsSet.has(m);
                  const isCursor = modelPool[modelCursor] === m;
                  return (
                    <Box key={m} flexDirection="row">
                      <Text
                        color={
                          isCursor ? theme.status.success : theme.text.primary
                        }
                      >
                        {isCursor ? '▶ ' : '  '}
                      </Text>
                      <Text
                        bold={isChecked}
                        color={
                          isChecked
                            ? theme.status.success
                            : theme.text.secondary
                        }
                      >
                        [{isChecked ? '✓' : ' '}] {m}
                      </Text>
                    </Box>
                  );
                })
              )}
            </Box>
          )}

          {/* Custom model typing */}
          <Box marginTop={1} flexDirection="column">
            <Text color={theme.text.secondary}>
              {t(
                '手动添加模型，多个名称用逗号分隔，回车保存：',
                'Add model names separated by commas, then press Enter:',
              )}
            </Text>
            <Box>
              <Text color={theme.text.accent}>&gt; </Text>
              <Text color={theme.text.primary}>{customModelInput}</Text>
              <Text color={theme.text.secondary}>_</Text>
            </Box>
          </Box>

          <Box
            marginTop={1}
            paddingX={1}
            borderStyle="single"
            borderColor={theme.border.default}
            flexDirection="row"
            justifyContent="space-between"
          >
            <Text color={theme.status.success}>
              [Space] {t('单项勾选/取消', 'Toggle Item')}
            </Text>
            <Text color={theme.text.accent}>
              [Ctrl+A] {t('全选 / 清空', 'Select all / Clear')}
            </Text>
            <Text color={theme.text.accent}>
              [Enter] {t('完成并保存模型', 'Save Models')}
            </Text>
            <Text color={theme.text.secondary}>[Esc] {t('返回', 'Back')}</Text>
          </Box>
        </Box>
      )}

      {/* PAGE 5: EDIT BASICS */}
      {page === 'edit-basics' && (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text bold color={theme.text.primary}>
              {focusedProvider
                ? t(
                    `修改基础参数: [${focusedProvider.name}]`,
                    `Edit: [${focusedProvider.name}]`,
                  )
                : t('添加新的外接供应商', 'Add New Provider')}
            </Text>
          </Box>

          <Box flexDirection="column" marginY={0}>
            <Text
              color={
                formField === 'name'
                  ? theme.status.success
                  : theme.text.secondary
              }
            >
              1. {t('供应商代号 / 名称 (Name):', 'Provider Name:')}
            </Text>
            <Box paddingLeft={2}>
              <Text
                color={
                  formField === 'name'
                    ? theme.status.success
                    : theme.text.primary
                }
              >
                {formField === 'name' ? '▶ ' : '  '}
                {formName}
                {formField === 'name' ? '_' : ''}
              </Text>
            </Box>
          </Box>

          <Box flexDirection="column" marginY={1}>
            <Text
              color={
                formField === 'url'
                  ? theme.status.success
                  : theme.text.secondary
              }
            >
              2.{' '}
              {t(
                'API Base URL (端点，如 https://api.openai.com/v1):',
                'API Base URL:',
              )}
            </Text>
            <Box paddingLeft={2}>
              <Text
                color={
                  formField === 'url'
                    ? theme.status.success
                    : theme.text.primary
                }
              >
                {formField === 'url' ? '▶ ' : '  '}
                {formUrl}
                {formField === 'url' ? '_' : ''}
              </Text>
            </Box>
          </Box>

          <Box flexDirection="column" marginY={0}>
            <Text
              color={
                formField === 'key'
                  ? theme.status.success
                  : theme.text.secondary
              }
            >
              3. {t('API Key (密钥，支持右键直接粘贴):', 'API Key:')}
            </Text>
            <Box paddingLeft={2}>
              <Text
                color={
                  formField === 'key'
                    ? theme.status.success
                    : theme.text.primary
                }
              >
                {formField === 'key' ? '▶ ' : '  '}
                {formKey ? `${formKey.slice(0, 6)}***${formKey.slice(-4)}` : ''}
                {formField === 'key' ? '_' : ''}
              </Text>
            </Box>
          </Box>

          <Box marginTop={1}>
            <Text color={theme.ui.comment}>
              {t(
                '[Tab] 切换输入栏 | [Enter] 保存/下一步 | [Esc] 取消返回',
                '[Tab] Switch field | [Enter] Save/Next | [Esc] Cancel',
              )}
            </Text>
          </Box>
        </Box>
      )}

      {/* PAGE 6: IMAGE MODEL */}
      {page === 'select-reasoning-replay' && (
        <Box flexDirection="column">
          <Text bold color={theme.text.primary}>
            {t('推理续接', 'Reasoning Replay')} · {focusedProvider?.name}
          </Text>
          <Text color={theme.text.secondary}>
            {t(
              '仅用于 Chat 工具对话，同一供应商与模型的原始推理不会混入最终正文。',
              'For Chat tool conversations. Original reasoning stays with its provider and model, separate from the final answer.',
            )}
          </Text>
          {REASONING_REPLAY_MODES.map((mode, index) => (
            <Text
              key={mode}
              bold={index === reasoningReplayCursor}
              color={
                index === reasoningReplayCursor
                  ? theme.status.success
                  : theme.text.primary
              }
            >
              {index === reasoningReplayCursor ? '▶ ' : '  '}
              {mode === 'auto'
                ? t('自动：识别 DeepSeek 模型', 'Auto: detect DeepSeek models')
                : mode === 'on'
                  ? t(
                      '启用：端点支持 reasoning_content',
                      'Enabled: endpoint supports reasoning_content',
                    )
                  : t(
                      '关闭：端点不接受推理回传',
                      'Disabled: endpoint rejects reasoning replay',
                    )}
            </Text>
          ))}
          <Text color={theme.ui.comment}>
            {t(
              '[↑/↓] 选择 | [Enter] 保存 | [Esc] 取消',
              '[↑/↓] Select | [Enter] Save | [Esc] Cancel',
            )}
          </Text>
        </Box>
      )}

      {(page === 'edit-output-limit' || page === 'edit-context-window') && (
        <Box flexDirection="column">
          <Text bold color={theme.text.primary}>
            {page === 'edit-context-window'
              ? t('上下文容量', 'Context Window')
              : t('输出上限', 'Output Limit')}{' '}
            · {focusedProvider?.name}
          </Text>
          <Text color={theme.text.secondary}>
            {page === 'edit-context-window'
              ? t(
                  '填写此供应商下模型共同适用的上下文 Token 容量，留空沿用默认值。',
                  'Enter a context token capacity suitable for all models on this provider; leave empty for default.',
                )
              : t(
                  '输入正整数 Token 数，留空沿用默认值。任务自己的上限优先。',
                  'Enter a positive token count, or leave empty for default. Task limits take priority.',
                )}
          </Text>
          <Text color={theme.text.secondary}>
            {page === 'edit-context-window'
              ? t(
                  '用于主 Agent、子 Agent 和自动压缩；不会扩大供应商的实际容量。',
                  'Used by main agents, subagents and compression; does not increase provider capacity.',
                )
              : t(
                  '可用上限取决于模型与供应商。',
                  'Available limits depend on the model and provider.',
                )}
          </Text>
          <Box marginTop={1}>
            <Text color={theme.text.accent}>&gt; </Text>
            <Text color={theme.text.primary}>{outputLimitInput}</Text>
            <Text color={theme.text.secondary}>_</Text>
          </Box>
          <Text color={theme.ui.comment}>
            {t('[Enter] 保存 | [Esc] 取消返回', '[Enter] Save | [Esc] Cancel')}
          </Text>
        </Box>
      )}

      {page === 'edit-image-model' && (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text bold color={theme.text.primary}>
              {t('生图模型配置:', 'Configure Image Model:')}
            </Text>
          </Box>
          <Text color={theme.text.secondary}>
            {t(
              '输入生图模型名称 (例如 dall-e-3 / flux-1 / recraft-v3 / imagen-3.0-generate-002):',
              'Type image model (e.g. dall-e-3 / flux-1 / recraft-v3):',
            )}
          </Text>
          <Box marginTop={1}>
            <Text color={theme.text.accent}>&gt; </Text>
            <Text color={theme.text.primary}>{imageModelInput}</Text>
            <Text color={theme.text.secondary}>_</Text>
          </Box>
          <Box marginTop={1}>
            <Text color={theme.status.success}>
              {t(
                '(按 Enter 确定保存，留空回车则清除生图模型)',
                '(Press Enter to save, empty to clear)',
              )}
            </Text>
          </Box>
        </Box>
      )}

      {/* PAGE 7: CONFIRM DELETE */}
      {page === 'confirm-delete' && (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text bold color={theme.status.error}>
              {t(
                `警告: 确定要删除供应商 [${focusedProvider?.name}] 吗？`,
                `Warning: Delete provider [${focusedProvider?.name}]?`,
              )}
            </Text>
          </Box>
          <Box marginTop={1}>
            <Text color={theme.status.error} bold>
              {t(
                '[Enter] 确认删除此供应商   |   [Esc] 取消并保留',
                '[Enter] Confirm Delete   |   [Esc] Cancel',
              )}
            </Text>
          </Box>
        </Box>
      )}
    </Box>
  );
};
