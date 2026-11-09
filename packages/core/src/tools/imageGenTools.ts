/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { ProviderManager } from '../providers/providerManager.js';
import type { Config } from '../config/config.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  type ToolResult,
  type ExecuteOptions,
} from './tools.js';
import { ToolErrorType } from './tool-error.js';

export interface ImageGenResult {
  success: boolean;
  filePath?: string;
  markdownLink?: string;
  model: string;
  providerName?: string;
  error?: string;
}

export async function generateImage(params: {
  prompt: string;
  model?: string;
  providerId?: string;
  size?: '1024x1024' | '1024x1792' | '1792x1024' | '512x512';
  workspaceDir?: string;
}): Promise<ImageGenResult> {
  const mgr = ProviderManager.getInstance();
  const activeImage = mgr.getActiveImageModel();

  let provider = params.providerId
    ? mgr.getProvider(params.providerId)
    : activeImage.provider;
  let chosenModel = params.model || activeImage.modelId || 'dall-e-3';

  // Support "provider:model" syntax in params.model
  if (params.model && params.model.includes(':')) {
    const [provPrefix, modName] = params.model.split(':', 2);
    const resolvedProv = mgr.getProvider(provPrefix);
    if (resolvedProv && modName) {
      provider = resolvedProv;
      chosenModel = modName;
    }
  }

  const geminiApiKey = process.env['GEMINI_API_KEY'] || process.env['GOOGLE_API_KEY'];

  if ((!provider || !provider.apiKey) && !geminiApiKey) {
    return {
      success: false,
      model: chosenModel,
      error:
        '尚未配置生图供应商或 API Key。请运行 /provider 添加供应商并配置生图模型，或运行 /image model <模型名> [供应商] 绑定生图模型。',
    };
  }

  const baseDir = params.workspaceDir || process.cwd();
  const outDir = path.join(baseDir, '.gemini', 'generated_images');
  fs.mkdirSync(outDir, { recursive: true });
  const filename = `image_${Date.now()}.png`;
  const fullPath = path.join(outDir, filename);

  try {
    // Case 1: Native Gemini / Imagen endpoint or provider with protocol === 'gemini'
    if (
      (!provider && geminiApiKey) ||
      provider?.protocol === 'gemini' ||
      chosenModel.startsWith('imagen-') ||
      chosenModel.includes('gemini-')
    ) {
      const apiKey = provider?.apiKey || geminiApiKey || '';
      const baseUrl = (
        provider?.baseUrl || 'https://generativelanguage.googleapis.com/v1beta'
      ).replace(/\/+$/, '');
      const url = `${baseUrl}/models/${chosenModel}:predict?key=${encodeURIComponent(apiKey)}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(provider?.customHeaders || {}),
        },
        body: JSON.stringify({
          instances: [{ prompt: params.prompt }],
          parameters: { sampleCount: 1 },
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        return {
          success: false,
          model: chosenModel,
          providerName: provider?.name || 'Gemini',
          error: `生图端点返回错误 HTTP ${res.status}: ${errText}`,
        };
      }

      const data = (await res.json()) as {
        predictions?: Array<{ bytesBase64Encoded?: string }>;
      };
      const b64 = data.predictions?.[0]?.bytesBase64Encoded;
      if (!b64) {
        return {
          success: false,
          model: chosenModel,
          providerName: provider?.name || 'Gemini',
          error: '端点未返回有效的 bytesBase64Encoded 图像数据',
        };
      }
      fs.writeFileSync(fullPath, Buffer.from(b64, 'base64'));
      const normalizedPath = fullPath.replace(/\\/g, '/');
      return {
        success: true,
        filePath: fullPath,
        markdownLink: `![${params.prompt.slice(0, 30)}](file:///${normalizedPath})`,
        model: chosenModel,
        providerName: provider?.name || 'Gemini',
      };
    }

    // Case 2: OpenAI-compatible /v1/images/generations (DALL-E 3, Flux, Recraft, Kolors, etc.)
    const cleanBase = provider!.baseUrl
      .replace(/\/+(chat\/completions|responses|messages|images\/generations)\/?$/i, '')
      .replace(/\/+$/, '');
    const endpoint = `${cleanBase}/images/generations`;
    const payload = {
      model: chosenModel,
      prompt: params.prompt,
      n: 1,
      size: params.size || '1024x1024',
      response_format: 'b64_json',
    };

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provider!.apiKey}`,
        ...(provider!.customHeaders || {}),
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      return {
        success: false,
        model: chosenModel,
        providerName: provider!.name,
        error: `生图端点 [${provider!.name}] 返回错误 HTTP ${res.status}: ${errText}`,
      };
    }

    const data = (await res.json()) as {
      data?: Array<{ b64_json?: string; url?: string }>;
    };
    const item = data.data?.[0];
    if (!item) {
      return {
        success: false,
        model: chosenModel,
        providerName: provider!.name,
        error: '端点未返回有效的图片数据',
      };
    }

    if (item.b64_json) {
      const buffer = Buffer.from(item.b64_json, 'base64');
      fs.writeFileSync(fullPath, buffer);
    } else if (item.url) {
      const imgRes = await fetch(item.url);
      const ab = await imgRes.arrayBuffer();
      fs.writeFileSync(fullPath, Buffer.from(ab));
    } else {
      return {
        success: false,
        model: chosenModel,
        providerName: provider!.name,
        error: '未获取到可解析的 base64 或 URL 图片内容',
      };
    }

    const normalizedPath = fullPath.replace(/\\/g, '/');
    return {
      success: true,
      filePath: fullPath,
      markdownLink: `![${params.prompt.slice(0, 30)}](file:///${normalizedPath})`,
      model: chosenModel,
      providerName: provider!.name,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      model: chosenModel,
      providerName: provider?.name,
      error: `生图网络或存储异常: ${msg}`,
    };
  }
}

