import { readFile, writeFile } from 'node:fs/promises';

const path = new URL('../src/main.multitenant.js', import.meta.url);
let source = await readFile(path, 'utf8');

function replaceOnce(label, from, to) {
  if (!source.includes(from)) {
    throw new Error(`Conditional Access build transform failed: expected ${label} marker was not found.`);
  }
  source = source.replace(from, to);
}

function replaceAllChecked(label, from, to, minimum = 1) {
  const count = source.split(from).length - 1;
  if (count < minimum) {
    throw new Error(`Conditional Access build transform failed: expected ${label} marker at least ${minimum} time(s), found ${count}.`);
  }
  source = source.split(from).join(to);
}

replaceOnce(
  'Conditional Access scopes',
  "const ARM_SCOPES=['https://management.azure.com/user_impersonation'];",
  "const ARM_SCOPES=['https://management.azure.com/user_impersonation'];\nconst CONDITIONAL_ACCESS_SCOPES=['Policy.Read.All'];"
);

replaceOnce(
  'Conditional Access availability state',
  "directoryAuditsUnavailable:false,directoryAuditsMessage:'',loadedAt:null",
  "directoryAuditsUnavailable:false,directoryAuditsMessage:'',conditionalAccessUnavailable:false,conditionalAccessMessage:'',loadedAt:null"
);

replaceAllChecked(
  'Conditional Access data collection',
  'networkSecurityGroups:[],findings:[]',
  'networkSecurityGroups:[],conditionalAccessPolicies:[],findings:[]',
  2
);

replaceOnce(
  'Conditional Access reset state',
  "state.directoryAuditsUnavailable=false;state.directoryAuditsMessage=''}",
  "state.directoryAuditsUnavailable=false;state.directoryAuditsMessage='';state.conditionalAccessUnavailable=false;state.conditionalAccessMessage=''}"
);

replaceOnce(
  'Conditional Access Graph load',
  "  }catch(e){state.authPolicyUnavailable=true;state.authPolicyMessage=norm(e)}\n  try{\n   const roles=await paged(base+'/directoryRoles?$select=id,displayName,roleTemplateId',gt);",
  "  }catch(e){state.authPolicyUnavailable=true;state.authPolicyMessage=norm(e)}\n  try{\n   const cat=await acquire(CONDITIONAL_ACCESS_SCOPES);\n   state.data.conditionalAccessPolicies=await paged(base+'/identity/conditionalAccess/policies?$select=id,displayName,state,createdDateTime,modifiedDateTime,conditions,grantControls,sessionControls',cat);\n  }catch(e){\n   state.conditionalAccessUnavailable=true;\n   state.conditionalAccessMessage=norm(e);\n  }\n  try{\n   const roles=await paged(base+'/directoryRoles?$select=id,displayName,roleTemplateId',gt);"
);

replaceOnce(
  'Conditional Access findings',
  " for(const a of state.data.azureRoleAssignments){const p=a.properties||{},atSub=sub&&(p.scope||'').toLowerCase()===sub,role=a._roleName||'',human=/User|Guest user/.test(a._principalType);",
  " if(!state.conditionalAccessUnavailable){\n  const ca=state.data.conditionalAccessPolicies||[];\n  const enabled=ca.filter(p=>String(p.state||'').toLowerCase()==='enabled');\n  const reportOnly=ca.filter(p=>String(p.state||'').toLowerCase()==='enabledforreportingbutnotenforced');\n  if(!ca.length){\n   add('medium','No Conditional Access policies returned','No Conditional Access policies were returned for this tenant. Verify whether Security Defaults or another access-control strategy is intentionally being used.','','ca:none');\n  }else if(!enabled.length){\n   add('medium','No enabled Conditional Access policies detected',`${ca.length} Conditional Access polic${ca.length===1?'y was':'ies were'} returned, but none are currently enforced.${reportOnly.length?` ${reportOnly.length} polic${reportOnly.length===1?'y is':'ies are'} report-only.`:''}`,'','ca:no-enabled');\n  }else{\n   const strong=enabled.some(p=>{const g=p.grantControls||{},built=(g.builtInControls||[]).map(x=>String(x).toLowerCase());return built.includes('mfa')||Boolean(g.authenticationStrength?.id||g.authenticationStrength?.displayName)});\n   if(!strong)add('medium','No enabled Conditional Access MFA or authentication-strength control detected','Enabled Conditional Access policies were returned, but none of their grant controls explicitly require MFA or an authentication strength. Validate whether equivalent protection is provided elsewhere.','','ca:no-strong-auth');\n  }\n }\n for(const a of state.data.azureRoleAssignments){const p=a.properties||{},atSub=sub&&(p.scope||'').toLowerCase()===sub,role=a._roleName||'',human=/User|Guest user/.test(a._principalType);"
);

