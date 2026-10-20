import test from 'node:test';
import assert from 'node:assert/strict';
import { collectTenant, SCOPES } from '../src/collect.js';
import { assessment, SnapshotSession } from '../src/snapshot.js';
import { tenantClient, subscriptionId, users } from './helpers/tenant.js';

const now = () => new Date('2026-10-20T12:00:00Z');
async function collect(options = {}, subscription = subscriptionId) {
  const fixture = tenantClient(options);
  const snapshot = await collectTenant({ client: fixture.client, subscriptionId: subscription, now });
  return { ...fixture, snapshot };
}

test('successful collection preserves every existing data feature and can score only with complete evidence', async () => {
  const { snapshot, calls } = await collect();
  assert.deepEqual(assessment(snapshot.coverage).missing, []);
  for (const key of ['users', 'groups', 'mfa', 'directoryRoles', 'privilegedRoleAssignments', 'conditionalAccessPolicies', 'azureRoleAssignments', 'azureResources']) assert.ok(snapshot.data[key].length > 0, key);
  assert.equal(snapshot.data.effectivePrivilegedAssignments.length, 2);
  assert.equal(snapshot.data.effectiveAzureRoleAssignments.length, 2);
  assert.equal(snapshot.data.userAuthMethods.u[0].phoneNumber, undefined);
  assert.equal(snapshot.data.privilegedRoleAssignments[0].startDateTime, '2026-01-01T00:00:00Z');
  assert.ok(calls.every(call => call.options.method === 'GET'));
});

test('Graph queries respect page limits and advanced-query requirements for direct and transitive users', async () => {
  const { calls, authorizations } = await collect();
  const sp = calls.find(call => call.url.pathname.endsWith('/servicePrincipals'));
  assert.equal(sp.url.searchParams.get('$top'), '100');
  const memberships = calls.filter(call => /\/(members|transitiveMembers)\/microsoft.graph.user$/.test(call.url.pathname));
  assert.equal(memberships.length, 2);
  for (const { url, options } of memberships) {
    assert.equal(url.searchParams.get('$count'), 'true'); assert.equal(options.headers.ConsistencyLevel, 'eventual');
  }
  assert.ok(authorizations.some(scopes => scopes.includes('Directory.Read.All') && scopes.includes('AuditLog.Read.All')));
  assert.deepEqual(SCOPES.directory, ['Directory.Read.All']);
});

test('a nested Azure group member returned only by transitive membership gets effective access', async () => {
  const { snapshot } = await collect({ override: url => /\/members\/microsoft.graph.user$/.test(url.pathname) ? { value: [users[0]] } : undefined });
  assert.equal(snapshot.data.groupMemberships.g.length, 1);
  assert.ok(snapshot.data.effectiveAzureRoleAssignments.some(assignment => assignment.properties.principalId === 'guest'));
  assert.equal(snapshot.data.effectiveAzureRoleAssignments.find(assignment => assignment.properties.principalId === 'guest')._viaGroupName, 'Admins');
});

test('each failed Azure request preserves all independent successful inventory', async () => {
  for (const denied of ['/networkInterfaces', '/roleDefinitions', '/resources']) {
    const { snapshot } = await collect({ deny: url => url.origin.includes('management') && url.pathname.endsWith(denied) });
    assert.equal(snapshot.data.resourceGroups.length, 1);
    assert.equal(snapshot.data.azureResources.length, denied === '/resources' ? 0 : 1);
    assert.equal(snapshot.data.azureRoleAssignments.length, 1);
    assert.equal(snapshot.coverage[denied === '/resources' ? 'azureResources' : denied === '/roleDefinitions' ? 'azureRoleDefinitions' : 'networkInterfaces'].status, 'unavailable');
    assert.equal(assessment(snapshot.coverage, snapshot.data.findings).score, null);
  }
});

test('a later Azure page failure retains earlier rows and records partial coverage', async () => {
  const next = `https://management.azure.com/subscriptions/${subscriptionId}/resources?page=2`;
  const { snapshot } = await collect({
    override: url => url.pathname.endsWith('/resources') && !url.searchParams.has('page') ? { value: [{ id: 'known', name: 'Known resource' }], nextLink: next } : undefined,
    deny: url => url.href === next,
  });
  assert.equal(snapshot.coverage.azureResources.status, 'partial');
  assert.equal(snapshot.data.azureResources[0].name, 'Known resource');
  assert.equal(snapshot.data.resourceGroups.length, 1);
  assert.equal(assessment(snapshot.coverage).score, null);
});

