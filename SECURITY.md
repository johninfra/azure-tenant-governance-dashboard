# Security Policy

This project is designed as a read-only administrative visibility tool.

## Security assumptions

- Never place client secrets, certificates, Azure deployment tokens, or access tokens in the repository.
- Configure the Entra application as a public SPA, not as a confidential client.
- Grant only the delegated permissions documented in the README.
- Use a test tenant or least-privileged reader account while developing.
- Review all changes before deploying against production tenants.

## Reporting an issue

Open a GitHub issue without including tenant IDs, user data, access tokens, screenshots containing secrets, or other sensitive information.
