import './topology.css';

function azureResourceLabel(type=''){
 const t=String(type||'').toLowerCase();
 const labels={
  'microsoft.compute/virtualmachines':'Virtual machine',
  'microsoft.network/virtualnetworks':'Virtual network',
  'microsoft.network/networkinterfaces':'Network interface',
  'microsoft.network/publicipaddresses':'Public IP',
  'microsoft.network/networksecuritygroups':'Network security group',
  'microsoft.storage/storageaccounts':'Storage account',
  'microsoft.web/staticsites':'Static Web App',
  'microsoft.web/sites':'App Service',
  'microsoft.insights/actiongroups':'Action group',
  'microsoft.insights/activitylogalerts':'Activity log alert',
  'microsoft.authorization/policyassignments':'Policy assignment',
  'microsoft.keyvault/vaults':'Key Vault',
  'microsoft.network/networkwatchers':'Network Watcher',
  'microsoft.network/routetables':'Route table',
  'microsoft.network/loadbalancers':'Load balancer',
  'microsoft.network/natgateways':'NAT gateway'
 };
 return labels[t]||String(type||'Azure resource').split('/').pop().replace(/([a-z])([A-Z])/g,'$1 $2');
}
function azureResourceKind(type=''){
 const t=String(type||'').toLowerCase();
 if(t.includes('virtualmachines'))return 'vm';
 if(t.includes('virtualnetworks'))return 'vnet';
 if(t.includes('networkinterfaces'))return 'nic';
 if(t.includes('publicipaddresses'))return 'public-ip';
 if(t.includes('networksecuritygroups'))return 'nsg';
 if(t.includes('storageaccounts'))return 'storage';
 if(t.includes('staticsites')||t.includes('/sites'))return 'web';
 if(t.includes('keyvault'))return 'key';
 if(t.includes('policy'))return 'policy';
 if(t.includes('networkwatchers'))return 'watch';
 if(t.includes('routetables'))return 'route';
 if(t.includes('loadbalancers'))return 'lb';
 if(t.includes('natgateways'))return 'nat';
 return 'resource';
}
function azureResourceIcon(type=''){
 const kind=azureResourceKind(type);
 const icons={
  vm:'<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg>',
  vnet:'<svg viewBox="0 0 24 24"><circle cx="6" cy="7" r="2.5"/><circle cx="18" cy="7" r="2.5"/><circle cx="12" cy="17" r="2.5"/><path d="M8.2 8.2l2.5 6.3M15.8 8.2l-2.5 6.3M8.5 7h7"/></svg>',
  nic:'<svg viewBox="0 0 24 24"><rect x="4" y="7" width="16" height="10" rx="2"/><path d="M8 17v3M12 17v3M16 17v3M8 10h8"/></svg>',
  'public-ip':'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 4.5 6 4.5 9S15 18 12 21M12 3C9 6 7.5 9 7.5 12S9 18 12 21"/></svg>',
  nsg:'<svg viewBox="0 0 24 24"><path d="M12 3l7 3v5c0 4.5-2.8 8-7 10-4.2-2-7-5.5-7-10V6l7-3z"/><path d="M9 12l2 2 4-5"/></svg>',
  storage:'<svg viewBox="0 0 24 24"><ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></svg>',
  web:'<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M7 6.5h.01M10 6.5h.01"/></svg>',
  key:'<svg viewBox="0 0 24 24"><circle cx="8" cy="12" r="4"/><path d="M12 12h9M17 12v3M20 12v2"/></svg>',
  policy:'<svg viewBox="0 0 24 24"><path d="M6 3h9l3 3v15H6z"/><path d="M14 3v4h4M9 12h6M9 16h5"/></svg>',
  watch:'<svg viewBox="0 0 24 24"><path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6z"/><circle cx="12" cy="12" r="2.5"/></svg>',
  route:'<svg viewBox="0 0 24 24"><circle cx="5" cy="6" r="2"/><circle cx="19" cy="18" r="2"/><path d="M7 6h5a4 4 0 014 4v1a4 4 0 01-4 4H8a3 3 0 00-3 3"/></svg>',
  lb:'<svg viewBox="0 0 24 24"><path d="M12 3v18M5 7h14M5 17h14"/><circle cx="5" cy="7" r="2"/><circle cx="19" cy="7" r="2"/><circle cx="5" cy="17" r="2"/><circle cx="19" cy="17" r="2"/></svg>',
  nat:'<svg viewBox="0 0 24 24"><path d="M4 7h12M13 4l3 3-3 3M20 17H8M11 14l-3 3 3 3"/></svg>',
  resource:'<svg viewBox="0 0 24 24"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5l8 4.5 8-4.5M12 12v9"/></svg>'
 };
 return `<span class="azure-resource-icon ${kind}" aria-hidden="true">${icons[kind]||icons.resource}</span>`;
}
function resourceGroupName(id=''){
 const m=String(id||'').match(/\/resourceGroups\/([^/]+)/i);
 return m?decodeURIComponent(m[1]):'Subscription';
}
function resourceById(items,id=''){
 const key=String(id||'').toLowerCase();
 return (items||[]).find(x=>String(x.id||'').toLowerCase()===key)||null;
}
function publicIpValue(pip){
 return pip?.properties?.ipAddress||pip?.properties?.dnsSettings?.fqdn||'Dynamic / not assigned';
}
function vnetAddresses(vnet){
 return (vnet?.properties?.addressSpace?.addressPrefixes||[]).join(', ')||'Address space not exposed';
}
function subnetAddresses(subnet){
 return [subnet?.properties?.addressPrefix,...(subnet?.properties?.addressPrefixes||[])].filter(Boolean).join(', ')||'CIDR not exposed';
}
function topologyNicRows(subnetId){
 const key=String(subnetId||'').toLowerCase(),rows=[];
 for(const nic of state.data.networkInterfaces||[]){
  for(const cfg of nic.properties?.ipConfigurations||[]){
   if(String(cfg.properties?.subnet?.id||'').toLowerCase()!==key)continue;
   rows.push({nic,cfg,vm:resourceById(state.data.azureResources,nic.properties?.virtualMachine?.id),pip:resourceById(state.data.publicIpAddresses,cfg.properties?.publicIPAddress?.id),nsg:resourceById(state.data.networkSecurityGroups,nic.properties?.networkSecurityGroup?.id)});
  }
 }
 return rows;
}
function renderTopologyNode(type,name,meta='',extra='',esc){
 return `<div class="topology-node">${azureResourceIcon(type)}<div class="topology-node-copy"><strong>${esc(name||'Unnamed resource')}</strong><span>${esc(meta||azureResourceLabel(type))}</span>${extra}</div></div>`;
}
export function renderTopology(state,{esc,badge,toolbar}){
 const q=state.search.toLowerCase();
 const resources=[...(state.data.azureResources||[])].sort((a,b)=>(a.name||'').localeCompare(b.name||''));
 const visibleResources=resources.filter(r=>!q||`${r.name||''} ${r.type||''} ${r.location||''} ${resourceGroupName(r.id)}`.toLowerCase().includes(q));
 const vnets=[...(state.data.virtualNetworks||[])].sort((a,b)=>(a.name||'').localeCompare(b.name||''));
 const visibleVnets=vnets.filter(v=>{
  const subnets=v.properties?.subnets||[];
  const nicText=subnets.flatMap(s=>topologyNicRows(s.id)).map(x=>`${x.nic?.name||''} ${x.vm?.name||''} ${x.pip?.name||''} ${x.nsg?.name||''}`).join(' ');
  return !q||`${v.name||''} ${v.location||''} ${resourceGroupName(v.id)} ${subnets.map(s=>s.name).join(' ')} ${nicText}`.toLowerCase().includes(q);
 });
 const byGroup=new Map();
 for(const r of visibleResources){const rg=resourceGroupName(r.id);if(!byGroup.has(rg))byGroup.set(rg,[]);byGroup.get(rg).push(r)}
 const networkCount=(state.data.virtualNetworks||[]).length+(state.data.networkInterfaces||[]).length+(state.data.publicIpAddresses||[]).length+(state.data.networkSecurityGroups||[]).length;
 return `<section class="topology-page">
  <div class="card topology-intro"><div class="section-title"><div><h2>Azure resource & network topology</h2><div class="muted small">Live Azure Resource Manager inventory organized by VNet, subnet, NIC, VM, Public IP, and NSG relationships.</div></div><div class="topology-counts">${badge(`${resources.length} resources`,'good')}${badge(`${networkCount} network objects`,'neutral')}</div></div>
   ${toolbar('Search resource, resource group, VNet, subnet, VM, NIC, or IP…')}
   <div class="topology-legend"><span>${azureResourceIcon('Microsoft.Network/virtualNetworks')}Virtual network</span><span>${azureResourceIcon('Microsoft.Compute/virtualMachines')}VM</span><span>${azureResourceIcon('Microsoft.Network/networkInterfaces')}NIC</span><span>${azureResourceIcon('Microsoft.Network/publicIPAddresses')}Public IP</span><span>${azureResourceIcon('Microsoft.Network/networkSecurityGroups')}NSG</span></div>
  </div>
  <div class="topology-network-stack">${visibleVnets.map(vnet=>{
   const subnets=vnet.properties?.subnets||[];
   return `<article class="card vnet-panel"><div class="vnet-header"><div class="vnet-title">${azureResourceIcon(vnet.type)}<div><div class="resource-kicker">Virtual network</div><h3>${esc(vnet.name)}</h3><div class="muted small">${esc(resourceGroupName(vnet.id))} • ${esc(vnet.location||'location unavailable')}</div></div></div><div class="vnet-address">${esc(vnetAddresses(vnet))}</div></div>
    <div class="vnet-boundary"><div class="vnet-boundary-label">VNet boundary</div><div class="subnet-grid">${subnets.map(subnet=>{
     const rows=topologyNicRows(subnet.id),subnetNsg=resourceById(state.data.networkSecurityGroups,subnet.properties?.networkSecurityGroup?.id);
     return `<section class="subnet-zone"><div class="subnet-header"><div><span class="resource-kicker">Subnet</span><strong>${esc(subnet.name||'Unnamed subnet')}</strong><span class="muted small">${esc(subnetAddresses(subnet))}</span></div>${subnetNsg?`<span class="nsg-chip">${azureResourceIcon(subnetNsg.type)}${esc(subnetNsg.name)}</span>`:''}</div>
      <div class="subnet-flows">${rows.length?rows.map(({nic,cfg,vm,pip,nsg})=>`<div class="network-flow">
       ${pip?renderTopologyNode(pip.type,pip.name,publicIpValue(pip),'',esc):`<div class="topology-placeholder"><span class="placeholder-dot"></span><span>Private only</span></div>`}
       <span class="flow-arrow" aria-hidden="true">→</span>
       ${renderTopologyNode(nic.type,nic.name,cfg.properties?.privateIPAddress||'Private IP unavailable',nsg?`<span class="node-tag">NSG: ${esc(nsg.name)}</span>`:'',esc)}
       <span class="flow-arrow" aria-hidden="true">→</span>
       ${vm?renderTopologyNode(vm.type,vm.name,vm.location||'Virtual machine','',esc):`<div class="topology-placeholder unattached"><span class="placehlder-dot"></span><span>NIC not attached to a VM</span></div>`}
      </div>`).join(''):'<div class="subnet-empty">No network interfaces are currently attached to this subnet.</div>'}</div>
     </section>`;
    }).join('')||'<div class="subnet-empty">No subnets were returned for this VNet.</div>'}</div></div>
   </article>`;
  }).join('')||'<div class="card empty">No virtual networks match the current filter, or no VNet data was returned.</div>'}</div>
  <div class="card resource-inventory"><div class="section-title"><div><h2>Subscription resource inventory</h2><div class="muted small">All resources returned by Azure Resource Manager, grouped by resource group.</div></div><span class="muted small">${visibleResources.length}/${resources.length} shown</span></div>
   <div class="resource-group-stack">${[...byGroup.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([rg,items])=>`<section class="resource-group-panel"><div class="resource-group-heading"><strong>${esc(rg)}</strong><span>${items.length} resource${items.length===1?' ':'s'}</span></div><div class="resource-grid">${items.map(r=>`<div class="resource-tile">${azureResourceIcon(r.type)}<div><strong>${esc(r.name)}</strong><span>${esc(azureResourceLabel(r.type))}</span><small>${esc(r.location||'global')}</small></div></div>`).join('')}</div></section>`).join('')||'<div class="empty">No resources match the current filter.</div>'}</div>
  </div>
 </section>`;
}
