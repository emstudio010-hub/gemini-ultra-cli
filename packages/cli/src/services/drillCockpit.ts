/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  createServer,
  type Server,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import {
  ApprovalMode,
  DrillStore,
  ProviderManager,
  readDrillGrant,
  writeDrillGrant,
  runDrillPreflight,
  readUltraPromptConfig,
  saveUltraPromptConfig,
  ultraPromptConfigPath,
  coreEvents,
  I18nManager,
  getEffortOptions,
  readUltraRuntime,
  saveUltraRuntime,
  listCollaborationTasks,
  drillToolNames,
  savedDrillToolPaths,
  saveDrillToolPath,
  listAgentTasks,
  readAgentTaskDetails,
  agentTaskSelectionSchema,
  type Config,
} from '@google/gemini-cli-core';
import { registerCleanup } from '../utils/cleanup.js';

interface DrillSession {
  config: Config;
  isReady: () => boolean;
  submit: (prompt: string) => Promise<void>;
}

let session: DrillSession | undefined;
let server: Server | undefined;
let starting: Promise<string> | undefined;
let address = '';
let token = '';
let submitting = false;
let preflight: ReturnType<typeof runDrillPreflight> | undefined;

export function connectDrillSession(next: DrillSession): () => void {
  session = next;
  return () => {
    if (session === next) session = undefined;
  };
}

class RequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function readJson(
  req: IncomingMessage,
): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 65536) throw new RequestError(413, '内容过长，最多支持 64 KB。');
    chunks.push(Buffer.from(chunk));
  }
  try {
    return z
      .record(z.unknown())
      .parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
  } catch {
    throw new RequestError(400, '请求必须是 JSON 对象。');
  }
}

