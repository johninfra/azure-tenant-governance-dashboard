import { createApiClient } from '../../src/api.js';

export const subscriptionId = '12345678-1234-4234-8234-123456789abc';
export const ownerId = '8e3af657-a8ff-443c-a75c-2fe8c4bcb635';
export const ownerDefinition = `/subscriptions/${subscriptionId}/providers/Microsoft.Authorization/roleDefinitions/${ownerId}`;
export const users = [{ id: 'u', displayName: 'Example User', userPrincipalName: 'u@example.test', userType: 'Member', accountEnabled: true },
  { id: 'guest', displayName: 'Example Guest', userPrincipalName: 'guest@example.test', userType: 'Guest', accountEnabled: true }];
export const role = { id: 'a', principalId: 'g', roleDefinitionId: 'r', directoryScopeId: '/' };

export function tenantClient({ deny = () => false, override = () => undefined, denyScope = () => false, check, signal } = {}) {
  const calls = [], authorizations = [];
  const getToken = async scopes => {
    authorizations.push(scopes);
    if (denyScope(scopes)) throw new Error('Consent denied for optional feature');
    return 'test-only-token';
  };
  const bodyFor = async (url, options) => {
    const path = url.pathname;
    const custom = await override(url, options);
    if (custom !== undefined) return custom;
    if (url.origin === 'https://management.azure.com') {
      if (path.endsWith('/roleAssignments')) return { value: [{ id: 'arm-assignment', properties: {
        principalId: 'g', principalType: 'Group', roleDefinitionId: ownerDefinition, scope: `/subscriptions/${subscriptionId}` } }] };
      if (path.endsWith('/roleDefinitions')) return { value: [{ id: ownerDefinition, properties: { roleName: 'Owner' } }] };
      if (path.endsWith('/resourcegroups')) return { value: [{ id: 'rg', name: 'Example group' }] };
      if (path.endsWith('/resources')) return { value: [{ id: `/subscriptions/${subscriptionId}/resourceGroups/demo/providers/Microsoft.Compute/virtualMachines/vm`, name: 'vm', type: 'Microsoft.Compute/virtualMachines' }] };
      if (path.endsWith(subscriptionId)) return { displayName: 'Example subscription' };
      return { value: [] };
    }
    if (path.endsWith('/users')) return { value: url.searchParams.get('$select').includes('signInActivity') ? users.map(user => ({ id: user.id,
      createdDateTime: '2020-01-01T00:00:00Z', signInActivity: { lastSuccessfulSignInDateTime: '2026-10-19T12:00:00Z' } })) : users };
    if (path.endsWith('/groups')) return { value: [{ id: 'g', displayName: 'Admins', securityEnabled: true, groupTypes: [], visibility: 'Private' }] };
    if (/\/groups\/g\/(transitiveMembers|members)\/microsoft.graph.user$/.test(path)) return { value: users };
    if (path.endsWith('/owners')) return { value: [users[0]] };
    if (path.endsWith('/userRegistrationDetails')) return { value: users.map(user => ({ id: user.id, isMfaRegistered: true, isMfaCapable: true })) };
    if (path.endsWith('/authentication/methods')) return { value: [{ id: 'method', '@odata.type': '#microsoft.graph.microsoftAuthenticatorAuthenticationMethod', phoneNumber: 'must-not-be-stored' }] };
    if (path.endsWith('/authenticationMethodsPolicy')) return { authenticationMethodConfigurations: [{ id: 'microsoftAuthenticator', state: 'enabled', includeTargets: [{ id: 'all_users' }] }] };
    if (path.endsWith('/conditionalAccess/policies')) return { value: [{ id: 'policy', displayName: 'MFA', state: 'enabled', conditions: {
      users: { includeUsers: ['All'] }, applications: { includeApplications: ['All'] } }, grantControls: { operator: 'AND', builtInControls: ['mfa'] } }] };
    if (path.endsWith('/directoryRoles')) return { value: [{ id: 'legacy', displayName: 'Global Administrator', roleTemplateId: 'r' }] };
    if (path.endsWith('/directoryRoles/legacy/members')) return { value: [{ id: 'g', displayName: 'Admins', '@odata.type': '#microsoft.graph.group' }] };
    if (path.endsWith('/roleDefinitions')) return { value: [{ id: 'r', displayName: 'Global Administrator', isPrivileged: true }] };
    if (path.endsWith('/roleAssignments')) return { value: [role] };
    if (path.endsWith('/roleAssignmentScheduleInstances')) return { value: [{ ...role, id: 'schedule', startDateTime: '2026-01-01T00:00:00Z' }] };
    return { value: [] };
  };
  const client = createApiClient({ getToken, check, signal, maxRetries: 0,
    fetchImpl: async (target, options) => {
      const url = new URL(target); calls.push({ url, options });
      if (deny(url)) return new Response(JSON.stringify({ error: { message: 'Forbidden', code: 'AuthorizationFailed' } }), { status: 403 });
      return new Response(JSON.stringify(await bodyFor(url, options)), { status: 200 });
    } });
  return { client, calls, authorizations };
}
