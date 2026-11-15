import { PublicClientApplication, InteractionRequiredAuthError, EventType } from '@azure/msal-browser';
import './styles.css';
import { renderTopology } from './topology.js';
import { emptySnapshot, assessment, DATASETS, accountKey } from './snapshot.js';
import { createDashboardController } from './controller.js';
import { renderMfaView, renderOverviewView } from './views.js';
import { findingsCsv } from './export.js';
import { renderIdentityRisk } from './identity-risk.js';
import { assessFrameworks, frameworkExport, renderFrameworkAlignment } from './frameworks.js';
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
 <header class="topbar"><div><div class="eyebrow">Microsoft Entra ID + Azure RBAC</div><h1>Entra IAM Governance Dashboard</h1><p class="subtitle">Read-only identity and access governance for tenant inventory, MFA posture, Conditional Access, privileged Entra roles, Azure RBAC, and least-privilege findings.</p></div>
 <div class="top-actions">${connectionStatus()}${c&&state.account?`<button class="btn primary" data-action="load" ${state.loading||state.authBusy?'disabled':''}>${state.loading?'Loading…':'Refresh tenant data'}</button><button class="btn" data-action="signout" ${state.authBusy?'disabled':''}>Sign out</button>`:c?`<button class="btn primary" data-action="signin" ${!state.authReady||state.authBusy?'disabled':''}>${state.authBusy?'Completing authentication...':'Sign in with Microsoft'}</button>`:'<button class="btn primary" data-tab="setup">Configure app</button>'}</div></header>
 ${state.account?`<div class="notice"><strong>Signed in:</strong> ${esc(accountName())}. <strong>Tenant:</strong> ${esc(signedInTenantId()||'unknown')}. Tokens remain in session storage.</div>`:''}
 ${state.error?`<div class="notice error"><strong>Error:</strong> ${esc(state.error)}</div>`:''}
 ${state.mfaUnavailable&&!Object.keys(state.data.userAuthMethods||{}).length?`<div class="notice info"><strong>MFA report unavailable:</strong> ${esc(state.mfaMessage)}</div>`:''}
 ${state.warnings.map(w=>`<div class="notice warn"><strong>Partial data:</strong> ${esc(w)}</div>`).join('')}
 <nav class="nav">${nav('overview','Overview')}${nav('groups','Groups & Members')}${nav('privileged','Privileged Access')}${nav('mfa','MFA posture')}${nav('roles','Entra roles')}${nav('activity','Recent Activity')}${nav('conditionalAccess','Conditional Access')}${nav('topology','Azure Topology')}${nav('rbac','Azure RBAC')}${nav('identityRisk','Identity Risk')}${nav('findings','Findings')}${nav('frameworks','Framework Alignment')}${nav('setup','Setup')}</nav>
 ${renderCoverage()}
 ${safeRenderTab()}
 <footer class="footer"><span>Read-only governance utility • no secrets required in source</span><span>${state.loadedAt?'Snapshot: '+esc(state.loadedAt.toLocaleString()):'No tenant snapshot loaded yet'}</span></footer>
 </main>`;wire();
}
function safeRenderTab(){
 try { return renderTab(); }
 catch (error) {
  console.error('Dashboard view rendering failed:', error);
  return `<div class="notice error"><strong>Dashboard rendering error:</strong> ${esc(norm(error))}. Tenant collection may have completed, but the selected page could not render. Open DevTools Console for the error location.</div>`;
 }
}
function renderTab(){
 if(state.tab==='setup')return renderSetup();
 if(!configured())return '<div class="card empty">Configure your Entra application first in the <strong>Setup</strong> tab.</div>';
 if(!state.account)return '<div class="card empty">Sign in with the Entra account you want to use for the read-only review.</div>';
 if(!state.loadedAt&&!state.loading)return '<div class="card empty">Signed in successfully. Select <strong>Refresh tenant data</strong> to build the first governance snapshot.</div>';
 if(state.loading&&!state.loadedAt)return `<div class="card empty"><div class="loading-progress"><span class="status-dot"></span><strong>Loading tenant inventory</strong><p>${esc(state.loadStage||'Preparing tenant data…')}</p><p class="muted small">The refresh stops with an error if it exceeds two minutes. No additional administrator permissions are needed.</p></div></div>`;
 return ({groups:renderGroups,privileged:renderPrivileged,mfa:renderMfa,roles:renderRoles,activity:renderActivity,conditionalAccess:renderConditionalAccess,topology:()=>renderTopology(state,{esc,badge,toolbar}),rbac:renderRbac,identityRisk:()=>renderIdentityRisk(state,{esc,badge}),findings:renderFindings,frameworks:()=>renderFrameworkAlignment(state.data,state.coverage,{search:state.search,loadedAt:state.loadedAt})}[state.tab]||renderOverview)();
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
 const all=privilegedRows();
 const weight=name=>{const n=String(name||'').toLowerCase();if(n==='global administrator')return 0;if(n==='privileged role administrator')return 1;if(n==='conditional access administrator'||n==='security administrator'||n==='authentication administrator')return 2;if(n.includes('administrator'))return 3;return 4};
 const rows=all.filter(x=>!q||`${x._principalName} ${x._upn} ${x._roleName} ${x._access} ${x.memberType||''} ${x._viaGroupName||''} ${x.directoryScopeId||''}`.toLowerCase().includes(q))
  .sort((a,b)=>weight(a._roleName)-weight(b._roleName)||(a._access==='Active'?0:1)-(b._access==='Active'?0:1)||String(a._roleName).localeCompare(String(b._roleName))||String(a._principalName).localeCompare(String(b._principalName)));
 const global=all.filter(x=>x._roleName==='Global Administrator'&&x._access==='Active').length;
 const viaGroup=all.filter(x=>Boolean(x._viaGroupName)).length;
 const eligible=all.filter(x=>x._access==='Eligible').length;
 return `<section class="access-page"><div class="access-intro"><div><div class="eyebrow">Identity control plane</div><h2>Privileged Entra access</h2><p class="muted">Effective directory privileges, PIM eligibility, and group-inherited assignments. Highest-impact roles appear first.</p></div><span class="badge neutral">Read-only assessment</span></div>
 <div class="access-metrics"><div class="access-metric"><span>Role access records</span><strong>${all.length}</strong><small>Direct and resolved assignments</small></div><div class="access-metric critical"><span>Active Global Admin</span><strong>${global}</strong><small>Tenant-wide control plane</small></div><div class="access-metric"><span>Eligible assignments</span><strong>${eligible}</strong><small>Not currently activated</small></div><div class="access-metric"><span>Via groups</span><strong>${viaGroup}</strong><small>Resolved inherited access</small></div></div>
 <div class="card access-table-card"><div class="section-title"><div><h2>Role assignment inventory</h2><div class="muted small">Sorted by indicative administrative impact, then active before eligible. ${privilegedUsers().size} effective privileged users returned.</div></div><span class="muted small">${rows.length} of ${all.length} records</span></div>
 ${toolbar('Search identity, role, group, or scope…')}
 <div class="table-wrap"><table class="access-table"><thead><tr><th>Identity / principal</th><th>Directory role</th><th>State</th><th>Access path</th><th>Assigned / started</th><th>Ends</th><th>Scope</th></tr></thead><tbody>${rows.map(x=>`<tr class="${x._roleName==='Global Administrator'?'priority-row':''}"><td><strong>${esc(x._principalName)}</strong>${x._upn?`<div class="muted small">${esc(x._upn)}</div>`:''}</td><td><strong>${esc(x._roleName)}</strong>${x._roleName==='Global Administrator'?`<div class="priority-note">Highest tenant privilege</div>`:''}</td><td>${badge(x._access,x._access==='Active'?'high':'medium')}</td><td>${x._viaGroupName?`<span class="access-path">Inherited</span><div class="muted small">${esc(x._viaGroupName)}</div>`:`<span class="access-path">Direct</span><div class="muted small">${esc(x.memberType||x.assignmentType||'Role assignment')}</div>`}</td><td>${esc(fmtDate(x.startDateTime))}</td><td>${esc(x.endDateTime?fmtDate(x.endDateTime):'No end exposed')}</td><td><code>${esc(directoryScope(x.directoryScopeId||x.appScopeId||'/'))}</code></td></tr>`).join('')||'<tr><td colspan="7" class="empty">No privileged role assignments match the current filter.</td></tr>'}</tbody></table></div>
 <div class="notice info privileged-note"><strong>Evidence limitations:</strong> Standard active assignments may not expose historical start or expiration timestamps. PIM scheduling requires readable premium telemetry. “No end exposed” does not independently establish a permanent assignment. Group assignments and eligible roles are not necessarily effective for the same user at the same time.</div></div></section>`;
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
function rbacPriority(a){
 const n=String(a._roleName||'').toLowerCase().trim();
 const exact={'owner':0,'user access administrator':1,'role based access control administrator':1,'contributor':2,'virtual machine contributor':4,'security admin':4,'reader':7};
 let tier=5, label='Specialized';
 if(Object.hasOwn(exact,n))tier=exact[n];
 else if(/administrator|role assignment|access administrator/.test(n))tier=3;
 else if(/contributor|operator|data owner|data contributor|secrets officer/.test(n))tier=4;
 else if(/reader|scanner|monitoring/.test(n))tier=7;
 if(tier===0)label='Critical';else if(tier<=2)label='Elevated';else if(tier<=4)label='Privileged';else if(tier===7)label='Read / scan';
 else label='Review';
 const scope=String(a.properties?.scope||'').toLowerCase();
 const depth=scope.split('/').filter(Boolean).length;
 // Fewer segments indicate broader Azure scope. Scope breaks ties within each tier.
 return {tier,label,depth};
}
function renderRbac(){
 const all=azureRows(state.data);
 const q=state.search.toLowerCase();
 const rows=all.filter(a=>!q||`${a._roleName} ${a._principalName} ${a._viaGroupName||''} ${a._principalType} ${a.properties?.scope}`.toLowerCase().includes(q))
  .sort((a,b)=>{const x=rbacPriority(a),y=rbacPriority(b);return x.tier-y.tier||x.depth-y.depth||String(a._roleName).localeCompare(String(b._roleName))||String(a._principalName).localeCompare(String(b._principalName))});
 const critical=all.filter(a=>rbacPriority(a).tier<=1).length;
 const elevated=all.filter(a=>rbacPriority(a).tier===2).length;
 const subWide=all.filter(a=>String(a.properties?.scope||'').replace(/\/$/,'').toLowerCase()===`/subscriptions/${state.config.subscriptionId||''}`.toLowerCase()).length;
 const principals=new Set(all.map(a=>a._principalId||a.properties?.principalId||a._principalName)).size;
 return `<section class="access-page"><div class="access-intro"><div><div class="eyebrow">Azure authorization plane</div><h2>Azure RBAC access</h2><p class="muted">Assignments ranked by indicative role privilege, with broader scopes first inside each role tier.</p></div><span class="badge neutral">Read-only inventory</span></div>
 <div class="access-metrics"><div class="access-metric"><span>Total assignments</span><strong>${all.length}</strong><small>Returned by Azure ARM</small></div><div class="access-metric critical"><span>Owner / access admin</span><strong>${critical}</strong><small>Can control access at assigned scope</small></div><div class="access-metric"><span>Contributor</span><strong>${elevated}</strong><small>Broad resource management</small></div><div class="access-metric"><span>Distinct principals</span><strong>${principals}</strong><small>${subWide} subscription-scope assignments</small></div></div>
 <div class="card access-table-card"><div class="section-title"><div><h2>Role assignments by privilege</h2><div class="muted small">Highest-impact built-in roles first • broadest scope first within priority tier • custom roles require permission review</div></div><span class="muted small">${rows.length} of ${all.length} assignments</span></div>
 ${toolbar('Search role, identity, type, or Azure scope…')}
 <div class="table-wrap"><table class="access-table"><thead><tr><th>Role / priority</th><th>Assigned principal</th><th>Principal type</th><th>Azure scope</th></tr></thead><tbody>${rows.map(a=>{const p=rbacPriority(a);return `<tr class="${p.tier<=1?'priority-row':''}"><td><strong>${esc(a._roleName)}</strong><div class="priority-note">${badge(p.label,p.tier<=1?'high':p.tier===2?'medium':'neutral')}</div></td><td><strong>${esc(a._principalName)}</strong>${a._viaGroupName?`<div class="muted small">Via group: ${esc(a._viaGroupName)}</div>`:''}${a._upn?`<div class="muted small">${esc(a._upn)}</div>`:''}</td><td>${esc(a._principalType)}</td><td><code class="scope-code">${esc(shortScope(a.properties?.scope||''))}</code></td></tr>`}).join('')||'<tr><td colspan="4" class="empty">No RBAC assignments match the current filter.</td></tr>'}</tbody></table></div>
 <div class="notice info"><strong>Privilege ranking is a triage aid, not an effective-permissions calculation.</strong> Owner and access administrators can manage access; Contributor manages resources but cannot grant RBAC roles. Specialized and custom role permissions vary, and deny assignments, conditions, PIM activation, and inheritance can change actual effective access. Subscription: <code>${esc(state.config.subscriptionId||'not configured')}</code>.</div></div></section>`;
}
function renderFindings(){const q=state.search.toLowerCase(),rows=state.data.findings.filter(f=>!q||`${f.severity} ${f.title} ${f.detail} ${f.subject}`.toLowerCase().includes(q));return `<section class="card"><div class="section-title"><div><h2>Governance review findings</h2><div class="muted small">Heuristic review — validate findings against business requirements.</div></div><div><button class="btn" data-action="export-json">Export JSON</button> <button class="btn" data-action="export-csv">Export CSV</button></div></div>${toolbar('Search findings…')}${rows.length?rows.map(f=>`<div class="finding"><div>${badge(f.severity.toUpperCase(),f.severity)}</div><div><h3>${esc(f.title)}</h3><p>${esc(f.detail)}</p>${f.subject?`<div class="muted small subject">Subject: ${esc(f.subject)}</div>`:''}</div></div>`).join(''):(state.data.findings.length?'<div class="empty">No findings match the current filter.</div>':'<div class="empty">No heuristic findings generated. No tested condition was detected. This is not a certification that the tenant is secure.</div>')}</section>`}
function maskIdentifier(value=''){
 const text=String(value||'');
 return text.length>12?`${text.slice(0,7)}••••${text.slice(-5)}`:text||'Not available';
}
function renderSetup(){
 const coverage=Object.entries(state.coverage||{});
 const snapshot=Boolean(state.loadedAt);
 const review=snapshot?reviewAssessment():null;
 const statuses=coverage.reduce((result,[,v])=>{const status=String(v?.status||'unknown').toLowerCase();result[status]=(result[status]||0)+1;return result},{});
 const datasetRows=coverage.map(([key,value])=>{
  const status=String(value?.status||'unknown');
  const good=/^(available|success|loaded|ok)$/i.test(status);
  return `<div class="setup-dataset"><div><strong>${esc(DATASETS[key]||key)}</strong>${value?.detail?`<small>${esc(value.detail)}</small>`:''}</div>${badge(status,good?'good':/error|failed|denied/i.test(status)?'high':'neutral')}</div>`;
 }).join('');
 const permissionGroups=[
  ['Identity & groups','User.Read','Directory.Read.All'],
  ['Privileged roles','RoleManagement.Read.Directory'],
  ['Activity & sign-ins','AuditLog.Read.All'],
  ['MFA & authentication','UserAuthenticationMethod.Read.All','Policy.Read.AuthenticationMethod'],
  ['Conditional Access','Policy.Read.All'],
  ['Azure resource inventory','Azure Service Management: user_impersonation']
 ];
 const permissionRows=permissionGroups.map(([category,...permissions])=>`<div class="setup-permission"><div><strong>${esc(category)}</strong><small>${permissions.map(p=>esc(p)).join(' · ')}</small></div>${badge('Not verified','neutral')}</div>`).join('');
 return `<section class="setup-page">
  <div class="setup-heading"><div><div class="eyebrow">Workspace administration</div><h2>Configuration &amp; Security</h2><p class="muted">Review your organization connection, least-privilege requirements, data coverage, and integration guidance. All governance inventory remains read-only.</p></div>${badge('Read-only','good')}</div>
  <div class="setup-metrics">
   <div class="setup-metric"><span>Organization</span><strong>${state.account?'Connected':'Not signed in'}</strong><small>Microsoft Entra ID</small></div>
   <div class="setup-metric"><span>Dataset evidence</span><strong>${snapshot?`${review.available} / ${review.total}`:'—'}</strong><small>${snapshot?'Latest snapshot':'Refresh tenant data to assess'}</small></div>
   <div class="setup-metric"><span>Azure subscription</span><strong>${state.config.subscriptionId?'Configured':'Not configured'}</strong><small>RBAC access independently required</small></div>
   <div class="setup-metric"><span>Last refresh</span><strong class="setup-date">${snapshot?esc(state.loadedAt.toLocaleString()):'Never'}</strong><small>Local browser session</small></div>
  </div>
  <div class="setup-layout">
   <div class="card setup-panel"><div class="section-title"><div><h2>Organization connection</h2><p class="muted small">Tenant identity comes from the authenticated Microsoft account, not a manually entered tenant ID.</p></div>${badge(state.account?'Authenticated':'Not connected',state.account?'good':'neutral')}</div>
    <div class="setup-detail"><span>Signed-in identity</span><strong>${state.account?esc(maskIdentifier(accountName())):'Not signed in'}</strong></div>
    <div class="setup-detail"><span>Tenant ID</span><code>${state.account?esc(maskIdentifier(signedInTenantId())):'Not available'}</code></div>
    <div class="setup-detail"><span>Shared application</span><code>${configured()?esc(maskIdentifier(APP_CLIENT_ID)):'Not configured'}</code></div>
    <p class="muted small">Identifiers are masked for display. App and tenant IDs are identifiers, not credentials.</p>
    <div class="form-grid"><div class="field full"><label for="subscriptionId">Azure Subscription ID <span class="muted">(optional)</span></label><input id="subscriptionId" value="${esc(state.config.subscriptionId||'')}" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"></div></div>
    <div class="buttons"><button class="btn primary" data-action="save-config">Save subscription setting</button><button class="btn danger" data-action="clear-config">Clear browser settings</button></div>
    <div class="notice info"><strong>Least-privilege Azure RBAC</strong><ul class="checklist"><li>Assign <strong>Reader</strong> at the subscription scope for resource and topology inventory.</li><li>For Azure role assignments and role definitions, assign <strong>Role Based Access Control Reader</strong> at the appropriate scope.</li><li><strong>Owner, Contributor and User Access Administrator are not required</strong> for this read-only dashboard.</li><li>Entering a Subscription ID never grants access; authorization depends on the signed-in account.</li></ul></div>
   </div>
   <div class="card setup-panel"><div class="section-title"><div><h2>Permission readiness</h2><p class="muted small">Delegated Microsoft Graph and Azure resource permissions by capability.</p></div>${badge('Unverified','neutral')}</div>
    <div class="notice info"><strong>Permission grants are not independently audited here.</strong> Successful dataset retrieval provides evidence of access to that dataset, but does not prove which specific scopes were granted or that all required consent is in place.</div>
    <div class="setup-permissions">${permissionRows}</div>
    <p class="muted small">Admin consent may be required. Ask the customer tenant administrator to approve only the delegated permissions needed for enabled capabilities.</p>
   </div>
   <div class="card setup-panel"><div class="section-title"><div><h2>Data availability &amp; diagnostics</h2><p class="muted small">Evidence from the latest tenant collection, not a live authorization check.</p></div>${badge(snapshot?`${review.available} / ${review.total} available`:'No snapshot',snapshot&&review.complete?'good':'neutral')}</div>
    ${snapshot?`<p class="muted small">Snapshot: ${esc(state.loadedAt.toLocaleString())}. ${esc(Object.entries(statuses).map(([k,v])=>`${v} ${k}`).join(' · '))}. Missing, blocked or skipped datasets are not treated as passes.</p><details class="setup-disclosure" open><summary>Inspect dataset collection results</summary><div class="setup-datasets">${datasetRows||'<p>No coverage details returned.</p>'}</div></details>`:'<div class="setup-empty">No collection evidence yet. Sign in and select <strong>Refresh tenant data</strong> to populate dataset diagnostics.</div>'}
    <details class="setup-disclosure"><summary>Troubleshooting collection issues</summary><ul class="checklist"><li><strong>Consent or 403 errors:</strong> verify delegated permissions, tenant admin consent and signed-in user authorization.</li><li><strong>Azure RBAC empty:</strong> verify subscription ID, Reader access and RBAC Reader for assignment inventory.</li><li><strong>Premium identity data unavailable:</strong> confirm licensing and API availability before interpreting it as no risk.</li><li><strong>Expired or interrupted session:</strong> sign out and authenticate again, then refresh the snapshot.</li></ul></details>
   </div>
   <div class="card setup-panel"><div class="section-title"><h2>Security architecture</h2>${badge('Read-only','good')}</div>
    <div class="setup-security-grid"><div><strong>Authentication</strong><p>Microsoft Entra sign-in via MSAL browser. The SPA uses the authorization code flow with PKCE.</p></div><div><strong>Token caching</strong><p>MSAL tokens are cached in session storage. Closing the tab or clearing local cache is not the same as revoking identity-provider sessions.</p></div><div><strong>Data boundary</strong><p>Graph and Azure ARM reads run in the browser. No project backend receives tenant data in this version.</p></div><div><strong>Access principle</strong><p>No client secret in the browser. No remediation writes; assign only minimum required delegated permissions and Azure roles.</p></div></div>
    <div class="notice warn"><strong>Emergency accounts:</strong> avoid using break-glass identities for routine dashboard reviews. Use a designated least-privileged account and reserve emergency identities for recovery.</div>
   </div>
   <div class="card setup-panel"><div class="section-title"><h2>Multitenant application onboarding</h2>${badge('Setup guide')}</div>
    <details class="setup-disclosure" open><summary>1. Register the Entra application</summary><p>Set supported account types to <strong>Accounts in any organizational directory</strong> and configure the app as a single-page application.</p><p>SPA redirect URI:</p><div class="code">${esc(location.origin)}</div></details>
    <details class="setup-disclosure"><summary>2. Configure delegated permissions</summary><p>Request the Graph scopes listed in Permission readiness, plus Azure Service Management <strong>user_impersonation</strong> when Azure inventory is enabled. Grant tenant admin consent where required.</p></details>
    <details class="setup-disclosure"><summary>3. Configure Azure subscription access</summary><p>Provide the optional subscription ID and ensure the signed-in account has Reader and, when RBAC inventory is needed, Role Based Access Control Reader at the appropriate scope.</p></details>
    <details class="setup-disclosure"><summary>4. Validate read-only collection</summary><p>Refresh the snapshot, inspect dataset availability, and verify each intended capability. Keep any future remediation or write operations separate and subject to security review.</p></details>
   </div>
   <div class="card setup-panel"><div class="section-title"><h2>Governance capabilities</h2>${badge('Inventory & review')}</div>
    <div class="setup-capabilities"><div><h3>Identity &amp; groups</h3><p>Directory identities, group membership, ownerless groups and guest access.</p></div><div><h3>Privileged access</h3><p>Active and eligible Entra roles, PIM schedules, privileged access and stale privileged accounts when telemetry permits.</p></div><div><h3>Authentication posture</h3><p>Registered MFA methods, passwordless readiness, authentication policy and Conditional Access targeting and controls.</p></div><div><h3>Monitoring &amp; risk</h3><p>Sign-ins, audit activity, heuristic findings, dormant guests and framework-alignment evidence subject to available data.</p></div><div><h3>Azure authorization</h3><p>Resources, network topology, Azure RBAC assignments, scope breadth and high-impact role exposure.</p></div></div>
    <p class="muted small">Heuristic findings and framework mappings are review aids; they do not certify security, compliance or enforced MFA.</p>
   </div>
  </div>
 </section>`;
}

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
 document.querySelector('[data-action="export-frameworks"]')?.addEventListener('click',()=>download('azure-security-framework-alignment.json',JSON.stringify(frameworkExport(assessFrameworks(state.data,state.coverage),{tenantId:signedInTenantId()||null,snapshotAt:state.loadedAt?.toISOString()||null}),null,2),'application/json'));
}
function download(name,content,type){const b=new Blob([content],{type}),u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)}
function exportJson(){download('azure-governance-findings.json',JSON.stringify({generatedAt:new Date().toISOString(),snapshotAt:state.loadedAt?.toISOString()||null,assessment:reviewAssessment(),coverage:state.coverage,mfaEnforcement:'Unknown',tenantId:signedInTenantId()||null,subscriptionId:state.config.subscriptionId||null,summary:{users:state.data.users.length,groups:state.data.groups.length,mfaCapablePercent:mfaPct(),usersWithStrongRegisteredAuthMethod:usersWithStrongAuth().length,usersWithReadableAuthMethods:usersWithAuthData().length,effectivePrivilegedUsers:privilegedUsers().size,effectiveAzureUserAssignments:(state.data.effectiveAzureRoleAssignments||[]).length,entraRoleAssignments:roleMembers(),conditionalAccessPolicies:state.data.conditionalAccessPolicies.length,azureRbacAssignments:state.data.azureRoleAssignments.length,reviewScore:score()},findings:state.data.findings},null,2),'application/json')}
function exportCsv(){download('azure-governance-findings.csv',findingsCsv(state.data.findings,{...reviewAssessment(),snapshotAt:state.loadedAt?.toISOString()||null}),'text/csv')}

render();initAuth().catch(e=>{state.error=norm(e);render()});
