# Governance accuracy and security fixes

All implementation and validation was local. No GitHub push, deployment, or live
Azure/Entra resource change was performed. Microsoft API operations remain GET-only.

## Implementation stages

1. **Single source of truth.** Materialized the existing multitenant entry and all
   injected features into normal source modules. Removed five ordered text-rewriting
   scripts. Vite now loads `src/main.js` directly. CSS and topology design are unchanged.
2. **Session and transport isolation.** Added account/tenant-bound private snapshots,
   cancellation and guarded atomic publication. Logout clears data before its popup
   completes. Added MSAL account-event handling, deduplicated token requests, serialized
   consent, request deadlines, bounded retries and API-origin-checked pagination.
3. **Collection and effective access.** Split permissions by feature, corrected Graph
   page sizes and advanced-query headers, and isolated independent dataset failures.
   Retained successful Azure responses and earlier pages; supplemented Azure RBAC with
   ancestor assignments. Resolved group-based Entra/Azure access via Graph transitive
   membership, retaining original group, assignment, scope and active/eligible state.
4. **Governance evidence and presentation.** Added per-dataset completeness and withheld
   scores for partial/unavailable/skipped evidence. Separated method registration,
   reported capability and unknown enforcement. Checked TAP validity, preserved normal
   assignments when PIM calls fail, and stopped inferring inactivity from missing dates.
   Added evidence metadata to exports and formula-safe CSV values. Updated documentation,
   Node requirements, a dependency lockfile and the local validation command.

## Automated validation

`npm run validate` runs `node --test` and the Vite production build. Tests use only
Node built-ins and synthetic accounts/API fixtures; they never contact Microsoft.

The suite covers every requested priority:

| Priority | Regression coverage |
| --- | --- |
| Incomplete scoring | Missing, partial, unavailable, pending and skipped datasets; missing MFA/activity results; incomplete UI and exports |
| Indirect privilege | Group-derived active/eligible Entra roles, Azure nested membership, source/scope preservation, deduplication, privileged MFA/stale-account and guest-access findings |
| Logout/account races | Pending tokens, fetch, JSON parsing, retry waits, pagination, late collection successes/errors, replacement refreshes, MSAL events and immediate logout clearing |
| Graph queries | Service-principal page size, user-activity scopes, direct/transitive cast count and consistency headers, retained headers across pages |
| Partial Azure inventory | Individual endpoint failures, retained earlier pages, retained RBAC/resource results, scope inheritance and PIM isolation |
| MFA semantics | Registration versus capability versus enforcement, expired/future/unusable TAP, OR/report-only/block policies, readable reports with denied detailed methods |

Additional tests exercise all 11 tabs, HTML escaping, empty successful sign-in logs,
hidden membership labels, CSV formula handling and export metadata.

The final local suite contains **43 passing tests**. The production build passes using
the locked MSAL Browser **4.30.0** and Vite **7.3.7** dependencies. The dependency install
reported zero known vulnerabilities at validation time; this is not an ongoing audit.

## Browser smoke check

A headless Edge session tested the app served on localhost with mocked MSAL and API
responses. All 11 tabs rendered without browser errors. The check verified partial
scores, group-source labels, MFA evidence columns, JSON/CSV downloads, logout clearing,
and a 390px mobile viewport without document overflow. Desktop/mobile screenshots were
visually inspected. Thirty Graph/ARM requests were intercepted and fulfilled from
synthetic fixtures; no real Microsoft API calls or authentication occurred.

## Remaining limitations

- Real MSAL sign-in/consent, tenant roles, licensing and Graph/ARM responses still need
  validation in an explicitly authorized test tenant.
- Actual MFA enforcement remains unknown. This is not a Conditional Access, Security
  Defaults, legacy per-user MFA or federation evaluation engine.
- Hidden membership and latent PIM-for-Groups eligibility are not certified. The app
  does not request additional hidden-membership or PIM-for-Groups permissions.
- Azure custom-role permissions, deny assignments and all effective-access constraints
  are not evaluated. Built-in broad-role findings use IDs rather than name substrings.
- Missing licenses/permissions, missing successful activity timestamps or an unconfigured
  subscription intentionally withhold the overall score. There is no silent fallback to
  a perfect score or inference that an unobserved sign-in never occurred.
- Detailed per-user method and group inventories remain potentially expensive in large
  tenants. Delta synchronization, on-demand detail loading and table virtualization are
  separate performance work.
- The original deployment workflow's job-wide secrets and unpinned deployment CLI,
  production CSP/framing hardening, public source maps and old documentation screenshots
  were not changed in this focused implementation.
- The shared app still uses the organizational authority; it does not provide an explicit
  guest-tenant selector. Delegated Directory.Read.All remains broad but no new permission
  has been added. Reader-level Azure identities remain the recommended operating model.
