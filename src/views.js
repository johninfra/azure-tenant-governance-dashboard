import { authenticationPosture } from './governance.js';

export function renderOverviewView(state, { esc, badge, stat, pct, review, privilegedCount, membershipCount }) {
  const reports = new Map(state.data.mfa.map(row => [row.id, row]));
  const posture = state.data.users.map(user => authenticationPosture({ report: reports.get(user.id),
    methods: state.data.userAuthMethods[user.id] || [], methodsReadable: Object.hasOwn(state.data.userAuthMethods, user.id) }));
  const capability = posture.filter(value => value.capable !== null);
  const registrations = posture.filter(value => value.registered !== null);
  const useCapability = capability.length > 0, known = useCapability ? capability : registrations;
  const yes = known.filter(value => useCapability ? value.capable : value.registered).length;
  const percent = known.length ? yes / known.length * 100 : NaN;
  const label = useCapability ? 'MFA capability' : 'MFA registration';
  const count = key => state.coverage[key]?.status === 'available' ? state.data[key].length :
    state.coverage[key]?.status === 'partial' ? `${state.data[key].length} (partial)` : 'Unknown';
  const enabled = state.data.conditionalAccessPolicies.filter(policy => policy.state === 'enabled').length;
  const reportOnly = state.data.conditionalAccessPolicies.filter(policy => policy.state === 'enabledForReportingButNotEnforced').length;
  const high = state.data.findings.filter(finding => finding.severity === 'high').length;
  return `<section><div class="grid stats">
    ${stat('Users', count('users'), `${state.data.users.filter(user => user.userType === 'Guest').length} guests returned`)}
    ${stat('Groups', count('groups'), `${membershipCount} direct user memberships returned`)}
    ${stat(label, pct(percent), `${yes}/${known.length} known results; ${state.data.users.length - known.length} unknown. Enforcement unknown.`)}
    ${stat('Privileged users', privilegedCount, `${state.data.privilegedRoleAssignments.length} active assignments; ${state.data.privilegedRoleEligibilities.length} eligible. Includes resolved groups.`)}
    ${stat('CA policies', count('conditionalAccessPolicies'), `${enabled} enabled; ${reportOnly} report-only. Coverage not evaluated.`)}
    ${stat('Azure resources', count('azureResources'), `${state.data.virtualNetworks.length} VNets; ${state.data.resourceGroups.length} resource groups returned`)}
    ${stat('Review score', review.score === null ? 'Incomplete' : review.score, review.score === null ? `${review.available}/${review.total} datasets available; score withheld` : `${high} high-severity findings; heuristic only`)}
  </div><div class="grid two-col">
    <div class="card"><div class="section-title"><h2>MFA & authentication posture</h2><button class="btn" data-tab="mfa">View methods</button></div>
      ${known.length ? `<div class="hero-num">${pct(percent)}</div><div class="progress"><span style="width:${Math.max(0, Math.min(100, percent))}%"></span></div><div class="muted small">${esc(label)}: ${yes}/${known.length} known user results. ${state.data.users.length - known.length} users remain unknown.</div>` :
        '<div class="mfa-unavailable"><div class="mfa-icon">i</div><div><strong>Authentication evidence unavailable</strong><p>Registration and capability are unknown where Graph data could not be read.</p></div></div>'}
      <p class="muted small">Registration is not capability or enforcement. MFA enforcement is unknown; Conditional Access and other controls need separate validation.</p>
    </div>
    <div class="card"><div class="section-title"><h2>Highest-priority findings</h2><button class="btn" data-tab="findings">View all</button></div>
      ${state.data.findings.length ? state.data.findings.slice(0, 5).map(finding => `<div class="finding"><div>${badge(finding.severity.toUpperCase(), finding.severity)}</div><div><h3>${esc(finding.title)}</h3><p>${esc(finding.subject || finding.detail)}</p></div></div>`).join('') :
        `<div class="empty">No findings detected in available evidence.${review.complete ? '' : ' Some checks are incomplete.'} This is not a security certification.</div>`}
    </div>
  </div></section>`;
}

