import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import * as snapshots from '../src/snapshot.js';
import * as governance from '../src/governance.js';
import { createDashboardController } from '../src/controller.js';
import { renderMfaView, renderOverviewView } from '../src/views.js';
import { renderTopology } from './helpers/topology.js';
import { findingsCsv } from '../src/export.js';
import { collectTenant } from '../src/collect.js';
import { tenantClient, subscriptionId } from './helpers/tenant.js';

// Execute the real DOM controller and renderers with a minimal DOM and MSAL boundary.
// No authentication or Microsoft API request is made by this harness.
async function appHarness() {
  const root = { innerHTML: '' };
  let source = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  source = source.replace(/^import .*?;\r?\n/gm, '')
    .replace('import.meta.env.VITE_ENTRA_CLIENT_ID', JSON.stringify(subscriptionId))
    .replace('render();initAuth().catch(e=>{state.error=norm(e);render()});', '');
  const EventType = Object.fromEntries(['LOGOUT_START', 'ACCOUNT_REMOVED', 'ACTIVE_ACCOUNT_CHANGED', 'LOGIN_SUCCESS'].map(name => [name, name]));
  class FakeMsal {
    active = { homeAccountId: 'person', tenantId: 'tenant', username: 'user@example.test' };
    async initialize() {}
    enableAccountStorageEvents() {}
    addEventCallback(callback) { this.callback = callback; }
    async handleRedirectPromise() { return null; }
    getActiveAccount() { return this.active; }
    getAllAccounts() { return this.active ? [this.active] : []; }
    setActiveAccount(account) { this.active = account; }
  }
  const context = vm.createContext({ ...snapshots, createDashboardController, renderMfaView, renderOverviewView, findingsCsv,
    resolvedPrivilegedRows: governance.privilegedRows, privilegedUserIds: governance.privilegedUserIds,
    azureRows: governance.azureRows, usableMfaRegistration: governance.usableMfaRegistration,
    policyHasMandatoryAuthControl: governance.policyHasMandatoryAuthControl, renderTopology,
    EventType, PublicClientApplication: FakeMsal, InteractionRequiredAuthError: class extends Error {},
    localStorage: { getItem: () => null }, location: { origin: 'https://example.test' },
    document: { querySelector: selector => selector === '#app' ? root : null, querySelectorAll: () => [] },
  });
  new vm.Script(source).runInContext(context);
  const app = vm.runInContext('({state,render,signOut,initAuth,controller})', context);
  app.state.account = { homeAccountId: 'person', tenantId: 'tenant', username: 'user@example.test' };
  app.state.authReady = true;
  const fixture = tenantClient(); Object.assign(app.state, await collectTenant({ client: fixture.client, subscriptionId }));
  return { ...app, root, context };
}

test('all original tabs render with preserved layout and no unescaped directory content', async () => {
  const app = await appHarness();
  app.state.data.users[0].displayName = '<img src=x onerror=alert(1)>';
  for (const tab of ['overview', 'groups', 'privileged', 'mfa', 'roles', 'activity', 'conditionalAccess', 'topology', 'rbac', 'findings', 'setup']) {
    app.state.tab = tab; app.render();
    assert.match(app.root.innerHTML, /class="shell"/); assert.match(app.root.innerHTML, /class="nav"/);
    assert.ok(app.root.innerHTML.includes('data-tab="topology"'));
    assert.ok(!app.root.innerHTML.includes('<img src=x onerror='), tab);
  }
});

test('incomplete UI withholds score and MFA report stays visible when methods are denied', async () => {
  const app = await appHarness();
  app.state.coverage.networkInterfaces.status = 'unavailable'; app.state.tab = 'overview'; app.render();
  assert.match(app.root.innerHTML, /Review score withheld/); assert.match(app.root.innerHTML, /stat-value">Incomplete/);
  app.state.authMethodsUnavailable = true; app.state.data.userAuthMethods = {}; app.state.tab = 'mfa'; app.render();
  assert.match(app.root.innerHTML, /MFA capable \(report\)/); assert.match(app.root.innerHTML, /MFA enforcement is unknown/);
  assert.match(app.root.innerHTML, /u@example.test/); assert.ok(!app.root.innerHTML.includes('Strong/MFA-capable method'));
});

test('unreadable group membership is labelled unknown and effective roles show their group source', async () => {
  const app = await appHarness();
  delete app.state.data.groupMemberships.g; app.state.tab = 'groups'; app.render();
  assert.match(app.root.innerHTML, /Membership unavailable; effective access is unknown/);
  app.state.tab = 'privileged'; app.render(); assert.match(app.root.innerHTML, /Via group: Admins/);
  app.state.tab = 'rbac'; app.render(); assert.match(app.root.innerHTML, /Via group: Admins/);
});

test('hidden groups never display an empty membership as complete evidence', async () => {
  const app = await appHarness();
  app.state.data.groups[0].visibility = 'HiddenMembership'; app.state.data.groupMemberships.g = [];
  app.state.tab = 'groups'; app.render();
  assert.match(app.root.innerHTML, /0 \(partial\)/);
  assert.match(app.root.innerHTML, /Hidden membership may be incomplete/);
  assert.ok(!app.root.innerHTML.includes('No direct user members returned for this group.'));
});

test('successful empty sign-in logs render an available empty table', async () => {
  const app = await appHarness(); app.state.tab = 'activity'; app.render();
  assert.match(app.root.innerHTML, /Live sign-in logs available/);
  assert.match(app.root.innerHTML, /No sign-in events match/);
  assert.ok(!app.root.innerHTML.includes('Sign-in telemetry unavailable'));
});

test('actual sign-out handler clears the snapshot before the popup resolves or fails', async () => {
  for (const fail of [false, true]) {
    const app = await appHarness(); let complete, reject;
    app.state.msal = { setActiveAccount() {}, logoutPopup: () => new Promise((resolve, fail) => { complete = resolve; reject = fail; }) };
    const logout = app.signOut();
    assert.equal(app.state.account, null); assert.equal(app.state.loadedAt, null); assert.equal(app.state.data.users.length, 0);
    assert.ok(!app.root.innerHTML.includes('user@example.test'));
    if (fail) reject(new Error('popup blocked')); else complete();
    await logout; assert.equal(app.state.authBusy, false);
    assert.equal(app.state.data.users.length, 0);
  }
});

test('MSAL account-change and removal events invalidate the displayed snapshot', async () => {
  const app = await appHarness(); await app.initAuth();
  assert.ok(app.state.loadedAt);
  app.state.msal.active = { homeAccountId: 'person', tenantId: 'other-tenant' };
  app.state.msal.callback({ eventType: 'ACTIVE_ACCOUNT_CHANGED' });
  assert.equal(app.state.account.tenantId, 'other-tenant'); assert.equal(app.state.loadedAt, null);
  assert.equal(app.state.data.users.length, 0);
  app.state.msal.callback({ eventType: 'ACCOUNT_REMOVED', payload: app.state.account });
  assert.equal(app.state.account, null);
});
