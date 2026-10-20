import test from 'node:test';
import assert from 'node:assert/strict';
import { createDashboardController } from '../src/controller.js';
import { emptySnapshot } from '../src/snapshot.js';

const a = { homeAccountId: 'person', tenantId: 'tenant-a' }, b = { homeAccountId: 'person', tenantId: 'tenant-b' };
function setup() {
  const pending = [], state = { ...emptySnapshot(), account: a, config: {}, msal: { setActiveAccount() {} } };
  const controller = createDashboardController({ state, render() {}, makeClient: value => value,
    collect: options => new Promise((resolve, reject) => pending.push({ resolve, reject, options })) });
  return { state, pending, controller };
}
const result = label => ({ ...emptySnapshot(), loadedAt: new Date(), data: { ...emptySnapshot().data, users: [{ id: label }] } });

test('logout clears immediately and late collector completion cannot repopulate data', async () => {
  const { state, pending, controller } = setup();
  const refresh = controller.refresh(); controller.changeAccount(null);
  assert.equal(state.loading, false); assert.equal(state.loadedAt, null);
  assert.equal(pending[0].options.client.signal.aborted, true);
  pending[0].resolve(result('old tenant')); await refresh;
  assert.deepEqual(state.data.users, []); assert.equal(state.loadedAt, null);
});

test('switching tenants prevents old results and errors from overwriting the new snapshot', async () => {
  for (const fail of [false, true]) {
    const { state, pending, controller } = setup();
    const first = controller.refresh(); controller.changeAccount(b); const second = controller.refresh();
    pending[1].resolve(result('tenant-b')); await second;
    if (fail) pending[0].reject(new Error('old error')); else pending[0].resolve(result('tenant-a'));
    await first;
    assert.equal(state.data.users[0].id, 'tenant-b'); assert.equal(state.error, ''); assert.equal(state.loading, false);
  }
});

test('replacement refresh ignores late results even for the same account', async () => {
  const { state, pending, controller } = setup(); const first = controller.refresh(); const second = controller.refresh();
  pending[1].resolve(result('new')); await second; pending[0].resolve(result('old')); await first;
  assert.equal(state.data.users[0].id, 'new');
});
