/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { Script, createContext } from 'node:vm';
import { expect, it, vi } from 'vitest';
import { cockpitHtml } from './drillCockpitPage.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

// Execute the generated page script, including refresh and the form handler.
// Only DOM primitives are represented here; no copied business logic.
function page() {
  const elements = new Map<string, ReturnType<typeof element>>();
  function element() {
    const attributes = new Map<string, string>();
    return {
      value: '',
      disabled: false,
      hidden: false,
      textContent: '',
      dataset: {},
      children: [],
      namespaceURI: 'http://www.w3.org/2000/svg',
      classList: { add() {}, remove() {} },
      setAttribute: (name: string, value: string) =>
        attributes.set(name, value),
      getAttribute: (name: string) => attributes.get(name),
      removeAttribute: (name: string) => attributes.delete(name),
      append() {},
      prepend() {},
      replaceChildren() {},
      addEventListener() {},
      querySelectorAll: () => [],
      onsubmit: undefined as
        | undefined
        | ((event: { preventDefault: () => void }) => Promise<void>),
    };
  }
  const get = (id: string) => {
    if (!elements.has(id)) elements.set(id, element());
    return elements.get(id)!;
  };
  const status = {
    ready: true,
    sessionId: 'page-session',
    locale: 'en',
    effort: 'medium',
    providers: [],
    facts: [],
    patches: [],
    grant: { granted: false },
  };
  const send = deferred<Response>();
  const post = vi.fn(() => send.promise);
  const statusFetch = vi.fn(() => Promise.resolve(Response.json(status)));
  const fetch = vi.fn((url: string) => {
    if (url === '/api/prompt') return post();
    if (url === '/api/status') return statusFetch();
    return Promise.resolve(
      Response.json({ config: { enabled: true, prompt: '', rules: [] } }),
    );
  });
  const sandbox = createContext({
    document: {
      body: {},
      documentElement: {},
      hidden: false,
      getElementById: get,
      createElement: element,
      createElementNS: element,
      createTreeWalker: () => ({ nextNode: () => false }),
      querySelectorAll: () => [],
      addEventListener() {},
    },
    NodeFilter: { SHOW_TEXT: 4 },
    location: { hash: '', pathname: '/' },
    sessionStorage: { getItem: () => 'fixture-token' },
    AbortSignal,
    fetch,
    addEventListener() {},
    requestAnimationFrame: (callback: () => void) => callback(),
    setInterval() {},
  });
  const html = cockpitHtml('fixture');
  const script = html.match(/<script nonce="fixture">([\s\S]*?)<\/script>/)![1];
  new Script(script).runInContext(sandbox);
  return {
    get,
    send,
    post,
    status,
    statusFetch,
    fetch,
    refresh: () => new Script('refresh()').runInContext(sandbox),
    submit: () => get('task').onsubmit!({ preventDefault() {} }),
  };
}

it('keeps one pending submission across ready status refreshes and keyboard resubmission', async () => {
  const view = page();
  await view.refresh();
  expect(view.get('submit').disabled).toBe(false);
  view.get('prompt').value = 'Preserve this task draft';
  const pending = view.submit();
  expect(view.get('task').getAttribute('aria-busy')).toBe('true');
  expect(view.fetch).toHaveBeenCalledWith(
    '/api/prompt',
    expect.objectContaining({
      headers: expect.objectContaining({ 'X-Drill-Session': 'page-session' }),
    }),
  );
  await view.refresh();
  expect(view.get('submit').disabled).toBe(true);
  await view.submit();
  expect(view.post).toHaveBeenCalledOnce();
  view.status.ready = false;
  view.send.resolve(Response.json({ message: 'Accepted' }, { status: 202 }));
  await pending;
  expect(view.get('submit').disabled).toBe(true);
  expect(view.get('task').getAttribute('aria-busy')).toBe('false');
  expect(view.get('prompt').value).toBe('Preserve this task draft');
  expect(view.get('feedback').textContent).toBe('Accepted');
});

it('preserves the draft and releases pending state after failure without retrying the task', async () => {
  const view = page();
  await view.refresh();
  expect(view.get('submit').disabled).toBe(false);
  view.get('prompt').value = 'Retry only when explicitly requested';
  const pending = view.submit();
  view.send.resolve(
    Response.json({ error: 'Session changed' }, { status: 409 }),
  );
  await pending;
  expect(view.get('task').getAttribute('aria-busy')).toBe('false');
  expect(view.get('submit').disabled).toBe(false);
  expect(view.get('prompt').value).toBe('Retry only when explicitly requested');
  expect(view.get('prompt').getAttribute('aria-invalid')).toBe('true');
  expect(view.get('feedback').textContent).toBe('Session changed');
  expect(view.post).toHaveBeenCalledOnce();
});

it('requires a fresh ready status when refresh fails after acceptance without resending the task', async () => {
  const view = page();
  await view.refresh();
  view.get('prompt').value = 'Accepted once';
  const pending = view.submit();
  view.statusFetch.mockRejectedValueOnce(new Error('Status unavailable'));
  view.send.resolve(Response.json({ message: 'Accepted' }, { status: 202 }));
  await pending;
  expect(view.get('submit').disabled).toBe(true);
  expect(view.get('task').getAttribute('aria-busy')).toBe('false');
  expect(view.get('feedback').textContent).toBe('Accepted');
  await view.submit();
  expect(view.post).toHaveBeenCalledOnce();
  await view.refresh();
  expect(view.get('submit').disabled).toBe(false);
  expect(view.post).toHaveBeenCalledOnce();
});
