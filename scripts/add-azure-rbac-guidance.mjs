import { readFile, writeFile } from 'node:fs/promises';

const path = new URL('../src/main.multitenant.js', import.meta.url);
let source = await readFile(path, 'utf8');

const needle = '<div class="buttons"><button class="btn primary" data-action="save-config">Save subscription setting</button><button class="btn danger" data-action="clear-config">Clear browser settings</button></div>';
const replacement = `${needle}<div class="notice"><strong>Azure RBAC required for subscription analysis</strong><ul class="checklist"><li><strong>Reader</strong> at the subscription scope is the baseline for resource groups, VNets, NICs, public IPs, NSGs, VMs, and other Azure resource inventory used by the Topology tab.</li><li>Add <strong>Role Based Access Control Reader</strong> at the subscription scope if you want the dashboard to reliably display Azure role assignments and role definitions.</li><li><strong>Owner, Contributor, and User Access Administrator are not required</strong> for this read-only dashboard and should not be assigned just to use this app.</li><li>The signed-in user must actually have access to the Subscription ID entered above; knowing a Subscription ID by itself does not grant access.</li></ul></div>`;

if (!source.includes(needle)) {
  throw new Error('RBAC guidance injection failed: setup buttons marker was not found.');
}

source = source.replace(needle, replacement);
await writeFile(path, source, 'utf8');
console.log('Added Azure RBAC requirements guidance to the multitenant setup page.');
