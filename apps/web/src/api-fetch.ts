import { language } from './i18n.js';

export function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('Accept-Language', language() === 'zh' ? 'zh-Hans-MY' : 'en-MY');
  return fetch(input, { ...init, headers });
}