replaceOnce(
  'Conditional Access helper functions',
  "function roleMembers(){return state.data.directoryRoles.reduce((n,r)=>n+(r.members?.length||0),0)}",
  "function caPolicyState(v=''){const s=String(v).toLowerCase();if(s==='enabled')return {label:'Enabled',tone:'good'};if(s==='enabledforreportingbutnotenforced')return {label:'Report-only',tone:'medium'};if(s==='disabled')return {label:'Disabled',tone:'neutral'};return {label:v||'Unknown',tone:'neutral'}}\nfunction caGroupNames(ids=[]){const byId=new Map(state.data.groups.map(g=>[g.id,g.displayName]));return ids.map(id=>byId.get(id)||id)}\nfunction caUserTargets(policy={}){const u=policy.conditions?.users||{},parts=[];const inc=u.includeUsers||[];if(inc.includes('All'))parts.push('All users');else{if(inc.includes('GuestsOrExternalUsers'))parts.push('Guests / external users');const named=inc.filter(x=>!['All','GuestsOrExternalUsers','None'].includes(x));if(named.length)parts.push(`${named.length} user${named.length===1?'':'s'}`)}const groups=caGroupNames(u.includeGroups||[]);if(groups.length)parts.push(groups.length<=2?`Groups: ${groups.join(', ')}`:`${groups.length} groups`);if((u.includeRoles||[]).length)parts.push(`${u.includeRoles.length} directory role${u.includeRoles.length===1?'':'s'}`);const excluded=(u.excludeUsers||[]).length+(u.excludeGroups||[]).length+(u.excludeRoles||[]).length;if(excluded)parts.push(`${excluded} exclusion${excluded===1?'':'s'}`);return parts.join(' • ')||'No user targets exposed'}\nfunction caAppName(id=''){if(id==='All')return 'All cloud apps';if(id==='Office365')return 'Office 365';const sp=state.data.servicePrincipals.find(x=>String(x.appId||'').toLowerCase()===String(id).toLowerCase());return sp?.displayName||id}\nfunction caAppTargets(policy={}){const a=policy.conditions?.applications||{},parts=[];const apps=(a.includeApplications||[]).map(caAppName);if(apps.length)parts.push(apps.length<=2?apps.join(', '):`${apps.length} cloud apps`);if((a.includeUserActions||[]).length)parts.push(`${a.includeUserActions.length} user action${a.includeUserActions.length===1?'':'s'}`);if((a.includeAuthenticationContextClassReferences||[]).length)parts.push(`${a.includeAuthenticationContextClassReferences.length} auth context${a.includeAuthenticationContextClassReferences.length===1?'':'s'}`);const excluded=(a.excludeApplications||[]).length;if(excluded)parts.push(`${excluded} app exclusion${excluded===1?'':'s'}`);return parts.join(' • ')||'No application targets exposed'}\nfunction caGrantControls(policy={}){const g=policy.grantControls||{},parts=[];if((g.builtInControls||[]).length)parts.push(g.builtInControls.map(x=>String(x).replace(/([a-z])([A-Z])/g,'$1 $2')).join(', '));if(g.authenticationStrength?.displayName)parts.push(`Authentication strength: ${g.authenticationStrength.displayName}`);else if(g.authenticationStrength?.id)parts.push('Authentication strength');if((g.termsOfUse||[]).length)parts.push('Terms of use');return parts.join(' • ')||'No grant controls'}\nfunction caSessionControls(policy={}){const s=policy.sessionControls||{},parts=[];if(s.signInFrequency?.isEnabled)parts.push('Sign-in frequency');if(s.persistentBrowser?.isEnabled)parts.push('Persistent browser');if(s.applicationEnforcedRestrictions?.isEnabled)parts.push('App enforced restrictions');if(s.cloudAppSecurity?.isEnabled)parts.push('Defender for Cloud Apps');if(s.disableResilienceDefaults===true)parts.push('Resilience defaults disabled');return parts.join(' • ')||'None exposed'}\nfunction caStrongPolicyCount(){return (state.data.conditionalAccessPolicies||[]).filter(p=>String(p.state||'').toLowerCase()==='enabled'&&((p.grantControls?.builtInControls||[]).map(x=>String(x).toLowerCase()).includes('mfa')||Boolean(p.grantControls?.authenticationStrength?.id||p.grantControls?.authenticationStrength?.displayName))).length}\nfunction roleMembers(){return state.data.directoryRoles.reduce((n,r)=>n+(r.members?.length||0),0)}"
);

