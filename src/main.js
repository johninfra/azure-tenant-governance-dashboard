import { PublicClientApplication, InteractionRequiredAuthError, EventType } from '@azure/msal-browser';
import './styles.css';
import { renderTopology } from './topology.js';
import { emptySnapshot, assessment, DATASETS, accountKey } from './snapshot.js';
import { createDashboardController } from './controller.js';
import { renderMfaView, renderOverviewView } from './views.js';
import { findingsCsv } from './export.js';
import { privilegedRows as resolvedPrivilegedRows, privilegedUserIds, azureRows, usableMfaRegistration, policyHasMandatoryAuthControl } from './governance.js';

const KEY='azureTenantGovernanceConfig.v1';
const APP_CLIENT_ID=String(import.meta.env.VITE_ENTRA_CLIENT_ID||'').trim();
const MULTITENANT_AUTHORITY='https://login.microsoftonline.com/organizations';

const state={...emptySnapshot(),config:loadConfig(),msal:null,account:null,tab:'overview',loading:false,authReady:false,authBusy:false,error:'',search:''};
const app=document.querySelector('#app');

function loadConfig(){try{const value=JSON.parse(localStorage.getItem(KEY)||'{}');return value&&typeof value==='object'?value:{}}catch{return{}}}
function saveConfig(v){localStorage.setItem(KEY,JSON.stringify(v))}
function guid(v=''){return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v.trim())}
function configured(){return guid(APP_CLIENT_ID)}
function signedInTenantId(){return state.account?.tenantId||state.account?.idTokenClaims?.tid||''}
function esc(v=''){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function pct(v){return Number.isFinite(v)?`${Math.round(v)}%`:'—'}
function shortScope(s=''){return s.replace(/^\/subscriptions\/[0-9a-f-]+/i,'/subscription')}
function accountName(){return state.account?.username||state.account?.name||''}

const controller=createDashboardController({state,render,isInteractionRequired:error=>error instanceof InteractionRequiredAuthError||/interaction_required|consent_required|login_required/i.test(error?.errorCode||'')});
let authEpoch=0;

async function initAuth(){
 if(!configured()){state.error='This deployment is missing VITE_ENTRA_CLIENT_ID. Configure the shared multitenant Entra application ID in the deployment environment.';render();return}
 state.msal=new PublicClientApplication({auth:{clientId:APP_CLIENT_ID,authority:MULTITENANT_AUTHORITY,redirectUri:location.origin,postLogoutRedirectUri:location.origin},cache:{cacheLocation:'sessionStorage'}});
 await state.msal.initialize();
 state.msal.enableAccountStorageEvents();
 state.msal.addEventCallback(event=>{
  if(event.eventType===EventType.LOGOUT_START){authEpoch++;controller.changeAccount(null,false)}
  else if(event.eventType===EventType.ACCOUNT_REMOVED&&accountKey(event.payload)===accountKey(state.account)){authEpoch++;controller.changeAccount(null,false)}
  else if(event.eventType===EventType.ACTIVE_ACCOUNT_CHANGED&&!state.authBusy){authEpoch++;controller.changeAccount(state.msal.getActiveAccount(),false)}
  else if(event.eventType===EventType.LOGIN_SUCCESS&&!state.authBusy){authEpoch++;controller.changeAccount(event.payload?.account||state.msal.getActiveAccount())}
 });
 const restoreEpoch=authEpoch;
 try{
  const redirect=await state.msal.handleRedirectPromise();
  const cached=state.msal.getAllAccounts();
  if(restoreEpoch===authEpoch)controller.changeAccount(redirect?.account||state.msal.getActiveAccount()||(cached.length===1?cached[0]:null));
 }finally{state.authReady=true;render()}
}
async function signIn(){
 if(!state.authReady||state.authBusy)return;
 const epoch=++authEpoch;state.authBusy=true;render();
 try{const result=await state.msal.loginPopup({scopes:['User.Read'],prompt:'select_account'});if(epoch===authEpoch){controller.changeAccount(result.account);state.error=''}}
 catch(error){if(epoch===authEpoch)state.error=norm(error)}
 finally{state.authBusy=false;render()}
}
async function signOut(){
 if(!state.msal||!state.account||state.authBusy)return;
 const account=state.account;++authEpoch;state.authBusy=true;
 // Clear local data and abort work before waiting for the identity provider.
 controller.changeAccount(null);
 try{await state.msal.logoutPopup({account,postLogoutRedirectUri:location.origin})}
 catch(error){state.error='Local tenant data was cleared. Microsoft sign-out did not complete: '+norm(error)}
 finally{state.authBusy=false;render()}
}
async function loadTenantData(){if(!state.account)return signIn();return controller.refresh()}
function privilegedRows(){return resolvedPrivilegedRows(state.data)}
function privilegedUsers(){return privilegedUserIds(state.data)}
function rolesForUser(id){return privilegedRows().filter(x=>x.principalId===id).sort((a,b)=>(a._roleName||'').localeCompare(b._roleName||''))}
function fmtDate(v){if(!v)return 'Not exposed';const d=new Date(v);return Number.isNaN(d.getTime())?v:d.toLocaleString()}
function directoryScope(v){return !v||v==='/'?'Tenant-wide':v}
function reviewAssessment(){return assessment(state.coverage,state.data.findings)}
function score(){return reviewAssessment().score}
function renderCoverage(){
 if(!state.loadedAt)return '';
 const review=reviewAssessment();
 return '<div class="notice '+(review.complete?'info':'warn')+'"><strong>Assessment evidence: '+review.available+'/'+review.total+' datasets available.</strong> '+(review.complete?'The score summarizes heuristic findings; it does not certify security or MFA enforcement.':'Review score withheld while evidence is incomplete. Unknown and skipped data are not passes.')+'<details><summary>Data availability</summary><ul>'+Object.entries(state.coverage).map(([key,value])=>'<li><strong>'+esc(DATASETS[key]||key)+':</strong> '+esc(value.status)+(value.detail?' - '+esc(value.detail):'')+'</li>').join('')+'</ul></details></div>';
}
function norm(e){const raw=e?.message||e?.errorMessage||String(e||'Unknown error');if(/AADSTS65001|consent/i.test(raw))return 'Required delegated API permissions have not been consented. Check Setup and grant admin consent.';if(/AuthorizationFailed|does not have authorization|Forbidden/i.test(raw))return 'The signed-in account does not have permission to read this data at the requested scope.';return raw.length>500?raw.slice(0,500)+'…':raw}
function connectionStatus(){if(!state.account)return '';if(state.loading)return '<span class="connection-status syncing"><span class="status-dot"></span>Syncing tenant data</span>';if(state.loadedAt)return '<span class="connection-status '+(reviewAssessment().complete?'live':'pending')+'"><span class="status-dot"></span>'+(reviewAssessment().complete?'Tenant snapshot loaded':'Partial tenant snapshot')+'</span>';return '<span class="connection-status pending"><span class="status-dot"></span>Tenant authenticated</span>'}
function mfaPct(){const known=state.data.mfa.filter(x=>typeof x.isMfaCapable==='boolean');return known.length?known.filter(x=>x.isMfaCapable).length/known.length*100:NaN}
function authMethodsForUser(id){return Array.isArray(state.data.userAuthMethods?.[id])?state.data.userAuthMethods[id]:[]}
function authMethodLabel(method={}){
 const t=String(method['@odata.type']||'').toLowerCase();
 if(t.includes('microsoftauthenticator'))return 'Microsoft Authenticator';
 if(t.includes('fido2')||t.includes('passkey'))return 'FIDO2 / Passkey';
 if(t.includes('windowshelloforbusiness'))return 'Windows Hello for Business';
 if(t.includes('softwareoath'))return 'Software OATH';
 if(t.includes('phoneauthentication'))return method.phoneType?(`Phone / ${method.phoneType}`):'Phone / SMS';
 if(t.includes('temporaryaccesspass'))return 'Temporary Access Pass'+(usableMfaRegistration(method)?'':' (expired, unusable or unknown validity)');
 if(t.includes('x509certificate'))return 'Certificate-based authentication';
 if(t.includes('emailauthentication'))return 'Email';
 if(t.includes('passwordauthentication'))return 'Password';
 const raw=String(method['@odata.type']||'Authentication method').replace('#microsoft.graph.','').replace(/AuthenticationMethod$/,'');
 return raw.replace(/([a-z])([A-Z])/g,'$1 $2')||'Authentication method';
}
function isStrongAuthMethod(method={}){return usableMfaRegistration(method)}
function usersWithAuthData(){return state.data.users.filter(u=>Object.prototype.hasOwnProperty.call(state.data.userAuthMethods||{},u.id))}
function usersWithStrongAuth(){return usersWithAuthData().filter(u=>authMethodsForUser(u.id).some(isStrongAuthMethod))}
function authPolicyConfigs(){return state.data.authMethodsPolicy?.authenticationMethodConfigurations||[]}
function authPolicyLabel(id=''){
 const k=String(id).toLowerCase();
 const names={microsoftauthenticator:'Microsoft Authenticator',sms:'SMS',fido2:'FIDO2 / Passkey',temporaryaccesspass:'Temporary Access Pass',softwareoath:'Software OATH',voice:'Voice',email:'Email OTP',x509certificate:'Certificate-based authentication',qrcodepin:'QR code + PIN'};
 return names[k]||String(id).replace(/([a-z])([A-Z])/g,'$1 $2');
}
function authPolicyTargets(cfg={}){
 const inc=cfg.includeTargets||[];
 if(inc.some(t=>String(t.id||'').toLowerCase()==='all_users'))return 'All users';
 const groups=inc.filter(t=>String(t.targetType||'').toLowerCase()==='group');
 if(groups.length){
  const byId=new Map(state.data.groups.map(g=>[g.id,g.displayName]));
  return groups.map(g=>byId.get(g.id)||g.id).join(', ');
 }
 return inc.length?`${inc.length} included target${inc.length===1?'':'s'}`:'No included targets exposed';
}
function caPolicyState(v=''){const s=String(v).toLowerCase();if(s==='enabled')return {label:'Enabled',tone:'good'};if(s==='enabledforreportingbutnotenforced')return {label:'Report-only',tone:'medium'};if(s==='disabled')return {label:'Disabled',tone:'neutral'};return {label:v||'Unknown',tone:'neutral'}}
function caGroupNames(ids=[]){const byId=new Map(state.data.groups.map(g=>[g.id,g.displayName]));return ids.map(id=>byId.get(id)||id)}
function caUserTargets(policy={}){const u=policy.conditions?.users||{},parts=[];const inc=u.includeUsers||[];if(inc.includes('All'))parts.push('All users');else{if(inc.includes('GuestsOrExternalUsers'))parts.push('Guests / external users');const named=inc.filter(x=>!['All','GuestsOrExternalUsers','None'].includes(x));if(named.length)parts.push(`${named.length} user${named.length===1?'':'s'}`)}const groups=caGroupNames(u.includeGroups||[]);if(groups.length)parts.push(groups.length<=2?`Groups: ${groups.join(', ')}`:`${groups.length} groups`);if((u.includeRoles||[]).length)parts.push(`${u.includeRoles.length} directory role${u.includeRoles.length===1?'':'s'}`);const excluded=(u.excludeUsers||[]).length+(u.excludeGroups||[]).length+(u.excludeRoles||[]).length;if(excluded)parts.push(`${excluded} exclusion${excluded===1?'':'s'}`);return parts.join(' • ')||'No user targets exposed'}
function caAppName(id=''){if(id==='All')return 'All cloud apps';if(id==='Office365')return 'Office 365';const sp=state.data.servicePrincipals.find(x=>String(x.appId||'').toLowerCase()===String(id).toLowerCase());return sp?.displayName||id}
function caAppTargets(policy={}){const a=policy.conditions?.applications||{},parts=[];const apps=(a.includeApplications||[]).map(caAppName);if(apps.length)parts.push(apps.length<=2?apps.join(', '):`${apps.length} cloud apps`);if((a.includeUserActions||[]).length)parts.push(`${a.includeUserActions.length} user action${a.includeUserActions.length===1?'':'s'}`);if((a.includeAuthenticationContextClassReferences||[]).length)parts.push(`${a.includeAuthenticationContextClassReferences.length} auth context${a.includeAuthenticationContextClassReferences.length===1?'':'s'}`);const excluded=(a.excludeApplications||[]).length;if(excluded)parts.push(`${excluded} app exclusion${excluded===1?'':'s'}`);return parts.join(' • ')||'No application targets exposed'}
function caGrantControls(policy={}){const g=policy.grantControls||{},parts=[];if((g.builtInControls||[]).length)parts.push(g.builtInControls.map(x=>String(x).replace(/([a-z])([A-Z])/g,'$1 $2')).join(', '));if(g.authenticationStrength?.displayName)parts.push(`Authentication strength: ${g.authenticationStrength.displayName}`);else if(g.authenticationStrength?.id)parts.push('Authentication strength');if((g.termsOfUse||[]).length)parts.push('Terms of use');return (g.operator?String(g.operator).toUpperCase()+': ':'')+(parts.join(' / ')||'No grant controls')}
function caSessionControls(policy={}){const s=policy.sessionControls||{},parts=[];if(s.signInFrequency?.isEnabled)parts.push('Sign-in frequency');if(s.persistentBrowser?.isEnabled)parts.push('Persistent browser');if(s.applicationEnforcedRestrictions?.isEnabled)parts.push('App enforced restrictions');if(s.cloudAppSecurity?.isEnabled)parts.push('Defender for Cloud Apps');if(s.disableResilienceDefaults===true)parts.push('Resilience defaults disabled');return parts.join(' • ')||'None exposed'}
function caStrongPolicyCount(){return state.data.conditionalAccessPolicies.filter(policyHasMandatoryAuthControl).length}
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
 <header class="topbar"><div><div class="eyebrow">Microsoft Entra ID + Azure RBAC</div><h1>Azure Tenant Governance Dashboard</h1><p class="subtitle">Read-only identity and access governance for tenant inventory, MFA posture, Conditional Access, privileged Entra roles, Azure RBAC, and least-privilege findings.</p></div>
 <div class="top-actions">${connectionStatus()}${c&&state.account?`<button class="btn primary" data-action="load" ${state.loading||state.authBusy?'disabled':''}>${state.loading?'Loading…':'Refresh tenant data'}</button><button class="btn" data-action="signout" ${state.authBusy?'disabled':''}>Sign out</button>`:c?`<button class="btn primary" data-action="signin" ${!state.authReady||state.authBusy?'disabled':''}>${state.authBusy?'Completing authentication...':'Sign in with Microsoft'}</button>`:'<button class="btn primary" data-tab="setup">Configure app</button>'}</div></header>
 ${state.account?`<div class="notice"><strong>Signed in:</strong> ${esc(accountName())}. <strong>Tenant:</strong> ${esc(signedInTenantId()||'unknown')}. Tokens remain in session storage.</div>`:''}
 ${state.error?`<div class="notice error"><strong>Error:</strong> ${esc(state.error)}</div>`:''}
 ${state.mfaUnavailable&&!Object.keys(state.data.userAuthMethods||{}).length?`<div class="notice info"><strong>MFA report unavailable:</strong> ${esc(state.mfaMessage)}</div>`:''}
 ${state.warnings.map(w=>`<div class="notice warn"><strong>Partial data:</strong> ${esc(w)}</div>`).join('')}
 <nav class="nav">${nav('overview','Overview')}${nav('groups','Groups & Members')}${nav('privileged','Privileged Access')}${nav('mfa','MFA posture')}${nav('roles','Entra roles')}${nav('activity','Recent Activity')}${nav('conditionalAccess','Conditional Access')}${nav('topology','Azure Topology')}${nav('rbac','Azure RBAC')}${nav('findings','Findings')}${nav('setup','Setup')}</nav>
 ${renderCoverage()}
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
 return ({groups:renderGroups,privileged:renderPrivileged,mfa:renderMfa,roles:renderRoles,activity:renderActivity,conditionalAccess:renderConditionalAccess,topology:()=>renderTopology(state,{esc,badge,toolbar}),rbac:renderRbac,findings:renderFindings}[state.tab]||renderOverview)();
}
function renderOverview(){return renderOverviewView(state,{esc,badge,stat,pct,review:reviewAssessment(),privilegedCount:privilegedUsers().size,membershipCount:groupMembershipCount()})}
function renderGroups(){
 const q=state.search.toLowerCase();
 const groups=[...state.data.groups].sort((a,b)=>(a.displayName||'').localeCompare(b.displayName||''));
 const rows=groups.filter(g=>{
  const members=state.data.groupMemberships?.[g.id]||[];
  const hay=`${g.displayName||''} ${groupType(g)} ${members.map(m=>`${m.displayName||''} ${m.userPrincipalName||''} ${m.userType||''}`).join(' ')}`.toLowerCase();
  return !q||hay.includes(q);
 });
 return `<section class="card"><div class="section-title"><div><h2>Tenant groups & user membership</h2><div class="muted small">Live Microsoft Graph snapshot • direct user members</div></div><span class="muted small">${rows.length} groups • ${groupMembershipCount()} user memberships</span></div>${toolbar('Search groups, users, UPNs, or group type…')}<div class="group-list">${rows.map(g=>{const readable=Object.hasOwn(state.data.groupMemberships,g.id),complete=readable&&g.visibility!=='HiddenMembership',members=(state.data.groupMemberships?.[g.id]||[]).slice().sort((a,b)=>(a.displayName||'').localeCompare(b.displayName||''));return `<details class="group-panel" ${q?'open':''}><summary><span class="group-summary-main"><strong>${esc(g.displayName||'Unnamed group')}</strong><span class="group-meta">${badge(groupType(g),g.securityEnabled?'good':'neutral')}${g.mailEnabled?badge('Mail enabled','neutral'):''}</span></span><span class="member-count">${complete?members.length:readable?members.length+' (partial)':'Unknown'} user${members.length===1?'':'s'}</span></summary>${members.length?`<div class="table-wrap group-table"><table><thead><tr><th>User</th><th>UPN</th><th>Type</th><th>Account</th><th>Privileged Entra roles</th></tr></thead><tbody>${members.map(m=>{const pr=rolesForUser(m.id);return `<tr><td><strong>${esc(m.displayName||'Unnamed user')}</strong></td><td>${esc(m.userPrincipalName||'—')}</td><td>${esc(m.userType||'Member')}</td><td>${badge(m.accountEnabled===false?'Disabled':m.accountEnabled===true?'Enabled':'Unknown',m.accountEnabled===false?'high':m.accountEnabled===true?'good':'neutral')}</td><td>${pr.length?pr.map(r=>badge(`${r._roleName} · ${r._access}`,r._access==='Active'?'high':'medium')).join(' '):'<span class="muted">None returned</span>'}</td></tr>`}).join('')}</tbody></table></div>`:`<div class="group-empty">${complete?'No direct user members returned for this group.':readable?'Hidden membership may be incomplete; effective access is unknown.':'Membership unavailable; effective access is unknown.'}</div>`}</details>`}).join('')||'<div class="empty">No groups match the current filter.</div>'}</div></section>`;
}
function renderPrivileged(){
 const q=state.search.toLowerCase();
 const rows=privilegedRows().filter(x=>!q||`${x._principalName} ${x._upn} ${x._roleName} ${x._access} ${x.memberType||''} ${x._viaGroupName||''} ${x.directoryScopeId||''}`.toLowerCase().includes(q))
  .sort((a,b)=>a._principalName.localeCompare(b._principalName)||a._roleName.localeCompare(b._roleName)||a._access.localeCompare(b._access));
 return `<section class="card"><div class="section-title"><div><h2>Privileged Entra role access</h2><div class="muted small">Active Entra role assignments are shown on supported tenants. PIM eligible-role and schedule timing data appears when the tenant has Entra ID P2 or Entra ID Governance.</div></div><span class="muted small">${privilegedUsers().size} users • ${state.data.privilegedRoleAssignments.length} active • ${state.data.privilegedRoleEligibilities.length} eligible</span></div>${toolbar('Search user, role, access state, or scope…')}<div class="table-wrap"><table><thead><tr><th>User</th><th>Role</th><th>Access</th><th>Assignment</th><th>Started / assigned</th><th>Ends</th><th>Scope</th></tr></thead><tbody>${rows.map(x=>`<tr><td><strong>${esc(x._principalName)}</strong>${x._upn?`<br><span class="muted">${esc(x._upn)}</span>`:''}</td><td><strong>${esc(x._roleName)}</strong></td><td>${badge(x._access,x._access==='Active'?'high':'medium')}</td><td>${esc(x._viaGroupName?'Via group: '+x._viaGroupName:x.memberType||x.assignmentType||(x._principalType==='Group'?'Group assignment':'Direct'))}</td><td>${esc(fmtDate(x.startDateTime))}</td><td>${esc(x.endDateTime?fmtDate(x.endDateTime):'Permanent / no end exposed')}</td><td><code>${esc(directoryScope(x.directoryScopeId||x.appScopeId||'/'))}</code></td></tr>`).join('')||'<tr><td colspan="7" class="empty">No active privileged Entra role assignments were returned for the signed-in identity.</td></tr>'}</tbody></table></div><div class="notice info privileged-note"><strong>Assignment timing:</strong> Standard active Entra role assignments do not expose historical assignment timestamps. PIM schedule dates and eligible assignments require Entra ID P2 or Entra ID Governance, so this dashboard shows “Not exposed” rather than guessing when that licensed telemetry is unavailable.</div></section>`;
}
function renderMfa(){return renderMfaView(state,{esc,badge,toolbar,authMethodLabel,authPolicyConfigs,authPolicyLabel,authPolicyTargets})}
function renderConditionalAccess(){
 const policies=[...(state.data.conditionalAccessPolicies||[])].sort((a,b)=>(a.displayName||'').localeCompare(b.displayName||''));
 const q=state.search.toLowerCase();
 const rows=policies.filter(p=>{const hay=`${p.displayName||''} ${p.state||''} ${caUserTargets(p)} ${caAppTargets(p)} ${caGrantControls(p)} ${caSessionControls(p)}`.toLowerCase();return !q||hay.includes(q)});
 const enabled=policies.filter(p=>String(p.state||'').toLowerCase()==='enabled').length;
 const reportOnly=policies.filter(p=>String(p.state||'').toLowerCase()==='enabledforreportingbutnotenforced').length;
 const disabled=policies.filter(p=>String(p.state||'').toLowerCase()==='disabled').length;
 return `<section>
  <div class="grid stats">${stat('Policies',state.conditionalAccessUnavailable?'—':policies.length,state.conditionalAccessUnavailable?'Policy read unavailable':'Conditional Access inventory')}${stat('Enabled',state.conditionalAccessUnavailable?'Unknown':enabled,'Policy state; targeting applies')}${stat('Report-only',state.conditionalAccessUnavailable?'—':reportOnly,'Not yet enforced')}${stat('MFA / auth strength',state.conditionalAccessUnavailable?'—':caStrongPolicyCount(),'Enabled policies with mandatory auth controls; user coverage not evaluated')}</div>
  <div class="card"><div class="section-title"><div><h2>Conditional Access policies</h2><div class="muted small">Read-only policy inventory. Enabled controls do not prove tenant-wide or per-user MFA enforcement.</div></div><span class="muted small">${state.conditionalAccessUnavailable?'Unavailable':`${enabled} enabled • ${reportOnly} report-only • ${disabled} disabled`}</span></div>
   ${state.conditionalAccessUnavailable?`<div class="mfa-unavailable large"><div class="mfa-icon">i</div><div><strong>Conditional Access policies unavailable</strong><p>${esc(state.conditionalAccessMessage||'The signed-in identity could not read Conditional Access policies.')}</p><p class="muted small">This feature requests delegated <code>Policy.Read.All</code> separately so a tenant that does not grant Conditional Access policy access can still use the rest of the dashboard. Microsoft Entra role requirements also apply.</p></div></div>`:`${toolbar('Search policy, state, users, apps, or controls…')}<div class="table-wrap"><table><thead><tr><th>Policy</th><th>State</th><th>Users / groups</th><th>Cloud apps / actions</th><th>Grant controls</th><th>Session controls</th><th>Modified</th></tr></thead><tbody>${rows.map(p=>{const st=caPolicyState(p.state);return `<tr><td><strong>${esc(p.displayName||'Unnamed policy')}</strong><br><span class="muted small">${esc(p.id||'')}</span></td><td>${badge(st.label,st.tone)}</td><td>${esc(caUserTargets(p))}</td><td>${esc(caAppTargets(p))}</td><td>${esc(caGrantControls(p))}</td><td>${esc(caSessionControls(p))}</td><td>${esc(fmtDate(p.modifiedDateTime||p.createdDateTime))}</td></tr>`}).join('')||'<tr><td colspan="7" class="empty">No Conditional Access policies match the current filter.</td></tr>'}</tbody></table></div>`}
  </div>
 </section>`;
}
function renderRoles(){const q=state.search.toLowerCase(),flat=state.data.directoryRoles.flatMap(r=>(r.members||[]).map(m=>({role:r.displayName,...m}))),rows=flat.filter(x=>!q||`${x.role} ${x.displayName} ${x.userPrincipalName||''}`.toLowerCase().includes(q));return `<section class="card"><div class="section-title"><h2>Active Entra directory role memberships</h2><span class="muted small">${rows.length} assignments</span></div>${toolbar('Search role or principal…')}<div class="table-wrap"><table><thead><tr><th>Role</th><th>Member</th><th>Principal</th></tr></thead><tbody>${rows.map(x=>`<tr><td><strong>${esc(x.role)}</strong></td><td>${esc(x.displayName)}</td><td>${esc(x.userPrincipalName||x.id)}</td></tr>`).join('')||'<tr><td colspan="3" class="empty">No active role memberships returned.</td></tr>'}</tbody></table></div></section>`}

