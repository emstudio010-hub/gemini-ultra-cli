/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { InProcessChecker } from '../built-in.js';
import {
  SafetyCheckDecision,
  type SafetyCheckInput,
  type SafetyCheckResult,
} from '../protocol.js';

import {
  logConsecaPolicyGeneration,
  ConsecaPolicyGenerationEvent,
  logConsecaVerdict,
  ConsecaVerdictEvent,
} from '../../telemetry/index.js';
import { debugLogger } from '../../utils/debugLogger.js';
import type { Config } from '../../config/config.js';

import { generatePolicy } from './policy-generator.js';
import { enforcePolicy } from './policy-enforcer.js';
import type { SecurityPolicy } from './types.js';
import type { AgentLoopContext } from '../../config/agent-loop-context.js';

export class ConsecaSafetyChecker implements InProcessChecker {
  private static instance: ConsecaSafetyChecker | undefined;
  private static scopedInstances = new WeakMap<Config, ConsecaSafetyChecker>();
  private currentPolicy: SecurityPolicy | null = null;
  private activeUserPrompt: string | null = null;
  private activeTrustedContent: string | null = null;
  private policyConfig: Config | undefined;
  private context: AgentLoopContext | null = null;

  /**
   * Use getInstance(context) for a Config-owned checker. Callers without a
   * context retain the standalone instance for compatibility.
   */
  private constructor() {}

  static getInstance(context?: AgentLoopContext): ConsecaSafetyChecker {
    if (context) {
      let checker = this.scopedInstances.get(context.config);
      if (!checker) {
        checker = new ConsecaSafetyChecker();
        checker.setContext(context);
        this.scopedInstances.set(context.config, checker);
      }
      return checker;
    }
    if (!ConsecaSafetyChecker.instance) {
      ConsecaSafetyChecker.instance = new ConsecaSafetyChecker();
    }
    return ConsecaSafetyChecker.instance;
  }

  /**
   * Resets the singleton instance. Use only in tests.
   */
  static resetInstance(): void {
    ConsecaSafetyChecker.instance = undefined;
    ConsecaSafetyChecker.scopedInstances = new WeakMap();
  }

  setContext(context: AgentLoopContext): void {
    if (this.context?.config !== context.config) {
      this.currentPolicy = null;
      this.activeUserPrompt = null;
      this.activeTrustedContent = null;
      this.policyConfig = undefined;
    }
    this.context = context;
  }

  async check(input: SafetyCheckInput): Promise<SafetyCheckResult> {
    debugLogger.debug(
      `[Conseca] check called. History is: ${JSON.stringify(input.context.history)}`,
    );

    const context = this.context;
    if (!context) {
      debugLogger.debug('[Conseca] check failed: Config not initialized');
      return {
        decision: SafetyCheckDecision.ALLOW,
        reason: 'Config not initialized',
      };
    }

    context.config.getLifecycleSignal().throwIfAborted();
    if (!context.config.enableConseca) {
      debugLogger.debug('[Conseca] check skipped: Conseca is not enabled.');
      return {
        decision: SafetyCheckDecision.ALLOW,
        reason: 'Conseca is disabled',
      };
    }

    const userPrompt = this.extractUserPrompt(input);
    let trustedContent = '';

    const toolRegistry = context.toolRegistry;
    if (toolRegistry) {
      const tools = toolRegistry.getFunctionDeclarations();
      trustedContent = JSON.stringify(tools, null, 2);
    }

    let policy =
      this.policyConfig === context.config &&
      this.activeTrustedContent === trustedContent
        ? this.currentPolicy
        : null;
    if (userPrompt) {
      policy = await this.getPolicy(userPrompt, trustedContent, context.config);
    } else {
      debugLogger.debug(
        `[Conseca] Skipping policy generation because userPrompt is null`,
      );
    }

    let result: SafetyCheckResult;

    if (!policy) {
      result = {
        decision: SafetyCheckDecision.ALLOW, // Fallback if no policy generated yet
        reason: 'No security policy generated.',
        error: 'No security policy generated.',
      };
    } else {
      result = await enforcePolicy(policy, input.toolCall, context.config);
    }

    logConsecaVerdict(
      context.config,
      new ConsecaVerdictEvent(
        userPrompt || '',
        JSON.stringify(policy || {}),
        JSON.stringify(input.toolCall),
        result.decision,
        result.reason || '',
        'error' in result ? result.error : undefined,
      ),
    );

    return result;
  }

  async getPolicy(
    userPrompt: string,
    trustedContent: string,
    config: Config,
  ): Promise<SecurityPolicy> {
    config.getLifecycleSignal().throwIfAborted();
    if (
      this.policyConfig === config &&
      this.activeUserPrompt === userPrompt &&
      this.activeTrustedContent === trustedContent &&
      this.currentPolicy
    ) {
      return this.currentPolicy;
    }

    const contextAtStart = this.context;
    const { policy, error } = await generatePolicy(
      userPrompt,
      trustedContent,
      config,
    );
    config.getLifecycleSignal().throwIfAborted();
    if (this.context === contextAtStart) {
      this.currentPolicy = policy;
      this.activeUserPrompt = userPrompt;
      this.activeTrustedContent = trustedContent;
      this.policyConfig = config;
    }

    logConsecaPolicyGeneration(
      config,
      new ConsecaPolicyGenerationEvent(
        userPrompt,
        trustedContent,
        JSON.stringify(policy),
        error,
      ),
    );

    return policy;
  }

  private extractUserPrompt(input: SafetyCheckInput): string | null {
    const prompt = input.context.history?.turns.at(-1)?.user.text;
    if (prompt) {
      return prompt;
    }
    debugLogger.debug(`[Conseca] extractUserPrompt failed.`);
    return null;
  }

  // Helper methods for testing state
  getCurrentPolicy(): SecurityPolicy | null {
    return this.currentPolicy;
  }

  getActiveUserPrompt(): string | null {
    return this.activeUserPrompt;
  }
}
