import { emptySnapshot, isAbort } from './snapshot.js';
import { mapLimit } from './api.js';
import { buildGovernanceFindings, enrichAndResolve, mergeActiveSchedules, privilegedUserIds } from './governance.js';

export const SCOPES = {
  directory: ['Directory.Read.All'], roles: ['RoleManagement.Read.Directory'], reports: ['AuditLog.Read.All'],
  methods: ['UserAuthenticationMethod.Read.All'], authPolicy: ['Policy.Read.AuthenticationMethod'],
  conditionalAccess: ['Policy.Read.All'], arm: ['https://management.azure.com/user_impersonation'],
};
const GRAPH = 'https://graph.microsoft.com/v1.0';
const ADVANCED = { headers: { ConsistencyLevel: 'eventual' } };
const USER_FIELDS = 'id,displayName,userPrincipalName,userType,accountEnabled';

export function groupUsersUrl(id, transitive = false) {
  return `${GRAPH}/groups/${encodeURIComponent(id)}/${transitive ? 'transitiveMembers' : 'members'}/microsoft.graph.user?$select=${USER_FIELDS}&$top=999&$count=true`;
}

export async function collectTenant({ client, subscriptionId = '', check = () => {}, now = () => new Date() }) {
  const snapshot = emptySnapshot(), { data, coverage, warnings } = snapshot;
  const message = error => error?.message || String(error);
  function status(key, state, detail = '') { coverage[key] = { status: state, detail }; }
  async function collect(key, work, assign = value => { data[key] = value; }) {
    try {
      check(); const value = await work(); check(); assign(value);
      status(key, 'available'); return true;
    } catch (error) {
      if (isAbort(error)) throw error;
      check();
      const partial = Array.isArray(error.partialRows) && error.partialRows.length > 0;
      if (partial) assign(error.partialRows);
      status(key, partial ? 'partial' : 'unavailable', message(error));
      warnings.push(`${key}: ${message(error)}`);
      return false;
    }
  }
  const paged = (url, scopes, options) => client.paged(url, scopes, options);
  async function perObject(key, items, worker, target) {
    let failures = 0;
    const pairs = await mapLimit(items, 4, async item => {
      try { const value = await worker(item); check(); return [item.id, value]; }
      catch (error) {
        if (isAbort(error)) throw error;
        check(); failures++;
        warnings.push(`${key} for ${item.displayName || item.id}: ${message(error)}`);
        // An unreadable collection is unknown, never an empty collection.
        return null;
      }
    }, check);
    data[target || key] = Object.fromEntries(pairs.filter(Boolean));
    status(key, failures ? (failures === items.length ? 'unavailable' : 'partial') : 'available',
      failures ? `${failures}/${items.length} collections unreadable.` : '');
  }

  await Promise.all([
    collect('users', () => paged(`${GRAPH}/users?$select=${USER_FIELDS}&$top=999`, SCOPES.directory)),
    collect('groups', () => paged(`${GRAPH}/groups?$select=id,displayName,securityEnabled,mailEnabled,groupTypes,visibility,isAssignableToRole&$top=999`, SCOPES.directory)),
    collect('servicePrincipals', () => paged(`${GRAPH}/servicePrincipals?$select=id,displayName,appId,servicePrincipalType&$top=100`, SCOPES.directory)),
  ]);

  if (coverage.users.status === 'available') {
    await collect('userSignInActivity', () => paged(`${GRAPH}/users?$select=id,createdDateTime,signInActivity&$top=500`, [...SCOPES.directory, ...SCOPES.reports]), rows => {
      const byId = new Map(rows.map(user => [user.id, user]));
      data.users = data.users.map(user => ({ ...user, ...byId.get(user.id) }));
      data.userSignInActivityLoaded = true;
    });
    if (coverage.userSignInActivity.status === 'available' && data.users.some(user => user.accountEnabled === true &&
      !Number.isFinite(Date.parse(user.signInActivity?.lastSuccessfulSignInDateTime)))) {
      status('userSignInActivity', 'partial', 'Some users have no successful sign-in timestamp. Their inactivity is unknown.');
    }
  } else status('userSignInActivity', 'skipped', 'Complete user inventory is unavailable.');

  async function sample(url) {
    const body = await client.api(url, SCOPES.reports);
    if (!Array.isArray(body?.value)) throw new Error('The API did not return an activity collection.');
    return body.value;
  }
  await Promise.all([
    collect('directoryAudits', () => sample(`${GRAPH}/auditLogs/directoryAudits?$top=100&$orderby=activityDateTime%20desc`)),
    collect('signIns', () => sample(`${GRAPH}/auditLogs/signIns?$top=100&$orderby=createdDateTime%20desc`)),
  ]);
  for (const [key, flag, detail] of [['directoryAudits', 'directoryAuditsUnavailable', 'directoryAuditsMessage'], ['signIns', 'signInsUnavailable', 'signInsMessage']]) {
    snapshot[flag] = coverage[key].status !== 'available'; snapshot[detail] = coverage[key].detail;
  }

  await perObject('groupMemberships', data.groups, group => paged(groupUsersUrl(group.id), SCOPES.directory, ADVANCED));
  await perObject('groupOwners', data.groups, group => paged(`${GRAPH}/groups/${group.id}/owners?$select=id,displayName,userPrincipalName`, SCOPES.directory));
  if (coverage.groups.status !== 'available') {
    status('groupMemberships', 'partial', 'Group inventory is incomplete.');
    status('groupOwners', 'partial', 'Group inventory is incomplete.');
  }
  if (data.groups.some(group => group.visibility === 'HiddenMembership')) {
    status('groupMemberships', 'partial', 'Hidden membership cannot be certified with the requested scopes; no additional permission is requested.');
  }

  await collect('mfa', () => paged(`${GRAPH}/reports/authenticationMethods/userRegistrationDetails?$top=999`, SCOPES.reports));
  snapshot.mfaUnavailable = coverage.mfa.status !== 'available'; snapshot.mfaMessage = coverage.mfa.detail;
  // Detailed method access is an independent feature. Denied consent must not block inventory.
  try {
    if (data.users.length) await client.authorize(SCOPES.methods);
    check();
    await perObject('userAuthMethods', data.users, async user => {
      const methods = await paged(`${GRAPH}/users/${user.id}/authentication/methods`, SCOPES.methods);
      // Retain only fields needed for labels and TAP validity, not phone numbers or device details.
      return methods.map(method => Object.fromEntries(['id', '@odata.type', 'phoneType', 'isUsable', 'startDateTime', 'lifetimeInMinutes']
        .filter(key => Object.hasOwn(method, key)).map(key => [key, method[key]])));
    });
  } catch (error) {
    if (isAbort(error)) throw error;
    check(); status('userAuthMethods', 'unavailable', message(error));
    warnings.push(`Registered authentication methods: ${message(error)}`);
  }
  if (coverage.users.status !== 'available' && coverage.userAuthMethods.status === 'available') status('userAuthMethods', 'partial', 'User inventory is incomplete.');
  snapshot.authMethodsUnavailable = coverage.userAuthMethods.status === 'unavailable';
  snapshot.authMethodsMessage = coverage.userAuthMethods.detail;

  await collect('authMethodsPolicy', () => client.api(`${GRAPH}/policies/authenticationMethodsPolicy`, SCOPES.authPolicy));
  snapshot.authPolicyUnavailable = coverage.authMethodsPolicy.status !== 'available'; snapshot.authPolicyMessage = coverage.authMethodsPolicy.detail;
  await collect('conditionalAccessPolicies', () => paged(`${GRAPH}/identity/conditionalAccess/policies?$select=id,displayName,state,createdDateTime,modifiedDateTime,conditions,grantControls,sessionControls`, SCOPES.conditionalAccess));
  snapshot.conditionalAccessUnavailable = coverage.conditionalAccessPolicies.status !== 'available'; snapshot.conditionalAccessMessage = coverage.conditionalAccessPolicies.detail;

  await collect('directoryRoles', async () => {
    const roles = await paged(`${GRAPH}/directoryRoles?$select=id,displayName,roleTemplateId`, SCOPES.roles);
    let failures = 0;
    const rows = await mapLimit(roles, 4, async role => {
      try { return { ...role, members: await paged(`${GRAPH}/directoryRoles/${role.id}/members?$select=id,displayName,userPrincipalName`, SCOPES.roles) }; }
      catch (error) { if (isAbort(error)) throw error; failures++; warnings.push(`Members of ${role.displayName}: ${message(error)}`); return { ...role, members: null }; }
    }, check);
    if (failures) { const error = new Error(`${failures} directory roles have unreadable membership.`); error.partialRows = rows; throw error; }
    return rows;
  });
  await Promise.all([
    collect('directoryRoleDefinitions', () => paged(`${GRAPH}/roleManagement/directory/roleDefinitions`, SCOPES.roles)),
    collect('privilegedRoleAssignments', () => paged(`${GRAPH}/roleManagement/directory/roleAssignments?$select=id,principalId,roleDefinitionId,directoryScopeId,appScopeId`, SCOPES.roles)),
  ]);
  if (coverage.privilegedRoleAssignments.status !== 'available') {
    const known = new Set(data.privilegedRoleAssignments.map(a => a.principalId + '|' + a.roleDefinitionId));
    for (const role of data.directoryRoles) for (const member of role.members || []) {
      if (known.has(member.id + '|' + role.roleTemplateId)) continue;
      data.privilegedRoleAssignments.push({ id: `legacy:${role.id}:${member.id}`, principalId: member.id,
        roleDefinitionId: role.roleTemplateId || role.id, directoryScopeId: '/', _roleName: role.displayName,
        _principalName: member.displayName, _upn: member.userPrincipalName || '', _source: 'directoryRoles' });
    }
  }
  await Promise.all([
    collect('privilegedRoleSchedules', () => paged(`${GRAPH}/roleManagement/directory/roleAssignmentScheduleInstances?$select=id,principalId,roleDefinitionId,directoryScopeId,appScopeId,startDateTime,endDateTime,assignmentType,memberType`, SCOPES.roles),
      rows => { data.privilegedRoleAssignments = mergeActiveSchedules(data.privilegedRoleAssignments, rows); }),
    collect('privilegedRoleEligibilities', () => paged(`${GRAPH}/roleManagement/directory/roleEligibilityScheduleInstances?$select=id,principalId,roleDefinitionId,directoryScopeId,appScopeId,startDateTime,endDateTime,memberType`, SCOPES.roles)),
  ]);

  const azure = {
    azureRoleAssignments: '/providers/Microsoft.Authorization/roleAssignments?api-version=2022-04-01',
    azureRoleDefinitions: '/providers/Microsoft.Authorization/roleDefinitions?api-version=2022-04-01',
    resourceGroups: '/resourcegroups?api-version=2021-04-01', azureResources: '/resources?api-version=2021-04-01',
    virtualNetworks: '/providers/Microsoft.Network/virtualNetworks?api-version=2023-09-01',
    networkInterfaces: '/providers/Microsoft.Network/networkInterfaces?api-version=2023-09-01',
    publicIpAddresses: '/providers/Microsoft.Network/publicIPAddresses?api-version=2023-09-01',
    networkSecurityGroups: '/providers/Microsoft.Network/networkSecurityGroups?api-version=2023-09-01',
    subscription: '?api-version=2022-12-01',
  };
  if (subscriptionId) {
    const arm = `https://management.azure.com/subscriptions/${encodeURIComponent(subscriptionId)}`;
    let allowed = true;
    try { await client.authorize(SCOPES.arm); check(); }
    catch (error) { if (isAbort(error)) throw error; allowed = false;
      for (const key of Object.keys(azure)) status(key, 'unavailable', message(error));
      warnings.push(`Azure access unavailable: ${message(error)}`);
    }
    if (allowed) {
      await Promise.all(Object.entries(azure).map(([key, suffix]) => collect(key,
        () => key === 'subscription' ? client.api(arm + suffix, SCOPES.arm) : paged(arm + suffix, SCOPES.arm))));
      // Keep both child-scope inventory and assignments inherited from ancestor scopes.
      try {
        const inherited = await paged(arm + azure.azureRoleAssignments + '&$filter=atScope()', SCOPES.arm);
        check();
        const assignments = new Map(data.azureRoleAssignments.map(a => [a.id, a]));
        for (const a of inherited) assignments.set(a.id, { ...a,
          _inheritedAtSubscription: String(a.properties?.scope || '').toLowerCase() !== `/subscriptions/${subscriptionId}`.toLowerCase() });
        data.azureRoleAssignments = [...assignments.values()];
        if (data.azureRoleAssignments.length && coverage.azureRoleAssignments.status === 'unavailable') {
          status('azureRoleAssignments', 'partial', 'Assignments at/above the subscription were read, but child-scope inventory failed.');
        }
      } catch (error) {
        if (isAbort(error)) throw error; check();
        status('azureRoleAssignments', data.azureRoleAssignments.length ? 'partial' : 'unavailable', 'Inherited Azure assignments could not be read.');
        warnings.push(`Inherited Azure assignments: ${message(error)}`);
      }
    }
  } else {
    for (const key of Object.keys(azure)) status(key, 'skipped', 'No Azure Subscription ID configured.');
    warnings.push('Azure inventory was skipped because no Subscription ID is configured.');
  }

  enrichAndResolve(data);
  const groupIds = new Set([...data.privilegedRoleAssignments, ...data.privilegedRoleEligibilities]
    .filter(a => a._principalType === 'Group').map(a => a.principalId));
  for (const a of data.azureRoleAssignments) if (a._principalType === 'Group') groupIds.add(a.properties.principalId);
  const referencedGroups = [...groupIds].map(id => data.groups.find(g => g.id === id) || { id });
  await perObject('effectivePrivileges', referencedGroups,
    group => paged(groupUsersUrl(group.id, true), SCOPES.directory, ADVANCED), 'transitiveGroupMembers');
  if (referencedGroups.some(group => group.visibility === 'HiddenMembership')) status('effectivePrivileges', 'partial', 'A privileged group has hidden membership that cannot be certified with the requested scopes.');
  if (coverage.groups.status !== 'available' || coverage.privilegedRoleAssignments.status !== 'available' ||
    coverage.privilegedRoleEligibilities.status !== 'available') status('effectivePrivileges', 'partial', 'Assignments or group inventory are incomplete; some indirect privilege may be unknown.');
  enrichAndResolve(data);

  const report = new Map(data.mfa.map(row => [row.id, row]));
  const privileged = privilegedUserIds(data);
  if (coverage.mfa.status === 'available' && data.users.some(user => user.accountEnabled === true && (user.userType !== 'Guest' || privileged.has(user.id)) &&
    (typeof report.get(user.id)?.isMfaCapable !== 'boolean' || typeof report.get(user.id)?.isMfaRegistered !== 'boolean'))) {
    status('mfa', 'partial', 'Some in-scope users have no registration/capability result. Missing results are unknown.');
  }
  data.findings = buildGovernanceFindings(data, coverage, { subscriptionId, now: now().getTime() });
  check(); snapshot.loadedAt = now();
  return snapshot;
}
