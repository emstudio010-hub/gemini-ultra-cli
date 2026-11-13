/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useCallback, useContext, useMemo, useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { ModelQuotaDisplay } from './ModelQuotaDisplay.js';
import { useUIState } from '../contexts/UIStateContext.js';
import {
  PREVIEW_GEMINI_MODEL,
  PREVIEW_GEMINI_3_1_MODEL,
  PREVIEW_GEMINI_FLASH_MODEL,
  PREVIEW_GEMINI_FLASH_LITE_MODEL,
  DEFAULT_GEMINI_MODEL,
  ProviderManager,
  DEFAULT_GEMINI_FLASH_MODEL,
  DEFAULT_GEMINI_FLASH_LITE_MODEL,
  GEMINI_MODEL_ALIAS_AUTO,
  GEMMA_4_31B_IT_MODEL,
  GEMMA_4_26B_A4B_IT_MODEL,
  ModelSlashCommandEvent,
  logModelSlashCommand,
  getDisplayString,
  AuthType,
  PREVIEW_GEMINI_3_1_CUSTOM_TOOLS_MODEL,
  isProModel,
  getAutoModelDescription,
} from '@google/gemini-cli-core';
import { useKeypress } from '../hooks/useKeypress.js';
import { theme } from '../semantic-colors.js';
import { DescriptiveRadioButtonSelect } from './shared/DescriptiveRadioButtonSelect.js';
import { ConfigContext } from '../contexts/ConfigContext.js';
import { useSettings } from '../contexts/SettingsContext.js';
import { useLocale } from '../hooks/useLocale.js';
import { modelSaveError } from '../utils/modelSaveError.js';

interface ModelDialogProps {
  onClose: () => void;
}