test('partially readable per-user methods stay partial even when other users succeed', async () => {
  const { snapshot } = await collect({ deny: url => url.pathname.endsWith('/users/guest/authentication/methods') });
  assert.equal(snapshot.coverage.userAuthMethods.status, 'partial');
  assert.ok(Object.hasOwn(snapshot.data.userAuthMethods, 'u'));
  assert.ok(!Object.hasOwn(snapshot.data.userAuthMethods, 'guest'));
  assert.equal(assessment(snapshot.coverage).score, null);
});

test('optional consent denial leaves directory, role and Azure inventories usable', async () => {
  const { snapshot, calls } = await collect({ denyScope: scopes => scopes.includes('UserAuthenticationMethod.Read.All') });
  assert.equal(snapshot.data.users.length, 2); assert.equal(snapshot.data.azureResources.length, 1);
  assert.equal(snapshot.coverage.userAuthMethods.status, 'unavailable'); assert.equal(snapshot.authMethodsUnavailable, true);
  assert.ok(!calls.some(call => call.url.pathname.endsWith('/authentication/methods')));
  assert.equal(assessment(snapshot.coverage).score, null);
});

test('missing groups, group membership and hidden membership remain incomplete evidence', async () => {
  for (const suffix of ['/groups', '/transitiveMembers/microsoft.graph.user']) {
    const { snapshot } = await collect({ deny: url => url.pathname.endsWith(suffix) });
    assert.notEqual(snapshot.coverage.effectivePrivileges.status, 'available');
    assert.equal(snapshot.data.privilegedRoleAssignments.length, 1);
    assert.equal(assessment(snapshot.coverage).score, null);
  }
  const { snapshot } = await collect({ override: url => url.pathname.endsWith('/groups') ? { value: [{ id: 'g', displayName: 'Hidden', visibility: 'HiddenMembership' }] } : undefined });
  assert.equal(snapshot.coverage.effectivePrivileges.status, 'partial');
  assert.equal(snapshot.coverage.groupMemberships.status, 'partial');
});

test('null MFA and successful-sign-in evidence cannot become clean passes or inactivity findings', async () => {
  const { snapshot } = await collect({ override: url => url.pathname.endsWith('/userRegistrationDetails') ? { value: [] } :
    url.pathname.endsWith('/users') && url.searchParams.get('$select').includes('signInActivity') ? { value: users.map(user => ({ id: user.id, createdDateTime: '2020-01-01', signInActivity: null })) } : undefined });
  assert.equal(snapshot.coverage.mfa.status, 'partial'); assert.equal(snapshot.coverage.userSignInActivity.status, 'partial');
  assert.ok(snapshot.data.findings.every(finding => !/Stale|Dormant/.test(finding.title)));
  assert.equal(assessment(snapshot.coverage).score, null);
});

test('eligible-role failure preserves active schedule enrichment and withholds complete assessment', async () => {
  const { snapshot } = await collect({ deny: url => url.pathname.endsWith('/roleEligibilityScheduleInstances') });
  assert.equal(snapshot.data.privilegedRoleAssignments[0].startDateTime, '2026-01-01T00:00:00Z');
  assert.equal(snapshot.coverage.privilegedRoleEligibilities.status, 'unavailable');
  assert.equal(assessment(snapshot.coverage).score, null);
});

test('unconfigured Azure is explicitly skipped; empty successful logs are available', async () => {
  const { snapshot } = await collect({}, '');
  assert.equal(snapshot.coverage.azureResources.status, 'skipped');
  assert.equal(snapshot.coverage.signIns.status, 'available'); assert.equal(snapshot.signInsUnavailable, false);
  assert.equal(assessment(snapshot.coverage).score, null);
});

test('logout during real collection stops further requests and discards the private snapshot', async () => {
  const sessions = new SnapshotSession(); const run = sessions.begin({ homeAccountId: 'a' });
  let release; const gate = new Promise(resolve => { release = resolve; });
  const fixture = tenantClient({ check: run.check, signal: run.signal, override: async url => {
    if (url.pathname.endsWith('/users')) await gate;
  } });
  const request = collectTenant({ client: fixture.client, check: run.check, now });
  await new Promise(resolve => setImmediate(resolve)); sessions.cancel(); release();
  await assert.rejects(request, { name: 'AbortError' });
  assert.ok(fixture.calls.length <= 3);
});
