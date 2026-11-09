/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { Box, Text } from 'ink';
import {
  ProviderManager,
  type ProviderProtocol,
  type ExternalProviderProfile,
  I18nManager,
} from '@google/gemini-cli-core';
import { useKeypress } from '../hooks/useKeypress.js';
import { theme } from '../semantic-colors.js';

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

type Page =
  | 'overview'       // Claude Code style dashboard: provider cards, active status, shortcuts
  | 'edit-basics'    // Edit Name, Base URL, API Key
  | 'edit-protocol'  // Select/switch wire protocol
  | 'select-models'  // Multi-select / select-all / custom models
  | 'edit-image';    // Configure optional image generation model

const PROTOCOL_OPTIONS: Array<{ id: ProviderProtocol; label: string; descZh: string; descEn: string }> = [
  {
    id: 'openai-chat',
    label: 'Chat (OpenAI /v1/chat/completions)',
    descZh: '通用 Chat 接口 (OpenAI, DeepSeek, Grok, GLM, vLLM, OneAPI 等)',
    descEn: 'Standard chat completions (OpenAI, DeepSeek, Grok, GLM, OneAPI)',
  },
  {
    id: 'openai-responses',
    label: 'Responses (OpenAI /v1/responses)',
    descZh: '原生 Responses 与 Codex 协议端点',
    descEn: 'OpenAI Responses API & Codex-compatible endpoints',
  },
  {
    id: 'anthropic',
    label: 'Messages (Anthropic /v1/messages)',
    descZh: 'Claude 原生端点或兼容的反代服务',
    descEn: 'Native Anthropic Claude API or compatible proxies',
  },
  {
    id: 'gemini',
    label: 'Gemini (Google GenAI 原生/镜像)',
    descZh: 'Google 官方 / 第三方 Gemini Gateway 兼容镜像',
    descEn: 'Google GenAI official endpoint or third-party mirror',
  },
];

