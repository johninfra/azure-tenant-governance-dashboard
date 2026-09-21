export const INTERVIEW_SECTIONS=[
  {
    "title": "Positioning & confidence",
    "description": "Opening questions that frame you as an IAM / Microsoft cloud administrator instead of a generic help-desk candidate.",
    "questions": [
      {
        "q": "Tell me about yourself.",
        "answer": [
          "I am an IT and IAM professional with production experience supporting Microsoft Entra ID, Active Directory, Windows, Microsoft 365, authentication, and access-control workflows. At Oatridge Security Group I handled identity-lifecycle tasks such as provisioning and deprovisioning, password and MFA support, security groups, access changes, and remediation while supporting more than 30 Windows endpoints and Microsoft 365 users. Before that, at VIP Access Management, I managed employee, contractor, and visitor credential lifecycles, applied role-based access and least privilege, reviewed access activity, and documented security incidents.",
          "What differentiates me is that I have taken that operational experience and built deeper hands-on Azure and identity projects. I built an enterprise Azure administration lab with segmented VNets, NSGs, group-based RBAC, Azure Policy remediation, monitoring, Windows Server, and PowerShell validation. I also built an MFA and RBAC lifecycle lab where I registered Microsoft Authenticator for a test user, granted Reader access through an Engineering group, validated the access as the user, revoked it, and verified the access was gone. My current tenant governance dashboard uses MSAL, Microsoft Graph, and Azure Resource Manager to inventory users, groups, MFA posture, privileged roles, RBAC, and Azure resources.",
          "I am CompTIA Security+ and A+ certified, and I am targeting IAM, Entra ID, and Microsoft 365 administration roles where I can bring that identity-first, least-privilege mindset into production and keep growing into cloud identity security."
        ],
        "proof": [
          "Resume — Oatridge production identity/M365 support",
          "Resume — VIP credential lifecycle/RBAC",
          "Azure Enterprise Administration Lab",
          "Azure MFA & RBAC Lifecycle",
          "Azure Tenant Governance Dashboard"
        ]
      },
      {
        "q": "Why do you want to work in IAM, Entra ID, and Microsoft 365 administration?",
        "answer": [
          "Identity is the part of IT that connects security directly to daily business operations. A user can have a healthy laptop and a working network, but if authentication, group membership, licensing, or authorization is wrong, that user still cannot work. I like that IAM requires both security discipline and practical troubleshooting.",
          "My background naturally moved in that direction. I started with physical and digital access control, where the core questions were: who is this person, what are they authorized to access, and when should that access change or be removed? In IT support I began doing the same thing with Active Directory and Entra ID accounts, MFA, groups, onboarding and offboarding, and authentication problems. My Azure projects then let me go deeper into RBAC, Microsoft Graph, app registrations, Entra authentication, and governance.",
          "That is why IAM and Microsoft cloud administration feel like a specialization rather than a career reset for me."
        ],
        "proof": [
          "Resume — AD/Entra lifecycle + MFA",
          "VIP Access — least privilege + access changes",
          "Identity Governance Console"
        ]
      },
      {
        "q": "Why should we hire you for a junior IAM / Entra / M365 administrator role?",
        "answer": [
          "Because I already understand the operational fundamentals the role depends on, and I can prove that I apply them instead of only memorizing terminology. I have production experience with identity lifecycle tasks, MFA and password support, security groups, Microsoft 365 users, authentication troubleshooting, PowerShell, Event Viewer, and ServiceNow. I also have a security-operations background, so I naturally think about least privilege, authorization, auditability, and revocation.",
          "My lab work closes the gap between support and administration. I have built group-based Azure RBAC, tested access as the affected user, revoked access and validated the result, configured segmented Azure networking and governance controls, and built an Entra-authenticated governance dashboard that reads live tenant data through Microsoft Graph and Azure Resource Manager.",
          "I would not come in pretending I know every Microsoft product at a senior level. I would come in able to handle the core work, troubleshoot methodically, document what I do, respect change control, and learn quickly from the environment."
        ],
        "proof": [
          "Security+ and A+",
          "Oatridge identity/M365 support",
          "MFA/RBAC Lifecycle",
          "Tenant Governance Dashboard"
        ]
      },
      {
        "q": "What is your strongest technical project and why?",
        "answer": [
          "My strongest overall administration project is the Azure Enterprise Administration Lab because it forced me to manage the relationships between identity, networking, governance, monitoring, cost, and Windows administration rather than treating them as isolated features.",
          "I created a segmented VNet with management and server subnets, applied subnet-level NSGs, used group-based Azure RBAC, assigned and remediated Azure Policy, protected networking with a resource lock, created cost controls and Activity Log alerts, deployed a Windows Server 2022 VM, and validated DNS and HTTPS connectivity with PowerShell.",
          "For IAM-specific roles, I also point to my Azure MFA & RBAC Lifecycle lab and Tenant Governance Dashboard because those show authentication, group-based authorization, effective permissions, access revocation, Microsoft Graph, and least privilege."
        ],
        "proof": [
          "Azure Enterprise Administration Lab",
          "Azure MFA & RBAC Lifecycle",
          "Azure Tenant Governance Dashboard"
        ]
      },
      {
        "q": "What is a professional weakness you are actively improving?",
        "answer": [
          "The area I am deliberately improving is communicating complex technical concepts to nontechnical users. My instinct is to think in the actual technical chain — identity, token, group membership, policy, device, network — but the user usually does not need that entire chain.",
          "I have been working on translating the diagnosis into business language first: what is happening, what I need from the user, what I am changing, and what they should expect next. Then I keep the technical evidence in the ticket for the administrators who need it.",
          "That matters in IAM because an MFA or access issue can become frustrating quickly. I want the user to feel that the process is controlled even when the underlying problem is technical."
        ],
        "proof": [
          "Resume — ServiceNow documentation and user follow-up",
          "Resume — documented diagnostic evidence before escalation"
        ]
      }
    ]
  },
  {
    "title": "IAM fundamentals",
    "description": "Core identity questions you should answer cleanly, precisely, and with an operational example.",
    "questions": [
      {
        "q": "What is the difference between authentication and authorization?",
        "answer": [
          "Authentication answers: who are you? Authorization answers: what are you allowed to do after your identity is known.",
          "In Microsoft Entra ID, authentication can involve a password, Microsoft Authenticator, FIDO2, Windows Hello, or another supported method. Authorization can come from Entra directory roles, group membership, application assignments, or Azure RBAC depending on what resource is being accessed.",
          "I demonstrated that separation in my MFA and RBAC lifecycle lab. I registered Microsoft Authenticator for the Sophia Patel test identity. Separately, I placed Sophia in the Engineering security group and assigned that group Azure Reader at VM scope. Then I removed the RBAC assignment and verified that authentication still worked while the Azure authorization disappeared."
        ],
        "proof": [
          "Azure MFA & RBAC Lifecycle"
        ]
      },
      {
        "q": "Walk me through joiner, mover, leaver — JML.",
        "answer": [
          "For a joiner, I verify the approved request, create or enable the identity, assign the minimum required groups and licenses, establish MFA or other required authentication methods, and validate that the user can access the resources their role requires.",
          "For a mover, I treat access changes as a reauthorization event. I remove access that belonged to the old role, add access required for the new role, review privileged or inherited access, and confirm there is no unnecessary access accumulation.",
          "For a leaver, I disable sign-in according to policy, revoke active sessions where appropriate, remove privileged assignments and group access, deprovision applications and credentials, preserve data according to retention requirements, and document the completion. The important part is verifying effective access afterward.",
          "That maps directly to my production identity and credential lifecycle work at Oatridge and VIP Access Management and to my lab work where I granted access, validated it, revoked it, and tested again."
        ],
        "proof": [
          "Oatridge provisioning/deprovisioning",
          "VIP credential lifecycle",
          "MFA/RBAC access revocation"
        ]
      },
      {
        "q": "How do you apply least privilege and RBAC?",
        "answer": [
          "I start with the job function and required task, then grant the narrowest role at the narrowest practical scope. I prefer group-based assignments over one-off direct user permissions because they are easier to review, scale, and revoke.",
          "I also separate administrative privilege from ordinary resource access. A user who needs to view a VM does not need Contributor. A help-desk technician who needs password-reset capability does not need Global Administrator.",
          "In my Azure lab I used Reader for groups that only needed visibility and resource or resource-group scope instead of automatically assigning at the whole subscription. In production I followed the same principle when processing access changes against approved authorization at VIP Access Management."
        ],
        "proof": [
          "Azure Enterprise Administration Lab",
          "Azure MFA & RBAC Lifecycle",
          "VIP least-privilege experience"
        ]
      },
      {
        "q": "Why use groups instead of assigning access directly to users?",
        "answer": [
          "Groups make authorization role-based instead of person-based. If Engineering needs Reader access, I can assign Reader to the Engineering group once and then manage membership as people join, move, or leave. That reduces inconsistent one-off permissions and makes reviews much easier.",
          "Direct assignments still have legitimate uses, especially temporary exceptions or genuinely individual requirements, but they should be intentional and documented.",
          "My MFA/RBAC lab used exactly this pattern: Sophia Patel was a member of Engineering, Engineering received Reader at VM scope, and Sophia inherited that access. When I removed the group role assignment, I verified her effective access was removed."
        ],
        "proof": [
          "Azure MFA & RBAC Lifecycle",
          "Azure Enterprise Administration Lab"
        ]
      },
      {
        "q": "What is the difference between Active Directory and Microsoft Entra ID?",
        "answer": [
          "Active Directory Domain Services is primarily a traditional domain directory for Windows environments. It uses domains, organizational units, domain controllers, Kerberos, LDAP, Group Policy, and domain-joined devices.",
          "Microsoft Entra ID is Microsoft's cloud identity and access platform. It is designed around cloud identities, OAuth 2.0 and OpenID Connect, SAML, modern authentication, enterprise applications, app registrations, Conditional Access, cloud directory roles, and integration across Microsoft 365 and Azure.",
          "They overlap around identity, users, groups, and access, but Entra ID is not simply Active Directory in the cloud. I have worked with both identity models: production AD and Entra lifecycle support plus deeper Entra-focused Azure lab work."
        ],
        "proof": [
          "Resume — AD + Entra lifecycle",
          "26-lab portfolio — AD, Entra, Windows Server"
        ]
      },
      {
        "q": "What is the difference between Entra directory roles and Azure RBAC?",
        "answer": [
          "Entra directory roles control administration of the identity directory and Microsoft cloud directory capabilities. Roles such as Global Reader or User Administrator affect what someone can do in Entra ID.",
          "Azure RBAC controls access to Azure resources such as subscriptions, resource groups, VMs, VNets, and storage. Roles such as Reader, Contributor, Owner, and User Access Administrator are evaluated at Azure management scopes.",
          "The distinction matters because Azure Contributor does not automatically make someone an Entra administrator, and an Entra role does not automatically grant Azure resource-management access. My governance dashboard intentionally inventories both sides separately."
        ],
        "proof": [
          "Azure Tenant Governance Dashboard",
          "Azure Enterprise Administration Lab"
        ]
      },
      {
        "q": "What is an access review and why does it matter?",
        "answer": [
          "An access review is a periodic recertification of whether users still need the access they currently have. It addresses permission drift — the common situation where someone changes roles but retains old group membership, application access, or privilege.",
          "I would prioritize reviews for privileged roles, guest accounts, sensitive applications, and high-impact groups. The review should have a clear owner, decision criteria, evidence, and a process for removing denied or expired access.",
          "I have modeled access reviews and recertification in my Identity Governance Console, and the principle matches the access-remediation work in my production experience."
        ],
        "proof": [
          "Azure Identity Governance Console",
          "Resume — access remediation"
        ]
      }
    ]
  },
  {
    "title": "Entra security & troubleshooting",
    "description": "High-probability Entra questions where interviewers are testing whether you can troubleshoot safely, not just define terms.",
    "questions": [
      {
        "q": "A user says, 'I can't sign in.' How do you troubleshoot it?",
        "answer": [
          "I separate identity, authentication method, policy, device, application, and network causes instead of immediately resetting the password.",
          "First I confirm the correct account and UPN, whether the account is enabled, whether the password is expired or recently changed, and whether the user can sign in to another Microsoft service. Then I review Entra sign-in logs if I have access and look at the failure code, Conditional Access result, authentication requirement, client app, IP or location, and device state. I check MFA registration and whether the user is stuck on a specific method. I also verify group or application assignment if the failure is actually authorization rather than authentication.",
          "On the endpoint side I validate time, connectivity, VPN state if relevant, browser or session issues, and Windows evidence with Event Viewer and PowerShell. I make the least disruptive change first and document both the error and the fix."
        ],
        "proof": [
          "Oatridge authentication/VPN/Windows troubleshooting",
          "Event Viewer + PowerShell + ServiceNow"
        ]
      },
      {
        "q": "How would you troubleshoot an MFA problem?",
        "answer": [
          "First I identify whether the problem is registration, challenge delivery, method availability, policy, or the user's device. I verify the account is enabled, confirm which authentication methods are actually registered, and determine what the sign-in is asking for.",
          "If Microsoft Authenticator is involved, I confirm the correct account is registered, notifications and connectivity are working, and the method is still valid. I avoid deleting all methods as a first response because that can create unnecessary recovery work.",
          "If the user changed phones or lost the old method, I follow the organization's identity-verification process before resetting or requiring re-registration. I then have the user complete a fresh sign-in and verify the result. In my lab I registered Microsoft Authenticator for a test identity, and my governance dashboard reads authentication-method data through Microsoft Graph when tenant permissions allow it."
        ],
        "proof": [
          "Resume — password/MFA support",
          "MFA/RBAC Lifecycle",
          "Tenant Governance Dashboard"
        ]
      },
      {
        "q": "What is Conditional Access and how would you approach designing it?",
        "answer": [
          "Conditional Access is Entra's policy engine for making access decisions using signals such as user or group, application, device state, location, authentication strength, and risk where licensing supports it.",
          "I would design it in layers. Start with clear objectives such as requiring MFA for administrators, blocking legacy authentication, protecting sensitive cloud apps, and requiring compliant or trusted devices where appropriate. I would exclude controlled emergency-access accounts, use report-only mode before enforcement when possible, validate sign-in impact, and document rollback.",
          "I understand the architecture and have modeled Conditional Access in my Identity Governance Console. In my lab tenant I have also used Security Defaults as baseline MFA protection. I would be clear that my strongest current hands-on proof is Entra authentication, MFA, RBAC, Graph, and governance rather than claiming years of production Conditional Access ownership."
        ],
        "proof": [
          "Identity Governance Console — CA model",
          "Current Entra lab — Security Defaults"
        ]
      },
      {
        "q": "What are Security Defaults, and how are they different from Conditional Access?",
        "answer": [
          "Security Defaults are Microsoft's baseline protections for tenants that need a simple secure starting point. They enforce broad protections such as MFA registration and blocking legacy authentication without the organization building granular policy logic.",
          "Conditional Access is more flexible. It lets administrators define who, what application, what condition, and what control should apply. That makes it appropriate when an organization needs different policies for administrators, contractors, devices, locations, authentication strengths, or specific applications.",
          "If an organization moves from Security Defaults to Conditional Access, I would recreate the required baseline protections deliberately and validate them before enforcement."
        ],
        "proof": [
          "Current Entra lab — Security Defaults",
          "Identity Governance Console — Conditional Access modeling"
        ]
      },
      {
        "q": "What is legacy authentication and why is it risky?",
        "answer": [
          "Legacy authentication refers to older authentication protocols and clients that do not support modern authentication controls the same way newer OAuth-based flows do. The major security concern is that legacy protocols can bypass or weaken modern controls such as MFA and Conditional Access.",
          "That is why blocking legacy authentication is a common identity-security baseline. Before enforcement, I would identify whether any required systems still depend on those protocols so the change does not unexpectedly break a business-critical workflow.",
          "My approach is inventory first, understand dependencies, apply the control, verify the effect, and monitor for failures."
        ],
        "proof": [
          "Security+ identity-security foundation",
          "Entra modern-authentication lab work"
        ]
      },
      {
        "q": "Explain Privileged Identity Management — PIM.",
        "answer": [
          "PIM is about reducing standing privilege. Instead of leaving an administrator permanently active in a high-impact role, the organization can make the user eligible and require activation for a limited period, often with MFA, justification, approval, and auditing.",
          "The security benefit is smaller privilege exposure and better evidence around when elevated access was used. I would use PIM for roles where permanent activation is not operationally necessary and pair it with access reviews and monitoring.",
          "I have modeled PIM-style eligibility and activation in my Identity Governance Console. My Tenant Governance Dashboard also distinguishes active and eligible privileged roles when Microsoft Graph and the tenant license expose the PIM schedule endpoints. When that licensed data is unavailable, the dashboard falls back to active role visibility instead of pretending the telemetry exists."
        ],
        "proof": [
          "Azure Identity Governance Console",
          "Azure Tenant Governance Dashboard"
        ]
      },
      {
        "q": "How would you handle guest and external-user access?",
        "answer": [
          "I would treat guest access as temporary, purpose-driven access with an owner. The guest should receive only the groups, applications, or Azure scopes required for the collaboration, and the organization should know who is responsible for recertifying that access.",
          "I would review guest sign-ins, group membership, application assignment, and privileged or broad Azure access. High-impact roles or subscription-wide permissions for a guest should be exceptional and strongly justified.",
          "My governance dashboard specifically flags guest identities with broad Azure access, which reflects the way I think about external identity risk: visibility, least privilege, ownership, and timely removal."
        ],
        "proof": [
          "Tenant Governance Dashboard — guest access findings",
          "VIP contractor/visitor identity lifecycle"
        ]
      }
    ]
  },
  {
    "title": "Apps, Graph & cloud identity architecture",
    "description": "Questions that separate portal-only candidates from people who understand how Entra-backed applications actually work.",
    "questions": [
      {
        "q": "What is the difference between an App Registration and an Enterprise Application?",
        "answer": [
          "An App Registration is the application definition in Entra ID. It defines things such as the application ID, redirect URIs, supported account types, API permissions, credentials for confidential clients, and authentication configuration.",
          "The Enterprise Application is the service principal — the tenant-local representation of that application. That is where you commonly manage who can sign in, assignments, some single-sign-on settings, and tenant-specific access.",
          "I have used this distinction in my Azure identity projects. For my Entra-authenticated applications, I configured the application identity and redirect behavior, then controlled which users or groups were authorized to access the tenant-hosted application."
        ],
        "proof": [
          "Azure Identity Governance Console",
          "Azure Tenant Governance Dashboard"
        ]
      },
      {
        "q": "What is Microsoft Graph and how have you used it?",
        "answer": [
          "Microsoft Graph is Microsoft's unified API for accessing Entra ID and Microsoft 365 data and services. Instead of manually reading everything from the portal, an authorized application or script can request resources such as users, groups, group members, directory roles, authentication methods, and other supported objects.",
          "I use Graph in my Tenant Governance Dashboard. The app authenticates with MSAL, requests delegated Graph scopes, then reads users, groups, direct group memberships, service principals, directory roles, privileged-role information when available, authentication-method registration data, and authentication-method policy information.",
          "The important part is permissions. I do not think of Graph as unrestricted tenant access. The application should request only the scopes required for its job, admin consent should be controlled, tokens should be protected, and the app should fail honestly when licensing or permissions do not expose a dataset."
        ],
        "proof": [
          "Azure Tenant Governance Dashboard",
          "Resume — Microsoft Graph PowerShell SDK"
        ]
      },
      {
        "q": "Explain OAuth 2.0, OpenID Connect, and MSAL in practical terms.",
        "answer": [
          "OAuth 2.0 is primarily an authorization framework for obtaining tokens that let an application call an API. OpenID Connect adds identity on top of OAuth so an application can authenticate a user and receive identity claims. MSAL is Microsoft's client library that handles the Entra sign-in and token-acquisition flow.",
          "In my Tenant Governance Dashboard, the browser app uses MSAL with the authorization-code flow and PKCE. The user signs into Entra, the app obtains tokens for Microsoft Graph or Azure Resource Manager, and those APIs evaluate the token's audience, scopes, and the user's underlying permissions.",
          "I also deliberately avoid putting a client secret into a browser SPA. Public browser clients cannot protect a secret, so the design relies on delegated authentication with PKCE instead."
        ],
        "proof": [
          "Azure Tenant Governance Dashboard architecture"
        ]
      },
      {
        "q": "What is a service principal?",
        "answer": [
          "A service principal is an application's identity inside an Entra tenant. It lets the tenant authorize an application or automation separately from a human user.",
          "The principle I apply is the same as with user identities: least privilege and scoped authorization. A deployment or automation identity should receive only the roles and API permissions required for the workflow, and credentials should be handled securely.",
          "My Azure work has exposed me to service principals through application authentication and GitHub-to-Azure deployment workflows. I also understand the distinction between a service principal and a managed identity, where Azure manages the credential lifecycle for an Azure resource."
        ],
        "proof": [
          "Azure deployment workflows",
          "Identity Governance Console application identity"
        ]
      },
      {
        "q": "How do you think about API permissions and admin consent?",
        "answer": [
          "I treat API permissions as privileged access for software. I start with the exact data and operation the application requires, choose delegated versus application permissions based on the use case, and avoid broad permissions such as directory-wide write access when read-only access will solve the problem.",
          "Admin consent matters because some Graph scopes allow an application to reach high-value tenant data. That approval should be deliberate, documented, and reviewable.",
          "My governance dashboard is intentionally read-only. It uses Graph and Azure Resource Manager for inventory and analysis, but it does not expose write operations. That lets me demonstrate live tenant integration without turning a portfolio app into an administrative backdoor."
        ],
        "proof": [
          "Tenant Governance Dashboard — read-only security model"
        ]
      }
    ]
  },
  {
    "title": "Microsoft 365, endpoint & administration scenarios",
    "description": "Operational questions where you should connect identity, Microsoft 365, endpoint state, tickets, and user impact.",
    "questions": [
      {
        "q": "How would you onboard a new Microsoft 365 user?",
        "answer": [
          "I would start from an approved onboarding request with the user's role, manager, department, start date, required applications, and access owner. I would create or validate the identity, set the correct account attributes, assign required licenses, add the user to role-appropriate groups, and configure application access through groups where possible.",
          "Then I would make sure the authentication path is ready: initial credential process according to policy, MFA registration, and any Conditional Access or device requirements. I would verify the user can reach the core services they need and document the final state.",
          "My production experience includes provisioning, group changes, MFA support, Microsoft 365 user support, and access remediation. My lab work adds group-based RBAC and end-user validation."
        ],
        "proof": [
          "Resume — provisioning + MFA + security groups + M365",
          "MFA/RBAC Lifecycle"
        ]
      },
      {
        "q": "How would you offboard a Microsoft 365 / Entra user?",
        "answer": [
          "I would follow the organization's offboarding runbook and timing because offboarding has both security and business-continuity requirements. The identity should be blocked or disabled at the approved time, sessions revoked when appropriate, privileged and group access removed, application access deprovisioned, and credentials or authentication methods handled according to policy.",
          "For Microsoft 365 data, I would follow the organization's retention and handoff requirements before removing licenses that affect mailbox or OneDrive availability. I would also verify the user is no longer present in high-impact groups or Azure role assignments and close the ticket with evidence.",
          "The key is that deprovisioning is not simply deleting an account. It is controlled removal of access while preserving business data and auditability."
        ],
        "proof": [
          "Oatridge provisioning/deprovisioning",
          "VIP deactivation + audit-ready records",
          "MFA/RBAC revoke-and-verify"
        ]
      },
      {
        "q": "What Microsoft 365 support experience do you have?",
        "answer": [
          "In production I supported Microsoft 365 users alongside Windows endpoint, identity, VPN, application, printing, and network issues. The identity side included Entra and Active Directory account lifecycle tasks, password and MFA support, security groups, access changes, and authentication troubleshooting.",
          "My strongest Microsoft cloud administration depth today is identity-first administration rather than claiming senior Exchange or SharePoint engineering. If a role includes deeper Exchange Online, Teams, SharePoint, or licensing work, I already understand the Entra foundation those services depend on and I am comfortable learning the product-specific administration in a controlled environment.",
          "That is how I position myself: useful on day one for identity and Microsoft 365 support, with a clear path into broader Microsoft 365 administration."
        ],
        "proof": [
          "Resume — 30+ Windows endpoints and M365 users",
          "Resume — Entra/AD/MFA/groups/authentication"
        ]
      },
      {
        "q": "What is your Intune experience?",
        "answer": [
          "I have administrative familiarity with Intune concepts and I am actively deepening the hands-on device-management side. I understand the workflow around device enrollment, ownership, primary user, compliance policies, configuration profiles, update management, endpoint security, and the relationship between device compliance and Conditional Access.",
          "I would not present myself as a senior Intune engineer today. My strongest production endpoint experience is Windows support across more than 30 endpoints, and my strongest cloud identity work is Entra, MFA, RBAC, Graph, and Microsoft 365. I am intentionally adding Intune because it is the natural next layer between identity and endpoint trust.",
          "That answer is important because I can be productive without overstating a skill that I am still building."
        ],
        "proof": [
          "Resume — Intune skill + Windows endpoint support",
          "Current learning focus — Entra + endpoint administration"
        ]
      },
      {
        "q": "How do you use PowerShell as an administrator?",
        "answer": [
          "I use PowerShell to gather evidence, validate state, automate repetitive checks, and make troubleshooting reproducible. In production I used PowerShell and Windows administrative tools to inspect system and network state, validate fixes, and provide higher-tier teams with diagnostic evidence.",
          "In my Azure lab I used Get-NetIPConfiguration, Resolve-DnsName, Test-NetConnection, hostname, whoami, and systeminfo to validate the Windows Server guest, DNS, private addressing, and outbound HTTPS. My broader lab portfolio also includes PowerShell automation and Microsoft Graph PowerShell.",
          "My goal with PowerShell is not to automate blindly. I want the command or script to make the administrative state clearer and the result repeatable."
        ],
        "proof": [
          "Resume — PowerShell troubleshooting",
          "Azure Enterprise Administration Lab",
          "26-lab portfolio — Graph PowerShell + automation"
        ]
      },
      {
        "q": "How do you decide when to escalate an issue?",
        "answer": [
          "I escalate when the issue exceeds my authorization, when the blast radius is larger than the change I am approved to make, when the evidence points to an infrastructure or security problem owned by another team, or when continuing to troubleshoot would create unnecessary user impact.",
          "Before escalating, I collect enough evidence that the next person does not have to restart the investigation. That includes user and device context, exact error, time of failure, steps already tested, relevant logs, network or authentication results, and recent changes.",
          "That is how I worked in production with ServiceNow: document the diagnostics, authorized actions, escalation reason, and user follow-up. A good escalation is not giving up; it is transferring a well-defined problem to the right owner."
        ],
        "proof": [
          "Resume — ServiceNow incident management",
          "Resume — reproducible diagnostic evidence before escalation"
        ]
      }
    ]
  },
  {
    "title": "Behavioral & scenario answers",
    "description": "Stories that prove you can perform the work, communicate under pressure, and protect access without becoming rigid.",
    "questions": [
      {
        "q": "Tell me about a time you provisioned and then revoked access.",
        "answer": [
          "A strong example is my Azure MFA and RBAC lifecycle lab. I used a test identity named Sophia Patel who was a member of the Engineering security group. I registered Microsoft Authenticator for the account, then assigned the Engineering group the Azure Reader role at VM scope rather than granting a direct user role.",
          "I signed in as Sophia and verified that she could see the authorized VM but did not have unnecessary administrative access. After the validation, I removed the Engineering role assignment and signed in again to confirm that the resource access was gone.",
          "The reason I like this example is that it covers the full access lifecycle: authentication, group membership, authorization, least-privilege scoping, end-user validation, revocation, and post-change verification."
        ],
        "proof": [
          "Azure MFA & RBAC Lifecycle"
        ]
      },
      {
        "q": "Tell me about a difficult authentication or access issue and how you approached it.",
        "answer": [
          "My normal production approach was to avoid assuming that every access problem was a password problem. At Oatridge I handled authentication, account-access, VPN, and Windows issues, so I learned to isolate the layer that was failing.",
          "I would verify the identity and account state, reproduce or capture the exact error, check authentication or Windows evidence, validate network and VPN state when relevant, use Event Viewer and command-line or PowerShell tools, then compare the result against what the user was actually authorized to access. If the evidence pointed to infrastructure outside my scope, I escalated with the diagnostics already collected.",
          "That method reduced guesswork and made the escalation useful. It is the same troubleshooting model I now apply to Entra: identity, method, policy, authorization, device, network, evidence."
        ],
        "proof": [
          "Oatridge authentication/VPN/Windows incidents",
          "Event Viewer + PowerShell + escalation evidence"
        ]
      },
      {
        "q": "What would you do if a manager asked you to give a user more access than the approved request supports?",
        "answer": [
          "I would not grant the extra access just because the request came from a manager. I would explain that I need the authorization to match the access being assigned and route the request through the correct approval process.",
          "If the business need is legitimate, I would help move it forward quickly by identifying the correct role or group, the required scope, and the approving owner. If it is urgent, I would follow the organization's emergency-access or change process rather than inventing an exception.",
          "At VIP Access Management I processed access requests against approved authorization and made sure credentials and permissions matched operational role requirements before activation or modification."
        ],
        "proof": [
          "VIP approved authorization workflow",
          "Security+ access-control principles"
        ]
      },
      {
        "q": "How do you communicate a technical access problem to a nontechnical user?",
        "answer": [
          "I start with the impact, not the architecture. For example: 'Your account is valid, but the access policy is blocking this sign-in from the current device. I am checking which requirement is not being met.' That is clearer than immediately talking about token claims, device IDs, or policy evaluation.",
          "Then I give the user one action at a time and set expectations about what will happen next. In the ticket, I keep the technical evidence so another administrator can reproduce the diagnosis.",
          "This is an area I am deliberately improving because strong administration is not just making the correct change. It is helping the user understand what is happening without making the environment sound chaotic."
        ],
        "proof": [
          "Resume — user follow-up + ServiceNow",
          "Resume — technical diagnostics for higher-tier teams"
        ]
      },
      {
        "q": "How do you balance security with user productivity?",
        "answer": [
          "I treat the requirement as secure enablement, not security versus productivity. The goal is to give the user the access required for the job with the smallest reasonable privilege and the least disruptive control that meets the risk requirement.",
          "That means using role-based groups instead of one-off permissions, scoping Azure roles appropriately, using MFA and modern authentication, testing policy changes before broad enforcement, and creating clear recovery paths for legitimate users.",
          "My projects reflect that approach. In the MFA/RBAC lab I gave the user Reader rather than Contributor and verified the actual user experience. In the Azure administration lab I restricted network access with NSGs while still validating the required management path."
        ],
        "proof": [
          "Azure MFA & RBAC Lifecycle",
          "Azure Enterprise Administration Lab"
        ]
      },
      {
        "q": "How do you respond to a suspected compromised Microsoft account?",
        "answer": [
          "I would treat it as an identity-security incident. First I would preserve and review evidence: sign-in activity, locations and IPs, client applications, authentication details, recent password or MFA changes, and any suspicious role or group changes that I am authorized to review.",
          "Following the organization's incident process, I would contain the account by blocking or disabling sign-in if appropriate, revoke active sessions, reset credentials through the approved identity-verification process, require secure MFA re-registration if compromise is suspected, and review access granted through groups or roles.",
          "Then I would verify the user can regain legitimate access, document the timeline and actions, and escalate indicators of broader compromise. My Splunk work analyzing authentication failures and suspicious activity reinforces the evidence-first side of that response."
        ],
        "proof": [
          "Splunk SIEM lab — 69,631 events",
          "Resume — authentication investigation",
          "Security+ incident-response foundation"
        ]
      },
      {
        "q": "What would your first 30 days look like in this role?",
        "answer": [
          "My first priority would be learning the organization's identity model before trying to redesign it. I would understand the tenant structure, administrative roles, naming standards, onboarding and offboarding process, MFA and Conditional Access baseline, high-impact groups, application assignments, Microsoft 365 licensing model, ticket workflow, escalation paths, and documentation standards.",
          "Then I would take ownership of repeatable work within my permissions: account and group administration, MFA and sign-in troubleshooting, access requests, Microsoft 365 support, documentation, and approved PowerShell tasks. I would keep a list of recurring problems and identify where automation or better runbooks could reduce errors.",
          "By the end of the first month, I would want the team to see that my changes are predictable, documented, least-privilege oriented, and easy to audit."
        ],
        "proof": [
          "Production ServiceNow + identity operations",
          "Documented GitHub labs and runbooks"
        ]
      }
    ]
  }
];

