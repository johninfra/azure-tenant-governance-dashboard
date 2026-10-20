import { aborted, isAbort } from './snapshot.js';

export class ApiError extends Error {
  constructor(message, status, code, url) {
    super(message);
    this.name = 'ApiError';
    Object.assign(this, { status, code, url });
  }
}

export function waitForRetry(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(aborted()); return; }
    const cancel = () => { clearTimeout(timer); reject(aborted()); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', cancel); resolve(); }, ms);
    signal?.addEventListener('abort', cancel, { once: true });
  });
}

const API_ORIGINS = new Set(['https://graph.microsoft.com', 'https://management.azure.com']);

export function createApiClient({ getToken, signal, check = () => {}, fetchImpl = fetch,
  sleep = waitForRetry, timeoutMs = 30000, maxRetries = 2 }) {
  async function api(url, scopes, { headers = {}, origin } = {}) {
    check();
    const target = new URL(url);
    if (!API_ORIGINS.has(target.origin) || (origin && target.origin !== origin)) {
      throw new Error('Refusing to send an access token outside the requested Microsoft API.');
    }
    let renewed = false;
    for (let attempt = 0; ; attempt++) {
      check();
      const token = await getToken(scopes, { forceRefresh: renewed });
      check();
      const controller = new AbortController();
      const cancel = () => controller.abort();
      signal?.addEventListener('abort', cancel, { once: true });
      const timer = setTimeout(cancel, timeoutMs);
      let response, body;
      try {
        response = await fetchImpl(target.href, {
          method: 'GET', redirect: 'error', signal: controller.signal,
          headers: { Accept: 'application/json', ...headers, Authorization: `Bearer ${token}` },
        });
        check();
        try { body = await response.json(); }
        catch (error) { if (response.ok || isAbort(error)) throw error; }
        check();
      } catch (error) {
        if (signal?.aborted) throw aborted();
        if (controller.signal.aborted) throw new Error('The Microsoft API request timed out.');
        throw error;
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', cancel);
      }
      if (response.ok) return body;
      if (response.status === 401 && !renewed) { renewed = true; attempt--; continue; }
      if ([429, 502, 503, 504].includes(response.status) && attempt < maxRetries) {
        const retry = response.headers.get('Retry-After');
        const delay = retry === null ? 1000 * 2 ** attempt : /^\d+$/.test(retry)
          ? Number(retry) * 1000 : Math.max(0, Date.parse(retry) - Date.now());
        await sleep(Number.isFinite(delay) ? delay : 1000 * 2 ** attempt, signal);
        check();
        continue;
      }
      throw new ApiError(body?.error?.message || `${response.status} ${response.statusText}`,
        response.status, body?.error?.code, target.href);
    }
  }

  async function paged(url, scopes, options = {}) {
    const rows = [], seen = new Set(), origin = new URL(url).origin;
    let next = url;
    try {
      while (next) {
        check();
        if (seen.has(next)) throw new Error('The API returned a repeated pagination link.');
        seen.add(next);
        const body = await api(next, scopes, { ...options, origin });
        if (!Array.isArray(body?.value)) throw new Error('The API did not return a collection.');
        rows.push(...body.value);
        next = body['@odata.nextLink'] || body.nextLink || null;
      }
      return rows;
    } catch (error) {
      if (!isAbort(error)) error.partialRows = rows;
      throw error;
    }
  }
  return { api, paged, authorize: getToken };
}

export async function mapLimit(items, limit, worker, check = () => {}) {
  const out = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      check();
      const index = cursor++;
      out[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return out;
}
