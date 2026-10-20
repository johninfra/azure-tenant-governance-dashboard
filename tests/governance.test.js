import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyData, emptySnapshot } from '../src/snapshot.js';
import { enrichAndResolve, privilegedRows, privilegedUserIds, buildGovernanceFindings,
  authenticationPosture, usableMfaRegistration, policyHasMandatoryAuthControl, mergeActiveSchedules } from '../src/governance.js';

const now = Date.parse('2026-10-20T12:00:00Z');
const owner = '8e3af657-a8ff-443c-a75c-2fe8c4bcb635';
function fixture() {
  const data = emptyData();
  data.users = [{ id: 'u', displayName: 'User', userPrincipalName: 'user@example.test', accountEnabled: true, userType: 'Guest' }];
  data.groups = [{ id: 'g', displayName: 'Admins' }];
  data.directoryRoleDefinitions = [{ id: 'r', displayName: 'Global Administrator', isPrivileged: true }];
  data.privilegedRoleAssignments = [{ id: 'a', principalId: 'g', roleDefinitionId: 'r', directoryScopeId: '/' }];
  data.privilegedRoleEligibilities = [{ id: 'e', principalId: 'g', roleDefinitionId: 'r', directoryScopeId: '/administrativeUnits/unit' }];
  data.transitiveGroupMembers.g = [data.users[0], data.users[0]];
  data.azureRoleAssignments = [{ id: 'arm-a', properties: { principalId: 'g', principalType: 'Group',
    roleDefinitionId: `/providers/Microsoft.Authorization/roleDefinitions/${owner}`, scope: '/subscriptions/sub' } }];
  data.azureRoleDefinitions = [{ id: `/subscriptions/sub/providers/Microsoft.Authorization/roleDefinitions/${owner}`, properties: { roleName: 'Owner' } }];
  return data;
}

test('group-assigned active and eligible access resolves users once and preserves source/scope', () => {
  const data = fixture(); enrichAndResolve(data);
  assert.deepEqual([...privilegedUserIds(data)], ['u']);
  const rows = privilegedRows(data).filter(a => a.principalId === 'u');
  assert.equal(rows.length, 2); assert.deepEqual(rows.map(a => a._access), ['Active', 'Eligible']);
  assert.equal(rows[0]._viaGroupName, 'Admins'); assert.equal(rows[0]._assignmentId, 'a');
  assert.equal(rows[1].directoryScopeId, '/administrativeUnits/unit');
  assert.equal(data.effectiveAzureRoleAssignments.length, 1);
  enrichAndResolve(data); assert.equal(data.effectivePrivilegedAssignments.length, 2);
});

test('MFA, stale-admin and guest Azure findings include group-assigned users', () => {
  const data = fixture(); data.mfa = [{ id: 'u', isMfaCapable: false }];
  data.userSignInActivityLoaded = true; data.users[0].signInActivity = { lastSuccessfulSignInDateTime: '2026-01-01T00:00:00Z' };
  enrichAndResolve(data);
  const findings = buildGovernanceFindings(data, {}, { subscriptionId: 'sub', now });
  for (const title of ['Privileged Entra user is not MFA-capable', 'Stale privileged account', 'Guest account has broad subscription access']) {
    assert.ok(findings.some(f => f.title === title && f.subject === 'user@example.test'), title);
  }
  assert.ok(findings.some(f => f.detail.includes('through group Admins')));
});

test('unreadable group membership is not interpreted as no privileged access', () => {
  const data = fixture(); delete data.transitiveGroupMembers.g; enrichAndResolve(data);
  assert.equal(data.privilegedRoleAssignments[0]._principalType, 'Group');
  assert.equal(data.effectivePrivilegedAssignments.length, 0);
  assert.equal(privilegedUserIds(data).size, 0);
  assert.equal(data.privilegedRoleAssignments.length, 1);
});

test('registered methods never imply report capability or actual MFA enforcement', () => {
  const methods = [{ '@odata.type': '#microsoft.graph.microsoftAuthenticatorAuthenticationMethod' }];
  const posture = authenticationPosture({ methods, methodsReadable: true });
  assert.equal(posture.registered, true); assert.equal(posture.capable, null); assert.equal(posture.enforcement, 'Unknown');
  const reported = authenticationPosture({ methods, methodsReadable: true, report: { isMfaRegistered: true, isMfaCapable: false } });
  assert.equal(reported.registered, true); assert.equal(reported.capable, false); assert.equal(reported.enforcement, 'Unknown');
  assert.equal(authenticationPosture({}).registered, null);
});