export const PROOF_BANK=[
  {
    "name": "Azure Tenant Governance Dashboard",
    "url": "https://github.com/johninfra/azure-tenant-governance-dashboard",
    "detail": "Live MSAL + Microsoft Graph + Azure Resource Manager governance app: users, groups, authentication methods, privileged roles, Azure RBAC, findings, resource inventory, and topology."
  },
  {
    "name": "Azure MFA & RBAC Lifecycle Administration",
    "url": "https://github.com/johninfra/azure-mfa-rbac-lifecycle-administration",
    "detail": "Microsoft Authenticator registration, Engineering group membership, scoped Reader RBAC, signed-in user validation, revocation, and re-validation."
  },
  {
    "name": "Azure Enterprise Administration Lab",
    "url": "https://github.com/johninfra/azure-enterprise-administration-lab",
    "detail": "Segmented VNets/subnets, NSGs, group-based RBAC, Azure Policy remediation, locks, budgets, Activity Log alerts, Windows Server 2022, and PowerShell validation."
  },
  {
    "name": "Azure Identity Governance Console",
    "url": "https://github.com/johninfra/azure-identity-governance-console",
    "detail": "Identity lifecycle, groups, RBAC, access requests, PIM-style privilege, access reviews, Conditional Access modeling, identity risk, audit logging, and Entra-authenticated Azure deployment."
  },
  {
    "name": "Production resume evidence",
    "detail": "Oatridge: AD/Entra lifecycle, MFA/password support, groups, Microsoft 365, 30+ Windows endpoints, Event Viewer, PowerShell, ServiceNow. VIP: credential lifecycle, RBAC, least privilege, access incidents, approved authorization, audit-ready records."
  },
  {
    "name": "Credentials",
    "detail": "CompTIA Security+ and A+; A.S. Computer Information Systems, CIAT, May 2026."
  }
];
