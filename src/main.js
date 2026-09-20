import { PublicClientApplication, InteractionRequiredAuthError } from '@azure/msal-browser';
import './styles.css';

const GRAPH_SCOPES=['User.Read','Directory.Read.All','RoleManagement.Read.Directory','AuditLog.Read.All'];
const ARM_SCOPES=['https://management.azure.com/user_impersonation'];
const KEY='azureTenantGovernanceConfig.v1';

const state={config:loadConfig(),msal:null,account:null,tab:'overview',loading:false,error:'',warnings:[],mfaUnavailable:false,mfaMessage:'',loadedAt:null,search:'',data:{users:[],groups:[],groupMemberships:{},servicePrincipals:[],mfa:[],directoryRoles:[],directoryRoleDefinitions:[],privilegedRoleAssignments:[],privilegedRoleEligibilities:[],azureRoleAssignments:[],azureRoleDefinitions:[],resourceGroups:[],findings:[]}};
const app=document.querySelector('#app');

function loadConfig(){try{return JSON.parse(localStorage.getItem(KEY)||'{}')}catch{return{}}}
function saveConfig(v){localStorage.setItem(KEY,JSON.stringify(v))}
function guid(v=''){return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v.trim())}
function configured(){return guid(state.config.tenantId)&&guid(state.config.clientId)}
function esc(v=''){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function pct(v){return Number.isFinite(v)?`${Math.round(v)}%`:'—'}
function shortScope(s=''){return s.replace(/^\/subscriptions\/[0-9a-f-]+/i,'/subscription')}
function accountName(){return state.account?.username||state.account?.name||''}

async function initAuth(){
 if(!configured()){render();return}
 state.msal=new PublicClientApplication({auth:{clientId:state.config.clientId.trim(),authority:`https://login.microsoftonline.com/${state.config.tenantId.trim()}`,redirectUri:location.origin,postLogoutRedirectUri:location.origin},cache:{cacheLocation:'sessionStorage',storeAuthStateInCookie:false}});
 await state.msal.initialize();
 await state.msal.handleRedirectPromise();
 state.account=state.msal.getAllAccounts()[0]||null;
 render();
}
async function signIn(){
 try{const r=await state.msal.loginPopup({scopes:['User.Read'],prompt:'select_account'});state.account=r.account;state.error='';render()}catch(e){state.error=norm(e);render()}
}
async function signOut(){
 if(!state.msal||!state.account)return;
 await state.msal.logoutPopup({account:state.account,postLogoutRedirectUri:location.origin});
 state.account=null;resetData();render();
}
async function acquire(scopes){
 if(!state.account)throw new Error('Sign in first.');
 const req={scopes,account:state.account};
 try{return (await state.msal.acquireTokenSilent(req)).accessToken}
 catch(e){
  if(e instanceof InteractionRequiredAuthError||/interaction_required|consent_required|login_required/i.test(e?.errorCode||e?.message||'')) return (await state.msal.acquireTokenPopup(req)).accessToken;
  throw e;
 }
}
async function api(url,token){
 const r=await fetch(url,{headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'}});
 if(!r.ok){let d=`${r.status} ${r.statusText}`;try{const b=await r.json();d=b?.error?.message||b?.error?.code||d}catch{}throw new Error(`${d} — ${url}`)}
 return r.json();
}
async function paged(url,token){
 const rows=[];let next=url;
 while(next){const b=await api(next,token);rows.push(...(b.value||[]));next=b['@odata.nextLink']||b.nextLink||null}
 return rows;
}
async function mapLimit(items,limit,worker){
 const out=new Array(items.length);let cursor=0;
 async function run(){while(true){const i=cursor++;if(i>=items.length)return;out[i]=await worker(items[i],i)}}
 await Promise.all(Array.from({length:Math.min(limit,items.length)},run));
 return out;
}
function resetData(){state.data={users:[],groups:[],groupMemberships:{},servicePrincipals:[],mfa:[],directoryRoles:[],directoryRoleDefinitions:[],privilegedRoleAssignments:[],privilegedRoleEligibilities:[],azureRoleAssignments:[],azureRoleDefinitions:[],resourceGroups:[],findings:[]};state.loadedAt=null;state.warnings=[];state.mfaUnavailable=false;state.mfaMessage=''}

async function loadTenantData(){
 if(!state.account)return signIn();
 state.loading=true;state.error='';state.warnings=[];resetData();render();
 try{
  const gt=await acquire(GRAPH_SCOPES);
  const base='https://graph.microsoft.com/v1.0';
  const [users,groups,sps]=await Promise.all([
   paged(base+'/users?$select=id,displayName,userPrincipalName,userType,accountEnabled&$top=999',gt),
   paged(base+'/groups?$select=id,displayName,securityEnabled,mailEnabled,groupTypes&$top=999',gt),
   paged(base+'/servicePrincipals?$select=id,displayName,appId,servicePrincipalType&$top=999',gt)
  ]);
  Object.assign(state.data,{users,groups,servicePrincipals:sps});
  const memberships=await mapLimit(groups,5,async group=>{
   try{
    const members=await paged(`${base}/groups/${group.id}/members/microsoft.graph.user?$select=id,displayName,userPrincipalName,userType,accountEnabled&$top=999`,gt);
    return [group.id,members];
   }catch(e){
    state.warnings.push(`Could not read users for group ${group.displayName}: ${norm(e)}`);
    return [group.id,[]];
   }
  });
  state.data.groupMemberships=Object.fromEntries(memberships);
  try{state.data.mfa=await paged(base+'/reports/authenticationMethods/userRegistrationDetails?$top=999',gt)}catch(e){state.mfaUnavailable=true;state.mfaMessage=mfaUnavailableMessage(e)}
  try{
   const roles=await paged(base+'/directoryRoles?$select=id,displayName,roleTemplateId',gt);
   for(const role of roles){let members=[];try{members=await paged(`${base}/directoryRoles/${role.id}/members?$select=id,displayName,userPrincipalName`,gt)}catch(e){state.warnings.push(`Could not read members for ${role.displayName}: ${norm(e)}`)}state.data.directoryRoles.push({...role,members})}
  }catch(e){state.warnings.push('Directory role data unavailable: '+norm(e))}
  try{
   const [directoryRoleDefinitions,activeAssignments]=await Promise.all([
    paged(base+'/roleManagement/directory/roleDefinitions',gt),
    paged(base+'/roleManagement/directory/roleAssignments?$select=id,principalId,roleDefinitionId,directoryScopeId,appScopeId',gt)
   ]);
   Object.assign(state.data,{directoryRoleDefinitions,privilegedRoleAssignments:activeAssignments,privilegedRoleEligibilities:[]});

   // PIM schedule/eligibility endpoints require Entra ID P2 or Entra ID Governance.
   // When licensed, prefer the richer schedule instances because they include timing
   // and eligible-role data. On unlicensed tenants, keep the standard active RBAC
   // assignments above instead of treating the license limitation as an error.
   try{
    const [activeSchedules,eligibleSchedules]=await Promise.all([
     paged(base+'/roleManagement/directory/roleAssignmentScheduleInstances?$select=id,principalId,roleDefinitionId,directoryScopeId,appScopeId,startDateTime,endDateTime,assignmentType,memberType',gt),
     paged(base+'/roleManagement/directory/roleEligibilityScheduleInstances?$select=id,principalId,roleDefinitionId,directoryScopeId,appScopeId,startDateTime,endDateTime,memberType',gt)
    ]);
    if(activeSchedules.length) state.data.privilegedRoleAssignments=activeSchedules;
    state.data.privilegedRoleEligibilities=eligibleSchedules;
   }catch(e){
    const raw=e?.message||e?.errorMessage||String(e||'');
    if(!/Entra ID P2|Entra ID Governance|premium license|license/i.test(raw)){
     state.warnings.push('PIM schedule data unavailable: '+norm(e));
    }
   }
  }catch(e){
   // Final fallback: use the already-loaded active directory-role memberships.
   // This keeps active privileged-role visibility available even when unified RBAC
   // cannot be read by the current signed-in identity.
   const fallback=state.data.directoryRoles.flatMap(role=>(role.members||[]).map(member=>({
    id:`legacy:${role.id}:${member.id}`,
    principalId:member.id,
    roleDefinitionId:role.roleTemplateId||role.id,
    directoryScopeId:'/',
    _roleName:role.displayName,
    _principalName:member.displayName,
    _upn:member.userPrincipalName||'',
    _source:'directoryRoles'
   })));
   state.data.privilegedRoleAssignments=fallback;
   state.data.privilegedRoleEligibilities=[];
   if(!fallback.length) state.warnings.push('Privileged role data unavailable: '+norm(e));
  }
  if(guid(state.config.subscriptionId||'')){
   try{
    const at=await acquire(ARM_SCOPES), sub=state.config.subscriptionId.trim(), arm=`https://management.azure.com/subscriptions/${sub}`;
    const [assignments,definitions,resourceGroups]=await Promise.all([
     paged(`${arm}/providers/Microsoft.Authorization/roleAssignments?api-version=2022-04-01`,at),
     paged(`${arm}/providers/Microsoft.Authorization/roleDefinitions?api-version=2022-04-01`,at),
     paged(`${arm}/resourcegroups?api-version=2021-04-01`,at)
    ]);
    Object.assign(state.data,{azureRoleAssignments:assignments,azureRoleDefinitions:definitions,resourceGroups});
   }catch(e){state.warnings.push('Azure Resource Manager data unavailable: '+norm(e))}
  }else state.warnings.push('No Subscription ID configured, so Azure RBAC inventory was skipped.');
  enrichAssignments();enrichPrivilegedRoles();state.data.findings=buildFindings();state.loadedAt=new Date();
 }catch(e){state.error=norm(e)}
 finally{state.loading=false;render()}
}
function enrichAssignments(){
 const roles=new Map(state.data.azureRoleDefinitions.map(r=>[r.id.toLowerCase(),r.properties?.roleName||'Unknown role']));
 const principals=new Map();
 state.data.users.forEach(x=>principals.set(x.id,{name:x.displayName,upn:x.userPrincipalName,type:x.userType==='Guest'?'Guest user':'User'}));
 state.data.groups.forEach(x=>principals.set(x.id,{name:x.displayName,type:'Group'}));
 state.data.servicePrincipals.forEach(x=>principals.set(x.id,{name:x.displayName,type:'Service principal'}));
 state.data.azureRoleAssignments=state.data.azureRoleAssignments.map(a=>{const p=a.properties||{},r=(p.roleDefinitionId||'').toLowerCase(),pr=principals.get(p.principalId)||{name:p.principalId,type:p.principalType||'Unknown'};return {...a,_roleName:roles.get(r)||r.split('/').pop()||'Unknown role',_principalName:pr.name,_principalType:pr.type,_upn:pr.upn||''}})
}
function enrichPrivilegedRoles(){
 const defs=new Map(state.data.directoryRoleDefinitions.map(r=>[r.id,r.displayName||'Unknown role']));
 const principals=new Map();
 state.data.users.forEach(u=>principals.set(u.id,{name:u.displayName,upn:u.userPrincipalName,type:u.userType==='Guest'?'Guest user':'User'}));
 state.data.groups.forEach(g=>principals.set(g.id,{name:g.displayName,type:'Group'}));
 state.data.servicePrincipals.forEach(s=>principals.set(s.id,{name:s.displayName,type:'Service principal'}));
 const enrich=(x,access)=>{const p=principals.get(x.principalId)||{};return {...x,_access:access,_roleName:x._roleName||defs.get(x.roleDefinitionId)||x.roleDefinitionId||'Unknown role',_principalName:x._principalName||p.name||x.principalId,_upn:x._upn||p.upn||'',_principalType:p.type||'Unknown'}};
 state.data.privilegedRoleAssignments=state.data.privilegedRoleAssignments.map(x=>enrich(x,'Active'));
 state.data.privilegedRoleEligibilities=state.data.privilegedRoleEligibilities.map(x=>enrich(x,'Eligible'));
}
function privilegedRows(){return [...state.data.privilegedRoleAssignments,...state.data.privilegedRoleEligibilities]}
function privilegedUsers(){return new Set(privilegedRows().filter(x=>x._principalType==='User'||x._principalType==='Guest user'||x._source==='directoryRoles').map(x=>x.principalId).filter(Boolean))}
function rolesForUser(id){return privilegedRows().filter(x=>x.principalId===id).sort((a,b)=>(a._roleName||'').localeCompare(b._roleName||''))}
function fmtDate(v){if(!v)return 'Not exposed';const d=new Date(v);return Number.isNaN(d.getTime())?v:d.toLocaleString()}
function directoryScope(v){return !v||v==='/'?'Tenant-wide':v}
function buildFindings(){
 const out=[],seen=new Set();
 const add=(severity,title,detail,subject='',key='')=>{const fingerprint=(key||`${severity}|${title}|${subject}|${detail}`).toLowerCase().trim();if(seen.has(fingerprint))return;seen.add(fingerprint);out.push({severity,title,detail,subject})};
 const mfa=new Map(state.data.mfa.map(x=>[x.id,x]));
 const sub=guid(state.config.subscriptionId||'')?`/subscriptions/${state.config.subscriptionId.trim()}`.toLowerCase():'';
 const sensitive=/global administrator|privileged role administrator|privileged authentication administrator|authentication administrator|security administrator|user administrator|application administrator|cloud application administrator/i;
 if(state.data.mfa.length) for(const u of state.data.users.filter(x=>x.accountEnabled!==false&&x.userType!=='Guest')){const m=mfa.get(u.id);if(m&&!m.isMfaCapable)add('medium','Enabled member is not MFA-capable',`${u.displayName} does not currently report an MFA-capable strong authentication method.`,u.userPrincipalName,`mfa-member:${u.id}`)}
 for(const role of state.data.directoryRoles){if(!sensitive.test(role.displayName||''))continue;for(const member of role.members||[]){const m=mfa.get(member.id);if(state.data.mfa.length&&m&&!m.isMfaCapable)add('high','Privileged Entra role member is not MFA-capable',`${member.displayName} is an active member of ${role.displayName} but is not reported as MFA-capable.`,member.userPrincipalName||member.id,`mfa-role:${role.id}:${member.id}`)}}
 for(const a of state.data.azureRoleAssignments){const p=a.properties||{},atSub=sub&&(p.scope||'').toLowerCase()===sub,role=a._roleName||'',human=/User|Guest user/.test(a._principalType);
  if(atSub&&/owner/i.test(role))add(human?'high':'medium','Broad Owner assignment at subscription scope',`${a._principalName} has Owner across the subscription. Review whether this breadth is necessary.`,a._upn||a._principalName,`rbac-owner:${p.principalId||a._principalName}:${(p.scope||'').toLowerCase()}`);
  if(atSub&&/user access administrator/i.test(role))add('high','User Access Administrator at subscription scope',`${a._principalName} can manage Azure role assignments across the subscription.`,a._upn||a._principalName,`rbac-uaa:${p.principalId||a._principalName}:${(p.scope||'').toLowerCase()}`);
  if(atSub&&/contributor/i.test(role)&&human)add('medium','Human account has Contributor across the subscription',`${a._principalName} has broad write access across the subscription. Consider narrower scope.`,a._upn||a._principalName,`rbac-contributor:${p.principalId||a._principalName}:${(p.scope||'').toLowerCase()}`);
  if(atSub&&a._principalType==='Guest user'&&/owner|contributor|user access administrator/i.test(role))add('high','Guest account has broad subscription access',`${a._principalName} is a guest with ${role} at subscription scope.`,a._upn||a._principalName,`rbac-guest:${p.principalId||a._principalName}:${role.toLowerCase()}:${(p.scope||'').toLowerCase()}`);
 }
 return out.sort((a,b)=>({high:0,medium:1,low:2}[a.severity]-({high:0,medium:1,low:2}[b.severity])));
}
function score(){const c={high:0,medium:0,low:0};state.data.findings.forEach(f=>c[f.severity]++);return Math.max(0,100-c.high*12-c.medium*5-c.low*2)}
function norm(e){const raw=e?.message||e?.errorMessage||String(e||'Unknown error');if(/AADSTS65001|consent/i.test(raw))return 'Required delegated API permissions have not been consented. Check Setup and grant admin consent.';if(/AuthorizationFailed|does not have authorization|Forbidden/i.test(raw))return 'The signed-in account does not have permission to read this data at the requested scope.';return raw.length>500?raw.slice(0,500)+'…':raw}
function mfaUnavailableMessage(e){const raw=e?.message||e?.errorMessage||String(e||'');if(/premium license|B2C tenant|not a B2C/i.test(raw))return 'The Microsoft Graph MFA registration report is not available for this tenant or license. All other supported governance data remains live.';if(/Authorization|Forbidden|permission/i.test(raw))return 'The MFA registration report could not be read with the current account permissions. All other supported governance data remains live.';return 'The MFA registration report is currently unavailable. All other supported governance data remains live.'}
function connectionStatus(){if(!state.account)return '';if(state.loading)return '<span class="connection-status syncing"><span class="status-dot"></span>Syncing tenant data</span>';if(state.loadedAt)return '<span class="connection-status live"><span class="status-dot"></span>Live Tenant Connected</span>';return '<span class="connection-status pending"><span class="status-dot"></span>Tenant authenticated</span>'}
function mfaPct(){return state.data.mfa.length?state.data.mfa.filter(x=>x.isMfaCapable).length/state.data.mfa.length*100:NaN}
function roleMembers(){return state.data.directoryRoles.reduce((n,r)=>n+(r.members?.length||0),0)}
function groupMembershipCount(){return Object.values(state.data.groupMemberships||{}).reduce((n,m)=>n+(m?.length||0),0)}
function groupType(g){if((g.groupTypes||[]).includes('Unified'))return 'Microsoft 365';if(g.securityEnabled)return 'Security';if(g.mailEnabled)return 'Mail-enabled';return 'Directory'}
function stat(label,value,meta=''){return `<div class="card stat"><div class="stat-label">${esc(label)}</div><div class="stat-value">${esc(value)}</div><div class="stat-meta">${esc(meta)}</div></div>`}
function badge(v,c='neutral'){return `<span class="badge ${c}">${esc(v)}</span>`}
function nav(id,label){return `<button class="${state.tab===id?'active':''}" data-tab="${id}">${label}</button>`}
function toolbar(p){return `<div class="toolbar"><input class="search" data-search value="${esc(state.search)}" placeholder="${esc(p)}"><span class="muted small">Client-side filter</span></div>`}

function render(){
 const c=configured();
 app.innerHTML=`<main class="shell">
 <header class="topbar"><div><div class="eyebrow">Microsoft Entra ID + Azure RBAC</div><h1>Azure Tenant Governance Dashboard</h1><p class="subtitle">Read-only identity and access governance for tenant inventory, MFA posture, privileged Entra roles, Azure RBAC, and least-privilege findings.</p></div>
 <div class="top-actions">${connectionStatus()}${c&&state.account?`<button class="btn primary" data-action="load" ${state.loading?'disabled':''}>${state.loading?'Loading…':'Refresh tenant data'}</button><button class="btn" data-action="signout">Sign out</button>`:c?'<button class="btn primary" data-action="signin">Sign in with Microsoft</button>':'<button class="btn primary" data-tab="setup">Configure app</button>'}</div></header>
 ${state.account?`<div class="notice"><strong>Signed in:</strong> ${esc(accountName())}. Tokens remain in session storage.</div>`:''}
 ${state.error?`<div class="notice error"><strong>Error:</strong> ${esc(state.error)}</div>`:''}
 ${state.mfaUnavailable?`<div class="notice info"><strong>MFA report unavailable:</strong> ${esc(state.mfaMessage)}</div>`:''}
 ${state.warnings.map(w=>`<div class="notice warn"><strong>Partial data:</strong> ${esc(w)}</div>`).join('')}
 <nav class="nav">${nav('overview','Overview')}${nav('groups','Groups & Members')}${nav('privileged','Privileged Access')}${nav('mfa','MFA posture')}${nav('roles','Entra roles')}${nav('rbac','Azure RBAC')}${nav('findings','Findings')}${nav('setup','Setup')}</nav>
 ${renderTab()}
 <footer class="footer"><span>Read-only governance utility • no secrets required in source</span><span>${state.loadedAt?'Snapshot: '+esc(state.loadedAt.toLocaleString()):'No tenant snapshot loaded yet'}</span></footer>
 </main>`;wire();
}
function renderTab(){
 if(state.tab==='setup')return renderSetup();
 if(!configured())return '<div class="card empty">Configure your Entra application first in the <strong>Setup</strong> tab.</div>';
 if(!state.account)return '<div class="card empty">Sign in with the Entra account you want to use for the read-only review.</div>';
 if(!state.loadedAt&&!state.loading)return '<div class="card empty">Signed in successfully. Select <strong>Refresh tenant data</strong> to build the first governance snapshot.</div>';
 if(state.loading&&!state.loadedAt)return '<div class="card empty">Querying Microsoft Graph and Azure Resource Manager…</div>';
 return ({groups:renderGroups,privileged:renderPrivileged,mfa:renderMfa,roles:renderRoles,rbac:renderRbac,findings:renderFindings}[state.tab]||renderOverview)();
}
function renderOverview(){
 const p=mfaPct(),high=state.data.findings.filter(f=>f.severity==='high').length;
 return `<section><div class="grid stats">
 ${stat('Users',state.data.users.length,`${state.data.users.filter(x=>x.userType==='Guest').length} guests`)}
 ${stat('Groups',state.data.groups.length,`${state.data.groups.filter(x=>x.securityEnabled).length} security groups • ${groupMembershipCount()} user memberships`)}
 ${stat('MFA capable',pct(p),state.data.mfa.length?`${state.data.mfa.filter(x=>x.isMfaCapable).length}/${state.data.mfa.length} reported users`:state.mfaUnavailable?'tenant report unavailable':'not loaded')}
 ${stat('Privileged users',privilegedUsers().size,`${state.data.privilegedRoleAssignments.length} active • ${state.data.privilegedRoleEligibilities.length} eligible`)}
 ${stat('Azure RBAC',state.data.azureRoleAssignments.length,`${state.data.resourceGroups.length} resource groups`)}
 ${stat('Review score',score(),`${high} high-severity findings`)}
 </div><div class="grid two-col">
 <div class="card"><div class="section-title"><h2>MFA posture</h2><span class="muted small">Authentication Methods report</span></div>${state.data.mfa.length?`<div class="hero-num">${pct(p)}</div><div class="progress"><span style="width:${Math.max(0,Math.min(100,p))}%"></span></div><div class="muted small">${state.data.mfa.filter(x=>x.isMfaCapable).length} MFA-capable • ${state.data.mfa.filter(x=>x.isPasswordlessCapable).length} passwordless-capable</div>`:state.mfaUnavailable?`<div class="mfa-unavailable"><div class="mfa-icon">i</div><div><strong>MFA registration telemetry unavailable</strong><p>${esc(state.mfaMessage)}</p></div></div>`:'<div class="empty">MFA data has not been loaded yet.</div>'}</div>
 <div class="card"><div class="section-title"><h2>Highest-priority findings</h2><button class="btn" data-tab="findings">View all</button></div>${state.data.findings.length?state.data.findings.slice(0,5).map(f=>`<div class="finding"><div>${badge(f.severity.toUpperCase(),f.severity)}</div><div><h3>${esc(f.title)}</h3><p>${esc(f.subject||f.detail)}</p></div></div>`).join(''):'<div class="empty">No heuristic findings generated. No tested condition was detected. This is not a certification that the tenant is secure.</div>'}</div>
 </div></section>`;
}
function renderGroups(){
 const q=state.search.toLowerCase();
 const groups=[...state.data.groups].sort((a,b)=>(a.displayName||'').localeCompare(b.displayName||''));
 const rows=groups.filter(g=>{
  const members=state.data.groupMemberships?.[g.id]||[];
  const hay=`${g.displayName||''} ${groupType(g)} ${members.map(m=>`${m.displayName||''} ${m.userPrincipalName||''} ${m.userType||''}`).join(' ')}`.toLowerCase();
  return !q||hay.includes(q);
 });
 return `<section class="card"><div class="section-title"><div><h2>Tenant groups & user membership</h2><div class="muted small">Live Microsoft Graph snapshot • direct user members</div></div><span class="muted small">${rows.length} groups • ${groupMembershipCount()} user memberships</span></div>${toolbar('Search groups, users, UPNs, or group type…')}<div class="group-list">${rows.map(g=>{const members=(state.data.groupMemberships?.[g.id]||[]).slice().sort((a,b)=>(a.displayName||'').localeCompare(b.displayName||''));return `<details class="group-panel" ${q?'open':''}><summary><span class="group-summary-main"><strong>${esc(g.displayName||'Unnamed group')}</strong><span class="group-meta">${badge(groupType(g),g.securityEnabled?'good':'neutral')}${g.mailEnabled?badge('Mail enabled','neutral'):''}</span></span><span class="member-count">${members.length} user${members.length===1?'':'s'}</span></summary>${members.length?`<div class="table-wrap group-table"><table><thead><tr><th>User</th><th>UPN</th><th>Type</th><th>Account</th><th>Privileged Entra roles</th></tr></thead><tbody>${members.map(m=>{const pr=rolesForUser(m.id);return `<tr><td><strong>${esc(m.displayName||'Unnamed user')}</strong></td><td>${esc(m.userPrincipalName||'—')}</td><td>${esc(m.userType||'Member')}</td><td>${badge(m.accountEnabled===false?'Disabled':'Enabled',m.accountEnabled===false?'high':'good')}</td><td>${pr.length?pr.map(r=>badge(`${r._roleName} · ${r._access}`,r._access==='Active'?'high':'medium')).join(' '):'<span class="muted">None</span>'}</td></tr>`}).join('')}</tbody></table></div>`:'<div class="group-empty">No direct user members returned for this group.</div>'}</details>`}).join('')||'<div class="empty">No groups match the current filter.</div>'}</div></section>`;
}
function renderPrivileged(){
 const q=state.search.toLowerCase();
 const rows=privilegedRows().filter(x=>!q||`${x._principalName} ${x._upn} ${x._roleName} ${x._access} ${x.memberType||''} ${x.directoryScopeId||''}`.toLowerCase().includes(q))
  .sort((a,b)=>a._principalName.localeCompare(b._principalName)||a._roleName.localeCompare(b._roleName)||a._access.localeCompare(b._access));
 return `<section class="card"><div class="section-title"><div><h2>Privileged Entra role access</h2><div class="muted small">Active Entra role assignments are shown on supported tenants. PIM eligible-role and schedule timing data appears when the tenant has Entra ID P2 or Entra ID Governance.</div></div><span class="muted small">${privilegedUsers().size} users • ${state.data.privilegedRoleAssignments.length} active • ${state.data.privilegedRoleEligibilities.length} eligible</span></div>${toolbar('Search user, role, access state, or scope…')}<div class="table-wrap"><table><thead><tr><th>User</th><th>Role</th><th>Access</th><th>Assignment</th><th>Started / assigned</th><th>Ends</th><th>Scope</th></tr></thead><tbody>${rows.map(x=>`<tr><td><strong>${esc(x._principalName)}</strong>${x._upn?`<br><span class="muted">${esc(x._upn)}</span>`:''}</td><td><strong>${esc(x._roleName)}</strong></td><td>${badge(x._access,x._access==='Active'?'high':'medium')}</td><td>${esc(x.memberType||x.assignmentType||'Direct')}</td><td>${esc(fmtDate(x.startDateTime))}</td><td>${esc(x.endDateTime?fmtDate(x.endDateTime):'Permanent / no end exposed')}</td><td><code>${esc(directoryScope(x.directoryScopeId||x.appScopeId||'/'))}</code></td></tr>`).join('')||'<tr><td colspan="7" class="empty">No active privileged Entra role assignments were returned for the signed-in identity.</td></tr>'}</tbody></table></div><div class="notice info privileged-note"><strong>Assignment timing:</strong> Standard active Entra role assignments do not expose historical assignment timestamps. PIM schedule dates and eligible assignments require Entra ID P2 or Entra ID Governance, so this dashboard shows “Not exposed” rather than guessing when that licensed telemetry is unavailable.</div></section>`;
}
function renderMfa(){if(state.mfaUnavailable)return `<section class="card"><div class="section-title"><h2>MFA & authentication registration</h2>${badge('Unavailable','neutral')}</div><div class="mfa-unavailable large"><div class="mfa-icon">i</div><div><strong>Authentication Methods registration report unavailable</strong><p>${esc(state.mfaMessage)}</p><p class="muted small">This does not affect Users, Groups, Entra roles, Azure RBAC, or governance findings based on the available data.</p></div></div></section>`;const q=state.search.toLowerCase(),rows=state.data.mfa.filter(x=>!q||`${x.userDisplayName} ${x.userPrincipalName} ${(x.methodsRegistered||[]).join(' ')}`.toLowerCase().includes(q));return `<section class="card"><div class="section-title"><h2>MFA & authentication registration</h2><span class="muted small">${rows.length} rows</span></div>${toolbar('Search users, UPNs, or methods…')}<div class="table-wrap"><table><thead><tr><th>User</th><th>Type</th><th>MFA capable</th><th>MFA registered</th><th>Passwordless</th><th>Methods</th></tr></thead><tbody>${rows.map(x=>`<tr><td><strong>${esc(x.userDisplayName)}</strong><br><span class="muted">${esc(x.userPrincipalName)}</span></td><td>${esc(x.userType)}</td><td>${badge(x.isMfaCapable?'Yes':'No',x.isMfaCapable?'good':'high')}</td><td>${badge(x.isMfaRegistered?'Yes':'No',x.isMfaRegistered?'good':'medium')}</td><td>${badge(x.isPasswordlessCapable?'Yes':'No',x.isPasswordlessCapable?'good':'neutral')}</td><td>${esc((x.methodsRegistered||[]).join(', ')||'—')}</td></tr>`).join('')||'<tr><td colspan="6" class="empty">No MFA data returned.</td></tr>'}</tbody></table></div></section>`}
function renderRoles(){const q=state.search.toLowerCase(),flat=state.data.directoryRoles.flatMap(r=>(r.members||[]).map(m=>({role:r.displayName,...m}))),rows=flat.filter(x=>!q||`${x.role} ${x.displayName} ${x.userPrincipalName||''}`.toLowerCase().includes(q));return `<section class="card"><div class="section-title"><h2>Active Entra directory role memberships</h2><span class="muted small">${rows.length} assignments</span></div>${toolbar('Search role or principal…')}<div class="table-wrap"><table><thead><tr><th>Role</th><th>Member</th><th>Principal</th></tr></thead><tbody>${rows.map(x=>`<tr><td><strong>${esc(x.role)}</strong></td><td>${esc(x.displayName)}</td><td>${esc(x.userPrincipalName||x.id)}</td></tr>`).join('')||'<tr><td colspan="3" class="empty">No active role memberships returned.</td></tr>'}</tbody></table></div></section>`}
function renderRbac(){const q=state.search.toLowerCase(),rows=state.data.azureRoleAssignments.filter(a=>!q||`${a._roleName} ${a._principalName} ${a._principalType} ${a.properties?.scope}`.toLowerCase().includes(q));return `<section class="card"><div class="section-title"><h2>Azure RBAC assignments</h2><span class="muted small">Subscription: ${esc(state.config.subscriptionId||'not configured')}</span></div>${toolbar('Search role, principal, type, or scope…')}<div class="table-wrap"><table><thead><tr><th>Role</th><th>Principal</th><th>Type</th><th>Scope</th></tr></thead><tbody>${rows.map(a=>`<tr><td><strong>${esc(a._roleName)}</strong></td><td>${esc(a._principalName)}${a._upn?`<br><span class="muted">${esc(a._upn)}</span>`:''}</td><td>${esc(a._principalType)}</td><td><code>${esc(shortScope(a.properties?.scope||''))}</code></td></tr>`).join('')||'<tr><td colspan="4" class="empty">No RBAC assignments returned.</td></tr>'}</tbody></table></div></section>`}
function renderFindings(){const q=state.search.toLowerCase(),rows=state.data.findings.filter(f=>!q||`${f.severity} ${f.title} ${f.detail} ${f.subject}`.toLowerCase().includes(q));return `<section class="card"><div class="section-title"><div><h2>Governance review findings</h2><div class="muted small">Heuristic review — validate findings against business requirements.</div></div><div><button class="btn" data-action="export-json">Export JSON</button> <button class="btn" data-action="export-csv">Export CSV</button></div></div>${toolbar('Search findings…')}${rows.length?rows.map(f=>`<div class="finding"><div>${badge(f.severity.toUpperCase(),f.severity)}</div><div><h3>${esc(f.title)}</h3><p>${esc(f.detail)}</p>${f.subject?`<div class="muted small subject">Subject: ${esc(f.subject)}</div>`:''}</div></div>`).join(''):(state.data.findings.length?'<div class="empty">No findings match the current filter.</div>':'<div class="empty">No heuristic findings generated. No tested condition was detected. This is not a certification that the tenant is secure.</div>')}</section>`}
function renderSetup(){return `<section class="grid two-col"><div class="card"><div class="section-title"><h2>Application configuration</h2>${badge('Browser-local')}</div><div class="form-grid"><div class="field"><label>Tenant ID</label><input id="tenantId" value="${esc(state.config.tenantId||'')}" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"></div><div class="field"><label>Client / Application ID</label><input id="clientId" value="${esc(state.config.clientId||'')}" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"></div><div class="field full"><label>Azure Subscription ID</label><input id="subscriptionId" value="${esc(state.config.subscriptionId||'')}" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"></div></div><div class="buttons"><button class="btn primary" data-action="save-config">Save configuration</button><button class="btn danger" data-action="clear-config">Clear configuration</button></div><p class="muted small">These values are identifiers, not secrets. Never add a client secret to this SPA.</p></div><div class="card"><h2>Entra app registration checklist</h2><ol class="checklist"><li>Create a <strong>Single-page application (SPA)</strong> app registration.</li><li>Add redirect URI: <div class="code">${esc(location.origin)}</div></li><li>Add delegated Graph permissions: <strong>User.Read</strong>, <strong>Directory.Read.All</strong>, <strong>RoleManagement.Read.Directory</strong>, <strong>AuditLog.Read.All</strong>.</li><li>Add Azure Service Management delegated <strong>user_impersonation</strong>.</li><li>Grant tenant admin consent where required.</li><li>Use an account with read access to the requested directory reports and Azure scope.</li></ol></div><div class="card"><h2>Security model</h2><ul class="checklist"><li>Read-only Graph and ARM operations.</li><li>No client secret.</li><li>MSAL token cache uses session storage.</li><li>Only non-secret IDs are stored locally.</li><li>No project backend receives tenant data.</li></ul></div><div class="card"><h2>What it checks</h2><ul class="checklist"><li>Tenant groups and direct user membership.</li><li>Active and eligible privileged Entra role assignments, including schedule dates when exposed.</li><li>MFA and passwordless readiness.</li><li>Active Entra directory roles.</li><li>Azure RBAC scope breadth.</li><li>Subscription-wide Owner, Contributor, and User Access Administrator.</li><li>Privileged identities without reported MFA capability.</li><li>Guest identities with broad Azure access.</li></ul></div></section>`}

function wire(){
 document.querySelectorAll('[data-tab]').forEach(x=>x.addEventListener('click',()=>{state.tab=x.dataset.tab;state.search='';render()}));
 document.querySelector('[data-action="signin"]')?.addEventListener('click',signIn);
 document.querySelector('[data-action="signout"]')?.addEventListener('click',signOut);
 document.querySelector('[data-action="load"]')?.addEventListener('click',loadTenantData);
 document.querySelector('[data-action="save-config"]')?.addEventListener('click',()=>{const c={tenantId:document.querySelector('#tenantId').value.trim(),clientId:document.querySelector('#clientId').value.trim(),subscriptionId:document.querySelector('#subscriptionId').value.trim()};if(!guid(c.tenantId)||!guid(c.clientId)||(c.subscriptionId&&!guid(c.subscriptionId))){state.error='Enter valid GUIDs for Tenant ID and Client ID. Subscription ID must also be a GUID if provided.';render();return}saveConfig(c);location.reload()});
 document.querySelector('[data-action="clear-config"]')?.addEventListener('click',()=>{localStorage.removeItem(KEY);sessionStorage.clear();location.reload()});
 document.querySelector('[data-search]')?.addEventListener('input',e=>{state.search=e.target.value;render();requestAnimationFrame(()=>{const s=document.querySelector('[data-search]');if(s){s.focus();s.setSelectionRange(s.value.length,s.value.length)}})});
 document.querySelector('[data-action="export-json"]')?.addEventListener('click',exportJson);
 document.querySelector('[data-action="export-csv"]')?.addEventListener('click',exportCsv);
}
function download(name,content,type){const b=new Blob([content],{type}),u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)}
function exportJson(){download('azure-governance-findings.json',JSON.stringify({generatedAt:new Date().toISOString(),tenantId:state.config.tenantId,subscriptionId:state.config.subscriptionId||null,summary:{users:state.data.users.length,groups:state.data.groups.length,mfaCapablePercent:mfaPct(),entraRoleAssignments:roleMembers(),azureRbacAssignments:state.data.azureRoleAssignments.length,reviewScore:score()},findings:state.data.findings},null,2),'application/json')}
function cell(v=''){return '"'+String(v??'').replace(/"/g,'""')+'"'}
function exportCsv(){const rows=[['severity','title','subject','detail'],...state.data.findings.map(f=>[f.severity,f.title,f.subject,f.detail])];download('azure-governance-findings.csv',rows.map(r=>r.map(cell).join(',')).join('\n'),'text/csv')}

render();initAuth().catch(e=>{state.error=norm(e);render()});
