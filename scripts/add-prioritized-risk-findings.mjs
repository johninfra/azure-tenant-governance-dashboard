import { readFile, writeFile } from 'node:fs/promises';

const path = new URL('../src/main.multitenant.js', import.meta.url);
let source = await readFile(path, 'utf8');

function replaceOnce(label, from, to) {
  if (!source.includes(from)) {
    throw new Error(`Prioritized findings transform failed: expected ${label} marker was not found.`);
  }
  source = source.replace(from, to);
}

replaceOnce(
  'user sign-in activity and group owner loading',
  "  Object.assign(state.data,{users,groups,servicePrincipals:sps});",
  `  Object.assign(state.data,{users,groups,servicePrincipals:sps});
  state.data.userSignInActivityLoaded=false;
  state.data.groupOwners={};
  try{
   const activityUsers=await paged(base+'/users?$select=id,createdDateTime,signInActivity&$top=500',gt);
   const activityById=new Map(activityUsers.map(u=>[u.id,u]));
   state.data.users=state.data.users.map(u=>{const extra=activityById.get(u.id)||{};return {...u,createdDateTime:extra.createdDateTime||u.createdDateTime||null,signInActivity:extra.signInActivity||null}});
   state.data.userSignInActivityLoaded=true;
  }catch(e){
   state.warnings.push('User sign-in activity unavailable; stale-admin and dormant-guest findings were skipped. '+norm(e));
  }
  try{
   const ownerPairs=await mapLimit(groups,6,async group=>{
    try{return [group.id,await paged(base+'/groups/'+group.id+'/owners?$select=id,displayName,userPrincipalName',gt)]}
    catch{return [group.id,null]}
   });
   state.data.groupOwners=Object.fromEntries(ownerPairs.filter(([,owners])=>Array.isArray(owners)));
  }catch(e){
   state.warnings.push('Group owner inventory unavailable; ownerless-group findings were skipped. '+norm(e));
  }`
);

replaceOnce(
  'risk helper functions',
  "function directoryScope(v){return !v||v==='/'?'Tenant-wide':v}\nfunction buildFindings(){",
  `function directoryScope(v){return !v||v==='/'?'Tenant-wide':v}
function daysSince(v){if(!v)return Infinity;const t=new Date(v).getTime();return Number.isFinite(t)?(Date.now()-t)/86400000:Infinity}
function lastSuccessfulSignIn(user={}){return user.signInActivity?.lastSuccessfulSignInDateTime||null}
function activityAgeLabel(user={}){const last=lastSuccessfulSignIn(user);if(last)return 'last successful sign-in '+Math.floor(daysSince(last))+' days ago';if(user.createdDateTime)return 'no successful sign-in exposed; account created '+Math.floor(daysSince(user.createdDateTime))+' days ago';return 'no reliable activity timestamp exposed'}
function buildFindings(){`
);

replaceOnce(
  'ownerless, stale-admin, and dormant-guest findings',
  " const sensitive=/global administrator|privileged role administrator|privileged authentication administrator|authentication administrator|security administrator|user administrator|application administrator|cloud application administrator/i;",
  ` const sensitive=/global administrator|privileged role administrator|privileged authentication administrator|authentication administrator|security administrator|user administrator|application administrator|cloud application administrator/i;
 const highPriv=/global administrator|privileged role administrator|privileged authentication administrator|security administrator|application administrator|cloud application administrator/i;
 const owners=state.data.groupOwners||{};
 for(const g of state.data.groups){
  const groupOwners=owners[g.id];
  const governedType=g.securityEnabled||(g.groupTypes||[]).includes('Unified');
  if(governedType&&Array.isArray(groupOwners)&&groupOwners.length===0){
   add('medium','Ownerless group',(g.displayName||'Unnamed group')+' has no owner returned by Microsoft Graph. Assign accountable ownership so membership and access changes have a clear reviewer.',g.displayName||g.id,'ownerless-group:'+g.id);
  }
 }
 if(state.data.userSignInActivityLoaded){
  const usersById=new Map(state.data.users.map(u=>[u.id,u]));
  const activePrivByUser=new Map();
  for(const a of state.data.privilegedRoleAssignments||[]){
   if(!a.principalId)continue;
   const user=usersById.get(a.principalId);
   if(!user||user.accountEnabled===false)continue;
   if(!activePrivByUser.has(a.principalId))activePrivByUser.set(a.principalId,[]);
   activePrivByUser.get(a.principalId).push(a);
  }
  for(const [id,assignments] of activePrivByUser){
   const user=usersById.get(id);if(!user)continue;
   const last=lastSuccessfulSignIn(user),created=user.createdDateTime;
   const stale=(last&&daysSince(last)>=45)||(!last&&created&&daysSince(created)>=45);
   if(!stale)continue;
   const roleNames=[...new Set(assignments.map(a=>a._roleName||'Privileged role'))];
   const severity=roleNames.some(r=>highPriv.test(r))?'high':'medium';
   add(severity,'Stale privileged account',(user.displayName||user.userPrincipalName||id)+' has active privileged access ('+roleNames.join(', ')+') and '+activityAgeLabel(user)+'. Review whether the account still needs standing privilege or should be disabled/reduced.',user.userPrincipalName||user.displayName||id,'stale-admin:'+id);
  }
  for(const user of state.data.users.filter(u=>u.userType==='Guest'&&u.accountEnabled!==false)){
   const last=lastSuccessfulSignIn(user),created=user.createdDateTime;
   const dormant=(last&&daysSince(last)>=90)||(!last&&created&&daysSince(created)>=90);
   if(!dormant)continue;
   add('medium','Dormant guest account',(user.displayName||user.userPrincipalName||user.id)+' is an enabled guest with '+activityAgeLabel(user)+'. Confirm the external relationship is still valid and remove access that is no longer required.',user.userPrincipalName||user.displayName||user.id,'dormant-guest:'+user.id);
  }
 }`
);

replaceOnce(
  'setup risk checks list',
  '<li>Guest identities with broad Azure access.</li>',
  '<li>Guest identities with broad Azure access.</li><li>Ownerless Microsoft 365 and security groups.</li><li>Stale privileged accounts based on last successful sign-in when licensed telemetry is available.</li><li>Dormant enabled guest accounts based on last successful sign-in when licensed telemetry is available.</li>'
);

await writeFile(path, source, 'utf8');
console.log('Added ownerless-group, stale-privileged-account, and dormant-guest prioritized findings.');
