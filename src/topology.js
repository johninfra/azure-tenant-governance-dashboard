import './topology.css';

function azureResourceLabel(type=''){
 const t=String(type||'').toLowerCase();
 const labels={
  'microsoft.compute/virtualmachines':'Virtual machine',
  'microsoft.compute/disks':'Managed disk',
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
 if(t.includes('/disks'))return 'storage';
 if(t.includes('activitylogalerts'))return 'alert';
 if(t.includes('actiongroups'))return 'people';
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
  alert:'<svg viewBox="0 0 24 24"><path d="M5 17h14l-2-3V9a5 5 0 00-10 0v5zM10 21h4M12 2v2"/></svg>',
  people:'<svg viewBox="0 0 24 24"><circle cx="12" cy="7" r="4"/><path d="M5 21v-4a7 7 0 0114 0v4zM3 7v5M21 7v5"/></svg>',
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
function topologyNicRows(state,subnetId){
 const key=String(subnetId||'').toLowerCase(),rows=[];
 for(const nic of state.data.networkInterfaces||[]){
  for(const cfg of nic.properties?.ipConfigurations||[]){
   if(String(cfg.properties?.subnet?.id||'').toLowerCase()!==key)continue;
   rows.push({nic,cfg,vm:resourceById(state.data.azureResources,nic.properties?.virtualMachine?.id),pip:resourceById(state.data.publicIpAddresses,cfg.properties?.publicIPAddress?.id),nsg:resourceById(state.data.networkSecurityGroups,nic.properties?.networkSecurityGroup?.id)});
  }
 }
 return rows;
}
export function renderTopology(state,{esc,badge,toolbar}){
 const data=state.data,q=(state.search||'').trim().toLowerCase();
 const resources=[...(data.azureResources||[])].sort((a,b)=>(a.name||'').localeCompare(b.name||''));
 const type=r=>String(r.type||'').toLowerCase();
 const same=(a,b)=>String(a||'').toLowerCase()===String(b||'').toLowerCase();
 const nameFromId=id=>String(id||'').split('/').pop();
 const node=(r,meta)=>`<div class="map-node">${azureResourceIcon(r.type)}<div><strong>${esc(r.name||nameFromId(r.id)||'Unnamed resource')}</strong><span>${esc(meta||azureResourceLabel(r.type))}</span></div></div>`;
 const empty=text=>`<p class="map-empty">${esc(text)}</p>`;
 const link=label=>`<div class="map-link"><span>${esc(label)}</span><i></i></div>`;
 const groups=new Map();
 for(const rg of data.resourceGroups||[])groups.set(rg.name.toLowerCase(),{...rg,items:[]});
 for(const r of resources){const name=resourceGroupName(r.id),key=name.toLowerCase();if(!groups.has(key))groups.set(key,{name,items:[]});groups.get(key).items.push(r)}
 const shown=[...groups.values()].filter(g=>!q||JSON.stringify([g.name,g.items,(data.virtualNetworks||[]).filter(v=>same(resourceGroupName(v.id),g.name)),(data.networkInterfaces||[]).filter(n=>same(resourceGroupName(n.id),g.name))]).toLowerCase().includes(q));
 shown.sort((a,b)=>b.items.length-a.items.length||a.name.localeCompare(b.name));
 function network(g){
  const vnets=(data.virtualNetworks||[]).filter(v=>same(resourceGroupName(v.id),g.name));
  const used=new Set();
  const html=vnets.map(v=>`<section class="map-vnet">${node(v,`Virtual network • ${vnetAddresses(v)}`)}<div class="map-subnets">${(v.properties?.subnets||[]).map(s=>{
   const id=s.properties?.networkSecurityGroup?.id,nsg=resourceById(data.networkSecurityGroups,id);
   if(id)used.add(id.toLowerCase());
   return `<div class="map-association">${node({name:s.name,type:'Microsoft.Network/virtualNetworks'},subnetAddresses(s))}${id?`${link('Subnet association')}${node(nsg||{id,type:'Microsoft.Network/networkSecurityGroups'},nsg?'Network security group':'Referenced NSG • details unavailable')}`:empty('No subnet NSG association returned')}</div>`;
  }).join('')||empty('No subnet data returned')}</div></section>`).join('');
  const others=g.items.filter(r=>type(r).startsWith('microsoft.network/')&&!['microsoft.network/virtualnetworks','microsoft.network/networkinterfaces','microsoft.network/publicipaddresses'].includes(type(r))&&!used.has((r.id||'').toLowerCase()));
  return html+others.map(r=>node(r)).join('')||empty('No network resources returned');
 }
 function compute(g){
  const tracked=new Set(),flows=[];
  const mark=r=>{if(r?.id)tracked.add(r.id.toLowerCase());return r};
  for(const nic of (data.networkInterfaces||[]).filter(n=>same(resourceGroupName(n.id),g.name))){
   for(const cfg of nic.properties?.ipConfigurations||[]){
    const pip=resourceById(data.publicIpAddresses,cfg.properties?.publicIPAddress?.id),vm=resourceById(resources,nic.properties?.virtualMachine?.id);
    mark(nic);mark(pip);mark(vm);
    const subnetId=cfg.properties?.subnet?.id;
    flows.push(`<div class="map-compute-flow">${pip?node(pip,publicIpValue(pip))+link('IP configuration'):''}${node(nic,cfg.properties?.privateIPAddress||'Network interface')}${vm?link('Attached VM')+node(vm):''}</div><p class="map-caption">${subnetId?`Subnet: ${esc(nameFromId(subnetId))} • VNet: ${esc(String(subnetId).split('/subnets/')[0].split('/').pop())}`:'Subnet association unavailable'}${nic.properties?.networkSecurityGroup?.id?` • NIC NSG: ${esc(nameFromId(nic.properties.networkSecurityGroup.id))}`:''}</p>`);
   }
  }
  const remaining=g.items.filter(r=>(type(r).startsWith('microsoft.compute/')||['microsoft.network/networkinterfaces','microsoft.network/publicipaddresses'].includes(type(r)))&&!tracked.has((r.id||'').toLowerCase()));
  return flows.join('')+remaining.map(r=>node(r,type(r)==='microsoft.compute/disks'?'Managed disk • attachment not verified':undefined)).join('')||empty('No compute resources returned');
 }
 const category=(title,html,cls='')=>`<section class="map-category ${cls}"><h3>${title}</h3>${html}</section>`;
 function group(g){
  const subnets=(data.virtualNetworks||[]).filter(v=>same(resourceGroupName(v.id),g.name)).reduce((n,v)=>n+(v.properties?.subnets||[]).length,0);
  const web=g.items.filter(r=>type(r).startsWith('microsoft.web/'));
  const monitor=g.items.filter(r=>type(r).startsWith('microsoft.insights/'));
  const other=g.items.filter(r=>!['microsoft.network/','microsoft.compute/','microsoft.web/','microsoft.insights/'].some(t=>type(r).startsWith(t)));
  const full=g.items.some(r=>['microsoft.compute/','microsoft.web/','microsoft.network/virtualnetworks'].some(t=>type(r).startsWith(t)));
  return `<article class="map-group ${full?'':'map-group-compact'}"><header class="map-group-header">${node({name:g.name,type:'resource'},`Resource group${g.location?' • '+g.location:''}`)}<div class="topology-counts">${badge(`${g.items.length} resources`)}${subnets?badge(`${subnets} subnets`):''}</div></header>${full?`<div class="map-grid"><div class="map-column">${category('Networking',network(g))}${category('Compute & attached resources',compute(g))}</div><div class="map-column">${category(web.some(r=>type(r)==='microsoft.web/sites')?'Web Apps':'Static Web Apps',web.map(r=>node(r)).join('')||empty('No web apps returned'))}${category('Monitoring',monitor.map(r=>node(r)).join('')||empty('No monitoring resources returned'))}</div>${other.length?category('Other resources',other.map(r=>node(r)).join(''),'map-other'):''}</div>`:`<div class="map-compact-items">${g.items.map(r=>node(r)).join('')||empty('No resources returned')}</div>`}</article>`;
 }
 return `<section class="topology-page"><div class="card topology-intro"><div class="section-title"><div><h2>Azure resource & network topology</h2><p class="muted small">Live resource inventory and confirmed network associations.</p></div>${badge(`${resources.length} resources`,'good')}</div>${toolbar('Search resource, resource group, subnet, NSG, or IP…')}</div><div class="map-canvas"><header class="map-title"><h2>Azure resource map</h2><p>Subscription → resource groups → resources</p></header><section class="map-subscription"><header class="map-subscription-header">${azureResourceIcon('Microsoft.KeyVault/vaults')}<div><h3>${esc(data.subscription?.displayName||state.config.subscriptionName||'Azure subscription')}</h3><span>${esc(state.config.subscriptionId||'No subscription configured')}</span></div></header><div class="map-groups">${shown.map(group).join('')||empty(q?'No resources match your search.':'Connect and refresh tenant data to view the resource map.')}</div></section><footer class="map-footnote"><span><i></i> Solid lines: relationships returned by Azure</span><span>Unverified attachments are labeled; resource counts follow live inventory.</span></footer></div></section>`;
}