export interface GenerateImageToolParams {
  prompt: string;
  model?: string;
  provider?: string;
  size?: '1024x1024' | '1024x1792' | '1792x1024' | '512x512';
}

class GenerateImageInvocation extends BaseToolInvocation<
  GenerateImageToolParams,
  ToolResult
> {
  constructor(
    private readonly config: Config,
    params: GenerateImageToolParams,
    messageBus: MessageBus,
    toolName?: string,
  ) {
    super(params, messageBus, toolName, 'Generate Image');
  }

  getDescription(): string {
    return `Generating image with prompt: "${this.params.prompt.slice(0, 60)}"`;
  }

  override async execute(_options: ExecuteOptions): Promise<ToolResult> {
    const res = await generateImage({
      prompt: this.params.prompt,
      model: this.params.model,
      providerId: this.params.provider,
      size: this.params.size,
      workspaceDir: this.config.getTargetDir(),
    });

    if (!res.success) {
      return {
        llmContent: `Error generating image: ${res.error}`,
        returnDisplay: `生图失败: ${res.error}`,
        error: {
          message: res.error || 'Image generation failed',
          type: ToolErrorType.EXECUTION_FAILED,
        },
      };
    }

    const summary = `Image generated successfully using model "${res.model}" (${res.providerName || 'default'}).\nSaved to: ${res.filePath}\nMarkdown: ${res.markdownLink}`;
    return {
      llmContent: summary,
      returnDisplay: `✓ 生图成功 [${res.providerName ? res.providerName + ':' : ''}${res.model}]\n文件位置: ${res.filePath}\n${res.markdownLink}`,
    };
  }
}

export class GenerateImageTool extends BaseDeclarativeTool<
  GenerateImageToolParams,
  ToolResult
> {
  static readonly Name = 'generate_image';

  constructor(
    private readonly config: Config,
    messageBus: MessageBus,
  ) {
    super(
      GenerateImageTool.Name,
      'Generate Image',
      'Generates an image from a text prompt using the configured external or native image generation model (e.g., dall-e-3, flux-1, recraft-v3, imagen-3.0-generate-002) and saves it to the workspace.',
      Kind.Other,
      {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description: 'Detailed visual description of the image to generate.',
          },
          model: {
            type: 'string',
            description:
              'Optional image model ID or "provider:model" (defaults to active configured image model).',
          },
          provider: {
            type: 'string',
            description: 'Optional provider name/ID to route the image request.',
          },
          size: {
            type: 'string',
            enum: ['1024x1024', '1024x1792', '1792x1024', '512x512'],
            description: 'Image dimensions (default 1024x1024).',
          },
        },
        required: ['prompt'],
      },
      messageBus,
      true,
      false,
    );
  }

  protected createInvocation(
    params: GenerateImageToolParams,
    messageBus: MessageBus,
    toolName?: string,
  ) {
    return new GenerateImageInvocation(this.config, params, messageBus, toolName);
  }
}
