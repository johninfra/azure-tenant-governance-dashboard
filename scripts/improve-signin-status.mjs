import { readFile, writeFile } from 'node:fs/promises';

const path = new URL('../src/main.multitenant.js', import.meta.url);
let source = await readFile(path, 'utf8');

function replaceOnce(label, from, to) {
  if (!source.includes(from)) throw new Error(`Sign-in status transform failed: ${label} marker not found.`);
  source = source.replace(from, to);
}

replaceOnce(
  'sign-in error classification',
  `   state.signInsMessage=/premium|p1|p2|license|aadiam/i.test(raw)\n    ? 'Microsoft Graph sign-in downloads require Microsoft Entra ID P1 or P2. Directory audit activity is shown below until the tenant is upgraded.'\n    : raw;`,
  `   state.signInsMessage=/throttl|too many requests|retry-after|\\b429\\b/i.test(raw)\n    ? 'Microsoft Graph temporarily throttled the sign-in log request. Wait briefly, then refresh tenant data again.'\n    : /premium|p1|p2|license|aadiam/i.test(raw)\n      ? 'Microsoft Graph sign-in downloads require Microsoft Entra ID P1 or P2. Directory audit activity is shown below until the tenant is upgraded.'\n      : /forbidden|authorization|permission|insufficient privileges/i.test(raw)\n        ? 'The signed-in account or application does not currently have permission to read sign-in logs for this tenant.'\n        : raw;`
);

replaceOnce(
  'sign-in activity state helpers',
  ` const signInLive=(state.data.signIns||[]).length>0;`,
  ` const signInLive=(state.data.signIns||[]).length>0;\n const signInThrottled=!signInLive&&/throttl|retry|429/i.test(state.signInsMessage||'');\n const signInLicense=!signInLive&&/p1|p2|license/i.test(state.signInsMessage||'');\n const signInPermission=!signInLive&&/permission|authorization|forbidden|privilege/i.test(state.signInsMessage||'');\n const signInBadge=signInLive?badge('P1/P2 sign-in telemetry active','good'):signInThrottled?badge('Graph throttled — retry later','medium'):signInLicense?badge('Sign-in logs require P1/P2','neutral'):signInPermission?badge('Sign-in log access denied','medium'):badge('Sign-in telemetry unavailable','neutral');\n const signInUnavailableCopy=signInThrottled?'Microsoft Graph temporarily throttled the sign-in log request. Directory audit activity remains available below. Wait briefly before refreshing tenant data again.':signInLicense?'Microsoft Entra ID P1 or P2 is required for Graph sign-in downloads. Directory audit activity remains available below.':signInPermission?'The signed-in identity cannot currently read tenant sign-in logs. Verify Graph consent and the account\'s effective Entra role. Directory audit activity remains available below.':(state.signInsMessage||'Sign-in telemetry is currently unavailable. Directory audit activity remains available below.');`
);

replaceOnce(
  'sign-in status badge',
  `${'${signInLive?badge(\'P1/P2 sign-in telemetry active\',\'good\'):badge(\'Free-license fallback\',\'neutral\')}'}`,
  `${'${signInBadge}'}`
);

replaceOnce(
  'sign-in unavailable notice',
  `${'${signInLive\n    ?\'<div class="notice info"><strong>Live sign-in logs available.</strong> The table below shows the most recent sign-in events returned by Microsoft Graph.</div>\'\n    :`<div class="notice info"><strong>Sign-in telemetry not available through Graph yet.</strong> ${esc(state.signInsMessage||\'Microsoft Entra ID P1 or P2 is required for Graph sign-in downloads.\')} Recent directory audit activity is still available below.</div>`}'}`,
  `${'${signInLive\n    ?\'<div class="notice info"><strong>Live sign-in logs available.</strong> The table below shows the most recent sign-in events returned by Microsoft Graph.</div>\'\n    :`<div class="notice info"><strong>${signInThrottled?\'Sign-in logs temporarily throttled.\':signInLicense?\'Sign-in logs require additional licensing.\':signInPermission?\'Sign-in log access denied.\':\'Sign-in telemetry unavailable.\'}</strong> ${esc(signInUnavailableCopy)}</div>`}'}`
);

await writeFile(path, source, 'utf8');
console.log('Improved sign-in telemetry status and Graph throttling messaging.');
