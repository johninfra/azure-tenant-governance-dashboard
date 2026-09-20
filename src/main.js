import { PublicClientApplication, InteractionRequiredAuthError } from '@azure/msal-browser';
import './styles.css';

const GRAPH_SCOPES=['User.Read','Directory.Read.All','RoleManagement.Read.Directory','AuditLog.Read.All'];
const ARM_SCOPES=['https://management.azure.com/user_impersonation'];
const KEY='azureTenantGovernanceConfig.v1';

const state={config:loadConfig(),msal:null,account:null,tab:'overview',loading:false,error:'',warnings:[],loadedAt:null,search:'',data:{users:[],groups:[],servicePrincipals:[],mfa:[],directoryRoles:[],azureRoleAssignments:[],azureRoleDefinitions:[],resourceGroups:[],findings:[]}};
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
function resetData(){state.data={users:[],groups:[],servicePrincipals:[],mfa:[],directoryRoles:[],azureRoleAssignments:[],azureRoleDefinitions:[],resourceGroups:[],findings:[]};state.loadedAt=null;state.warnings=[]}

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
  try{state.data.mfa=await paged(base+'/reports/authenticationMethods/userRegistrationDetails?$top=999',gt)}catch(e){state.warnings.push('MFA registration report unavailable: '+norm(e))}
  try{
   const roles=await paged(base+'/directoryRoles?$select=id,displayName,roleTemplateId',gt);
   for(const role of roles){let members=[];try{members=await paged(`${base}/directoryRoles/${role.id}/members?$select=id,displayName,userPrincipalName`,gt)}catch(e){state.warnings.push(`Could not read members for ${role.displayName}: ${norm(e)}`)}state.data.directoryRoles.push({...role,members})}
  }catch(e){state.warnings.push('Directory role data unavailable: '+norm(e))}
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
  enrichAssignments();state.data.findings=buildFindings();state.loadedAt=new Date();
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
function buildFindings(){
 const out=[],add=(severity,title,detail,subject='')=>out.push({severity,title,detail,subject});
 const mfa=new Map(state.data.mfa.map(x=>[x.id,x]));
 const sub=guid(state.config.subscriptionId||'')?`/subscriptions/${state.config.subscriptionId.trim()}`.toLowerCase():'';
 const sensitive=/global administrator|privileged role administrator|privileged authentication administrator|authentication administrator|security administrator|user administrator|application administrator|cloud application administrator/i;
 if(state.data.mfa.length) for(const u of state.data.users.filter(x=>x.accountEnabled!==false&&x.userType!=='Guest')){const m=mfa.get(u.id);if(m&&!m.isMfaCapable)add('medium','Enabled member is not MFA-capable',`${u.displayName} does not currently report an MFA-capable strong authentication method.`,u.userPrincipalName)}
 for(const role of state.data.directoryRoles){if(!sensitive.test(role.displayName||''))continue;for(const member of role.members||[]){const m=mfa.get(member.id);if(state.data.mfa.length&&m&&!m.isMfaCapable)add('high','Privileged Entra role member is not MFA-capable',`${member.displayName} is an active member of ${role.displayName} but is not reported as MFA-capable.`,member.userPrincipalName||member.id)}}
 for(const a of state.data.azureRoleAssignments){const p=a.properties||{},atSub=sub&&(p.scope||'').toLowerCase()===sub,role=a._roleName||'',human=/User|Guest user/.test(a._principalType);
  if(atSub&&/owner/i.test(role))add(human?'high':'medium','Broad Owner assignment at subscription scope',`${a._principalName} has Owner across the subscription. Review whether this breadth is necessary.`,a._upn||a._principalName);
  if(atSub&&/user access administrator/i.test(role))add('high','User Access Administrator at subscription scope',`${a._principalName} can manage Azure role assignments across the subscription.`,a._upn||a._principalName);
  if(atSub&&/contributor/i.test(role)&&human)add('medium','Human account has Contributor across the subscription',`${a._principalName} has broad write access across the subscription. Consider narrower scope.`,a._upn||a._principalName);
  if(atSub&&a._principalType==='Guest user'&&/owner|contributor|user access administrator/i.test(role))add('high','Guest account has broad subscription access',`${a._principalName} is a guest with ${role} at subscription scope.`,a._upn||a._principalName);
 }
 if(!out.length&&state.loadedAt)add('low','No heuristic findings generated','No tested condition was detected. This is not a certification that the tenant is secure.');
 return out.sort((a,b)=>({high:0,medium:1,low:2}[a.severity]-({high:0,medium:1,low:2}[b.severity])));
}
function score(){const c={high:0,medium:0,low:0};state.data.findings.forEach(f=>c[f.severity]++);return Math.max(0,100-c.high*12-c.medium*5-c.low*2)}
function norm(e){const raw=e?.message||e?.errorMessage||String(e||'Unknown error');if(/AADSTS65001|consent/i.test(raw))return 'Required delegated API permissions have not been consented. Check Setup and grant admin consent.';if(/AuthorizationFailed|does not have authorization|Forbidden/i.test(raw))return 'The signed-in account does not have permission to read this data at the requested scope.';return raw.length>500?raw.slice(0,500)+'…':raw}
function mfaPct(){return state.data.mfa.length?state.data.mfa.filter(x=>x.isMfaCapable).length/state.data.mfa.length*100:NaN}
function roleMembers(){return state.data.directoryRoles.reduce((n,r)=>n+(r.members?.length||0),0)}
function stat(label,value,meta=''){return `<div class="card stat"><div class="stat-label">${esc(label)}</div><div class="stat-value">${esc(value)}</div><div class="stat-meta">${esc(meta)}</div></div>`}
function badge(v,c='neutral'){return `<span class="badge ${c}">${esc(v)}</span>`}
function nav(id,label){return `<button class="${state.tab===id?'active':''}" data-tab="${id}">${label}</button>`}
function toolbar(p){return `<div class="toolbar"><input class="search" data-search value="${esc(state.search)}" placeholder="${esc(p)}"><span class="muted small">Client-side filter</span></div>`}

