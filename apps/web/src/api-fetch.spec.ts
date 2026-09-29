import { afterEach, expect, it, vi } from 'vitest';
import { setLanguage } from './i18n.js';
import { apiFetch } from './api-fetch.js';

afterEach(async () => { vi.unstubAllGlobals(); await setLanguage('zh'); });

it('sends the selected language while preserving other request headers', async () => {
  const seen: Headers[] = [];
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    seen.push(new Headers(init?.headers));
    return new Response('{}');
  });
  vi.stubGlobal('fetch', fetchMock);
  await apiFetch('/example', { headers: { 'content-type': 'application/json' } });
  await setLanguage('en');
  await apiFetch('/example');
  expect(seen[0].get('Accept-Language')).toBe('zh-Hans-MY');
  expect(seen[0].get('content-type')).toBe('application/json');
  expect(seen[1].get('Accept-Language')).toBe('en-MY');
});