function formatActivityTime(v){
 if(!v)return '—';
 const d=new Date(v);return Number.isNaN(d.getTime())?String(v):d.toLocaleString();
}
function signInStatus(x){
 const code=Number(x?.status?.errorCode||0);
 return code===0?'Success':(x?.status?.failureReason||x?.status?.additionalDetails||('Error '+code));
}
function signInLocation(x){
 return [x?.location?.city,x?.location?.state,x?.location?.countryOrRegion].filter(Boolean).join(', ')||'—';
}
function auditActor(x){
 const u=x?.initiatedBy?.user;
 const a=x?.initiatedBy?.app;
 return {name:u?.displayName||a?.displayName||'System / service',upn:u?.userPrincipalName||u?.id||a?.servicePrincipalName||a?.appId||'',ip:u?.ipAddress||'—'};
}
function auditTargets(x){
 return (x?.targetResources||[]).map(t=>t?.userPrincipalName||t?.displayName||t?.id).filter(Boolean).slice(0,4).join(', ')||'—';
}
function renderActivity(){
 const q=state.search.toLowerCase();
 const signIns=(state.data.signIns||[]).filter(x=>!q||`${x.userDisplayName||''} ${x.userPrincipalName||''} ${x.appDisplayName||''} ${x.resourceDisplayName||''} ${x.ipAddress||''} ${signInStatus(x)}`.toLowerCase().includes(q));
 const audits=(state.data.directoryAudits||[]).filter(x=>{const a=auditActor(x);return !q||`${a.name} ${a.upn} ${x.activityDisplayName||''} ${x.category||''} ${x.result||''} ${auditTargets(x)}`.toLowerCase().includes(q)});
 const signInLive=state.coverage.signIns?.status==='available';
 const signInThrottled=!signInLive&&/throttl|retry|429/i.test(state.signInsMessage||'');
 const signInLicense=!signInLive&&/p1|p2|license/i.test(state.signInsMessage||'');
 const signInPermission=!signInLive&&/permission|authorization|forbidden|privilege/i.test(state.signInsMessage||'');
 const signInBadge=signInLive?badge('P1/P2 sign-in telemetry active','good'):signInThrottled?badge('Graph throttled — retry later','medium'):signInLicense?badge('Sign-in logs require P1/P2','neutral'):signInPermission?badge('Sign-in log access denied','medium'):badge('Sign-in telemetry unavailable','neutral');
 const signInUnavailableCopy=signInThrottled?'Microsoft Graph temporarily throttled the sign-in log request. Directory audit activity remains available below. Wait briefly before refreshing tenant data again.':signInLicense?'Microsoft Entra ID P1 or P2 is required for Graph sign-in downloads. Directory audit activity remains available below.':signInPermission?'The signed-in identity cannot currently read tenant sign-in logs. Verify Graph consent and the effective Entra role for the account. Directory audit activity remains available below.':(state.signInsMessage||'Sign-in telemetry is currently unavailable. Directory audit activity remains available below.');
 return `<section>
  <div class="card">
   <div class="section-title"><div><h2>Recent identity activity</h2><div class="muted small">Read-only Microsoft Graph activity for this Entra tenant.</div></div>${signInBadge}</div>
   ${toolbar('Search user, UPN, application, activity, IP, or result…')}
   ${signInLive
    ?'<div class="notice info"><strong>Live sign-in logs available.</strong> The table below shows the most recent sign-in events returned by Microsoft Graph.</div>'
    :`<div class="notice info"><strong>${signInThrottled?'Sign-in logs temporarily throttled.':signInLicense?'Sign-in logs require additional licensing.':signInPermission?'Sign-in log access denied.':'Sign-in telemetry unavailable.'}</strong> ${esc(signInUnavailableCopy)}</div>`}
  </div>
  ${signInLive?`<div class="card"><div class="section-title"><div><h2>Recent tenant sign-ins</h2><div class="muted small">Newest 25 events requested from Microsoft Graph.</div></div><span class="muted small">${signIns.length}/${state.data.signIns.length} shown</span></div>
   <div class="table-wrap"><table><thead><tr><th>Time</th><th>User</th><th>UPN</th><th>Application</th><th>Status</th><th>IP</th><th>Location</th></tr></thead><tbody>
   ${signIns.map(x=>`<tr><td>${esc(formatActivityTime(x.createdDateTime))}</td><td><strong>${esc(x.userDisplayName||'—')}</strong></td><td>${esc(x.userPrincipalName||'—')}</td><td>${esc(x.appDisplayName||x.resourceDisplayName||'—')}</td><td>${Number(x?.status?.errorCode||0)===0?badge('Success','good'):badge('Failed','high')}<br><span class="muted small">${esc(signInStatus(x))}</span></td><td><code>${esc(x.ipAddress||'—')}</code></td><td>${esc(signInLocation(x))}</td></tr>`).join('')||'<tr><td colspan="7" class="empty">No sign-in events match the current filter.</td></tr>'}
   </tbody></table></div></div>`:''}
  <div class="card"><div class="section-title"><div><h2>Recent directory audit activity</h2><div class="muted small">Available on Entra ID Free. This is administrative/directory activity, not a substitute for sign-in telemetry.</div></div><span class="muted small">${audits.length}/${state.data.directoryAudits.length} shown</span></div>
   ${state.directoryAuditsUnavailable?`<div class="notice warn"><strong>Directory audit data unavailable:</strong> ${esc(state.directoryAuditsMessage)}</div>`:''}
   <div class="table-wrap"><table><thead><tr><th>Time</th><th>Actor</th><th>Actor UPN / ID</th><th>Activity</th><th>Category</th><th>Result</th><th>Target</th><th>IP</th></tr></thead><tbody>
   ${audits.map(x=>{const a=auditActor(x);return `<tr><td>${esc(formatActivityTime(x.activityDateTime))}</td><td><strong>${esc(a.name)}</strong></td><td>${esc(a.upn||'—')}</td><td>${esc(x.activityDisplayName||'—')}</td><td>${esc(x.category||'—')}</td><td>${String(x.result||'').toLowerCase()==='success'?badge('Success','good'):badge(x.result||'Unknown','neutral')}</td><td>${esc(auditTargets(x))}</td><td><code>${esc(a.ip)}</code></td></tr>`}).join('')||'<tr><td colspan="8" class="empty">No directory audit events match the current filter.</td></tr>'}
   </tbody></table></div>
  </div>
 </section>`;
}
function renderRbac(){const q=state.search.toLowerCase(),rows=azureRows(state.data).filter(a=>!q||`${a._roleName} ${a._principalName} ${a._viaGroupName||''} ${a._principalType} ${a.properties?.scope}`.toLowerCase().includes(q));return `<section class="card"><div class="section-title"><h2>Azure RBAC assignments</h2><span class="muted small">Subscription: ${esc(state.config.subscriptionId||'not configured')}</span></div>${toolbar('Search role, principal, type, or scope…')}<div class="table-wrap"><table><thead><tr><th>Role</th><th>Principal</th><th>Type</th><th>Scope</th></tr></thead><tbody>${rows.map(a=>`<tr><td><strong>${esc(a._roleName)}</strong></td><td>${esc(a._principalName)}${a._viaGroupName?`<br><span class="muted small">Via group: ${esc(a._viaGroupName)}</span>`:''}${a._upn?`<br><span class="muted">${esc(a._upn)}</span>`:''}</td><td>${esc(a._principalType)}</td><td><code>${esc(shortScope(a.properties?.scope||''))}</code></td></tr>`).join('')||'<tr><td colspan="4" class="empty">No RBAC assignments returned.</td></tr>'}</tbody></table></div></section>`}
function renderFindings(){const q=state.search.toLowerCase(),rows=state.data.findings.filter(f=>!q||`${f.severity} ${f.title} ${f.detail} ${f.subject}`.toLowerCase().includes(q));return `<section class="card"><div class="section-title"><div><h2>Governance review findings</h2><div class="muted small">Heuristic review — validate findings against business requirements.</div></div><div><button class="btn" data-action="export-json">Export JSON</button> <button class="btn" data-action="export-csv">Export CSV</button></div></div>${toolbar('Search findings…')}${rows.length?rows.map(f=>`<div class="finding"><div>${badge(f.severity.toUpperCase(),f.severity)}</div><div><h3>${esc(f.title)}</h3><p>${esc(f.detail)}</p>${f.subject?`<div class="muted small subject">Subject: ${esc(f.subject)}</div>`:''}</div></div>`).join(''):(state.data.findings.length?'<div class="empty">No findings match the current filter.</div>':'<div class="empty">No heuristic findings generated. No tested condition was detected. This is not a certification that the tenant is secure.</div>')}</section>`}
function renderSetup(){return `<section class="grid two-col"><div class="card"><div class="section-title"><h2>Organization connection</h2>${badge('Multitenant')}</div><p>Microsoft work or school accounts can authenticate through the shared Entra application. The signed-in tenant is detected automatically; customers do not enter a Tenant ID or Client ID.</p><div class="form-grid"><div class="field full"><label>Azure Subscription ID <span class="muted">(optional, for Azure resource/RBAC inventory)</span></label><input id="subscriptionId" value="${esc(state.config.subscriptionId||'')}" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"></div></div><div class="buttons"><button class="btn primary" data-action="save-config">Save subscription setting</button><button class="btn danger" data-action="clear-config">Clear browser settings</button></div><div class="notice"><strong>Azure RBAC required for subscription analysis</strong><ul class="checklist"><li><strong>Reader</strong> at the subscription scope is the baseline for resource groups, VNets, NICs, public IPs, NSGs, VMs, and other Azure resource inventory used by the Topology tab.</li><li>Add <strong>Role Based Access Control Reader</strong> at the subscription scope if you want the dashboard to reliably display Azure role assignments and role definitions.</li><li><strong>Owner, Contributor, and User Access Administrator are not required</strong> for this read-only dashboard and should not be assigned just to use this app.</li><li>The signed-in user must actually have access to the Subscription ID entered above; knowing a Subscription ID by itself does not grant access.</li></ul></div><p class="muted small">Shared application ID: ${configured()?esc(APP_CLIENT_ID):'deployment variable not configured'}. This is a public identifier, not a secret.</p>${state.account?`<p class="muted small">Connected tenant: <code>${esc(signedInTenantId()||'unknown')}</code></p>`:''}</div><div class="card"><h2>Multitenant Entra app checklist</h2><ol class="checklist"><li>Set supported account types to <strong>Accounts in any organizational directory</strong>.</li><li>Add SPA redirect URI: <div class="code">${esc(location.origin)}</div></li><li>Configure delegated Graph permissions: <strong>User.Read</strong>, <strong>Directory.Read.All</strong>, <strong>RoleManagement.Read.Directory</strong>, <strong>AuditLog.Read.All</strong>, <strong>UserAuthenticationMethod.Read.All</strong>, <strong>Policy.Read.AuthenticationMethod</strong>, and <strong>Policy.Read.All</strong> for Conditional Access policy inventory.</li><li>Add Azure Service Management delegated <strong>user_impersonation</strong> if Azure resource inventory is required.</li><li>Customer tenant administrators grant consent for permissions that require admin approval.</li><li>Keep the application read-only until a separately reviewed remediation workflow is introduced.</li></ol></div><div class="card"><h2>Security model</h2><ul class="checklist"><li>Organization is derived from the authenticated token tenant claim.</li><li>Read-only Graph and ARM operations.</li><li>No client secret in the browser.</li><li>MSAL token cache uses session storage.</li><li>Only the optional Azure Subscription ID is stored locally.</li><li>No project backend receives tenant data in this version.</li></ul></div><div class="card"><h2>What it checks</h2><ul class="checklist"><li>Tenant groups and direct user membership.</li><li>Active and eligible privileged Entra role assignments, including schedule dates when exposed.</li><li>Tenant authentication-method policy and per-user registered authentication methods.</li><li>Conditional Access policy state, user/group targeting, cloud app targeting, grant controls, and session controls when permitted.</li><li>Premium MFA/passwordless readiness telemetry when the tenant license exposes it.</li><li>Active Entra directory roles.</li><li>Recent Entra directory audit activity, with automatic tenant sign-in telemetry when P1/P2 is available.</li><li>Live Azure resource inventory and VNet/subnet/NIC/VM/Public IP/NSG topology.</li><li>Azure RBAC scope breadth.</li><li>Subscription-wide Owner, Contributor, and User Access Administrator.</li><li>Privileged identities without reported MFA capability.</li><li>Guest identities with broad Azure access.</li><li>Ownerless Microsoft 365 and security groups.</li><li>Stale privileged accounts based on last successful sign-in when licensed telemetry is available.</li><li>Dormant enabled guest accounts based on last successful sign-in when licensed telemetry is available.</li></ul></div></section>`}