replaceOnce(
  'header subtitle',
  'Read-only identity and access governance for tenant inventory, MFA posture, privileged Entra roles, Azure RBAC, and least-privilege findings.',
  'Read-only identity and access governance for tenant inventory, MFA posture, Conditional Access, privileged Entra roles, Azure RBAC, and least-privilege findings.'
);

replaceOnce(
  'Conditional Access navigation',
  "${nav('activity','Recent Activity')}${nav('topology','Azure Topology')}",
  "${nav('activity','Recent Activity')}${nav('conditionalAccess','Conditional Access')}${nav('topology','Azure Topology')}"
);

replaceOnce(
  'Conditional Access tab routing',
  'activity:renderActivity,topology:()=>renderTopology(state,{esc,badge,toolbar}),rbac:renderRbac',
  'activity:renderActivity,conditionalAccess:renderConditionalAccess,topology:()=>renderTopology(state,{esc,badge,toolbar}),rbac:renderRbac'
);

replaceOnce(
  'Conditional Access overview variables',
  "const p=mfaPct(),authUsers=usersWithAuthData().length,strongUsers=usersWithStrongAuth().length,strongPct=authUsers?strongUsers/authUsers*100:NaN,high=state.data.findings.filter(f=>f.severity==='high').length;",
  "const p=mfaPct(),authUsers=usersWithAuthData().length,strongUsers=usersWithStrongAuth().length,strongPct=authUsers?strongUsers/authUsers*100:NaN,high=state.data.findings.filter(f=>f.severity==='high').length,caEnabled=state.data.conditionalAccessPolicies.filter(x=>String(x.state||'').toLowerCase()==='enabled').length,caReportOnly=state.data.conditionalAccessPolicies.filter(x=>String(x.state||'').toLowerCase()==='enabledforreportingbutnotenforced').length;"
);

replaceOnce(
  'Conditional Access overview stat',
  "${stat('Privileged users',privilegedUsers().size,`${state.data.privilegedRoleAssignments.length} active • ${state.data.privilegedRoleEligibilities.length} eligible`)}\n ${stat('Azure resources'",
  "${stat('Privileged users',privilegedUsers().size,`${state.data.privilegedRoleAssignments.length} active • ${state.data.privilegedRoleEligibilities.length} eligible`)}\n ${stat('CA policies',state.conditionalAccessUnavailable?'—':state.data.conditionalAccessPolicies.length,state.conditionalAccessUnavailable?'Policy read unavailable':`${caEnabled} enabled • ${caReportOnly} report-only`)}\n ${stat('Azure resources'"
);

