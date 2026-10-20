import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiClient, waitForRetry } from '../src/api.js';
import { SnapshotSession } from '../src/snapshot.js';

const response = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers });
const graph = 'https://graph.microsoft.com/v1.0/groups';

test('GET-only pagination preserves advanced headers and refreshes tokens per page', async () => {
  const calls = []; let tokens = 0;
  const client = createApiClient({ getToken: async () => `token-${++tokens}`,
    fetchImpl: async (url, options) => { calls.push({ url, ...options });
      return response(calls.length === 1 ? { value: [1], '@odata.nextLink': `${graph}?page=2` } : { value: [2] }); } });
  assert.deepEqual(await client.paged(graph, ['Directory.Read.All'], { headers: { ConsistencyLevel: 'eventual' } }), [1, 2]);
  assert.equal(tokens, 2);
  assert.ok(calls.every(call => call.method === 'GET' && call.headers.ConsistencyLevel === 'eventual'));
  assert.equal(calls[1].headers.Authorization, 'Bearer token-2');
});

test('429 honors Retry-After; 401 forces token renewal; failures retain earlier pages', async () => {
  const delays = [], refresh = []; let count = 0;
  const client = createApiClient({ getToken: async (_, options) => { refresh.push(options.forceRefresh); return 'token'; },
    sleep: async delay => delays.push(delay), fetchImpl: async () => {
      count++;
      if (count === 1) return response({ error: { message: 'throttled' } }, 429, { 'Retry-After': '2' });
      if (count === 2) return response({}, 401);
      return response({ value: [] });
    } });
  await client.paged(graph, []);
  assert.deepEqual(delays, [2000]); assert.deepEqual(refresh, [false, false, true]);
  let pages = 0;
  const broken = createApiClient({ getToken: async () => 'token', fetchImpl: async () => ++pages === 1
    ? response({ value: ['known'], '@odata.nextLink': `${graph}?page=2` }) : response({ error: { message: 'denied' } }, 403) });
  await assert.rejects(broken.paged(graph, []), error => error.status === 403 && error.partialRows[0] === 'known');
});

test('logout aborts fetch, JSON parsing, retry waits and further pages', async () => {
  for (const stage of ['fetch', 'json']) {
    const sessions = new SnapshotSession(); const run = sessions.begin({ homeAccountId: 'a' });
    let release, observedSignal;
    const gate = new Promise(resolve => { release = resolve; });
    const client = createApiClient({ getToken: async () => 'token', signal: run.signal, check: run.check,
      fetchImpl: async (_, options) => { observedSignal = options.signal;
        if (stage === 'fetch') await gate;
        return { ok: true, json: async () => { if (stage === 'json') await gate; return { value: [1] }; } }; } });
    const request = client.paged(graph, []);
    await new Promise(resolve => setImmediate(resolve));
    sessions.cancel(); release();
    await assert.rejects(request, { name: 'AbortError' }); assert.equal(observedSignal.aborted, true);
  }
  const controller = new AbortController(); const waiting = waitForRetry(10000, controller.signal);
  controller.abort(); await assert.rejects(waiting, { name: 'AbortError' });
});

test('pagination never forwards bearer tokens to another origin or loops forever', async () => {
  for (const next of ['https://attacker.example/steal', 'https://management.azure.com/subscriptions', graph]) {
    let calls = 0;
    const client = createApiClient({ getToken: async () => 'token', fetchImpl: async () => {
      calls++; return response({ value: [1], '@odata.nextLink': next }); } });
    await assert.rejects(client.paged(graph, [])); assert.equal(calls, 1);
  }
});