export function ModelDialog({ onClose }: ModelDialogProps): React.JSX.Element {
  const config = useContext(ConfigContext);
  const settings = useSettings();
  const locale = useLocale();
  const isZh = locale === 'zh';
  const { terminalWidth } = useUIState();
  const [hasAccessToProModel, setHasAccessToProModel] = useState<boolean>(
    () => !(config?.getProModelNoAccessSync() ?? false),
  );
  const [view, setView] = useState<'main' | 'manual'>(() =>
    config?.getProModelNoAccessSync() ? 'manual' : 'main',
  );
  const [persistMode, setPersistMode] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [quotaStatus, setQuotaStatus] = useState<
    'idle' | 'loading' | 'ready' | 'unavailable'
  >('idle');

  useEffect(() => {
    let active = true;
    async function checkAccess() {
      if (!config) return;
      try {
        const noAccess = await config.getProModelNoAccess();
        if (!active) return;
        setHasAccessToProModel(!noAccess);
        if (noAccess) {
          setView('manual');
        }
      } catch {
        // Keep the synchronous access snapshot if optional loading fails.
      }
    }
    void checkAccess();
    return () => {
      active = false;
    };
  }, [config]);

  useEffect(() => {
    if (!config) return;
    let disposed = false;
    const controller = new AbortController();
    const onAbort = () => {
      if (!disposed) setQuotaStatus('unavailable');
    };
    controller.signal.addEventListener('abort', onAbort, { once: true });
    setQuotaStatus('loading');
    const timeout = setTimeout(
      () => controller.abort(new Error('Model quota refresh timed out')),
      10_000,
    );
    void (async () => {
      try {
        const quota = await config.refreshUserQuota(controller.signal);
        if (!disposed && !controller.signal.aborted) {
          setQuotaStatus(quota ? 'ready' : 'unavailable');
        }
      } catch {
        if (!disposed) setQuotaStatus('unavailable');
      } finally {
        clearTimeout(timeout);
      }
    })();
    return () => {
      disposed = true;
      clearTimeout(timeout);
      controller.signal.removeEventListener('abort', onAbort);
      controller.abort();
    };
  }, [config]);

  // Determine the Preferred Model (read once when the dialog opens).
  const preferredModel = config?.getModel() || GEMINI_MODEL_ALIAS_AUTO;

  const shouldShowPreviewModels = config?.getHasAccessToPreviewModel() ?? false;
  const useGemini31 = config?.getGemini31LaunchedSync?.() ?? false;
  const useLatestFlash = config?.hasLatestFlashGAAccess?.() ?? false;
  const useLatestFlashLite = config?.hasLatestFlashLiteGAAccess?.() ?? false;
  const selectedAuthType = settings.merged.security.auth.selectedType;
  const useCustomToolModel =
    useGemini31 && selectedAuthType === AuthType.USE_GEMINI;

  const manualModelSelected = useMemo(() => {
    if (
      config?.getExperimentalDynamicModelConfiguration?.() === true &&
      config.getModelConfigService
    ) {
      const def = config
        .getModelConfigService()
        .getModelDefinition(preferredModel);
      // Only treat as manual selection if it's a visible, non-auto model.
      return def && def.tier !== 'auto' && def.isVisible === true
        ? preferredModel
        : '';
    }

    const manualModels = [
      DEFAULT_GEMINI_MODEL,
      DEFAULT_GEMINI_FLASH_MODEL,
      DEFAULT_GEMINI_FLASH_LITE_MODEL,
      PREVIEW_GEMINI_MODEL,
      PREVIEW_GEMINI_3_1_MODEL,
      PREVIEW_GEMINI_3_1_CUSTOM_TOOLS_MODEL,
      PREVIEW_GEMINI_FLASH_LITE_MODEL,
      PREVIEW_GEMINI_FLASH_MODEL,
    ].filter((m) => m !== 'none');
    if (manualModels.includes(preferredModel)) {
      return preferredModel;
    }
    return '';
  }, [preferredModel, config]);

  useKeypress(
    (key) => {
      if (key.name === 'escape') {
        if (view === 'manual' && hasAccessToProModel) {
          setView('main');
        } else {
          onClose();
        }
        return true;
      }
      if (key.name === 'tab') {
        setPersistMode((prev) => !prev);
        setSaveFailed(false);
        return true;
      }
      return false;
    },
    { isActive: true },
  );
  const mainOptions = useMemo(() => {
    // --- DYNAMIC PATH ---
    if (
      config?.getExperimentalDynamicModelConfiguration?.() === true &&
      config.getModelConfigService
    ) {
      const allOptions = config
        .getModelConfigService()
        .getAvailableModelOptions({
          useGemini3_1: useGemini31,
          useLatestFlash,
          useLatestFlashLite,
          useCustomTools: useCustomToolModel,
          hasAccessToPreview: shouldShowPreviewModels,
          hasAccessToProModel,
        });

      const list = allOptions
        .filter((o) => o.tier === 'auto')
        .map((o) => ({
          value: o.modelId,
          title: isZh ? '自动选择' : o.name,
          description: isZh
            ? '根据任务自动选择可用的 Gemini 模型'
            : o.description,
          key: o.modelId,
        }));

      list.push({
        value: 'Manual',
        title: manualModelSelected
          ? `${isZh ? '手动选择' : 'Manual'} (${getDisplayString(manualModelSelected, config ?? undefined)})`
          : isZh
            ? '手动选择'
            : 'Manual',
        description: isZh ? '从模型列表中选择' : 'Manually select a model',
        key: 'Manual',
      });
      return list;
    }

    // --- LEGACY PATH ---
    const list = [
      {
        value: GEMINI_MODEL_ALIAS_AUTO,
        title: isZh ? '自动选择' : getDisplayString(GEMINI_MODEL_ALIAS_AUTO),
        description: isZh
          ? '根据任务自动选择可用的 Gemini 模型'
          : getAutoModelDescription(
              shouldShowPreviewModels,
              useGemini31,
              useLatestFlash,
            ),
        key: GEMINI_MODEL_ALIAS_AUTO,
      },
      {
        value: 'Manual',
        title: manualModelSelected
          ? `${isZh ? '手动选择' : 'Manual'} (${getDisplayString(manualModelSelected)})`
          : isZh
            ? '手动选择'
            : 'Manual',
        description: isZh ? '从模型列表中选择' : 'Manually select a model',
        key: 'Manual',
      },
    ];

    return list;
  }, [
    config,
    shouldShowPreviewModels,
    manualModelSelected,
    useGemini31,
    useLatestFlash,
    useLatestFlashLite,
    useCustomToolModel,
    hasAccessToProModel,
    isZh,
  ]);

  const manualOptions = useMemo(() => {
    // --- DYNAMIC PATH ---
    if (
      config?.getExperimentalDynamicModelConfiguration?.() === true &&
      config.getModelConfigService
    ) {
      const allOptions = config
        .getModelConfigService()
        .getAvailableModelOptions({
          useGemini3_1: useGemini31,
          useLatestFlash,
          useLatestFlashLite,
          useCustomTools: useCustomToolModel,
          hasAccessToPreview: shouldShowPreviewModels,
          hasAccessToProModel,
        });

      return allOptions
        .filter((o) => o.tier !== 'auto')
        .map((o) => ({
          value: o.modelId,
          title: o.name,
          key: o.modelId,
        }));
    }

    // --- LEGACY PATH ---
    const showGemmaModels = config?.getExperimentalGemma() ?? false;

    const options = [
      {
        value: DEFAULT_GEMINI_MODEL,
        title: getDisplayString(DEFAULT_GEMINI_MODEL),
        key: DEFAULT_GEMINI_MODEL,
      },
      {
        value: DEFAULT_GEMINI_FLASH_LITE_MODEL,
        title: getDisplayString(DEFAULT_GEMINI_FLASH_LITE_MODEL),
        key: DEFAULT_GEMINI_FLASH_LITE_MODEL,
      },
      {
        value: DEFAULT_GEMINI_FLASH_MODEL,
        title: getDisplayString(DEFAULT_GEMINI_FLASH_MODEL),
        key: DEFAULT_GEMINI_FLASH_MODEL,
      },
    ];

    if (showGemmaModels) {
      options.push(
        {
          value: GEMMA_4_31B_IT_MODEL,
          title: getDisplayString(GEMMA_4_31B_IT_MODEL),
          key: GEMMA_4_31B_IT_MODEL,
        },
        {
          value: GEMMA_4_26B_A4B_IT_MODEL,
          title: getDisplayString(GEMMA_4_26B_A4B_IT_MODEL),
          key: GEMMA_4_26B_A4B_IT_MODEL,
        },
      );
    }

    if (shouldShowPreviewModels) {
      const previewProModel = useGemini31
        ? PREVIEW_GEMINI_3_1_MODEL
        : PREVIEW_GEMINI_MODEL;

      const previewProValue = useCustomToolModel
        ? PREVIEW_GEMINI_3_1_CUSTOM_TOOLS_MODEL
        : previewProModel;

      const previewOptions = [
        {
          value: previewProValue,
          title: getDisplayString(previewProModel),
          key: previewProModel,
        },
        {
          value: PREVIEW_GEMINI_FLASH_MODEL,
          title: getDisplayString(PREVIEW_GEMINI_FLASH_MODEL),
          key: PREVIEW_GEMINI_FLASH_MODEL,
        },
      ];

      if (PREVIEW_GEMINI_FLASH_LITE_MODEL !== 'none') {
        previewOptions.push({
          value: PREVIEW_GEMINI_FLASH_LITE_MODEL,
          title: getDisplayString(PREVIEW_GEMINI_FLASH_LITE_MODEL),
          key: PREVIEW_GEMINI_FLASH_LITE_MODEL,
        });
      }

      options.unshift(...previewOptions);
    }

    if (!hasAccessToProModel) {
      // Filter out all Pro models for free tier
      return options.filter((option) => !isProModel(option.value));
    }

    return options;
  }, [
    shouldShowPreviewModels,
    useGemini31,
    useLatestFlash,
    useLatestFlashLite,
    useCustomToolModel,
    hasAccessToProModel,
    config,
  ]);

  const options = useMemo(() => {
    const baseOptions = view === 'main' ? mainOptions : manualOptions;
    const externalOptions = ProviderManager.getInstance()
      .getAllExternalModelItems()
      .map((item) => ({
        value: item.qualifiedId,
        title: `${item.providerName} · ${item.modelId}`,
        description: `${isZh ? '外接供应商' : 'External provider'} (${item.protocol})`,
        key: `ext-${item.qualifiedId}`,
      }));
    // External provider models are shown first in the main list and also in manual view.
    const rawOptions =
      view === 'main'
        ? [
            ...baseOptions.filter((o) => o.value !== 'Manual'),
            ...externalOptions,
            ...baseOptions.filter((o) => o.value === 'Manual'),
          ]
        : [...externalOptions, ...baseOptions];
    const seen = new Set<string>();
    return rawOptions.filter((option) => {
      if (seen.has(option.value)) {
        return false;
      }
      seen.add(option.value);
      return true;
    });
  }, [view, mainOptions, manualOptions, isZh]);

  // Calculate the initial index based on the preferred model.
  const initialIndex = useMemo(() => {
    const idx = options.findIndex((option) => option.value === preferredModel);
    if (idx !== -1) {
      return idx;
    }
    if (view === 'main') {
      const manualIdx = options.findIndex((o) => o.value === 'Manual');
      return manualIdx !== -1 ? manualIdx : 0;
    }
    return 0;
  }, [preferredModel, options, view]);

  // Handle selection internally (Autonomous Dialog).
  const handleSelect = useCallback(
    (model: string) => {
      if (model === 'Manual') {
        setView('manual');
        return;
      }

      if (config) {
        // Qualified model IDs route this session without rewriting provider
        // defaults. The existing model preference callback owns Remember.
        try {
          config.setModel(model, !persistMode);
        } catch {
          setSaveFailed(true);
          return;
        }
        const event = new ModelSlashCommandEvent(model);
        logModelSlashCommand(config, event);
      }
      onClose();
    },
    [config, onClose, persistMode],
  );

  return (
    <Box
      borderStyle="round"
      borderColor={theme.border.default}
      flexDirection="column"
      padding={1}
      width="100%"
    >
      <Text bold>{isZh ? '选择模型' : 'Select Model'}</Text>
      {saveFailed ? (
        <Text color={theme.status.error}>{modelSaveError()}</Text>
      ) : null}

      <Box marginTop={1}>
        <DescriptiveRadioButtonSelect
          items={options}
          onSelect={handleSelect}
          initialIndex={initialIndex}
          showNumbers={true}
        />
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Box>
          <Text bold color={theme.text.primary}>
            {isZh
              ? '记住模型供后续会话使用：'
              : 'Remember model for future sessions: '}
          </Text>
          <Text color={theme.status.success}>
            {isZh
              ? persistMode
                ? '开启'
                : '关闭'
              : persistMode
                ? 'true'
                : 'false'}
          </Text>
          <Text color={theme.text.secondary}>
            {isZh ? '（按 Tab 切换）' : ' (Press Tab to toggle)'}
          </Text>
        </Box>
      </Box>
      <Box flexDirection="column">
        <Text color={theme.text.secondary}>
          {isZh
            ? '> 启动时用 --model 指定模型；外接模型使用 供应商ID:模型ID。'
            : '> Use --model on startup; external models use provider-id:model-id.'}
        </Text>
      </Box>
      <ModelQuotaDisplay
        title={isZh ? '模型用量' : 'Model usage'}
        buckets={config?.getLastRetrievedQuota()?.buckets}
        availableWidth={terminalWidth - 2}
      />
      {quotaStatus === 'loading' ? (
        <Text color={theme.text.secondary}>
          {isZh ? '正在刷新配额…' : 'Refreshing quota…'}
        </Text>
      ) : quotaStatus === 'unavailable' &&
        (selectedAuthType === AuthType.LOGIN_WITH_GOOGLE ||
          selectedAuthType === AuthType.COMPUTE_ADC ||
          config?.getLastRetrievedQuota()) ? (
        <Text color={theme.text.secondary}>
          {isZh
            ? '未取得新配额，缓存未更新；可继续选择模型。'
            : 'New quota unavailable; cache unchanged. You can still select a model.'}
        </Text>
      ) : null}
      <Box marginTop={1} flexDirection="column">
        <Text color={theme.text.secondary}>
          {view === 'manual' && hasAccessToProModel
            ? isZh
              ? '（按 Esc 返回）'
              : '(Press Esc to go back)'
            : isZh
              ? '（按 Esc 关闭）'
              : '(Press Esc to close)'}
        </Text>
      </Box>
    </Box>
  );
}
