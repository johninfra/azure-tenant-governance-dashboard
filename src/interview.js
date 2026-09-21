import './interview.css';
import { INTERVIEW_SECTIONS, PROOF_BANK } from './interview-data.js';

function answerParagraphs(answer,esc){
 return (answer||[]).map(p=>`<p>${esc(p)}</p>`).join('');
}
function questionMatches(item,section,q){
 if(!q)return true;
 const hay=[section.title,section.description,item.q,...(item.answer||[]),...(item.proof||[])].join(' ').toLowerCase();
 return hay.includes(q);
}
function proofNameLink(name,esc){
 const map={
  'Azure Tenant Governance Dashboard':'https://github.com/johninfra/azure-tenant-governance-dashboard',
  'Tenant Governance Dashboard':'https://github.com/johninfra/azure-tenant-governance-dashboard',
  'Azure MFA & RBAC Lifecycle':'https://github.com/johninfra/azure-mfa-rbac-lifecycle-administration',
  'MFA/RBAC Lifecycle':'https://github.com/johninfra/azure-mfa-rbac-lifecycle-administration',
  'Azure Enterprise Administration Lab':'https://github.com/johninfra/azure-enterprise-administration-lab',
  'Azure Identity Governance Console':'https://github.com/johninfra/azure-identity-governance-console',
  'Identity Governance Console':'https://github.com/johninfra/azure-identity-governance-console'
 };
 const url=map[name];
 return url?`<a class="interview-proof-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(name)} ↗</a>`:`<span class="interview-proof-link static">${esc(name)}</span>`;
}
export function renderInterview(state,{esc,badge,toolbar}){
 const q=String(state.search||'').trim().toLowerCase();
 const total=INTERVIEW_SECTIONS.reduce((n,s)=>n+s.questions.length,0);
 const shown=INTERVIEW_SECTIONS.reduce((n,s)=>n+s.questions.filter(item=>questionMatches(item,s,q)).length,0);
 return `<section class="interview-page">
  <div class="card interview-hero">
   <div class="section-title"><div><div class="interview-eyebrow">John Tyler • IAM / Entra / Microsoft 365</div><h2>Interview Mastery</h2><div class="muted small">Personalized answers grounded in your resume, production experience, certifications, and documented GitHub projects.</div></div><div class="interview-hero-badges">${badge(`${total} backed-up answers`,'good')}${badge('No placeholder answers','neutral')}</div></div>
   ${toolbar('Search interview questions, technologies, scenarios, or proof…')}
   <div class="interview-principles">
    <div><strong>Answer first.</strong><span>Give the interviewer a direct sentence before adding context.</span></div>
    <div><strong>Explain your method.</strong><span>Identity → authentication → authorization → device/network → evidence.</span></div>
    <div><strong>Prove it.</strong><span>Use production experience for operations and GitHub for Azure/Entra depth.</span></div>
    <div><strong>State the boundary.</strong><span>Separate production experience from lab experience. Precision builds credibility.</span></div>
   </div>
   <div class="interview-north-star"><strong>Your positioning:</strong> You are presenting as an IAM / Microsoft cloud administrator who already understands identity lifecycle, MFA, groups, RBAC, least privilege, troubleshooting, documentation, Microsoft Graph, and Azure governance — with concrete proof you can contribute and grow into deeper cloud identity ownership.</div>
  </div>
  <div class="card proof-bank">
   <div class="section-title"><div><h2>Proof bank</h2><div class="muted small">Use one or two strong proofs when an interviewer asks, “Where have you actually done that?”</div></div></div>
   <div class="proof-bank-grid">${PROOF_BANK.map(p=>`<div class="proof-bank-item"><div class="proof-bank-name">${p.url?`<a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">${esc(p.name)} ↗</a>`:esc(p.name)}</div><p>${esc(p.detail)}</p></div>`).join('')}</div>
  </div>
  <div class="interview-section-stack">
   ${INTERVIEW_SECTIONS.map(section=>{
    const items=section.questions.filter(item=>questionMatches(item,section,q));
    if(!items.length)return '';
    return `<section class="card interview-section"><div class="section-title"><div><h2>${esc(section.title)}</h2><div class="muted small">${esc(section.description)}</div></div><span class="muted small">${items.length} question${items.length===1?'':'s'}</span></div>
     <div class="interview-question-list">${items.map((item,index)=>`<details class="interview-question" open><summary><span class="interview-question-number">${String(index+1).padStart(2,'0')}</span><span>${esc(item.q)}</span></summary><div class="interview-question-body"><div class="interview-answer">${answerParagraphs(item.answer,esc)}</div><div class="interview-proof"><span class="proof-label">Proof to cite</span><div class="proof-links">${(item.proof||[]).map(name=>proofNameLink(name,esc)).join('')}</div></div></div></details>`).join('')}</div>
    </section>`;
   }).join('') || '<div class="card empty">No interview questions match the current search.</div>'}
  </div>
  <div class="card interview-close">
   <h2>Closing answer to memorize</h2>
   <p>“The common thread in my background is access: verifying identity, granting the right access, troubleshooting when access fails, and removing access when it is no longer justified. I have done that in production through Active Directory, Entra ID, Microsoft 365 support, MFA, groups, credential lifecycle, ServiceNow, and security operations. I have also built Azure projects that prove I understand RBAC, least privilege, Microsoft Graph, Entra authentication, governance, networking, and access validation. I am looking for a team where I can bring that foundation into a dedicated IAM or Microsoft cloud administration role and keep expanding the depth of what I own.”</p>
   <div class="muted small">Search result: ${shown}/${total} answers currently shown.</div>
  </div>
 </section>`;
}
