const MFA_TYPES = /microsoftauthenticator|fido2|passkey|windowshelloforbusiness|softwareoath|hardwareoath|phoneauthentication|temporaryaccesspass|x509certificate/;

export function isMfaRegistration(method = {}) {
  return MFA_TYPES.test(String(method['@odata.type'] || '').toLowerCase());
}

export function usableMfaRegistration(method = {}, now = Date.now()) {
  if (!isMfaRegistration(method)) return false;
  if (!String(method['@odata.type']).toLowerCase().includes('temporaryaccesspass')) return true;
  const start = Date.parse(method.startDateTime), lifetime = Number(method.lifetimeInMinutes);
  return method.isUsable === true && Number.isFinite(start) && lifetime > 0 &&
    start <= now && now < start + lifetime * 60000;
}

export function authenticationPosture({ report, methods = [], methodsReadable = false }, now = Date.now()) {
  return {
    registered: typeof report?.isMfaRegistered === 'boolean' ? report.isMfaRegistered :
      methodsReadable ? methods.some(isMfaRegistration) : null,
    capable: typeof report?.isMfaCapable === 'boolean' ? report.isMfaCapable : null,
    usableRegistration: methodsReadable ? methods.some(method => usableMfaRegistration(method, now)) : null,
    // Registration, capability and policy inventory do not prove enforcement for a user/sign-in.
    enforcement: 'Unknown',
  };
}

export function policyHasMandatoryAuthControl(policy = {}) {
  if (String(policy.state).toLowerCase() !== 'enabled') return false;
  const grant = policy.grantControls || {}, controls = grant.builtInControls || [];
  if (controls.includes('block')) return false;
  const strength = Boolean(grant.authenticationStrength?.id || grant.authenticationStrength?.displayName);
  if (!controls.includes('mfa') && !strength) return false;
  const count = controls.length + Number(strength) + (grant.termsOfUse?.length || 0) +
    (grant.customAuthenticationFactors?.length || 0);
  return String(grant.operator).toUpperCase() === 'AND' || count === 1;
}

export function roleAssignmentKey(assignment) {
  return [assignment.principalId, assignment.roleDefinitionId, assignment.directoryScopeId || '/', assignment.appScopeId || ''].join('|');
}

export function mergeActiveSchedules(assignments, schedules) {
  const merged = new Map(assignments.map(a => [roleAssignmentKey(a), a]));
  for (const schedule of schedules) {
    const key = roleAssignmentKey(schedule);
    merged.set(key, { ...merged.get(key), ...schedule });
  }
  return [...merged.values()];
}

export function enrichAndResolve(data) {
  const principals = new Map();
  for (const u of data.users) principals.set(u.id, { ...u, name: u.displayName, upn: u.userPrincipalName,
    type: u.userType === 'Guest' ? 'Guest user' : 'User' });
  for (const g of data.groups) principals.set(g.id, { ...g, name: g.displayName, type: 'Group' });
  for (const sp of data.servicePrincipals) principals.set(sp.id, { ...sp, name: sp.displayName, type: 'Service principal' });
  // Legacy memberships may contain principals not present in the main inventory.
  for (const role of data.directoryRoles) for (const member of role.members || []) {
    if (!principals.has(member.id)) principals.set(member.id, { ...member, name: member.displayName,
      upn: member.userPrincipalName, type: /group$/i.test(member['@odata.type'] || '') ? 'Group' :
        member.userPrincipalName ? 'User' : 'Unknown' });
  }
  const definitions = new Map(data.directoryRoleDefinitions.map(r => [r.id, r]));
  const enrich = (assignment, access) => {
    const p = principals.get(assignment.principalId) || {}, definition = definitions.get(assignment.roleDefinitionId);
    return { ...assignment, _access: access, _roleName: assignment._roleName || definition?.displayName || assignment.roleDefinitionId || 'Unknown role',
      _principalName: assignment._principalName || p.name || assignment.principalId || 'Unknown principal',
      _upn: assignment._upn || p.upn || '', _principalType: p.type || assignment._principalType || 'Unknown',
      _isPrivileged: definition?.isPrivileged };
  };
  data.privilegedRoleAssignments = data.privilegedRoleAssignments.map(a => enrich(a, 'Active'));
  data.privilegedRoleEligibilities = data.privilegedRoleEligibilities.map(a => enrich(a, 'Eligible'));

  const roleId = value => String(value || '').split('/').pop().toLowerCase();
  const azureRoles = new Map(data.azureRoleDefinitions.map(r => [roleId(r.id), r.properties?.roleName]));
  data.azureRoleAssignments = data.azureRoleAssignments.map(a => {
    const p = a.properties || {}, principal = principals.get(p.principalId) || {};
    return { ...a, _roleName: azureRoles.get(roleId(p.roleDefinitionId)) || roleId(p.roleDefinitionId) || 'Unknown role',
      _principalName: principal.name || p.principalId || 'Unknown principal', _upn: principal.upn || '',
      _principalType: principal.type || p.principalType || 'Unknown' };
  });

  function inheritedUsers(assignment, azure = false) {
    const groupId = azure ? assignment.properties?.principalId : assignment.principalId;
    if (assignment._principalType !== 'Group') return [];
    const unique = new Map((data.transitiveGroupMembers[groupId] || []).map(user => [user.id, user]));
    return [...unique.values()].map(user => {
      const p = principals.get(user.id) || { name: user.displayName || user.id, upn: user.userPrincipalName,
        type: user.userType === 'Guest' ? 'Guest user' : 'User' };
      return { ...assignment, id: `${assignment.id}:via:${groupId}:${user.id}`,
        ...(azure ? { properties: { ...assignment.properties, principalId: user.id, principalType: 'User' } } : { principalId: user.id }),
        _assignmentId: assignment.id, _viaGroupId: groupId, _viaGroupName: principals.get(groupId)?.name || groupId,
        _principalName: p.name, _upn: p.upn || '', _principalType: p.type,
      };
    });
  }
  data.effectivePrivilegedAssignments = [...data.privilegedRoleAssignments, ...data.privilegedRoleEligibilities]
    .flatMap(a => inheritedUsers(a));
  data.effectiveAzureRoleAssignments = data.azureRoleAssignments.flatMap(a => inheritedUsers(a, true));
}

