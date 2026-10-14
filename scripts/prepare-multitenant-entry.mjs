import { readFile, writeFile } from 'node:fs/promises';

const sourcePath = new URL('../src/main.js', import.meta.url);
const outputPath = new URL('../src/main.multitenant.js', import.meta.url);
let source = await readFile(sourcePath, 'utf8');

function replaceOnce(label, from, to) {
  if (!source.includes(from)) {
    throw new Error(`Multitenant build transform failed: expected ${label} source was not found.`);
  }
  source = source.replace(from, to);
}

replaceOnce(
  'application configuration',
  "const KEY='azureTenantGovernanceConfig.v1';",
  "const KEY='azureTenantGovernanceConfig.v1';\nconst APP_CLIENT_ID=String(import.meta.env.VITE_ENTRA_CLIENT_ID||'').trim();\nconst MULTITENANT_AUTHORITY='https://login.microsoftonline.com/organizations';"
);

replaceOnce(
  'configured check',
  "function configured(){return guid(state.config.tenantId)&&guid(state.config.clientId)}",
  "function configured(){return guid(APP_CLIENT_ID)}\nfunction signedInTenantId(){return state.account?.tenantId||state.account?.idTokenClaims?.tid||''}"
);

replaceOnce(
  'MSAL initialization',
  "async function initAuth(){\n if(!configured()){render();return}\n state.msal=new PublicClientApplication({auth:{clientId:state.config.clientId.trim(),authority:`https://login.microsoftonline.com/${state.config.tenantId.trim()}`,redirectUri:location.origin,postLogoutRedirectUri:location.origin},cache:{cacheLocation:'sessionStorage',storeAuthStateInCookie:false}});\n await state.msal.initialize();\n await state.msal.handleRedirectPromise();\n state.account=state.msal.getAllAccounts()[0]||null;\n render();\n}",
  "async function initAuth(){\n if(!configured()){state.error='This deployment is missing VITE_ENTRA_CLIENT_ID. Configure the shared multitenant Entra application ID in the deployment environment.';render();return}\n state.msal=new PublicClientApplication({auth:{clientId:APP_CLIENT_ID,authority:MULTITENANT_AUTHORITY,redirectUri:location.origin,postLogoutRedirectUri:location.origin},cache:{cacheLocation:'sessionStorage',storeAuthStateInCookie:false}});\n await state.msal.initialize();\n await state.msal.handleRedirectPromise();\n state.account=state.msal.getAllAccounts()[0]||null;\n render();\n}"
);

replaceOnce(
  'signed-in notice',
  "${state.account?`<div class=\"notice\"><strong>Signed in:</strong> ${esc(accountName())}. Tokens remain in session storage.</div>`:''}",
  "${state.account?`<div class=\"notice\"><strong>Signed in:</strong> ${esc(accountName())}. <strong>Tenant:</strong> ${esc(signedInTenantId()||'unknown')}. Tokens remain in session storage.</div>`:''}"
);