function reply(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(value));
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  nonce: string,
): Promise<void> {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader(
    'Content-Security-Policy',
    `default-src 'none'; script-src 'self' 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'`,
  );
  if (
    req.headers.host !== new URL(address).host ||
    (req.headers.origin && req.headers.origin !== address)
  ) {
    throw new RequestError(403, '仅允许当前本地控制台访问。');
  }
  const pathname = new URL(req.url || '/', address).pathname;
  if (req.method === 'GET' && pathname === '/assets/morphicons.js') {
    const { morphiconsBundle } = await import('./morphiconsBundle.js');
    res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
    res.end(morphiconsBundle);
    return;
  }
  if (req.method === 'GET' && pathname === '/') {
    const { cockpitHtml } = await import('./drillCockpitPage.js');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(cockpitHtml(nonce));
    return;
  }
  const supplied = Buffer.from(String(req.headers['x-drill-token'] || ''));
  const expected = Buffer.from(token);
  if (
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  ) {
    throw new RequestError(403, '访问凭证已失效，请在 CLI 中重新运行 /drill。');
  }
  const current = session;
  if (!current) throw new RequestError(409, 'CLI 会话尚未就绪或已关闭。');
  const { config } = current;
  const mgr = ProviderManager.getInstance();
  if (req.method === 'GET' && pathname === '/api/agent-tasks') {
    const value =
      new URL(req.url || '/', address).searchParams.get('page') || '1';
    if (!/^[1-9]\d{0,5}$/.test(value))
      throw new RequestError(400, 'Invalid task page.');
    try {
      const catalog = listAgentTasks(
        config.storage.getProjectTempDir(),
        Number(value),
      );
      reply(res, 200, {
        ...catalog,
        entries: catalog.entries.map((entry) => ({
          ...entry,
          objective: entry.objective?.slice(0, 300),
        })),
      });
    } catch {
      throw new RequestError(
        400,
        I18nManager.getInstance().t(
          '任务目录无法读取，原文件保留。',
          'Task catalog unavailable; original files retained.',
        ),
      );
    }
    return;
  }
  if (req.method === 'GET' && pathname === '/api/agent-task') {
    const query = new URL(req.url || '/', address).searchParams;
    const selected = agentTaskSelectionSchema.safeParse({
      mode: query.get('mode'),
      id: query.get('id'),
    });
    if (!selected.success)
      throw new RequestError(400, 'Invalid task mode or ID.');
    try {
      reply(
        res,
        200,
        readAgentTaskDetails(config.storage.getProjectTempDir(), selected.data),
      );
    } catch {
      throw new RequestError(
        400,
        I18nManager.getInstance().t(
          '任务详情无法读取或模式不匹配，原文件保留。',
          'Task details unavailable or mode mismatch; original files retained.',
        ),
      );
    }
    return;
  }
  if (req.method === 'GET' && pathname === '/api/status') {
    const store = DrillStore.getInstance();
    reply(res, 200, {
      ready: current.isReady() && !submitting,
      sessionId: config.getSessionId(),
      locale: I18nManager.getInstance().getLocale(),
      effortOptions: getEffortOptions(I18nManager.getInstance().getLocale()),
      runtime: readUltraRuntime(),
      collaborationTasks: listCollaborationTasks(config.getSessionId()),
      effort: mgr.getReasoningEffort(),
      bypass: config.getApprovalMode() === ApprovalMode.YOLO,
      grant: readDrillGrant(),
      activeProviderId: mgr.getActiveProvider()?.id || '',
      activeModel: mgr.getActiveModel() || config.getModel(),
      providers: mgr
        .listProviders()
        .map(
          ({
            id,
            name,
            models,
            defaultModel,
            baseUrl,
            protocol,
            apiKey,
            maxOutputTokens,
            contextWindow,
          }) => ({
            id,
            name,
            models,
            defaultModel,
            baseUrl,
            protocol,
            maxOutputTokens,
            contextWindow,
            hasKey: Boolean(apiKey),
          }),
        ),
      facts: store.queryFacts(config.getSessionId()).slice(0, 50),
      patches: store.queryPatchTransactions(config.getSessionId()),
    });
    return;
  }
  if (req.method === 'GET' && pathname === '/api/preflight') {
    // Coalesce concurrent requests, but never reuse a completed discovery.
    // Paths and installations can change while the cockpit remains open.
    if (!preflight) {
      const pending = runDrillPreflight().finally(() => {
        if (preflight === pending) preflight = undefined;
      });
      preflight = pending;
    }
    reply(res, 200, await preflight);
    return;
  }
  if (req.method === 'GET' && pathname === '/api/tool-paths') {
    reply(res, 200, { ...savedDrillToolPaths(), tools: drillToolNames });
    return;
  }
  if (req.method === 'GET' && pathname === '/api/skills') {
    const manager = config.getSkillManager();
    const skills = manager.getAllSkills?.() || manager.getSkills();
    reply(
      res,
      200,
      skills.map(({ name, description, disabled }) => ({
        name,
        description,
        disabled: Boolean(disabled),
      })),
    );
    return;
  }
  if (req.method === 'GET' && pathname === '/api/prompts') {
    reply(res, 200, {
      config: readUltraPromptConfig(),
      path: ultraPromptConfigPath(),
    });
    return;
  }
  if (req.method !== 'POST') throw new RequestError(404, '接口不存在。');
  const body = await readJson(req);
  if (!current.isReady() || submitting)
    throw new RequestError(
      409,
      '会话忙碌或正在等待确认，请回到终端完成当前操作。',
    );
  if (pathname === '/api/tool-paths') {
    const input = z
      .discriminatedUnion('action', [
        z
          .object({
            action: z.literal('save'),
            name: z.enum(drillToolNames),
            path: z.string().min(1).max(32768),
          })
          .strict(),
        z
          .object({ action: z.literal('reset'), name: z.enum(drillToolNames) })
          .strict(),
      ])
      .safeParse(body);
    if (!input.success)
      throw new RequestError(
        400,
        I18nManager.getInstance().t(
          '请选择工具并填写完整路径；清除时只需工具名称。',
          'Choose a tool and enter its full path; resetting only needs the tool name.',
        ),
      );
    try {
      const saved = saveDrillToolPath(
        input.data.name,
        input.data.action === 'save' ? input.data.path : undefined,
      );
      preflight = undefined;
      reply(res, 200, {
        ...saved,
        tools: drillToolNames,
        message: I18nManager.getInstance().t(
          input.data.action === 'save'
            ? '路径已保存。点击「查看就绪状态」重新检查。'
            : '已清除保存路径。点击「查看就绪状态」重新检查。',
          input.data.action === 'save'
            ? 'Path saved. Click “Check availability” to check again.'
            : 'Saved path cleared. Click “Check availability” to check again.',
        ),
      });
    } catch (error) {
      throw new RequestError(
        400,
        error instanceof Error ? error.message : 'Could not save tool paths.',
      );
    }
    return;
  }
  if (pathname === '/api/prompt') {
    const prompt = z.string().trim().min(1).safeParse(body['prompt']);
    if (!prompt.success) throw new RequestError(400, '请先输入任务。');
    submitting = true;
    void current
      .submit(prompt.data)
      .catch((error: unknown) => {
        coreEvents.emitFeedback(
          'error',
          `演练台任务执行失败：${error instanceof Error ? error.message : String(error)}`,
        );
      })
      .finally(() => {
        submitting = false;
      });
    reply(res, 202, {
      message: I18nManager.getInstance().t(
        '任务已送入当前 CLI 会话，执行过程与审批请查看终端。',
        'Task sent to the current CLI session. Follow execution and approvals in the terminal.',
      ),
    });
    return;
  }
  if (pathname === '/api/prompts') {
    try {
      saveUltraPromptConfig(body['config']);
    } catch (error) {
      throw new RequestError(
        400,
        error instanceof Error ? error.message : '提示词保存失败。',
      );
    }
    reply(res, 200, {
      message: I18nManager.getInstance().t(
        '提示词与规则已保存，下次主会话或子代理请求自动生效。',
        'Prompts and rules saved for future agent requests.',
      ),
    });
    return;
  }
  if (pathname === '/api/providers' || pathname === '/api/provider-models') {
    const parsed = z
      .object({
        id: z.string().optional(),
        name: z.string().trim().min(1).max(64),
        baseUrl: z.string().url(),
        apiKey: z.string(),
        protocol: z.enum([
          'openai-chat',
          'openai-responses',
          'anthropic',
          'gemini',
        ]),
        models: z.array(z.string().trim().min(1)).max(300),
        defaultModel: z.string().optional(),
        maxOutputTokens: z
          .number()
          .int()
          .positive()
          .safe()
          .nullable()
          .optional(),
        contextWindow: z.number().int().positive().safe().nullable().optional(),
      })
      .safeParse(body);
    if (!parsed.success)
      throw new RequestError(
        400,
        '请检查名称、端点、模型和 Token 设置（必须为正整数）。 / Check the name, endpoint, models and positive integer token settings.',
      );
    const { maxOutputTokens, contextWindow, ...input } = parsed.data;
    const existing = input.id ? mgr.getProviderById(input.id) : undefined;
    if (input.id && !existing)
      throw new RequestError(404, 'Provider no longer exists.');
    if (!input.id && mgr.getProvider(input.name))
      throw new RequestError(
        409,
        '该名称已存在，请选择编辑已有供应商。 / This name exists; select it to edit.',
      );
    const apiKey = input.apiKey.trim() || existing?.apiKey || '';
    if (pathname === '/api/provider-models') {
      const controller = new AbortController();
      const cancel = () => controller.abort();
      req.once('aborted', cancel);
      res.once('close', cancel);
      if (req.aborted || res.destroyed) cancel();
      try {
        const result = await mgr.fetchModelsFromEndpoint({
          ...input,
          apiKey,
          customHeaders: existing?.customHeaders,
          timeoutMs: 7000,
          signal: controller.signal,
        });
        if (!controller.signal.aborted) reply(res, 200, result);
      } finally {
        req.removeListener('aborted', cancel);
        res.removeListener('close', cancel);
        controller.abort();
      }
      return;
    }
    if (!input.models.length)
      throw new RequestError(
        400,
        '请至少填写一个模型。 / Enter at least one model.',
      );
    const provider = mgr.upsertProvider({
      ...input,
      apiKey,
      defaultModel:
        input.defaultModel ||
        (existing?.defaultModel && input.models.includes(existing.defaultModel)
          ? existing.defaultModel
          : input.models[0]),
      ...(Object.hasOwn(body, 'maxOutputTokens')
        ? { maxOutputTokens: maxOutputTokens ?? undefined }
        : {}),
      ...(Object.hasOwn(body, 'contextWindow')
        ? { contextWindow: contextWindow ?? undefined }
        : {}),
      setActive: false,
    });
    reply(res, 200, {
      id: provider.id,
      message: I18nManager.getInstance().t(
        '供应商已保存，请在模型选择器中激活。',
        'Provider saved. Activate it with the model selector.',
      ),
    });
    return;
  }
  if (pathname === '/api/settings') {
    switch (body['action']) {
      case 'language': {
        const locale = z.enum(['zh', 'en']).safeParse(body['value']);
        if (!locale.success) throw new RequestError(400, 'Choose zh or en.');
        I18nManager.getInstance().setLocale(locale.data);
        break;
      }
      case 'runtime': {
        const next = z
          .object({
            collaboration: z.enum(['auto', 'single', 'team']),
            maxParallel: z.number().int().min(1).max(8),
            workflow: z.enum(['general', 'redteam']),
          })
          .safeParse(body['value']);
        if (!next.success)
          throw new RequestError(400, 'Invalid workflow configuration.');
        if (next.data.workflow === 'redteam' && !readDrillGrant().granted)
          throw new RequestError(
            400,
            '请先登记演练授权。 / Record drill authorization first.',
          );
        saveUltraRuntime(next.data);
        break;
      }
      case 'effort': {
        const effort = z
          .enum(['low', 'medium', 'high', 'xhigh', 'max', 'ultra'])
          .safeParse(body['value']);
        if (!effort.success) throw new RequestError(400, '无效的推理强度。');
        mgr.setReasoningEffort(effort.data);
        break;
      }
      case 'bypass':
        if (!z.boolean().safeParse(body['value']).success)
          throw new RequestError(400, '审批设置必须是布尔值。');
        config.setApprovalMode(
          body['value'] ? ApprovalMode.YOLO : ApprovalMode.DEFAULT,
        );
        break;
      case 'grant':
        if (!z.boolean().safeParse(body['value']).success)
          throw new RequestError(400, '授权设置必须是布尔值。');
        writeDrillGrant(z.boolean().parse(body['value']));
        break;
      case 'model': {
        const provider = mgr
          .listProviders()
          .find((p) => p.id === body['providerId']);
        const model = z.string().safeParse(body['model']);
        if (
          !provider ||
          !model.success ||
          !provider.models.includes(model.data)
        )
          throw new RequestError(400, '请选择已配置的供应商和模型。');
        mgr.setActiveSelection(provider.id, model.data);
        config.setModel(`${provider.id}:${model.data}`);
        break;
      }
      default:
        throw new RequestError(400, '未知设置。');
    }
    reply(res, 200, {
      message: I18nManager.getInstance().t('设置已更新。', 'Settings updated.'),
    });
    return;
  }
  throw new RequestError(404, '接口不存在。');
}

