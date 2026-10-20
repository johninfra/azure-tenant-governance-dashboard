# Architecture and Trust Boundaries

## Components

1. **Static SPA** — HTML/CSS/JavaScript built with Vite.
2. **MSAL Browser** — handles Entra authentication with OAuth 2.0 Authorization Code Flow with PKCE for public browser clients.
3. **Microsoft Graph** — directory identity and authentication registration inventory.
4. **Azure Resource Manager** — Azure RBAC, role definition, and resource-group inventory.

## Trust boundaries

- The browser is the application runtime.
- Microsoft Entra ID is the identity provider.
- Microsoft Graph and Azure Resource Manager are the only data APIs called by the application.
- No project-operated API or database receives tenant data.

## Authorization model

The app uses delegated permissions, so effective access is bounded by both the application's consented delegated scopes and the signed-in user's own directory/Azure privileges.

## Data handling

- Non-secret configuration IDs: local storage.
- Authentication cache: session storage through MSAL.
- Tenant query results: in-memory JavaScript state only.
- Findings exports: generated locally as browser downloads.

## Source modules

- `src/main.js`: the direct Vite entry point, MSAL events, navigation and existing UI wiring.
- `src/controller.js`: account changes and atomic publication of refresh results.
- `src/snapshot.js`: the empty snapshot schema, cancellation/session identity and evidence coverage.
- `src/auth.js`: account-bound token acquisition, deduplication and serialized interactive consent.
- `src/api.js`: GET-only transport, pagination, request deadlines, token renewal and bounded throttling retries.
- `src/collect.js`: independent Graph/ARM collectors and feature-specific delegated scopes.
- `src/governance.js`: effective role resolution, registration/capability semantics and findings.
- `src/views.js`: overview and MFA presentation using the existing cards, tables and styles.
- `src/export.js`: CSV evidence metadata and formula-safe text export.
- `src/topology.js`: existing Azure resource/topology presentation.

The previous source-rewriting build scripts have been removed. `npm run dev` and
`npm run build` operate on the same source. All existing injected features now live
in ordinary modules, including Conditional Access, activity status, RBAC guidance,
and ownerless/stale/dormant-account checks.

## Refresh isolation

Each refresh captures an account identifier, tenant identifier, subscription and
MSAL instance and owns an AbortController. Collection writes only to a private
snapshot. Publication requires that the refresh is still current and all captured
identifiers still match. Logout clears visible state before awaiting MSAL. Account
events and replacement refreshes cancel the old run. Checks after token acquisition,
fetch, JSON parsing, pagination and retry waits prevent late work from publishing.

Graph and ARM pagination may only stay on the original API origin. Every request is
a GET, tokens are reacquired through MSAL per request, and a 401 gets one forced
renewal. Transient 429/502/503/504 responses get up to two retries; Retry-After is
honored. A request has a 30-second deadline; logout also cancels retry waits.

## Evidence and scoring

Every dataset records `pending`, `available`, `partial`, `unavailable` or `skipped`.
Successful empty collections are available, while failed membership requests remain
unknown. Successful earlier pages may be retained as partial results. Independent
ARM results survive other endpoint failures. Standard active Entra assignments are
retained when PIM timing/eligibility is missing.

The review score is `null` unless all 27 tracked datasets are available, including
Azure inventory and PIM visibility. Consequently unconfigured Azure, license limits,
denied consent and missing user capability/activity data withhold a numeric score.
This deliberately favors visible uncertainty over a misleading perfect score. Even
complete evidence yields only a heuristic findings score, never a security certification.
JSON and CSV exports carry evidence completeness and the snapshot timestamp.

## Indirect privilege

Graph direct user membership still powers Groups & Members. For groups referenced
by active/eligible Entra roles or Azure RBAC, Graph transitive user membership is
queried separately with the required advanced-query header and count. Effective
user assignments retain source group, source assignment, access state and scope.
Counts deduplicate users; findings evaluate their effective active access. ARM's
atScope result supplements child-scope inventory with ancestor assignments.

Graph determines supported group nesting; Entra role-assignable groups do not support
nested groups. Hidden membership and failed resolution remain incomplete evidence.
The app does not request Member.Read.Hidden or PIM-for-Groups permissions. Latent
PIM-for-Groups eligibility is not evaluated, nor are custom-role permissions or Azure
deny assignments evaluated as an effective-access engine.

## MFA semantics

Registration is evidence that a method is registered. Capability is taken only from
an explicit `isMfaCapable` registration-report value. A method type alone never
establishes that capability. Temporary Access Pass usability requires an explicit
usable state and a current start/lifetime interval. Expired/unusable passes cannot
count as usable MFA registrations. Detailed method objects are reduced to the fields
needed for labels and pass validity, avoiding stored phone numbers/device details.

Enforcement remains **Unknown** for every user. Policy inventory cannot prove the
effective sign-in decision. Report-only policies and OR grant alternatives do not
count as mandatory authentication controls. Even a mandatory control in a narrow
policy does not establish tenant-wide MFA coverage. Security Defaults, legacy per-user
MFA, authentication-strength combinations, federation and the complete Conditional
Access evaluation require separate validation. Missing successful-sign-in timestamps
do not prove inactivity and no longer generate stale/dormant-account findings.

## Local validation

Use Node 22.12 or later, `npm ci`, then `npm run validate`. The Node test runner covers
transport, collection, assessment rules, session races, rendering, MSAL event wiring,
and exports using synthetic tenants. Tests do not contact Microsoft services. A real
tenant with the relevant licenses and delegated roles is still needed to validate
live authentication and authorization behavior; local tests make no claim of that.
