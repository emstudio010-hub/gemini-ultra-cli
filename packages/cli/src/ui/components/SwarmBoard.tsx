/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import stripAnsi from 'strip-ansi';
import { readSwarm, readSwarmBoard } from '@google/gemini-cli-core';
import { useKeypress } from '../hooks/useKeypress.js';
import { useLocale } from '../hooks/useLocale.js';
import { theme } from '../semantic-colors.js';

function safe(text: string): string {
  return Array.from(stripAnsi(text))
    .filter(
      (character) =>
        character === '\n' ||
        character === '\t' ||
        (character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127),
    )
    .join('');
}
function snapshot(root: string, id: string) {
  try {
    return {
      swarm: readSwarm(root, id),
      posts: readSwarmBoard(root, id),
      error: '',
    };
  } catch (error) {
    return {
      swarm: undefined,
      posts: [],
      error: error instanceof Error ? error.message : 'Cannot read board.',
    };
  }
}
export function SwarmBoard({
  root,
  id,
  onClose,
}: {
  root: string;
  id: string;
  onClose: () => void;
}) {
  const locale = useLocale();
  const [view, setView] = useState(() => snapshot(root, id));
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setView(snapshot(root, id)), 1000);
    return () => clearInterval(timer);
  }, [root, id]);
  useKeypress(
    (key) => {
      if (key.name === 'escape') {
        onClose();
        return true;
      }
      if (key.name === 'up') {
        setOffset((value) =>
          Math.min(Math.max(0, view.posts.length - 6), value + 1),
        );
        return true;
      }
      if (key.name === 'down') {
        setOffset((value) => Math.max(0, value - 1));
        return true;
      }
      return false;
    },
    { isActive: true },
  );
  const end = Math.max(0, view.posts.length - offset);
  const posts = view.posts.slice(Math.max(0, end - 6), end);
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.border.default}
      paddingX={1}
      width="100%"
    >
      <Box justifyContent="space-between">
        <Text bold color={theme.text.accent}>
          Swarm · {view.swarm?.phase || '—'}
        </Text>
        <Text color={theme.text.secondary}>
          {locale === 'zh' ? '↑↓ 历史 · Esc 返回' : '↑↓ History · Esc Back'}
        </Text>
      </Box>
      {view.error ? (
        <Text color={theme.status.error}>{safe(view.error)}</Text>
      ) : (
        <>
          <Text wrap="truncate-end">{safe(view.swarm?.objective || '')}</Text>
          {view.swarm && (
            <Text color={theme.text.secondary}>
              {locale === 'zh'
                ? '模型调度 / 失败轮数 / 唤醒轮数'
                : 'Model dispatches / Failed turns / Member turns'}
              : {view.swarm.budget.requests}/{view.swarm.budget.maxRequests} ·{' '}
              {view.swarm.budget.failedTurns}/{view.swarm.budget.maxFailedTurns}{' '}
              · {view.swarm.budget.turns}/{view.swarm.budget.maxTurns}
            </Text>
          )}
          {view.swarm?.stopReason && (
            <Text color={theme.status.error}>
              {safe(view.swarm.stopReason)}
            </Text>
          )}
          <Text color={theme.text.secondary}>
            {view.swarm?.members
              .map((member) => `@${member.name} [${member.state}]`)
              .join(' · ') ||
              (locale === 'zh'
                ? '等待协调者添加成员'
                : 'Waiting for the coordinator to add members')}
          </Text>
          <Box marginTop={1} flexDirection="column">
            {posts.map((post) => (
              <Box key={post.seq} flexDirection="column">
                <Text color={theme.text.accent}>
                  #{post.seq} @{post.sender}
                </Text>
                <Text wrap="truncate-end">
                  {safe(post.text).replaceAll('\n', ' ')}
                </Text>
              </Box>
            ))}
          </Box>
          <Text color={theme.text.secondary}>
            {locale === 'zh'
              ? '每秒刷新 · 等待成员不调用模型 · /swarm message @成员 指令'
              : 'Updates every second · Waiting members make no model calls · /swarm message @member instruction'}
          </Text>
        </>
      )}
    </Box>
  );
}
