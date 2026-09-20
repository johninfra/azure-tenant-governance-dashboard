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