export function privilegedRows(data) {
  return [...data.privilegedRoleAssignments, ...data.privilegedRoleEligibilities, ...data.effectivePrivilegedAssignments];
}

export function privilegedUserIds(data) {
  return new Set(privilegedRows(data).filter(a => ['User', 'Guest user'].includes(a._principalType)).map(a => a.principalId));
}

export function azureRows(data) {
  return [...data.azureRoleAssignments, ...(data.effectiveAzureRoleAssignments || [])];
}

export function daysSince(value, now = Date.now()) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp <= now ? (now - timestamp) / 86400000 : null;
}

const BUILTIN_AZURE_ROLES = {
  owner: '8e3af657-a8ff-443c-a75c-2fe8c4bcb635',
  contributor: 'b24988ac-6180-42a0-ab88-20f7382dd24c',
  access: '18d7d88d-d35e-4628-a5f7-947b3e40cc0d',
};

export function buildGovernanceFindings(data, coverage, { subscriptionId = '', now = Date.now() } = {}) {
  const findings = [], seen = new Set();
  const add = (severity, title, detail, subject = '', key = `${title}|${subject}`) => {
    if (!seen.has(key)) { seen.add(key); findings.push({ severity, title, detail, subject }); }
  };
  const mfa = new Map(data.mfa.map(row => [row.id, row]));
  const users = new Map(data.users.map(user => [user.id, user]));
  const sensitive = /global administrator|privileged role administrator|privileged authentication administrator|authentication administrator|security administrator|user administrator|application administrator|cloud application administrator/i;

  for (const group of data.groups) {
    const owners = data.groupOwners[group.id];
    if ((group.securityEnabled || group.groupTypes?.includes('Unified')) && Array.isArray(owners) && !owners.length) {
      add('medium', 'Ownerless group', `${group.displayName || group.id} has no owner returned by Microsoft Graph. Review accountable ownership.`,
        group.displayName || group.id, `owners:${group.id}`);
    }
  }
  for (const user of data.users.filter(u => u.accountEnabled === true && u.userType !== 'Guest')) {
    if (mfa.get(user.id)?.isMfaCapable === false) add('medium', 'Enabled member is not MFA-capable',
      `${user.displayName} is not MFA-capable according to the registration report. This does not establish whether MFA is enforced.`, user.userPrincipalName, `mfa:${user.id}`);
    if (!mfa.has(user.id) && Object.hasOwn(data.userAuthMethods, user.id) && !data.userAuthMethods[user.id].some(method => usableMfaRegistration(method, now))) {
      add('medium', 'No currently usable MFA registration returned', `${user.displayName} has no currently usable MFA method returned by the methods API. Capability and enforcement remain unknown.`, user.userPrincipalName, `methods:${user.id}`);
    }
  }
  const active = privilegedRows(data).filter(a => a._access === 'Active' && ['User', 'Guest user'].includes(a._principalType));
  const byUser = new Map();
  for (const assignment of active) {
    if (!byUser.has(assignment.principalId)) byUser.set(assignment.principalId, []);
    byUser.get(assignment.principalId).push(assignment);
    if (!assignment._isPrivileged && !sensitive.test(assignment._roleName)) continue;
    const user = users.get(assignment.principalId);
    if (user?.accountEnabled === false) continue;
    const via = assignment._viaGroupName ? ` through group ${assignment._viaGroupName}` : '';
    if (mfa.get(assignment.principalId)?.isMfaCapable === false) add('high', 'Privileged Entra user is not MFA-capable',
      `${assignment._principalName} has ${assignment._roleName}${via} but is not MFA-capable in the registration report.`,
      assignment._upn || assignment.principalId, `priv-mfa:${assignment.principalId}:${assignment.roleDefinitionId}`);
    else if (!mfa.has(assignment.principalId) && Object.hasOwn(data.userAuthMethods, assignment.principalId) &&
      !data.userAuthMethods[assignment.principalId].some(method => usableMfaRegistration(method, now))) {
      add('high', 'Privileged Entra user has no usable MFA registration returned',
        `${assignment._principalName} has ${assignment._roleName}${via}; no currently usable MFA registration was returned. Capability and enforcement remain unknown.`,
        assignment._upn || assignment.principalId, `priv-methods:${assignment.principalId}:${assignment.roleDefinitionId}`);
    }
  }
  if (data.userSignInActivityLoaded) {
    for (const [id, assignments] of byUser) {
      const user = users.get(id); if (!user || user.accountEnabled !== true) continue;
      const age = daysSince(user.signInActivity?.lastSuccessfulSignInDateTime, now);
      if (age === null || age < 45) continue;
      const roles = [...new Set(assignments.map(a => a._roleName))];
      add(assignments.some(a => a._isPrivileged || sensitive.test(a._roleName)) ? 'high' : 'medium', 'Stale privileged account',
        `${user.displayName || id} has active access (${roles.join(', ')}) and last successfully signed in ${Math.floor(age)} days ago. Review continued need for access.`, user.userPrincipalName || id, `stale:${id}`);
    }
    for (const user of data.users.filter(u => u.userType === 'Guest' && u.accountEnabled === true)) {
      const age = daysSince(user.signInActivity?.lastSuccessfulSignInDateTime, now);
      if (age !== null && age >= 90) add('medium', 'Dormant guest account',
        `${user.displayName || user.id} last successfully signed in ${Math.floor(age)} days ago. Confirm the external relationship remains valid.`, user.userPrincipalName || user.id, `guest:${user.id}`);
    }
  }
  if (coverage.conditionalAccessPolicies?.status === 'available') {
    const policies = data.conditionalAccessPolicies;
    if (!policies.length) add('medium', 'No Conditional Access policies returned',
      'Review whether Security Defaults or another strategy is intentionally used. MFA enforcement has not been established.');
    else if (!policies.some(p => String(p.state).toLowerCase() === 'enabled')) add('medium', 'No enabled Conditional Access policies detected',
      'Disabled and report-only policies do not enforce their controls. Review other protections and intended coverage.');
    else if (!policies.some(policyHasMandatoryAuthControl)) add('medium', 'No mandatory Conditional Access MFA or strength control observed',
      'No enabled policy requires MFA or authentication strength without an alternative grant control. Other protections and effective user/application coverage require review.');
  }
  const subscription = `/subscriptions/${subscriptionId}`.toLowerCase();
  for (const assignment of azureRows(data)) {
    const p = assignment.properties || {}, scope = String(p.scope || '').toLowerCase();
    // Ancestor assignments originate from ARM's atScope() result for this subscription.
    const broad = subscriptionId && (scope === subscription || assignment._inheritedAtSubscription === true);
    if (!broad) continue;
    const role = String(p.roleDefinitionId || '').split('/').pop().toLowerCase();
    const subject = assignment._upn || assignment._principalName, human = ['User', 'Guest user'].includes(assignment._principalType);
    const via = assignment._viaGroupName ? ` through group ${assignment._viaGroupName}` : '';
    const key = `${p.principalId}:${role}:${scope}`;
    if (role === BUILTIN_AZURE_ROLES.owner) add(human ? 'high' : 'medium', 'Broad Owner assignment covering subscription',
      `${assignment._principalName} has Owner${via} at ${p.scope}. Review whether this breadth is necessary.`, subject, `owner:${key}`);
    if (role === BUILTIN_AZURE_ROLES.access) add('high', 'User Access Administrator covering subscription',
      `${assignment._principalName} can manage role assignments${via} across the subscription.`, subject, `uaa:${key}`);
    if (role === BUILTIN_AZURE_ROLES.contributor && human) add('medium', 'Human account has Contributor across subscription',
      `${assignment._principalName} has broad write access${via}. Consider a narrower role or scope.`, subject, `contributor:${key}`);
    if (assignment._principalType === 'Guest user' && Object.values(BUILTIN_AZURE_ROLES).includes(role)) add('high', 'Guest account has broad subscription access',
      `${assignment._principalName} is a guest with ${assignment._roleName}${via}. Review continued need.`, subject, `guest-rbac:${key}`);
  }
  return findings.sort((a, b) => ({ high: 0, medium: 1, low: 2 }[a.severity] - { high: 0, medium: 1, low: 2 }[b.severity]));
}
