import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeIdentityRisk, renderIdentityRisk } from '../src/identity-risk.js';
import { emptyData } from '../src/snapshot.js';

const sub = '12345678-1234-4234-8234-123456789abc';
const coverage = Object.fromEntries(['privilegedRoleAssignments','privilegedRoleEligibilities','azureRoleAssignments','azureRoleDefinitions','effectivePrivileges'].map(k=>[k,{status:'available'}]));

test('standing Global Administrators are flagged for review, not automatically labeled vulnerabilities', () => {
  const data = emptyData();
  data.privilegedRoleAssignments = [
    {id:'e1', principalId:'emergency', _principalName:'Emergency Access 01', _upn:'breakglass@example.test', _roleName:'Global Administrator', _access:'Active', directoryScopeId:'/'},
    {id:'regular',principalId:'admin',_principalName:'Operator',_roleName:'Global Administrator',_access:'Active',directoryScopeId:'/'}
  ];
  data.privilegedRoleEligibilities = [{id:'eligible',_roleName:'Global Administrator',_access:'Eligible'}];
  const result = analyzeIdentityRisk(data,coverage,sub);
  assert.equal(result.metrics.standingGlobalAdmins,2);
  assert.equal(result.metrics.eligibleEntra,1);
  assert.equal(result.items.length,2);
  assert.equal(result.metrics.emergencyNamed,1);
  assert.match(result.items.find(i=>i.exception).action,/Do not remove required break-glass/);
});

test('broad Azure roles flag original assignments without counting effective group expansion twice', () => {
  const data = emptyData();
  const scope = `/subscriptions/${sub}`;
  data.azureRoleAssignments=[
    {id:'owner',_roleName:'Owner',_principalName:'Admins',_principalType:'Group',properties:{principalId:'g',roleDefinitionId:`${scope}/providers/Microsoft.Authorization/roleDefinitions/8e3af657-a8ff-443c-a75c-2fe8c4bcb635`,scope}},
    {id:'reader',_roleName:'Reader',_principalName:'Reader',properties:{principalId:'r',roleDefinitionId:'reader',scope}},
    {id:'contributor-child',_roleName:'Contributor',_principalName:'Operator',properties:{principalId:'u',roleDefinitionId:'b24988ac-6180-42a0-ab88-20f7382dd24c',scope:`${scope}/resourceGroups/limited`}},
  ];
  data.effectiveAzureRoleAssignments=[{...data.azureRoleAssignments[0],id:'owner:via:g:u',_viaGroupName:'Admins'}];
  const result=analyzeIdentityRisk(data,coverage,sub);
  assert.equal(result.metrics.broadAzure,1);
  assert.equal(result.items.length,1);
  assert.equal(result.items[0].severity,'high');
});

test('unavailable data is not counted as zero and rendering works with an empty snapshot', () => {
  const data = emptyData();
  const result = analyzeIdentityRisk(data,{},sub);
  assert.equal(result.metrics.standingGlobalAdmins,null);
  assert.equal(result.metrics.broadAzure,null);
  assert.equal(result.coverageComplete,false);
  const html=renderIdentityRisk({data,coverage:{},config:{subscriptionId:sub},search:''},{
    esc:v=>String(v??''),badge:(value)=>`<span>${value}</span>`
  });
  assert.match(html,/Identity Risk & Least-Privilege Analysis/);
  assert.match(html,/Incomplete evidence/);
  assert.match(html,/No matching review candidates/);
});

test('presentation escapes data from tenant identities', () => {
  const data=emptyData();
  data.privilegedRoleAssignments=[{id:'bad',_principalName:'<script>alert(1)</script>',_roleName:'Global Administrator',_access:'Active',directoryScopeId:'/'}];
  const state={data,coverage,config:{subscriptionId:sub},search:''};
  const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const html=renderIdentityRisk(state,{esc,badge:v=>`<span>${esc(v)}</span>`});
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
});