// Keep the existing cards, tables, badges and search controls; make the evidence explicit.
export function renderMfaView(state, { esc, badge, toolbar, authMethodLabel,
  authPolicyConfigs, authPolicyLabel, authPolicyTargets }) {
  const query = state.search.toLowerCase();
  const methodsFor = id => state.data.userAuthMethods[id] || [];
  const report = new Map(state.data.mfa.map(row => [row.id, row]));
  const users = state.data.users.filter(user => `${user.displayName || ''} ${user.userPrincipalName || ''} ${methodsFor(user.id).map(authMethodLabel).join(' ')}`
    .toLowerCase().includes(query)).sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));
  const policy = authPolicyConfigs().slice().sort((a, b) => authPolicyLabel(a.id).localeCompare(authPolicyLabel(b.id)));
  const enabled = policy.filter(method => String(method.state).toLowerCase() === 'enabled').length;
  const answer = value => value === null ? badge('Unknown', 'neutral') : badge(value ? 'Yes' : 'No', value ? 'good' : 'medium');
  return `<section>
    <div class="card"><div class="section-title"><div><h2>Tenant authentication methods policy</h2><div class="muted small">Allowed methods and targeting; policy availability does not prove MFA enforcement</div></div><span class="muted small">${enabled} enabled of ${policy.length} configured methods</span></div>
      ${state.authPolicyUnavailable ? `<div class="notice warn">${esc(state.authPolicyMessage || 'Authentication methods policy unavailable.')}</div>` : policy.length ?
        `<div class="table-wrap"><table><thead><tr><th>Method</th><th>State</th><th>Targeting</th></tr></thead><tbody>${policy.map(method =>
          `<tr><td><strong>${esc(authPolicyLabel(method.id))}</strong></td><td>${badge(String(method.state || 'unknown').toUpperCase(), String(method.state).toLowerCase() === 'enabled' ? 'good' : 'neutral')}</td><td>${esc(authPolicyTargets(method))}</td></tr>`).join('')}</tbody></table></div>` :
        '<div class="empty">No authentication-method policy configurations were returned.</div>'}
    </div>
    <div class="card"><div class="section-title"><div><h2>User registered authentication methods</h2><div class="muted small">Registration: a method exists. Capability: Graph registration report. Enforcement: not established by this inventory.</div></div></div>
      <div class="notice info"><strong>MFA enforcement is unknown.</strong> Registered methods and MFA capability do not show whether a particular user or sign-in must satisfy MFA. Conditional Access targeting, exclusions, grant alternatives, Security Defaults and other controls require separate validation. SMS and phone methods are not phishing-resistant.</div>
      ${state.authMethodsUnavailable ? `<div class="notice warn"><strong>Detailed methods unavailable:</strong> ${esc(state.authMethodsMessage || 'No readable method inventory.')} Registration-report results, when readable, remain visible.</div>` : ''}
      ${toolbar('Search users, UPNs, or authentication methods...')}
      <div class="table-wrap"><table><thead><tr><th>User</th><th>Account</th><th>Registered methods</th><th>MFA registered</th><th>MFA capable (report)</th><th>MFA enforced</th></tr></thead><tbody>${users.map(user => {
        const known = Object.hasOwn(state.data.userAuthMethods, user.id), methods = methodsFor(user.id);
        const posture = authenticationPosture({ report: report.get(user.id), methods, methodsReadable: known });
        return `<tr><td><strong>${esc(user.displayName || 'Unnamed user')}</strong><br><span class="muted">${esc(user.userPrincipalName || user.id)}</span></td><td>${answer(typeof user.accountEnabled === 'boolean' ? user.accountEnabled : null)}<br><span class="muted small">Account enabled</span></td><td>${known ? esc([...new Set(methods.map(authMethodLabel))].join(', ') || 'No methods returned') : '<span class="muted">Not readable</span>'}${methods.some(method => String(method['@odata.type']).includes('temporaryAccessPass')) && posture.usableRegistration === false ? '<br><span class="muted small">TAP is expired, unusable, or its validity is unknown.</span>' : ''}</td><td>${answer(posture.registered)}</td><td>${answer(posture.capable)}</td><td>${badge(posture.enforcement, 'neutral')}</td></tr>`;
      }).join('') || '<tr><td colspan="6" class="empty">No users match the current filter.</td></tr>'}</tbody></table></div>
    </div>
    ${state.mfaUnavailable ? `<div class="notice info"><strong>Registration report unavailable:</strong> ${esc(state.mfaMessage)} Method registration is shown where readable; missing capability remains unknown.</div>` : ''}
  </section>`;
}
