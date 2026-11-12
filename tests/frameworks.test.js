import test from 'node:test';
import assert from 'node:assert/strict';
import { assessFrameworks, frameworkExport, renderFrameworkAlignment } from '../src/frameworks.js';

const coverage = Object.fromEntries(['conditionalAccessPolicies','privilegedRoleAssignments','groups','groupOwners','directoryAudits','signIns'].map(k => [k,{status:'available'}]));
const data = {
  conditionalAccessPolicies: [{id:'ca-1',displayName:'Require MFA',state:'enabled',grantControls:{builtInControls:['mfa']}}],
  privilegedRoleAssignments: [{id:'role-1',_roleName:'Global Administrator'}],
  groups: [{id:'group-1',displayName:'IT',securityEnabled:true}],
  groupOwners: {'group-1': [{id:'owner-1'}]},
  directoryAudits: [{id:'audit-1'}], signIns: [{id:'signin-1'}]
};

test('maps existing evidence without equating it to compliance', () => {
  const rows=assessFrameworks(data,coverage);
  assert.equal(rows.find(r=>r.id==='authentication').status,'Evidence detected');
  assert.equal(rows.find(r=>r.id==='access-reviews').status,'Not assessed');
  assert.equal(rows.find(r=>r.id==='endpoint-hardening').status,'Not assessed');
  assert.ok(rows.every(r=>r.mappings.nist.length&&r.mappings.iso.length&&r.mappings.cis.length));
  assert.match(frameworkExport(rows).disclaimer,/not an audit/i);
});
test('unavailable data never counts as passing evidence', () => {
  const rows=assessFrameworks(data,{...coverage,conditionalAccessPolicies:{status:'partial'}});
  assert.equal(rows.find(r=>r.id==='authentication').status,'Not assessed');
  assert.equal(rows.find(r=>r.id==='conditional-access').status,'Not assessed');
});
test('identifies ownerless groups as gaps and escapes labels', () => {
  const rows=assessFrameworks({...data,groups:[{id:'x',displayName:'<script>alert(1)</script>',securityEnabled:true}],groupOwners:{x:[]}},coverage);
  assert.equal(rows.find(r=>r.id==='access-ownership').status,'Gap identified');
  const html=renderFrameworkAlignment({...data,groups:[{id:'x',displayName:'<script>alert(1)</script>',securityEnabled:true}],groupOwners:{x:[]}},coverage);
  assert.doesNotMatch(html,/<script>/);
  assert.match(html,/&lt;script&gt;/);
  assert.match(html,/Export assessment JSON/);
});
test('render search filters controls', () => {
  const html=renderFrameworkAlignment(data,coverage,{search:'endpoint hardening'});
  assert.match(html,/Endpoint configuration hardening/);
  assert.doesNotMatch(html,/Strong authentication policy/);
});