export const ProviderConfigDialog: React.FC<ProviderConfigDialogProps> = ({ onClose }) => {
  const mgr = ProviderManager.getInstance();
  const i18n = I18nManager.getInstance();
  const [locale, setLocale] = useState(i18n.getLocale());

  const t = (zh: string, en: string) => (locale === 'zh' ? zh : en);

  const [providers, setProviders] = useState<ExternalProviderProfile[]>(() => mgr.listProviders());
  const [selectedProviderIdx, setSelectedProviderIdx] = useState(0);

  const [page, setPage] = useState<Page>(() => (providers.length === 0 ? 'edit-basics' : 'overview'));

  // Edit form state
  const [editProviderId, setEditProviderId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formUrl, setFormUrl] = useState('');
  const [formKey, setFormKey] = useState('');
  const [formField, setFormField] = useState<'name' | 'url' | 'key'>('name');

  const [formProtocol, setFormProtocol] = useState<ProviderProtocol>('openai-chat');
  const [protocolCursor, setProtocolCursor] = useState(0);

  // Model selection state
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [selectedModelsSet, setSelectedModelsSet] = useState<Set<string>>(new Set());
  const [modelCursor, setModelCursor] = useState(0);
  const [customModelInput, setCustomModelInput] = useState('');
  const [isFetchingModels, setIsFetchingModels] = useState(false);

  // Image model state
  const [imageModelInput, setImageModelInput] = useState('');

  const [statusMessage, setStatusMessage] = useState('');

  const currentSelectedProvider = providers[selectedProviderIdx];

  // Load a provider into editing buffer
  const startEditing = (provider?: ExternalProviderProfile) => {
    if (provider) {
      setEditProviderId(provider.id);
      setFormName(provider.name);
      setFormUrl(provider.baseUrl);
      setFormKey(provider.apiKey);
      setFormProtocol(provider.protocol);
      setProtocolCursor(Math.max(0, PROTOCOL_OPTIONS.findIndex((p) => p.id === provider.protocol)));
      setAvailableModels(provider.models || []);
      setSelectedModelsSet(new Set(provider.models || []));
      setImageModelInput(provider.defaultImageModel || '');
    } else {
      setEditProviderId(null);
      setFormName('');
      setFormUrl('');
      setFormKey('');
      setFormProtocol('openai-chat');
      setProtocolCursor(0);
      setAvailableModels([]);
      setSelectedModelsSet(new Set());
      setImageModelInput('');
    }
    setFormField('name');
    setCustomModelInput('');
    setPage('edit-basics');
  };

  const handleFetchEndpointModels = async (baseUrl: string, apiKey: string, proto: ProviderProtocol) => {
    setIsFetchingModels(true);
    setStatusMessage(t('正在连接端点拉取模型列表...', 'Fetching models from endpoint...'));
    try {
      const res = await mgr.fetchModelsFromEndpoint({ baseUrl, apiKey, protocol: proto, timeoutMs: 7000 });
      if (res.models && res.models.length > 0) {
        // deduplicate and clean
        const unique = Array.from(new Set(res.models));
        setAvailableModels(unique);
        setSelectedModelsSet(new Set(unique)); // default all selected, user can uncheck with Space or A
        setStatusMessage(
          t(`拉取到 ${unique.length} 个模型！[Space] 勾选/反选，[A] 全选/全消`, `Fetched ${unique.length} models. [Space] toggle, [A] select all`)
        );
      } else {
        setStatusMessage(res.error ? `提示: ${res.error}` : t('未返回模型列表，请手动输入', 'No models found, enter manually'));
      }
    } catch (e: any) {
      setStatusMessage(`拉取失败: ${e.message}`);
    } finally {
      setIsFetchingModels(false);
    }
  };

  const commitSaveProvider = () => {
    const finalModelsList = Array.from(selectedModelsSet);
    if (customModelInput.trim()) {
      finalModelsList.unshift(customModelInput.trim());
    }
    const cleanModels = Array.from(new Set(finalModelsList.filter(Boolean)));
    const defModel = cleanModels[0] || 'default-model';

    const p = mgr.upsertProvider({
      name: formName.trim() || 'CustomProvider',
      baseUrl: formUrl.trim(),
      apiKey: formKey.trim(),
      protocol: formProtocol,
      models: cleanModels,
      defaultModel: defModel,
      imageModels: imageModelInput.trim() ? [imageModelInput.trim()] : undefined,
      defaultImageModel: imageModelInput.trim() || undefined,
      setActive: true,
    });

    const updated = mgr.listProviders();
    setProviders(updated);
    setStatusMessage(
      t(`✓ 供应商 [${p.name}] 已保存并激活 (协议: ${p.protocol}, 模型: ${cleanModels.length} 个)`,
        `✓ Provider [${p.name}] saved & activated (Protocol: ${p.protocol}, ${cleanModels.length} models)`)
    );
    setPage('overview');
  };

  // Quick switch protocol on existing provider without opening wizard
  const cycleProviderProtocol = (prov: ExternalProviderProfile) => {
    const currentIdx = PROTOCOL_OPTIONS.findIndex((p) => p.id === prov.protocol);
    const nextIdx = (currentIdx + 1) % PROTOCOL_OPTIONS.length;
    const nextProto = PROTOCOL_OPTIONS[nextIdx].id;

    mgr.upsertProvider({
      name: prov.name,
      baseUrl: prov.baseUrl,
      apiKey: prov.apiKey,
      protocol: nextProto,
      models: prov.models,
      defaultModel: prov.defaultModel,
      imageModels: prov.imageModels,
      defaultImageModel: prov.defaultImageModel,
      setActive: mgr.getActiveProvider()?.id === prov.id,
    });

    setProviders(mgr.listProviders());
    setStatusMessage(t(`✓ 已将 [${prov.name}] 协议切换为: ${nextProto}`, `✓ Switched [${prov.name}] protocol to: ${nextProto}`));
  };

  useKeypress(
    (key) => {
      // Global language toggle with [L] when not in text input
      if ((key.name === 'l' || key.sequence === 'l') && page === 'overview') {
        const next = i18n.toggleLocale();
        setLocale(next);
        return true;
      }

      // Escape navigation
      if (key.name === 'escape') {
        if (page !== 'overview' && providers.length > 0) {
          setPage('overview');
          return true;
        }
        onClose();
        return true;
      }

      // ========================================================
      // 1. OVERVIEW DASHBOARD (Claude Code Style)
      // ========================================================
      if (page === 'overview') {
        if (key.name === 'up') {
          setSelectedProviderIdx((prev) => (prev > 0 ? prev - 1 : Math.max(0, providers.length - 1)));
          return true;
        }
        if (key.name === 'down') {
          setSelectedProviderIdx((prev) => (prev < providers.length - 1 ? prev + 1 : 0));
          return true;
        }
        // Activate default
        if (isEnter(key)) {
          if (currentSelectedProvider) {
            mgr.setActiveSelection(currentSelectedProvider.id, currentSelectedProvider.defaultModel);
            onClose();
          }
          return true;
        }
        // [e] Edit
        if (key.name === 'e' || key.sequence === 'e') {
          if (currentSelectedProvider) {
            startEditing(currentSelectedProvider);
          }
          return true;
        }
        // [p] Quick cycle protocol (Chat <-> Responses <-> Anthropic <-> Gemini)
        if (key.name === 'p' || key.sequence === 'p') {
          if (currentSelectedProvider) {
            cycleProviderProtocol(currentSelectedProvider);
          }
          return true;
        }
        // [a] / [n] Add new provider
        if (key.name === 'a' || key.name === 'n' || key.sequence === 'a') {
          startEditing();
          return true;
        }
        // [m] Manage/Filter models
        if (key.name === 'm' || key.sequence === 'm') {
          if (currentSelectedProvider) {
            startEditing(currentSelectedProvider);
            setPage('select-models');
          }
          return true;
        }
        // [d] Delete provider
        if (key.name === 'd' || key.sequence === 'd') {
          if (currentSelectedProvider) {
            mgr.removeProvider(currentSelectedProvider.id);
            const upd = mgr.listProviders();
            setProviders(upd);
            setSelectedProviderIdx(Math.max(0, upd.length - 1));
          }
          return true;
        }
        return false;
      }

      // ========================================================
      // 2. EDIT BASICS: NAME, URL, API KEY
      // ========================================================
      if (page === 'edit-basics') {
        if (key.name === 'tab') {
          setFormField((prev) => (prev === 'name' ? 'url' : prev === 'url' ? 'key' : 'name'));
          return true;
        }
        if (isEnter(key)) {
          if (formField === 'name') {
            if (formName.trim()) setFormField('url');
          } else if (formField === 'url') {
            if (formUrl.trim()) setFormField('key');
          } else {
            // go to protocol
            setPage('edit-protocol');
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
          const pasted = key.sequence.replace(/[\r\n\x1b]/g, '').replace(/\[20[01]~/g, '');
          if (pasted) {
            if (formField === 'name') setFormName((p) => p + pasted);
            else if (formField === 'url') setFormUrl((p) => p + pasted);
            else setFormKey((p) => p + pasted);
          }
          return true;
        }
      }

      // ========================================================
      // 3. EDIT PROTOCOL SELECTION
      // ========================================================
      if (page === 'edit-protocol') {
        if (key.name === 'up') {
          setProtocolCursor((p) => (p > 0 ? p - 1 : PROTOCOL_OPTIONS.length - 1));
          return true;
        }
        if (key.name === 'down') {
          setProtocolCursor((p) => (p < PROTOCOL_OPTIONS.length - 1 ? p + 1 : 0));
          return true;
        }
        if (isEnter(key)) {
          const chosen = PROTOCOL_OPTIONS[protocolCursor].id;
          setFormProtocol(chosen);
          setPage('select-models');
          void handleFetchEndpointModels(formUrl, formKey, chosen);
          return true;
        }
      }

      // ========================================================
      // 4. SELECT MODELS (Multi-select, Select-all, Custom)
      // ========================================================
      if (page === 'select-models') {
        if (key.name === 'up') {
          setModelCursor((p) => (p > 0 ? p - 1 : Math.max(0, availableModels.length - 1)));
          return true;
        }
        if (key.name === 'down') {
          setModelCursor((p) => (p < availableModels.length - 1 ? p + 1 : 0));
          return true;
        }
        // [Space] Toggle single item selection
        if (key.name === 'space' || key.sequence === ' ') {
          const curModel = availableModels[modelCursor];
          if (curModel) {
            setSelectedModelsSet((prev) => {
              const next = new Set(prev);
              if (next.has(curModel)) next.delete(curModel);
              else next.add(curModel);
              return next;
            });
          }
          return true;
        }
        // [a] Toggle select all / unselect all
        if (key.name === 'a' || key.sequence === 'a') {
          if (selectedModelsSet.size === availableModels.length && availableModels.length > 0) {
            setSelectedModelsSet(new Set());
          } else {
            setSelectedModelsSet(new Set(availableModels));
          }
          return true;
        }
        // Custom model typing
        if (key.name === 'backspace') {
          setCustomModelInput((p) => p.slice(0, -1));
          return true;
        }
        // Enter -> Save or go to Image model
        if (isEnter(key)) {
          setPage('edit-image');
          return true;
        }
        if (key.sequence && !key.ctrl && key.sequence !== ' ') {
          const pasted = key.sequence.replace(/[\r\n\x1b]/g, '').replace(/\[20[01]~/g, '');
          if (pasted) setCustomModelInput((p) => p + pasted);
          return true;
        }
      }

      // ========================================================
      // 5. OPTIONAL IMAGE MODEL
      // ========================================================
      if (page === 'edit-image') {
        if (isEnter(key)) {
          commitSaveProvider();
          return true;
        }
        if (key.name === 'backspace') {
          setImageModelInput((p) => p.slice(0, -1));
          return true;
        }
        if (key.sequence && !key.ctrl) {
          const pasted = key.sequence.replace(/[\r\n\x1b]/g, '').replace(/\[20[01]~/g, '');
          if (pasted) setImageModelInput((p) => p + pasted);
          return true;
        }
      }

      return false;
    },
    { isActive: true },
  );

  const activeProvider = mgr.getActiveProvider();

  // Windowed model list for large catalogs
  const windowStart = Math.max(0, Math.min(modelCursor - 4, availableModels.length - 9));
  const windowedModels = availableModels.slice(windowStart, windowStart + 9);

  return (
    <Box
      borderStyle="round"
      borderColor={theme.border.default}
      flexDirection="column"
      padding={1}
      width="100%"
    >
      {/* --- HEADER & BREADCRUMB --- */}
      <Box flexDirection="row" justifyContent="space-between" borderBottom={false} marginBottom={1}>
        <Box flexDirection="row">
          <Text bold color={theme.text.accent}>✦ Gemini-Cli-Ultra </Text>
          <Text color={theme.text.secondary}>
            {page === 'overview' && t('› 供应商管理中心', '› Provider Dashboard')}
            {page === 'edit-basics' && t('› 基础配置与端点', '› Endpoint & Key')}
            {page === 'edit-protocol' && t('› 通信协议切换', '› Wire Protocol')}
            {page === 'select-models' && t('› 模型清单勾选', '› Model Selection')}
            {page === 'edit-image' && t('› 生图模型配置', '› Image Generation')}
          </Text>
        </Box>
        <Box flexDirection="row">
          <Text color={theme.ui.comment}>[L: {locale.toUpperCase()}] </Text>
          <Text color={theme.text.secondary}>[Esc: {t('返回/退出', 'Back/Exit')}]</Text>
        </Box>
      </Box>

      {statusMessage ? (
        <Box marginBottom={1} paddingX={1} borderStyle="single" borderColor={theme.border.default}>
          <Text color={theme.status.success}>{statusMessage}</Text>
        </Box>
      ) : null}

      {/* ========================================================
          PAGE 1: OVERVIEW DASHBOARD
         ======================================================== */}
      {page === 'overview' && (
        <Box flexDirection="column">
          <Text color={theme.text.secondary} marginBottom={1}>
            {t('已登记的外接模型供应商 (上下键高亮，按 Enter 激活生效):', 'Configured External Providers (Up/Down to navigate, Enter to activate):')}
          </Text>

          {providers.length === 0 ? (
            <Box paddingY={1}>
              <Text color={theme.ui.comment}>{t('尚未配置任何外接供应商。按 [a] 或 [n] 即可添加！', 'No providers configured yet. Press [a] to create one!')}</Text>
            </Box>
          ) : (
            providers.map((p, idx) => {
              const isSelected = idx === selectedProviderIdx;
              const isActive = activeProvider?.id === p.id;
              return (
                <Box
                  key={p.id}
                  flexDirection="column"
                  paddingX={1}
                  paddingY={0}
                  borderStyle={isSelected ? 'round' : undefined}
                  borderColor={isSelected ? theme.text.accent : undefined}
                >
                  <Box flexDirection="row" justifyContent="space-between">
                    <Box flexDirection="row">
                      <Text bold color={isSelected ? theme.text.accent : theme.text.primary}>
                        {isSelected ? '▶ ' : '  '}
                        {p.name}
                      </Text>
                      <Text color={theme.ui.comment}> ({p.protocol})</Text>
                      {isActive && <Text bold color={theme.status.success}> [{t('当前生效中', 'Active')}]</Text>}
                    </Box>
                    <Text color={theme.text.secondary}>
                      {p.models.length} {t('个模型', 'models')}
                    </Text>
                  </Box>
                  <Box paddingLeft={2}>
                    <Text color={theme.text.secondary} dimColor>
                      URL: {p.baseUrl} | Key: {p.apiKey ? `${p.apiKey.slice(0, 4)}***${p.apiKey.slice(-4)}` : 'none'}
                    </Text>
                  </Box>
                </Box>
              );
            })
          )}

          {/* Claude Code Style Action Bar */}
          <Box marginTop={1} flexDirection="column" borderStyle="single" borderColor={theme.border.default} paddingX={1}>
            <Text bold color={theme.text.primary}>{t('快捷指令操作栏:', 'Action Shortcuts:')}</Text>
            <Box flexDirection="row" justifyContent="space-between">
              <Text color={theme.text.accent}>[Enter] {t('激活选中', 'Activate')}</Text>
              <Text color={theme.status.success}>[e] {t('编辑配置', 'Edit')}</Text>
              <Text color="#f59e0b">[p] {t('就地切换协议', 'Switch Protocol')}</Text>
              <Text color="#38bdf8">[m] {t('多选模型', 'Pick Models')}</Text>
              <Text color={theme.text.accent}>[a] {t('新建', 'Add New')}</Text>
              <Text color={theme.status.error}>[d] {t('删除', 'Delete')}</Text>
            </Box>
          </Box>
        </Box>
      )}

      {/* ========================================================
          PAGE 2: EDIT BASICS
         ======================================================== */}
      {page === 'edit-basics' && (
        <Box flexDirection="column">
          <Text bold color={theme.text.primary} marginBottom={1}>
            {editProviderId ? t(`编辑供应商: ${formName}`, `Edit Provider: ${formName}`) : t('新建外接供应商', 'New Provider Setup')}
          </Text>

          {/* Name Field */}
          <Box flexDirection="column" marginY={0}>
            <Text color={formField === 'name' ? theme.text.accent : theme.text.secondary}>
              1. {t('供应商代号 / 名称 (Name):', 'Provider Name:')}
            </Text>
            <Box paddingLeft={2}>
              <Text color={formField === 'name' ? theme.status.success : theme.text.primary}>
                {formField === 'name' ? '▶ ' : '  '}
                {formName}
                {formField === 'name' ? '_' : ''}
              </Text>
            </Box>
          </Box>

          {/* URL Field */}
          <Box flexDirection="column" marginY={1}>
            <Text color={formField === 'url' ? theme.text.accent : theme.text.secondary}>
              2. {t('API Base URL (端点，如 https://api.openai.com/v1):', 'API Base URL (e.g. https://api.openai.com/v1):')}
            </Text>
            <Box paddingLeft={2}>
              <Text color={formField === 'url' ? theme.status.success : theme.text.primary}>
                {formField === 'url' ? '▶ ' : '  '}
                {formUrl}
                {formField === 'url' ? '_' : ''}
              </Text>
            </Box>
          </Box>

          {/* Key Field */}
          <Box flexDirection="column" marginY={0}>
            <Text color={formField === 'key' ? theme.text.accent : theme.text.secondary}>
              3. {t('API Key (密钥，支持右键直接粘贴):', 'API Key (paste supported):')}
            </Text>
            <Box paddingLeft={2}>
              <Text color={formField === 'key' ? theme.status.success : theme.text.primary}>
                {formField === 'key' ? '▶ ' : '  '}
                {formKey ? `${formKey.slice(0, 6)}***${formKey.slice(-4)}` : ''}
                {formField === 'key' ? '_' : ''}
              </Text>
            </Box>
          </Box>

          <Box marginTop={1}>
            <Text color={theme.ui.comment}>
              {t('[Tab] 切换输入栏 | [Enter] 下一步选择通信协议 | [Esc] 取消返回', '[Tab] Switch field | [Enter] Next: Protocol | [Esc] Cancel')}
            </Text>
          </Box>
        </Box>
      )}

      {/* ========================================================
          PAGE 3: EDIT PROTOCOL
         ======================================================== */}
      {page === 'edit-protocol' && (
        <Box flexDirection="column">
          <Text bold color={theme.text.primary} marginBottom={1}>
            {t('选择通信协议 (Wire Protocol):', 'Select Wire Protocol:')}
          </Text>

          {PROTOCOL_OPTIONS.map((opt, idx) => {
            const isCursor = idx === protocolCursor;
            const isCurrent = formProtocol === opt.id;
            return (
              <Box key={opt.id} flexDirection="column" marginY={0} paddingLeft={1}>
                <Text bold={isCursor} color={isCursor ? theme.text.accent : theme.text.primary}>
                  {isCursor ? '▶ ' : '  '}
                  {opt.label}
                  {isCurrent ? <Text color={theme.status.success}> ({t('当前', 'Selected')})</Text> : null}
                </Text>
                <Box paddingLeft={4}>
                  <Text color={theme.text.secondary} dimColor>
                    {locale === 'zh' ? opt.descZh : opt.descEn}
                  </Text>
                </Box>
              </Box>
            );
          })}

          <Box marginTop={1}>
            <Text color={theme.ui.comment}>
              {t('[↑/↓] 移动选择 | [Enter] 确认协议并探测拉取模型列表', '[Up/Down] Navigate | [Enter] Confirm & fetch model catalog')}
            </Text>
          </Box>
        </Box>
      )}

      {/* ========================================================
          PAGE 4: MULTI-SELECT MODELS
         ======================================================== */}
      {page === 'select-models' && (
        <Box flexDirection="column">
          <Box flexDirection="row" justifyContent="space-between">
            <Text bold color={theme.text.primary}>
              {t('模型库多选清单 (Model Checklist):', 'Model Catalog Checklist:')}
            </Text>
            <Text color={theme.status.success}>
              {selectedModelsSet.size}/{availableModels.length} {t('已勾选', 'selected')}
            </Text>
          </Box>

          {isFetchingModels ? (
            <Box paddingY={1}>
              <Text color={theme.text.accent}>{t('正在探测端点可用模型...', 'Fetching models...')}</Text>
            </Box>
          ) : (
            <Box flexDirection="column" marginTop={1}>
              {availableModels.length === 0 ? (
                <Text color={theme.ui.comment}>{t('未获取到模型列表，可在下方手动输入', 'No remote models detected, enter below:')}</Text>
              ) : (
                windowedModels.map((m) => {
                  const isChecked = selectedModelsSet.has(m);
                  const isCursor = availableModels[modelCursor] === m;
                  return (
                    <Box key={m} flexDirection="row">
                      <Text color={isCursor ? theme.text.accent : theme.text.primary}>
                        {isCursor ? '▶ ' : '  '}
                      </Text>
                      <Text bold={isChecked} color={isChecked ? theme.status.success : theme.text.secondary}>
                        [{isChecked ? '✓' : ' '}] {m}
                      </Text>
                    </Box>
                  );
                })
              )}
            </Box>
          )}

          {/* Custom model input */}
          <Box marginTop={1} flexDirection="column">
            <Text color={theme.text.secondary}>
              {t('或手填追加自定义模型 (Custom Model):', 'Or type to append custom model:')}
            </Text>
            <Box>
              <Text color={theme.text.accent}>&gt; </Text>
              <Text color={theme.text.primary}>{customModelInput}</Text>
              <Text color={theme.text.secondary}>_</Text>
            </Box>
          </Box>

          <Box marginTop={1} borderStyle="single" borderColor={theme.border.default} paddingX={1} flexDirection="row" justifyContent="space-between">
            <Text color={theme.text.accent}>[Space] {t('单个勾选/反选', 'Toggle')}</Text>
            <Text color="#f59e0b">[A] {t('全选 / 全消', 'All / None')}</Text>
            <Text color={theme.status.success}>[Enter] {t('下一步 (配置生图)', 'Next: Image Model')}</Text>
            <Text color={theme.text.secondary}>[Esc] {t('返回', 'Back')}</Text>
          </Box>
        </Box>
      )}

      {/* ========================================================
          PAGE 5: OPTIONAL IMAGE MODEL
         ======================================================== */}
      {page === 'edit-image' && (
        <Box flexDirection="column">
          <Text bold color={theme.text.primary} marginBottom={1}>
            {t('生图模型配置 (可选):', 'Image Model Configuration (Optional):')}
          </Text>
          <Text color={theme.text.secondary}>
            {t('指定该端点的生图模型 (如 dall-e-3 / flux-1 / recraft-v3 / imagen-3.0-generate-002):',
               'Specify image generation model (e.g. dall-e-3, flux-1, recraft-v3):')}
          </Text>
          <Box marginTop={1}>
            <Text color={theme.text.accent}>&gt; </Text>
            <Text color={theme.text.primary}>{imageModelInput}</Text>
            <Text color={theme.text.secondary}>_</Text>
          </Box>
          <Box marginTop={1}>
            <Text color={theme.status.success} bold>
              {t('(按 Enter 完成保存并立即应用生效！)', '(Press Enter to save and activate now!)')}
            </Text>
          </Box>
        </Box>
      )}
    </Box>
  );
};
