/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { z } from 'zod';
import { withAgentWorkingDirectory } from '../config/scoped-config.js';

const schema = z.object({
  id: z.string().uuid(),
  source: z.string(),
  directory: z.string(),
  baseline: z.string().regex(/^[a-f0-9]{40,64}$/),
  phase: z.enum(['ready', 'exported', 'applied', 'removed']),
  patch: z.string().optional(),
  patchSha256: z.string().optional(),
  result: z
    .string()
    .regex(/^[a-f0-9]{40,64}$/)
    .optional(),
  acceptedTree: z
    .string()
    .regex(/^[a-f0-9]{40,64}$/)
    .optional(),
  cleanupHead: z
    .string()
    .regex(/^[a-f0-9]{40,64}$/)
    .optional(),
});
export type AgentWorktree = z.infer<typeof schema>;
const maxBytes = 64 * 1024 * 1024;
function folder(root: string, id: string): string {
  z.string().uuid().parse(id);
  return path.join(root, 'agent-worktrees', id);
}
function save(root: string, state: AgentWorktree): void {
  const file = path.join(folder(root, state.id), 'state.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temp, JSON.stringify(schema.parse(state), null, 2), {
      mode: 0o600,
    });
    fs.renameSync(temp, file);
  } finally {
    fs.rmSync(temp, { force: true });
  }
}
function environment(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of Object.keys(env))
    if (
      /^GIT_(?:DIR|WORK_TREE|INDEX_FILE|COMMON_DIR|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|CONFIG|NAMESPACE)/i.test(
        key,
      )
    )
      delete env[key];
  return { ...env, GIT_TERMINAL_PROMPT: '0', ...extra };
}
function git(
  cwd: string,
  args: string[],
  extra: NodeJS.ProcessEnv = {},
): Buffer {
  return execFileSync(
    'git',
    ['-c', 'core.hooksPath=', '-c', 'core.fsmonitor=false', ...args],
    {
      cwd,
      env: environment(extra),
      windowsHide: true,
      timeout: 30000,
      maxBuffer: maxBytes,
    },
  );
}
function text(cwd: string, args: string[]): string {
  return git(cwd, args).toString('utf8').trim();
}
function same(a: string, b: string): boolean {
  // Native resolution also expands Windows 8.3 aliases emitted by runner TEMP.
  return (
    path.relative(fs.realpathSync.native(a), fs.realpathSync.native(b)) === ''
  );
}
function assertOwned(root: string, state: AgentWorktree): void {
  if (
    path.resolve(state.directory) !==
    path.resolve(folder(root, state.id), 'workspace')
  )
    throw new Error('Worktree path does not match its managed task directory.');
  if (state.phase === 'removed')
    throw new Error(
      'This worktree was removed; preserved patches remain available.',
    );
  if (fs.lstatSync(state.directory).isSymbolicLink())
    throw new Error('Managed worktree cannot be a symbolic link.');
  const listed = git(state.source, ['worktree', 'list', '--porcelain', '-z'])
    .toString('utf8')
    .split('\0');
  if (
    !listed.some(
      (entry) =>
        entry.startsWith('worktree ') && same(entry.slice(9), state.directory),
    )
  )
    throw new Error(
      'Managed worktree is no longer registered in the source repository.',
    );
  if (
    ![state.baseline, state.cleanupHead].includes(
      text(state.directory, ['rev-parse', 'HEAD']),
    )
  )
    throw new Error(
      'Worktree HEAD changed; preserve the worktree and reconcile its commits before export.',
    );
}
/** Snapshot through a private alternate index; never stage/reset the source index. */
function snapshot(source: string, index: string): string {
  if (
    git(source, ['ls-files', '--stage'])
      .toString('utf8')
      .split('\n')
      .some((line) => line.startsWith('160000 '))
  )
    throw new Error(
      'Task worktree snapshots do not yet support submodules; use shared mode for this repository.',
    );
  // Reject huge plain files before git add writes their blobs. Ignored build outputs stay excluded.
  const files = git(source, [
    'ls-files',
    '-z',
    '--cached',
    '--others',
    '--exclude-standard',
  ])
    .toString('utf8')
    .split('\0')
    .filter(Boolean);
  let bytes = 0;
  for (const relative of new Set(files)) {
    const file = path.resolve(source, relative);
    if (!file.startsWith(path.resolve(source) + path.sep))
      throw new Error('Snapshot contains an invalid repository path.');
    const segments = relative.split(/[\\/]/);
    let parent = source;
    for (const segment of segments.slice(0, -1)) {
      parent = path.join(parent, segment);
      if (fs.existsSync(parent) && fs.lstatSync(parent).isSymbolicLink())
        throw new Error(
          'Snapshot files cannot traverse a symbolic-link directory.',
        );
    }
    try {
      const stat = fs.lstatSync(file);
      if (stat.isFile()) bytes += stat.size;
    } catch (error) {
      if (
        !(
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          error.code === 'ENOENT'
        )
      )
        throw error;
    }
    if (bytes > maxBytes)
      throw new Error(
        'Worktree snapshot exceeds 64 MiB; narrow the repository or exclude generated files first.',
      );
  }
  try {
    git(source, ['read-tree', 'HEAD'], { GIT_INDEX_FILE: index });
    git(source, ['add', '-A', '--', '.'], { GIT_INDEX_FILE: index });
    return git(source, ['write-tree'], { GIT_INDEX_FILE: index })
      .toString('utf8')
      .trim();
  } finally {
    fs.rmSync(index, { force: true });
    fs.rmSync(index + '.lock', { force: true });
  }
}
export function readAgentWorktree(
  root: string,
  id: string,
): AgentWorktree | undefined {
  const file = path.join(folder(root, id), 'state.json');
  if (!fs.existsSync(file)) return undefined;
  if (fs.statSync(file).size > 16384)
    throw new Error('Worktree state is too large.');
  const state = schema.parse(JSON.parse(fs.readFileSync(file, 'utf8')));
  if (state.id !== id) throw new Error('Worktree state ID mismatch.');
  return state;
}
export function prepareAgentWorktree(
  root: string,
  id: string,
  sourceDirectory: string,
): AgentWorktree {
  const old = readAgentWorktree(root, id);
  if (old) {
    assertOwned(root, old);
    return old;
  }
  const source = fs.realpathSync.native(sourceDirectory);
  if (!same(source, text(source, ['rev-parse', '--show-toplevel'])))
    throw new Error(
      'Worktree mode requires the repository root as the active workspace.',
    );
  const destination = path.join(folder(root, id), 'workspace');
  if (path.resolve(destination).startsWith(path.resolve(source) + path.sep))
    throw new Error('Managed worktrees must be outside the source repository.');
  fs.mkdirSync(folder(root, id), { recursive: true });
  if (fs.existsSync(destination))
    throw new Error(
      'Task worktree directory already exists without a saved manifest; preserve and inspect it.',
    );
  const tree = snapshot(source, path.join(folder(root, id), 'snapshot.index'));
  const parent = text(source, ['rev-parse', 'HEAD']);
  const baseline = git(
    source,
    [
      'commit-tree',
      tree,
      '-p',
      parent,
      '-m',
      'Gemini Ultra isolated task snapshot',
    ],
    {
      GIT_AUTHOR_NAME: 'Gemini Ultra',
      GIT_AUTHOR_EMAIL: 'local@invalid',
      GIT_COMMITTER_NAME: 'Gemini Ultra',
      GIT_COMMITTER_EMAIL: 'local@invalid',
    },
  )
    .toString('utf8')
    .trim();
  git(source, ['worktree', 'add', '--detach', '--', destination, baseline]);
  const state: AgentWorktree = {
    id,
    source,
    directory: destination,
    baseline,
    phase: 'ready',
  };
  save(root, state);
  return state;
}
export async function inAgentWorktree<T>(
  root: string,
  id: string,
  run: (directory?: string) => Promise<T>,
  required = false,
): Promise<T> {
  const state = readAgentWorktree(root, id);
  if (!state) {
    if (required)
      throw new Error(
        'This task requires its saved worktree manifest. Restore it before resuming; source execution is refused.',
      );
    return run();
  }
  assertOwned(root, state);
  if (state.phase === 'applied')
    throw new Error(
      'This worktree result was already applied; create a new task for further work.',
    );
  return withAgentWorkingDirectory(state.directory, () => run(state.directory));
}
export function exportAgentWorktree(root: string, id: string): AgentWorktree {
  const state = readAgentWorktree(root, id);
  if (!state) throw new Error('No worktree was prepared for this task.');
  assertOwned(root, state);
  if (state.phase === 'applied') return state;
  const tree = snapshot(
    state.directory,
    path.join(folder(root, id), 'export.index'),
  );
  const patch = path.join(folder(root, id), 'result.patch');
  const content = git(state.directory, [
    'diff',
    '--binary',
    '--full-index',
    '--no-ext-diff',
    '--no-textconv',
    state.baseline,
    tree,
    '--',
  ]);
  fs.writeFileSync(patch, content, { mode: 0o600 });
  state.result = tree;
  state.patch = patch;
  state.patchSha256 = createHash('sha256').update(content).digest('hex');
  state.phase = 'exported';
  save(root, state);
  return state;
}
export function applyAgentWorktree(root: string, id: string): AgentWorktree {
  const state = exportAgentWorktree(root, id);
  if (state.phase === 'applied') return state;
  if (!state.acceptedTree || state.result !== state.acceptedTree)
    throw new Error(
      'Current worktree content has not passed the native final review, or changed after review. Preserve the patch and resolve review before applying.',
    );
  if (!same(state.source, text(state.source, ['rev-parse', '--show-toplevel'])))
    throw new Error('Source repository identity changed.');
  if (fs.statSync(state.patch!).size) {
    git(state.source, ['apply', '--check', '--binary', '--', state.patch!]);
    git(state.source, ['apply', '--binary', '--', state.patch!]);
  }
  state.phase = 'applied';
  save(root, state);
  return state;
}
export function acceptAgentWorktree(root: string, id: string): void {
  if (!readAgentWorktree(root, id)) return;
  const state = exportAgentWorktree(root, id);
  state.acceptedTree = state.result;
  save(root, state);
}
export function agentWorktreeTree(
  root: string,
  id: string,
): string | undefined {
  const state = readAgentWorktree(root, id);
  if (!state) return undefined;
  assertOwned(root, state);
  return snapshot(
    state.directory,
    path.join(folder(root, id), `review-${randomUUID()}.index`),
  );
}
export function acceptReviewedAgentWorktree(
  root: string,
  id: string,
  reviewedTree?: string,
): void {
  if (!readAgentWorktree(root, id)) return;
  if (!reviewedTree || agentWorktreeTree(root, id) !== reviewedTree)
    throw new Error(
      'Isolated files changed during or after independent review; preserve them and review the current worktree again.',
    );
  acceptAgentWorktree(root, id);
}
/** No force deletion. A changed worktree must be exported and applied first. */
export function removeAgentWorktree(root: string, id: string): AgentWorktree {
  const state = readAgentWorktree(root, id);
  if (!state) throw new Error('No managed worktree for this task.');
  assertOwned(root, state);
  // Git removes ignored files even without --force. Preserve dependencies and
  // other ignored user content until the user explicitly clears them.
  if (
    git(state.directory, [
      'ls-files',
      '--others',
      '--ignored',
      '--exclude-standard',
      '-z',
    ]).length
  )
    throw new Error(
      'Worktree contains Git-ignored files. Preserve or remove them explicitly before workspace remove; automatic cleanup is refused.',
    );
  const tree = snapshot(
    state.directory,
    path.join(folder(root, id), 'cleanup.index'),
  );
  const baselineTree = text(state.directory, [
    'rev-parse',
    `${state.baseline}^{tree}`,
  ]);
  if (
    tree !== baselineTree &&
    (state.phase !== 'applied' || tree !== state.result)
  )
    throw new Error(
      'Worktree has changes; retain it and its patch. Clean removal is available after reverting changes inside this isolated worktree.',
    );
  if (tree !== baselineTree) {
    // Preserve an applied result as a detached Git commit, then align only this
    // disposable index/HEAD. No working files or source index are reset.
    const commit = git(
      state.directory,
      [
        'commit-tree',
        tree,
        '-p',
        state.baseline,
        '-m',
        'Gemini Ultra applied task result',
      ],
      {
        GIT_AUTHOR_NAME: 'Gemini Ultra',
        GIT_AUTHOR_EMAIL: 'local@invalid',
        GIT_COMMITTER_NAME: 'Gemini Ultra',
        GIT_COMMITTER_EMAIL: 'local@invalid',
      },
    )
      .toString('utf8')
      .trim();
    state.cleanupHead = commit;
    save(root, state);
    git(state.directory, [
      'update-ref',
      '--no-deref',
      'HEAD',
      commit,
      text(state.directory, ['rev-parse', 'HEAD']),
    ]);
    git(state.directory, ['read-tree', tree]);
  }
  git(state.source, ['worktree', 'remove', '--', state.directory]);
  state.phase = 'removed';
  save(root, state);
  return state;
}
/** Shared local command implementation. The caller checks task ownership/idle state. */
export function agentWorktreeCommand(
  root: string,
  id: string,
  source: string,
  argument: string,
  canPrepare: boolean,
  completed: boolean,
): AgentWorktree | undefined {
  switch (argument.trim() || 'status') {
    case 'status':
      return readAgentWorktree(root, id);
    case 'on':
      if (!readAgentWorktree(root, id) && !canPrepare)
        throw new Error(
          'Enable worktree mode before the first member turn. Use prepare to configure a new task locally.',
        );
      return prepareAgentWorktree(root, id, source);
    case 'export':
      return exportAgentWorktree(root, id);
    case 'apply':
      if (!completed)
        throw new Error(
          'Complete the native independent final review before applying the isolated result.',
        );
      return applyAgentWorktree(root, id);
    case 'remove':
      return removeAgentWorktree(root, id);
    default:
      throw new Error(
        'Usage: workspace on|status|export|apply|remove. Enable before starting; source changes are applied only with the local apply command.',
      );
  }
}