replaceOnce(
  'setup panel',
  "function renderSetup(){return `<section class=\"grid two-col\"><div class=\"card\"><div class=\"section-title\"><h2>Application configuration</h2>${badge('Browser-local')}</div><div class=\"form-grid\"><div class=\"field\"><label>Tenant ID</label><input id=\"tenantId\" value=\"${esc(state.config.tenantId||'')}\" placeholder=\"xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx\"></div><div class=\"field\"><label>Client / Application ID</label><input id=\"clientId\" value=\"${esc(state.config.clientId||'')}\" placeholder=\"xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx\"></div><div class=\"field full\"><label>Azure Subscription ID</label><input id=\"subscriptionId\" value=\"${esc(state.config.subscriptionId||'')}\" placeholder=\"xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx\"></div></div><div class=\"buttons\"><button class=\"btn primary\" data-action=\"save-config\">Save configuration</button><button class=\"btn danger\" data-action=\"clear-config\">Clear configuration</button></div><p class=\"muted small\">These values are identifiers, not secrets. Never add a client secret to this SPA.</p></div><div class=\"card\"><h2>Entra app registration checklist</h2><ol class=\"checklist\"><li>Create a <strong>Single-page application (SPA)</strong> app registration.</li><li>Add redirect URI: <div class=\"code\">${esc(location.origin)}</div></li><li>Add delegated Graph permissions: <strong>User.Read</strong>, <strong>Directory.Read.All</strong>, <strong>RoleManagement.Read.Directory</strong>, <strong>AuditLog.Read.All</strong>, <strong>UserAuthenticationMethod.Read.All</strong>, and <strong>Policy.Read.AuthenticationMethod</strong>.</li><li>Add Azure Service Management delegated <strong>user_impersonation</strong>.</li><li>Grant tenant admin consent where required.</li><li>Use an account with read access to the requested directory reports and Azure scope.</li></ol></div><div class=\"card\"><h2>Security model</h2><ul class=\"checklist\"><li>Read-only Graph and ARM operations.</li><li>No client secret.</li><li>MSAL token cache uses session storage.</li><li>Only non-secret IDs are stored locally.</li><li>No project backend receives tenant data.</li></ul></div><div class=\"card\"><h2>What it checks</h2><ul class=\"checklist\"><li>Tenant groups and direct user membership.</li><li>Active and eligible privileged Entra role assignments, including schedule dates when exposed.</li><li>Tenant authentication-method policy and per-user registered authentication methods.</li><li>Premium MFA/passwordless readiness telemetry when the tenant license exposes it.</li><li>Active Entra directory roles.</li><li>Recent Entra directory audit activity, with automatic tenant sign-in telemetry when P1/P2 is available.</li><li>Live Azure resource inventory and VNet/subnet/NIC/VM/Public IP/NSG topology.</li><li>Azure RBAC scope breadth.</li><li>Subscription-wide Owner, Contributor, and User Access Administrator.</li><li>Privileged identities without reported MFA capability.</li><li>Guest identities with broad Azure access.</li></ul></div></section>`}",
  "function renderSetup(){return `<section class=\"grid two-col\"><div class=\"card\"><div class=\"section-title\"><h2>Organization connection</h2>${badge('Multitenant')}</div><p>Microsoft work or school accounts can authenticate through the shared Entra application. The signed-in tenant is detected automatically; customers do not enter a Tenant ID or Client ID.</p><div class=\"form-grid\"><div class=\"field full\"><label>Azure Subscription ID <span class=\"muted\">(optional, for Azure resource/RBAC inventory)</span></label><input id=\"subscriptionId\" value=\"${esc(state.config.subscriptionId||'')}\" placeholder=\"xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx\"></div></div><div class=\"buttons\"><button class=\"btn primary\" data-action=\"save-config\">Save subscription setting</button><button class=\"btn danger\" data-action=\"clear-config\">Clear browser settings</button></div><p class=\"muted small\">Shared application ID: ${configured()?esc(APP_CLIENT_ID):'deployment variable not configured'}. This is a public identifier, not a secret.</p>${state.account?`<p class=\"muted small\">Connected tenant: <code>${esc(signedInTenantId()||'unknown')}</code></p>`:''}</div><div class=\"card\"><h2>Multitenant Entra app checklist</h2><ol class=\"checklist\"><li>Set supported account types to <strong>Accounts in any organizational directory</strong>.</li><li>Add SPA redirect URI: <div class=\"code\">${esc(location.origin)}</div></li><li>Configure delegated Graph permissions: <strong>User.Read</strong>, <strong>Directory.Read.All</strong>, <strong>RoleManagement.Read.Directory</strong>, <strong>AuditLog.Read.All</strong>, <strong>UserAuthenticationMethod.Read.All</strong>, and <strong>Policy.Read.AuthenticationMethod</strong>.</li><li>Add Azure Service Management delegated <strong>user_impersonation</strong> if Azure resource inventory is required.</li><li>Customer tenant administrators grant consent for permissions that require admin approval.</li><li>Keep the application read-only until a separately reviewed remediation workflow is introduced.</li></ol></div><div class=\"card\"><h2>Security model</h2><ul class=\"checklist\"><li>Organization is derived from the authenticated token tenant claim.</li><li>Read-only Graph and ARM operations.</li><li>No client secret in the browser.</li><li>MSAL token cache uses session storage.</li><li>Only the optional Azure Subscription ID is stored locally.</li><li>No project backend receives tenant data in this version.</li></ul></div><div class=\"card\"><h2>What it checks</h2><ul class=\"checklist\"><li>Tenant groups and direct user membership.</li><li>Active and eligible privileged Entra role assignments, including schedule dates when exposed.</li><li>Tenant authentication-method policy and per-user registered authentication methods.</li><li>Premium MFA/passwordless readiness telemetry when the tenant license exposes it.</li><li>Active Entra directory roles.</li><li>Recent Entra directory audit activity, with automatic tenant sign-in telemetry when P1/P2 is available.</li><li>Live Azure resource inventory and VNet/subnet/NIC/VM/Public IP/NSG topology.</li><li>Azure RBAC scope breadth.</li><li>Subscription-wide Owner, Contributor, and User Access Administrator.</li><li>Privileged identities without reported MFA capability.</li><li>Guest identities with broad Azure access.</li></ul></div></section>`}"
);

replaceOnce(
  'setup save handler',
  "document.querySelector('[data-action=\"save-config\"]')?.addEventListener('click',()=>{const c={tenantId:document.querySelector('#tenantId').value.trim(),clientId:document.querySelector('#clientId').value.trim(),subscriptionId:document.querySelector('#subscriptionId').value.trim()};if(!guid(c.tenantId)||!guid(c.clientId)||(c.subscriptionId&&!guid(c.subscriptionId))){state.error='Enter valid GUIDs for Tenant ID and Client ID. Subscription ID must also be a GUID if provided.';render();return}saveConfig(c);location.reload()});",
  "document.querySelector('[data-action=\"save-config\"]')?.addEventListener('click',()=>{const subscriptionId=document.querySelector('#subscriptionId')?.value.trim()||'';if(subscriptionId&&!guid(subscriptionId)){state.error='Subscription ID must be a valid GUID if provided.';render();return}saveConfig({subscriptionId});location.reload()});"
);

replaceOnce(
  'export tenant identifier',
  'tenantId:state.config.tenantId,subscriptionId:state.config.subscriptionId||null',
  'tenantId:signedInTenantId()||null,subscriptionId:state.config.subscriptionId||null'
);

await writeFile(outputPath, source, 'utf8');
console.log('Generated src/main.multitenant.js using organizations authority and shared VITE_ENTRA_CLIENT_ID.');
