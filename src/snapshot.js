// A refresh owns a private snapshot. Only its originating account may publish it.
export function accountKey(account) {
  if (!account) return '';
  return [account.homeAccountId || account.localAccountId || account.username,
    account.tenantId || account.idTokenClaims?.tid || ''].join('|');
}

export function aborted() {
  return new DOMException('The tenant session changed or the request was cancelled.', 'AbortError');
}

export function isAbort(error) {
  return error?.name === 'AbortError';
}

export class SnapshotSession {
  current = null;

  cancel() {
    this.current?.controller.abort();
    this.current = null;
  }

  begin(account) {
    this.cancel();
    const controller = new AbortController();
    const run = {
      account: { ...account }, key: accountKey(account), controller, signal: controller.signal,
      check: () => { if (this.current !== run || controller.signal.aborted) throw aborted(); },
    };
    this.current = run;
    return run;
  }

  canCommit(run, account) {
    return this.current === run && !run.signal.aborted && run.key === accountKey(account);
  }
}

export const DATASETS = {
  users: 'Users', groups: 'Groups', servicePrincipals: 'Service principals',
  groupMemberships: 'Direct group membership', groupOwners: 'Group owners',
  userSignInActivity: 'User sign-in activity', mfa: 'MFA registration and capability report',
  userAuthMethods: 'Registered authentication methods', authMethodsPolicy: 'Authentication methods policy',
  conditionalAccessPolicies: 'Conditional Access policies', directoryRoles: 'Directory role membership',
  directoryRoleDefinitions: 'Directory role definitions', privilegedRoleAssignments: 'Active Entra assignments',
  privilegedRoleSchedules: 'Active Entra assignment timing',
  privilegedRoleEligibilities: 'Eligible Entra assignments', effectivePrivileges: 'Group-based privilege resolution',
  directoryAudits: 'Directory audit sample', signIns: 'Sign-in sample',
  azureRoleAssignments: 'Azure RBAC assignments', azureRoleDefinitions: 'Azure RBAC definitions',
  subscription: 'Azure subscription', resourceGroups: 'Resource groups', azureResources: 'Azure resources',
  virtualNetworks: 'Virtual networks', networkInterfaces: 'Network interfaces',
  publicIpAddresses: 'Public IP addresses', networkSecurityGroups: 'Network security groups',
};

export function emptyData() {
  return {
    users: [], groups: [], servicePrincipals: [], groupMemberships: {}, groupOwners: {},
    transitiveGroupMembers: {}, mfa: [], userAuthMethods: {}, authMethodsPolicy: null,
    userSignInActivityLoaded: false, directoryRoles: [], directoryRoleDefinitions: [],
    privilegedRoleAssignments: [], privilegedRoleEligibilities: [], effectivePrivilegedAssignments: [],
    signIns: [], directoryAudits: [], azureRoleAssignments: [], effectiveAzureRoleAssignments: [], azureRoleDefinitions: [], subscription: null,
    resourceGroups: [], azureResources: [], virtualNetworks: [], networkInterfaces: [], publicIpAddresses: [],
    networkSecurityGroups: [], conditionalAccessPolicies: [], findings: [],
  };
}

export function emptySnapshot() {
  return {
    data: emptyData(), warnings: [], coverage: Object.fromEntries(Object.keys(DATASETS).map(key =>
      [key, { status: 'pending', detail: 'Not collected yet.' }])), loadedAt: null,
    mfaUnavailable: false, mfaMessage: '', authMethodsUnavailable: false, authMethodsMessage: '',
    authPolicyUnavailable: false, authPolicyMessage: '', signInsUnavailable: false, signInsMessage: '',
    directoryAuditsUnavailable: false, directoryAuditsMessage: '',
    conditionalAccessUnavailable: false, conditionalAccessMessage: '',
  };
}

export function assessment(coverage, findings = []) {
  const sources = Object.keys(DATASETS);
  const missing = sources.filter(key => coverage?.[key]?.status !== 'available');
  const deductions = findings.reduce((n, finding) => n + ({ high: 12, medium: 5, low: 2 }[finding.severity] || 0), 0);
  return {
    score: missing.length ? null : Math.max(0, 100 - deductions),
    complete: missing.length === 0, available: sources.length - missing.length, total: sources.length,
    missing: missing.map(key => ({ key, label: DATASETS[key], ...(coverage?.[key] || { status: 'pending' }) })),
  };
}
