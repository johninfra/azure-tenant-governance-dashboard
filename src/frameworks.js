// Read-only, evidence-limited control alignment. This is NOT a compliance determination.
const available = (coverage, key) => coverage?.[key]?.status === 'available';
const details = (status, explanation, evidence = []) => ({ status, explanation, evidence });
const observed = (explanation, evidence) => details('Evidence detected', explanation, evidence);
const unknown = (explanation) => details('Requires validation', explanation);
const unassessed = (explanation) => details('Not assessed', explanation);
const gap = (explanation, evidence = []) => details('Gap identified', explanation, evidence);

export const FRAMEWORK_CONTROLS = [
  {
    id: 'authentication', title: 'Strong authentication policy', area: 'Identity & Access',
    mappings: { nist: ['PR.AA — Identity management, authentication and access control'],
      iso: ['Annex A 5.17 — Authentication information', 'Annex A 8.5 — Secure authentication'],
      cis: ['Control 6 — Access Control Management'] },
    evaluate(data, coverage) {
      if (!available(coverage, 'conditionalAccessPolicies')) return unassessed('Conditional Access policies are unavailable or incomplete.');
      const policies = (data.conditionalAccessPolicies || []).filter(p => p.state === 'enabled' &&
        ((p.grantControls?.builtInControls || []).some(c => /mfa/i.test(c)) || p.grantControls?.authenticationStrength));
      if (!policies.length) return unknown('No enabled MFA/authentication-strength Conditional Access policy was observed. Other controls may exist; enforcement was not assessed.');
      return observed('Enabled authentication controls were found; user targeting, exclusions, and sign-in enforcement require separate validation.',
        policies.map(p => ({ source: 'Conditional Access', name: p.displayName || p.id, id: p.id })));
    },
  },
  {
    id: 'conditional-access', title: 'Conditional Access governance', area: 'Identity & Access',
    mappings: { nist: ['PR.AA — Identity management, authentication and access control'], iso: ['Annex A 5.15 — Access control'],
      cis: ['Control 6 — Access Control Management'] },
    evaluate(data, coverage) {
      if (!available(coverage, 'conditionalAccessPolicies')) return unassessed('Conditional Access inventory is incomplete or unavailable.');
      const enabled = (data.conditionalAccessPolicies || []).filter(p => p.state === 'enabled');
      return enabled.length ? observed('Enabled policies exist, but effectiveness, scope and exclusion safety are not established.',
        enabled.map(p => ({ source: 'Conditional Access', name: p.displayName || p.id, id: p.id }))) :
        unknown('No enabled Conditional Access policies were returned; alternative access controls were not assessed.');
    },
  },
  {
    id: 'privileged-access', title: 'Privileged access oversight', area: 'Privileged Access',
    mappings: { nist: ['PR.AA — Identity management, authentication and access control'],
      iso: ['Annex A 8.2 — Privileged access rights', 'Annex A 5.18 — Access rights'],
      cis: ['Control 5 — Account Management', 'Control 6 — Access Control Management'] },
    evaluate(data, coverage) {
      if (!available(coverage, 'privilegedRoleAssignments')) return unassessed('Privileged role assignments are not fully readable.');
      const active = data.privilegedRoleAssignments || [];
      if (!active.length) return unknown('No active Entra assignments were observed. This does not establish least privilege.');
      return observed('Entra privileged role assignments are inventoried; eligibility, just-in-time enforcement and approval rules need independent validation.',
        active.slice(0,40).map(a => ({ source: 'Entra role assignment', name: a._roleName || a.roleDefinitionId || 'Role assignment', id: a.id })));
    },
  },
  {
    id: 'access-ownership', title: 'Group ownership accountability', area: 'Identity & Access',
    mappings: { nist: ['PR.AA — Identity management, authentication and access control'],
      iso: ['Annex A 5.2 — Information security roles and responsibilities', 'Annex A 5.18 — Access rights'],
      cis: ['Control 5 — Account Management'] },
    evaluate(data, coverage) {
      if (!available(coverage, 'groups') || !available(coverage, 'groupOwners')) return unassessed('Group or owner inventory is incomplete.');
      const groups = (data.groups || []).filter(g => g.securityEnabled || (g.groupTypes || []).includes('Unified'));
      const missing = groups.filter(g => Array.isArray(data.groupOwners?.[g.id]) && !data.groupOwners[g.id].length);
      if (missing.length) return gap('One or more security/Microsoft 365 groups have no returned owner. Review ownership requirements.',
        missing.map(g => ({ source: 'Group owner inventory', name: g.displayName || g.id, id: g.id })));
      return groups.length ? observed('Owner records were returned for the examined groups. Owner suitability and review cadence remain unverified.',
        [{ source: 'Group owner inventory', name: groups.length + ' groups evaluated' }]) :
        unknown('No applicable groups were returned to evaluate.');
    },
  },
  {
    id: 'audit-visibility', title: 'Directory audit visibility', area: 'Monitoring',
    mappings: { nist: ['DE.CM — Continuous monitoring'],
      iso: ['Annex A 8.15 — Logging', 'Annex A 8.16 — Monitoring activities'],
      cis: ['Control 8 — Audit Log Management'] },
    evaluate(data, coverage) {
      if (!available(coverage, 'directoryAudits')) return unassessed('Directory audit sample is unavailable or incomplete.');
      const events = data.directoryAudits || [];
      return events.length ? observed('Recent directory audit events are readable. Retention, alerting, coverage and investigations are not verified.',
        [{ source: 'Microsoft Graph directory audits', name: events.length + ' sampled records' }]) :
        unknown('The audit endpoint was readable but returned no sampled records. Logging and retention require validation.');
    },
  },
  {
    id: 'signin-monitoring', title: 'Sign-in monitoring', area: 'Monitoring',
    mappings: { nist: ['DE.CM — Continuous monitoring'], iso: ['Annex A 8.15 — Logging', 'Annex A 8.16 — Monitoring activities'],
      cis: ['Control 8 — Audit Log Management'] },
    evaluate(data, coverage) {
      if (!available(coverage, 'signIns')) return unassessed('Sign-in records are not fully available.');
      const events = data.signIns || [];
      return events.length ? observed('Recent sign-in events are readable. Alerting, time coverage, and incident response were not tested.',
        [{ source: 'Microsoft Graph sign-in logs', name: events.length + ' sampled records' }]) :
        unknown('Sign-in endpoint is accessible but contains no records in the sample.');
    },
  },
  {
    id: 'access-reviews', title: 'Periodic access reviews', area: 'Identity Governance',
    mappings: { nist: ['PR.AA — Identity management, authentication and access control'],
      iso: ['Annex A 5.18 — Access rights'], cis: ['Control 6 — Access Control Management'] },
    evaluate() { return unassessed('Access review schedules, decisions and remediation evidence are not collected by this dashboard.'); },
  },
  {
    id: 'endpoint-hardening', title: 'Endpoint configuration hardening', area: 'Configuration',
    mappings: { nist: ['PR.PS — Platform security'],
      iso: ['Annex A 8.9 — Configuration management'], cis: ['Control 4 — Secure Configuration of Enterprise Assets and Software'] },
    evaluate() { return unassessed('CIS Benchmark compliance requires endpoint configuration evidence not collected by the existing Graph snapshot.'); },
  },
];

