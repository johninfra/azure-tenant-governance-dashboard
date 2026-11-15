import { azureRows, privilegedRows } from './governance.js';

const AZURE_ROLE_IDS = {
  owner: '8e3af657-a8ff-443c-a75c-2fe8c4bcb635',
  contributor: 'b24988ac-6180-42a0-ab88-20f7382dd24c',
  userAccessAdministrator: '18d7d88d-d35e-4628-a5f7-947b3e40cc0d',
  rbacAdministrator: 'f58310d9-a9f6-439a-9e8d-f62e7b41a168',
};
const roleId = value => String(value || '').split('/').pop().toLowerCase();
const readable = (coverage, key) => ['available', 'partial'].includes(coverage?.[key]?.status);
const broadScope = (scope, subscriptionId, inherited) => {
  const normalized = String(scope || '').replace(/\/$/, '').toLowerCase();
  return Boolean(inherited || (subscriptionId && normalized === `/subscriptions/${subscriptionId}`.toLowerCase()) ||
    /^\/providers\/microsoft\.management\/managementgroups\//i.test(normalized) || normalized === '/');
};
const isEmergencyNamed = assignment => /break.?glass|emergency access/i.test(
  `${assignment._principalName || ''} ${assignment._upn || ''}`
);
function add(items, { id, category, severity, title, identity, evidence, action, scope = '', exception = false }) {
  if (items.some(item => item.id === id)) return;
  items.push({ id, category, severity, title, identity, evidence, action, scope, exception });
}

export function analyzeIdentityRisk(data, coverage = {}, subscriptionId = '') {
  const items = [];
  const active = privilegedRows(data).filter(a => a._access === 'Active');
  // Only count the original role assignment once; resolved group users have separate access paths.
  const standing = active.filter(a => !a._viaGroupName);
  const globalAdmins = standing.filter(a => String(a._roleName).toLowerCase() === 'global administrator');
  for (const a of standing) {
    const name = String(a._roleName || '').toLowerCase();
    if (!['global administrator', 'privileged role administrator'].includes(name)) continue;
    const exception = isEmergencyNamed(a);
    add(items, {
      id: `entra:${a.id || a.principalId + ':' + a.roleDefinitionId}`,
      category: 'Standing privilege', severity: name === 'global administrator' ? 'high' : 'medium',
      title: `${a._roleName} — active assignment`, identity: a._principalName || a.principalId,
      evidence: `Active ${a._roleName} assignment${a._viaGroupName ? ' via group ' + a._viaGroupName : ''}; ${a.directoryScopeId === '/' ? 'tenant-wide' : 'scope ' + (a.directoryScopeId || 'not exposed')}. Active does not prove frequent use.`,
      action: exception
        ? 'Verify documented emergency-access designation, alerting, credential protection, and periodic access tests. Do not remove required break-glass access automatically.'
        : 'Validate business need; consider PIM eligible/JIT access instead of a standing active assignment where supported.',
      exception,
    });
  }
  const directAzure = data.azureRoleAssignments || [];
  const uniqueAzure = new Map(directAzure.map(a => [a.id || `${a.properties?.principalId}:${a.properties?.roleDefinitionId}:${a.properties?.scope}`, a]));
  for (const a of uniqueAzure.values()) {
    const p = a.properties || {}, id = roleId(p.roleDefinitionId);
    if (!broadScope(p.scope, subscriptionId, a._inheritedAtSubscription)) continue;
    const kind = id === AZURE_ROLE_IDS.owner ? 'Owner'
      : id === AZURE_ROLE_IDS.contributor ? 'Contributor'
      : id === AZURE_ROLE_IDS.userAccessAdministrator ? 'User Access Administrator'
      : id === AZURE_ROLE_IDS.rbacAdministrator ? 'Role Based Access Control Administrator'
      : null;
    if (!kind) continue;
    const canGrantAccess = kind === 'Owner' || kind.includes('Administrator');
    add(items, {
      id: `azure:${a.id || p.principalId + ':' + id + ':' + p.scope}`,
      category: 'Broad Azure RBAC', severity: canGrantAccess ? 'high' : 'medium',
      title: `${kind} at broad scope`, identity: a._principalName || p.principalId || 'Unknown principal',
      scope: p.scope || 'Not exposed',
      evidence: `Azure ${kind} role on a subscription-level or ancestor scope. Principal type: ${a._principalType || p.principalType || 'Unknown'}.`,
      action: canGrantAccess
        ? 'Review who can manage access at this scope. Reduce scope or use an appropriately narrow role if broad assignment is unnecessary.'
        : 'Confirm subscription-wide write access is needed; consider resource-group scope and task-specific built-in roles.',
    });
  }

  const missing = ['privilegedRoleAssignments', 'privilegedRoleEligibilities', 'azureRoleAssignments', 'azureRoleDefinitions', 'effectivePrivileges']
    .filter(key => coverage?.[key]?.status !== 'available');
  items.sort((a, b) => (a.severity === 'high' ? 0 : 1) - (b.severity === 'high' ? 0 : 1) ||
    a.category.localeCompare(b.category) || a.title.localeCompare(b.title) || a.identity.localeCompare(b.identity));
  return {
    items,
    metrics: {
      standingGlobalAdmins: readable(coverage, 'privilegedRoleAssignments') ? globalAdmins.length : null,
      eligibleEntra: readable(coverage, 'privilegedRoleEligibilities') ? data.privilegedRoleEligibilities.length : null,
      broadAzure: readable(coverage, 'azureRoleAssignments') ? items.filter(i => i.category === 'Broad Azure RBAC').length : null,
      highReview: items.filter(i => i.severity === 'high').length,
      emergencyNamed: items.filter(i => i.exception).length,
    },
    missing,
    coverageComplete: missing.length === 0,
    existingFindings: data.findings || [],
  };
}

export function renderIdentityRisk(state, { esc, badge }) {
  const assessment = analyzeIdentityRisk(state.data, state.coverage, state.config.subscriptionId || '');
  const { metrics, items, missing } = assessment;
  const q = String(state.search || '').toLowerCase();
  const filtered = items.filter(i => !q || [i.title, i.identity, i.evidence, i.action, i.scope, i.category].join(' ').toLowerCase().includes(q));
  const metric = (label, value, note, tone = '') => `<div class="access-metric ${tone}"><span>${esc(label)}</span><strong>${value === null ? '—' : esc(value)}</strong><small>${esc(note)}</small></div>`;
  return `<section class="access-page identity-risk-page">
    <div class="access-intro"><div><div class="eyebrow">Identity security • governance review</div><h2>Identity Risk & Least-Privilege Analysis</h2><p class="muted">Prioritized review candidates derived from the current Entra and Azure RBAC snapshot. Recommendations are advisory; no changes are made.</p></div>${badge('Read-only analysis', 'neutral')}</div>
    <div class="access-metrics">
      ${metric('Active Global Admin', metrics.standingGlobalAdmins, 'Original active role assignments', 'critical')}
      ${metric('PIM eligible', metrics.eligibleEntra, 'Eligible Entra assignments')}
      ${metric('Broad Azure RBAC', metrics.broadAzure, 'Built-in privileged roles at broad scope')}
      ${metric('High-priority reviews', metrics.highReview, 'Flags are not confirmed vulnerabilities')}
    </div>
    <div class="notice info"><strong>Interpretation:</strong> Standing privileges and wide scopes are review candidates, not proof of overprivilege. ${metrics.emergencyNamed} active assignment(s) have an emergency-access name and may be intentional. PIM eligibility, role activation, Conditional Access coverage, custom role actions, group inheritance, and scope must be validated before remediation.</div>
    ${missing.length ? `<div class="notice warn"><strong>Incomplete evidence:</strong> ${esc(missing.join(', '))}. Counts may be understated. Missing data is never treated as a pass.</div>` : ''}
    <div class="card access-table-card">
      <div class="section-title"><div><h2>Prioritized access reviews</h2><div class="muted small">Role and scope evidence with suggested least-privilege next steps • ${items.length} review candidates</div></div>${badge(assessment.coverageComplete ? 'Key datasets available' : 'Partial evidence', assessment.coverageComplete ? 'good' : 'medium')}</div>
      <div class="toolbar"><input class="search" data-search value="${esc(state.search || '')}" placeholder="Search principal, role, or scope…"><span class="muted small">${filtered.length} of ${items.length} shown</span></div>
      <div class="risk-review-list">${filtered.map(item => `<article class="risk-review-item"><div class="risk-review-top"><div class="risk-review-heading">${badge(item.severity === 'high' ? 'PRIORITY REVIEW' : 'REVIEW', item.severity === 'high' ? 'high' : 'medium')}${badge(item.category, 'neutral')}${item.exception ? badge('Emergency-named', 'low') : ''}</div><h3>${esc(item.title)}</h3><p class="muted"><strong>${esc(item.identity)}</strong>${item.scope ? ' • ' + esc(item.scope) : ''}</p></div><div class="risk-review-detail"><div><span class="risk-detail-label">Observed evidence</span><p>${esc(item.evidence)}</p></div><div><span class="risk-detail-label">Recommended next step</span><p>${esc(item.action)}</p></div></div></article>`).join('') || '<div class="empty">No matching review candidates in the available evidence. This does not establish that access is least-privileged.</div>'}</div>
    </div>
    <div class="card"><div class="section-title"><div><h2>Existing governance findings</h2><div class="muted small">The dashboard’s existing heuristic checks, separate from privilege review candidates</div></div><span class="muted small">${assessment.existingFindings.length} findings</span></div>
      ${assessment.existingFindings.length ? assessment.existingFindings.slice(0, 6).map(f => `<div class="finding"><div>${badge(String(f.severity || 'unknown').toUpperCase(), f.severity || 'neutral')}</div><div><h3>${esc(f.title)}</h3><p>${esc(f.detail)}</p></div></div>`).join('') : '<div class="empty">No heuristic findings detected in the collected evidence. This is not a security certification.</div>'}
      <div class="buttons"><button class="btn" data-tab="findings">View all findings</button><button class="btn" data-tab="privileged">Review Entra roles</button><button class="btn" data-tab="rbac">Review Azure RBAC</button></div>
    </div>
  </section>`;
}
