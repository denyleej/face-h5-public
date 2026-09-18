# Security Policy

## Supported version

Security fixes are applied to the latest revision of the default branch.

## Reporting

Use the repository's private security advisory feature to report a vulnerability. Do not include real biometric media, identity data, credentials, or production configuration in an issue.

## Deployment baseline

- Serve the application over trusted HTTPS.
- Keep the model and runtime on the same trusted origin.
- Use a restrictive Content Security Policy suitable for the deployment.
- Review dependency and workflow updates before merging.
- Do not add media submission without server-side authorization, replay protection, size limits, and explicit user consent.