function wire(){
 document.querySelectorAll('[data-tab]').forEach(x=>x.addEventListener('click',()=>{state.tab=x.dataset.tab;state.search='';render()}));
 document.querySelector('[data-action="signin"]')?.addEventListener('click',signIn);
 document.querySelector('[data-action="signout"]')?.addEventListener('click',signOut);
 document.querySelector('[data-action="load"]')?.addEventListener('click',loadTenantData);
 document.querySelector('[data-action="save-config"]')?.addEventListener('click',()=>{const subscriptionId=document.querySelector('#subscriptionId')?.value.trim()||'';if(subscriptionId&&!guid(subscriptionId)){state.error='Subscription ID must be a valid GUID if provided.';render();return}saveConfig({subscriptionId});location.reload()});
 document.querySelector('[data-action="clear-config"]')?.addEventListener('click',async()=>{controller.changeAccount(null);localStorage.removeItem(KEY);try{await state.msal?.clearCache()}finally{location.reload()}});
 document.querySelector('[data-search]')?.addEventListener('input',e=>{state.search=e.target.value;render();requestAnimationFrame(()=>{const s=document.querySelector('[data-search]');if(s){s.focus();s.setSelectionRange(s.value.length,s.value.length)}})});
 document.querySelector('[data-action="export-json"]')?.addEventListener('click',exportJson);
 document.querySelector('[data-action="export-csv"]')?.addEventListener('click',exportCsv);
}
function download(name,content,type){const b=new Blob([content],{type}),u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)}
function exportJson(){download('azure-governance-findings.json',JSON.stringify({generatedAt:new Date().toISOString(),snapshotAt:state.loadedAt?.toISOString()||null,assessment:reviewAssessment(),coverage:state.coverage,mfaEnforcement:'Unknown',tenantId:signedInTenantId()||null,subscriptionId:state.config.subscriptionId||null,summary:{users:state.data.users.length,groups:state.data.groups.length,mfaCapablePercent:mfaPct(),usersWithStrongRegisteredAuthMethod:usersWithStrongAuth().length,usersWithReadableAuthMethods:usersWithAuthData().length,effectivePrivilegedUsers:privilegedUsers().size,effectiveAzureUserAssignments:(state.data.effectiveAzureRoleAssignments||[]).length,entraRoleAssignments:roleMembers(),conditionalAccessPolicies:state.data.conditionalAccessPolicies.length,azureRbacAssignments:state.data.azureRoleAssignments.length,reviewScore:score()},findings:state.data.findings},null,2),'application/json')}
function exportCsv(){download('azure-governance-findings.csv',findingsCsv(state.data.findings,{...reviewAssessment(),snapshotAt:state.loadedAt?.toISOString()||null}),'text/csv')}

render();initAuth().catch(e=>{state.error=norm(e);render()});