function render(){
 const c=configured();
 app.innerHTML=`<main class="shell">
 <header class="topbar"><div><div class="eyebrow">Microsoft Entra ID + Azure RBAC</div><h1>Azure Tenant Governance Dashboard</h1><p class="subtitle">Read-only identity and access governance for tenant inventory, MFA posture, privileged Entra roles, Azure RBAC, and least-privilege findings.</p></div>
 <div class="top-actions">${c&&state.account?`<button class="btn primary" data-action="load" ${state.loading?'disabled':''}>${state.loading?'Loading…':'Refresh tenant data'}</button><button class="btn" data-action="signout">Sign out</button>`:c?'<button class="btn primary" data-action="signin">Sign in with Microsoft</button>':'<button class="btn primary" data-tab="setup">Configure app</button>'}</div></header>
 ${state.account?`<div class="notice"><strong>Signed in:</strong> ${esc(accountName())}. Tokens remain in session storage.</div>`:''}
 ${state.error?`<div class="notice error"><strong>Error:</strong> ${esc(state.error)}</div>`:''}
 ${state.warnings.map(w=>`<div class="notice warn"><strong>Partial data:</strong> ${esc(w)}</div>`).join('')}
 <nav class="nav">${nav('overview','Overview')}${nav('mfa','MFA posture')}${nav('roles','Entra roles')}${nav('rbac','Azure RBAC')}${nav('findings','Findings')}${nav('setup','Setup')}</nav>
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
 return ({mfa:renderMfa,roles:renderRoles,rbac:renderRbac,findings:renderFindings}[state.tab]||renderOverview)();
}
function renderOverview(){
 const p=mfaPct(),high=state.data.findings.filter(f=>f.severity==='high').length;
 return `<section><div class="grid stats">
 ${stat('Users',state.data.users.length,`${state.data.users.filter(x=>x.userType==='Guest').length} guests`)}
 ${stat('Groups',state.data.groups.length,`${state.data.groups.filter(x=>x.securityEnabled).length} security groups`)}
 ${stat('MFA capable',pct(p),state.data.mfa.length?`${state.data.mfa.filter(x=>x.isMfaCapable).length}/${state.data.mfa.length} reported users`:'report unavailable')}
 ${stat('Entra role members',roleMembers(),`${state.data.directoryRoles.length} activated roles`)}
 ${stat('Azure RBAC',state.data.azureRoleAssignments.length,`${state.data.resourceGroups.length} resource groups`)}
 ${stat('Review score',score(),`${high} high-severity findings`)}
 </div><div class="grid two-col">
 <div class="card"><div class="section-title"><h2>MFA posture</h2><span class="muted small">Authentication Methods report</span></div>${state.data.mfa.length?`<div class="hero-num">${pct(p)}</div><div class="progress"><span style="width:${Math.max(0,Math.min(100,p))}%"></span></div><div class="muted small">${state.data.mfa.filter(x=>x.isMfaCapable).length} MFA-capable • ${state.data.mfa.filter(x=>x.isPasswordlessCapable).length} passwordless-capable</div>`:'<div class="empty">MFA report unavailable. See Setup for required permissions.</div>'}</div>
 <div class="card"><div class="section-title"><h2>Highest-priority findings</h2><button class="btn" data-tab="findings">View all</button></div>${state.data.findings.length?state.data.findings.slice(0,5).map(f=>`<div class="finding"><div>${badge(f.severity.toUpperCase(),f.severity)}</div><div><h3>${esc(f.title)}</h3><p>${esc(f.subject||f.detail)}</p></div></div>`).join(''):'<div class="empty">No findings generated yet.</div>'}</div>
 </div></section>`;
}
function renderMfa(){const q=state.search.toLowerCase(),rows=state.data.mfa.filter(x=>!q||`${x.userDisplayName} ${x.userPrincipalName} ${(x.methodsRegistered||[]).join(' ')}`.toLowerCase().includes(q));return `<section class="card"><div class="section-title"><h2>MFA & authentication registration</h2><span class="muted small">${rows.length} rows</span></div>${toolbar('Search users, UPNs, or methods…')}<div class="table-wrap"><table><thead><tr><th>User</th><th>Type</th><th>MFA capable</th><th>MFA registered</th><th>Passwordless</th><th>Methods</th></tr></thead><tbody>${rows.map(x=>`<tr><td><strong>${esc(x.userDisplayName)}</strong><br><span class="muted">${esc(x.userPrincipalName)}</span></td><td>${esc(x.userType)}</td><td>${badge(x.isMfaCapable?'Yes':'No',x.isMfaCapable?'good':'high')}</td><td>${badge(x.isMfaRegistered?'Yes':'No',x.isMfaRegistered?'good':'medium')}</td><td>${badge(x.isPasswordlessCapable?'Yes':'No',x.isPasswordlessCapable?'good':'neutral')}</td><td>${esc((x.methodsRegistered||[]).join(', ')||'—')}</td></tr>`).join('')||'<tr><td colspan="6" class="empty">No MFA data returned.</td></tr>'}</tbody></table></div></section>`}
function renderRoles(){const q=state.search.toLowerCase(),flat=state.data.directoryRoles.flatMap(r=>(r.members||[]).map(m=>({role:r.displayName,...m}))),rows=flat.filter(x=>!q||`${x.role} ${x.displayName} ${x.userPrincipalName||''}`.toLowerCase().includes(q));return `<section class="card"><div class="section-title"><h2>Active Entra directory role memberships</h2><span class="muted small">${rows.length} assignments</span></div>${toolbar('Search role or principal…')}<div class="table-wrap"><table><thead><tr><th>Role</th><th>Member</th><th>Principal</th></tr></thead><tbody>${rows.map(x=>`<tr><td><strong>${esc(x.role)}</strong></td><td>${esc(x.displayName)}</td><td>${esc(x.userPrincipalName||x.id)}</td></tr>`).join('')||'<tr><td colspan="3" class="empty">No active role memberships returned.</td></tr>'}</tbody></table></div></section>`}
function renderRbac(){const q=state.search.toLowerCase(),rows=state.data.azureRoleAssignments.filter(a=>!q||`${a._roleName} ${a._principalName} ${a._principalType} ${a.properties?.scope}`.toLowerCase().includes(q));return `<section class="card"><div class="section-title"><h2>Azure RBAC assignments</h2><span class="muted small">Subscription: ${esc(state.config.subscriptionId||'not configured')}</span></div>${toolbar('Search role, principal, type, or scope…')}<div class="table-wrap"><table><thead><tr><th>Role</th><th>Principal</th><th>Type</th><th>Scope</th></tr></thead><tbody>${rows.map(a=>`<tr><td><strong>${esc(a._roleName)}</strong></td><td>${esc(a._principalName)}${a._upn?`<br><span class="muted">${esc(a._upn)}</span>`:''}</td><td>${esc(a._principalType)}</td><td><code>${esc(shortScope(a.properties?.scope||''))}</code></td></tr>`).join('')||'<tr><td colspan="4" class="empty">No RBAC assignments returned.</td></tr>'}</tbody></table></div></section>`}
function renderFindings(){const q=state.search.toLowerCase(),rows=state.data.findings.filter(f=>!q||`${f.severity} ${f.title} ${f.detail} ${f.subject}`.toLowerCase().includes(q));return `<section class="card"><div class="section-title"><div><h2>Governance review findings</h2><div class="muted small">Heuristic review — validate findings against business requirements.</div></div><div><button class="btn" data-action="export-json">Export JSON</button> <button class="btn" data-action="export-csv">Export CSV</button></div></div>${toolbar('Search findings…')}${rows.length?rows.map(f=>`<div class="finding"><div>${badge(f.severity.toUpperCase(),f.severity)}</div><div><h3>${esc(f.title)}</h3><p>${esc(f.detail)}</p>${f.subject?`<div class="muted small subject">Subject: ${esc(f.subject)}</div>`:''}</div></div>`).join(''):'<div class="empty">No findings match the current filter.</div>'}</section>`}
function renderSetup(){return `<section class="grid two-col"><div class="card"><div class="section-title"><h2>Application configuration</h2>${badge('Browser-local')}</div><div class="form-grid"><div class="field"><label>Tenant ID</label><input id="tenantId" value="${esc(state.config.tenantId||'')}" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"></div><div class="field"><label>Client / Application ID</label><input id="clientId" value="${esc(state.config.clientId||'')}" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"></div><div class="field full"><label>Azure Subscription ID</label><input id="subscriptionId" value="${esc(state.config.subscriptionId||'')}" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"></div></div><div class="buttons"><button class="btn primary" data-action="save-config">Save configuration</button><button class="btn danger" data-action="clear-config">Clear configuration</button></div><p class="muted small">These values are identifiers, not secrets. Never add a client secret to this SPA.</p></div><div class="card"><h2>Entra app registration checklist</h2><ol class="checklist"><li>Create a <strong>Single-page application (SPA)</strong> app registration.</li><li>Add redirect URI: <div class="code">${esc(location.origin)}</div></li><li>Add delegated Graph permissions: <strong>User.Read</strong>, <strong>Directory.Read.All</strong>, <strong>RoleManagement.Read.Directory</strong>, <strong>AuditLog.Read.All</strong>.</li><li>Add Azure Service Management delegated <strong>user_impersonation</strong>.</li><li>Grant tenant admin consent where required.</li><li>Use an account with read access to the requested directory reports and Azure scope.</li></ol></div><div class="card"><h2>Security model</h2><ul class="checklist"><li>Read-only Graph and ARM operations.</li><li>No client secret.</li><li>MSAL token cache uses session storage.</li><li>Only non-secret IDs are stored locally.</li><li>No project backend receives tenant data.</li></ul></div><div class="card"><h2>What it checks</h2><ul class="checklist"><li>MFA and passwordless readiness.</li><li>Active Entra directory roles.</li><li>Azure RBAC scope breadth.</li><li>Subscription-wide Owner, Contributor, and User Access Administrator.</li><li>Privileged identities without reported MFA capability.</li><li>Guest identities with broad Azure access.</li></ul></div></section>`}

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