test('expired, future, consumed and incompletely described TAPs do not count as usable registrations', () => {
  const tap = { '@odata.type': '#microsoft.graph.temporaryAccessPassAuthenticationMethod', isUsable: true,
    startDateTime: '2026-10-20T11:30:00Z', lifetimeInMinutes: 60 };
  assert.equal(usableMfaRegistration(tap, now), true);
  for (const override of [{ isUsable: false }, { startDateTime: '2026-10-20T13:00:00Z' },
    { lifetimeInMinutes: 1 }, { lifetimeInMinutes: undefined }, { startDateTime: null }]) {
    assert.equal(usableMfaRegistration({ ...tap, ...override }, now), false);
  }
});

test('OR alternatives, report-only policies and block policies do not imply mandatory MFA', () => {
  const policy = { state: 'enabled', grantControls: { operator: 'OR', builtInControls: ['mfa', 'compliantDevice'] } };
  assert.equal(policyHasMandatoryAuthControl(policy), false);
  assert.equal(policyHasMandatoryAuthControl({ ...policy, grantControls: { ...policy.grantControls, operator: 'AND' } }), true);
  assert.equal(policyHasMandatoryAuthControl({ state: 'enabled', grantControls: { operator: 'OR', builtInControls: ['mfa'] } }), true);
  assert.equal(policyHasMandatoryAuthControl({ state: 'enabledForReportingButNotEnforced', grantControls: { builtInControls: ['mfa'] } }), false);
  assert.equal(policyHasMandatoryAuthControl({ state: 'enabled', grantControls: { operator: 'OR', authenticationStrength: { id: 's' }, termsOfUse: ['terms'] } }), false);
  assert.equal(policyHasMandatoryAuthControl({ state: 'enabled', grantControls: { operator: 'AND', builtInControls: ['block', 'mfa'] } }), false);
});

test('missing or invalid sign-in activity never generates a stale-account finding', () => {
  for (const last of [null, undefined, 'bad-date', '2099-01-01T00:00:00Z']) {
    const data = fixture(); data.userSignInActivityLoaded = true;
    data.users[0].createdDateTime = '2020-01-01T00:00:00Z';
    data.users[0].signInActivity = { lastSuccessfulSignInDateTime: last }; enrichAndResolve(data);
    assert.ok(buildGovernanceFindings(data, {}, { now }).every(f => !/Stale|Dormant/.test(f.title)));
  }
});

test('PIM timing enrichment cannot remove standard active assignments', () => {
  const direct = [{ id: 'a', principalId: 'u1', roleDefinitionId: 'r', directoryScopeId: '/' },
    { id: 'b', principalId: 'u2', roleDefinitionId: 'r', directoryScopeId: '/' }];
  const rows = mergeActiveSchedules(direct, [{ ...direct[0], id: 'schedule', startDateTime: '2026-01-01' }]);
  assert.equal(rows.length, 2); assert.equal(rows[0].startDateTime, '2026-01-01'); assert.equal(rows[1].principalId, 'u2');
});

test('Azure role matching uses IDs and includes inherited ancestor access', () => {
  const data = fixture(); data.azureRoleDefinitions[0].properties.roleName = 'Renamed Owner';
  data.azureRoleAssignments[0].properties.scope = '/providers/Microsoft.Management/managementGroups/parent';
  data.azureRoleAssignments[0]._inheritedAtSubscription = true; enrichAndResolve(data);
  assert.ok(buildGovernanceFindings(data, {}, { subscriptionId: 'sub' }).some(f => f.title.includes('Owner')));
  data.azureRoleAssignments[0].properties.roleDefinitionId = 'custom-owner-named-role';
  enrichAndResolve(data);
  assert.ok(buildGovernanceFindings(data, {}, { subscriptionId: 'sub' }).every(f => !f.title.includes('Owner')));
});

test('a narrow policy is inventory evidence, never a per-user enforcement result', () => {
  const policy = { state: 'enabled', conditions: { users: { includeUsers: ['one-user'] } }, grantControls: { builtInControls: ['mfa'] } };
  assert.equal(policyHasMandatoryAuthControl(policy), true);
  assert.equal(authenticationPosture({ report: { isMfaCapable: true } }).enforcement, 'Unknown');
  const data = emptyData(); data.conditionalAccessPolicies = [{ ...policy, grantControls: { operator: 'OR', builtInControls: ['mfa', 'compliantDevice'] } }];
  const coverage = emptySnapshot().coverage; coverage.conditionalAccessPolicies.status = 'available';
  assert.ok(buildGovernanceFindings(data, coverage).some(f => f.title.includes('No mandatory')));
});