replaceOnce(
  'Conditional Access renderer insertion',
  "function renderRoles(){const q=state.search.toLowerCase(),flat=state.data.directoryRoles.flatMap(r=>(r.members||[]).map(m=>({role:r.displayName,...m}))),rows=flat.filter(x=>!q||`${x.role} ${x.displayName} ${x.userPrincipalName||''}`.toLowerCase().includes(q));",
  "function renderConditionalAccess(){\n const policies=[...(state.data.conditionalAccessPolicies||[])].sort((a,b)=>(a.displayName||'').localeCompare(b.displayName||''));\n const q=state.search.toLowerCase();\n const rows=policies.filter(p=>{const hay=`${p.displayName||''} ${p.state||''} ${caUserTargets(p)} ${caAppTargets(p)} ${caGrantControls(p)} ${caSessionControls(p)}`.toLowerCase();return !q||hay.includes(q)});\n const enabled=policies.filter(p=>String(p.state||'').toLowerCase()==='enabled').length;\n const reportOnly=policies.filter(p=>String(p.state||'').toLowerCase()==='enabledforreportingbutnotenforced').length;\n const disabled=policies.filter(p=>String(p.state||'').toLowerCase()==='disabled').length;\n return `<section>\n  <div class=\"grid stats\">${stat('Policies',state.conditionalAccessUnavailable?'—':policies.length,state.conditionalAccessUnavailable?'Policy read unavailable':'Conditional Access inventory')}${stat('Enabled',state.conditionalAccessUnavailable?'—':enabled,'Currently enforced')}${stat('Report-only',state.conditionalAccessUnavailable?'—':reportOnly,'Not yet enforced')}${stat('MFA / auth strength',state.conditionalAccessUnavailable?'—':caStrongPolicyCount(),'Enabled policies with explicit strong-auth grant controls')}</div>\n  <div class=\"card\"><div class=\"section-title\"><div><h2>Conditional Access policies</h2><div class=\"muted small\">Read-only Microsoft Graph policy inventory for the connected Microsoft Entra tenant.</div></div><span class=\"muted small\">${state.conditionalAccessUnavailable?'Unavailable':`${enabled} enabled • ${reportOnly} report-only • ${disabled} disabled`}</span></div>\n   ${state.conditionalAccessUnavailable?`<div class=\"mfa-unavailable large\"><div class=\"mfa-icon\">i</div><div><strong>Conditional Access policies unavailable</strong><p>${esc(state.conditionalAccessMessage||'The signed-in identity could not read Conditional Access policies.')}</p><p class=\"muted small\">This feature requests delegated <code>Policy.Read.All</code> separately so a tenant that does not grant Conditional Access policy access can still use the rest of the dashboard. Microsoft Entra role requirements also apply.</p></div></div>`:`${toolbar('Search policy, state, users, apps, or controls…')}<div class=\"table-wrap\"><table><thead><tr><th>Policy</th><th>State</th><th>Users / groups</th><th>Cloud apps / actions</th><th>Grant controls</th><th>Session controls</th><th>Modified</th></tr></thead><tbody>${rows.map(p=>{const st=caPolicyState(p.state);return `<tr><td><strong>${esc(p.displayName||'Unnamed policy')}</strong><br><span class=\"muted small\">${esc(p.id||'')}</span></td><td>${badge(st.label,st.tone)}</td><td>${esc(caUserTargets(p))}</td><td>${esc(caAppTargets(p))}</td><td>${esc(caGrantControls(p))}</td><td>${esc(caSessionControls(p))}</td><td>${esc(fmtDate(p.modifiedDateTime||p.createdDateTime))}</td></tr>`}).join('')||'<tr><td colspan=\"7\" class=\"empty\">No Conditional Access policies match the current filter.</td></tr>'}</tbody></table></div>`}\n  </div>\n </section>`;\n}\nfunction renderRoles(){const q=state.search.toLowerCase(),flat=state.data.directoryRoles.flatMap(r=>(r.members||[]).map(m=>({role:r.displayName,...m}))),rows=flat.filter(x=>!q||`${x.role} ${x.displayName} ${x.userPrincipalName||''}`.toLowerCase().includes(q));"
);

replaceOnce(
  'setup delegated permissions',
  '<strong>UserAuthenticationMethod.Read.All</strong>, and <strong>Policy.Read.AuthenticationMethod</strong>.',
  '<strong>UserAuthenticationMethod.Read.All</strong>, <strong>Policy.Read.AuthenticationMethod</strong>, and <strong>Policy.Read.All</strong> for Conditional Access policy inventory.'
);

replaceOnce(
  'setup Conditional Access checks',
  '<li>Tenant authentication-method policy and per-user registered authentication methods.</li><li>Premium MFA/passwordless readiness telemetry when the tenant license exposes it.</li>',
  '<li>Tenant authentication-method policy and per-user registered authentication methods.</li><li>Conditional Access policy state, user/group targeting, cloud app targeting, grant controls, and session controls when permitted.</li><li>Premium MFA/passwordless readiness telemetry when the tenant license exposes it.</li>'
);

replaceOnce(
  'export Conditional Access summary',
  'entraRoleAssignments:roleMembers(),azureRbacAssignments:state.data.azureRoleAssignments.length',
  'entraRoleAssignments:roleMembers(),conditionalAccessPolicies:state.data.conditionalAccessPolicies.length,azureRbacAssignments:state.data.azureRoleAssignments.length'
);

await writeFile(path, source, 'utf8');
console.log('Added read-only Conditional Access policy inventory and governance checks to the multitenant dashboard.');