export function assessFrameworks(data = {}, coverage = {}) {
  return FRAMEWORK_CONTROLS.map(({ evaluate, ...control }) => ({
    ...control, ...evaluate(data, coverage),
  }));
}

export function frameworkExport(rows, { tenantId = null, snapshotAt = null } = {}) {
  return { generatedAt: new Date().toISOString(), snapshotAt, tenantId,
    disclaimer: 'Control-alignment evidence only; not an audit, certification, attestation, or proof of compliance.',
    controls: rows };
}

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const tones = { 'Evidence detected':'good', 'Requires validation':'medium', 'Not assessed':'neutral', 'Gap identified':'high' };
export function renderFrameworkAlignment(data, coverage, { search = '', loadedAt = null } = {}) {
  const rows = assessFrameworks(data, coverage);
  const q = search.trim().toLowerCase();
  const filtered = rows.filter(row => [row.title,row.area,row.status,row.explanation,...Object.values(row.mappings).flat()]
    .join(' ').toLowerCase().includes(q));
  const count = status => rows.filter(row => row.status === status).length;
  return '<section class="framework-page">' +
    '<div class="card"><div class="section-title"><div><h2>Security Framework Alignment</h2><p class="muted small">Evidence-based crosswalk for NIST CSF 2.0, ISO/IEC 27001:2022 Annex A and CIS Controls v8.</p></div>' +
    '<button class="btn" data-action="export-frameworks">Export assessment JSON</button></div>' +
    '<div class="notice info"><strong>Not a compliance certification.</strong> Mapping a technical signal to a security outcome does not demonstrate full control implementation, operating effectiveness, audit readiness, or certification. Missing and partial data never count as passes.</div>' +
    '<div class="grid stats">' +
    [['Mapped controls',rows.length],['Evidence detected',count('Evidence detected')],['Requires validation',count('Requires validation')],['Not assessed',count('Not assessed')],['Gap identified',count('Gap identified')]].map(x => '<div class="card stat"><div class="stat-label">'+escapeHtml(x[0])+'</div><div class="stat-value">'+escapeHtml(x[1])+'</div></div>').join('') +
    '</div><div class="toolbar"><input class="search" data-search value="'+escapeHtml(search)+'" placeholder="Search framework, control or finding…"><span class="muted small">Snapshot: '+escapeHtml(loadedAt ? new Date(loadedAt).toLocaleString() : 'Not loaded')+'</span></div>' +
    '<div class="framework-controls">' + filtered.map(row => '<article class="card framework-control"><div class="section-title"><div><div class="muted small">'+escapeHtml(row.area)+' · '+escapeHtml(row.id)+'</div><h3>'+escapeHtml(row.title)+'</h3></div><span class="badge '+tones[row.status]+'">'+escapeHtml(row.status)+'</span></div>' +
    '<p>'+escapeHtml(row.explanation)+'</p><div class="framework-mappings">'+
    [['NIST CSF 2.0',row.mappings.nist],['ISO 27001:2022',row.mappings.iso],['CIS Controls v8',row.mappings.cis]].map(([label,items]) => '<div><strong>'+escapeHtml(label)+'</strong><ul>'+items.map(item => '<li>'+escapeHtml(item)+'</li>').join('')+'</ul></div>').join('')+
    '</div><details><summary>Evidence ('+row.evidence.length+')</summary>' +
    (row.evidence.length ? '<ul>'+row.evidence.map(e => '<li>'+escapeHtml(e.source)+': '+escapeHtml(e.name)+'</li>').join('')+'</ul>' : '<p class="muted small">No reliable positive evidence is available for this assessment.</p>') +
    '</details></article>').join('') + (filtered.length ? '' : '<div class="card empty">No controls match this filter.</div>') + '</div></div></section>';
}