export function stopDrillCockpit(): void {
  server?.close();
  server?.closeAllConnections();
  server = undefined;
  address = '';
  token = '';
  preflight = undefined;
}

export async function startDrillCockpit(): Promise<string> {
  if (starting) return starting;
  if (server) return `${address}/#${token}`;
  if (!session) throw new Error('当前交互会话尚未就绪。');
  starting = (async () => {
    token = randomBytes(32).toString('hex');
    const nonce = randomBytes(16).toString('hex');
    const next = createServer((req, res) => {
      void handleRequest(req, res, nonce).catch((error: unknown) => {
        if (!res.headersSent)
          reply(res, error instanceof RequestError ? error.status : 500, {
            error: error instanceof Error ? error.message : '控制台请求失败。',
          });
        else res.end();
      });
    });
    await new Promise<void>((resolve, reject) => {
      const onError = (error: NodeJS.ErrnoException) => {
        if (error.code === 'EADDRINUSE') next.listen(0, '127.0.0.1');
        else {
          next.removeListener('error', onError);
          reject(error);
        }
      };
      next.on('error', onError);
      next.listen(45678, '127.0.0.1', () => {
        next.removeListener('error', onError);
        resolve();
      });
    });
    const bound = next.address();
    if (!bound || typeof bound === 'string')
      throw new Error('无法获取控制台端口。');
    address = `http://127.0.0.1:${bound.port}`;
    server = next;
    next.unref();
    return `${address}/#${token}`;
  })();
  try {
    return await starting;
  } finally {
    starting = undefined;
  }
}

registerCleanup(stopDrillCockpit);
