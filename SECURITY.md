# Security Policy

Security is important to Arrakis Control Dashboard, particularly for authentication, administrative controls, external integrations, credentials, and deployment infrastructure.

## Supported versions

Security fixes are generally targeted at the latest maintained release. Older releases and development branches may not receive backported fixes. Maintainers should update this section when a formal support matrix is established.

## Reporting a vulnerability

**Do not report exploitable security vulnerabilities in public GitHub issues, discussions, or pull requests.**

Use GitHub's private vulnerability reporting feature if it is enabled for this repository: **Security → Advisories → Report a vulnerability**. If it is not enabled, contact the maintainers through a verified private channel listed in the repository or official project community. Do not send exploit details to an unverified account.

Include, where possible:

- A description of the issue and potential impact.
- Affected versions, components, and configuration.
- Minimal reproduction steps or a safe proof of concept.
- Relevant sanitized logs or screenshots.
- Suggested mitigations, if known.

Never include real credentials, personal data, or unauthorized access to third-party systems.

## Disclosure process

Maintainers will attempt to acknowledge reports, assess impact, reproduce the issue safely, and coordinate remediation and disclosure. Response and remediation timelines depend on severity and maintainer availability; no fixed service-level commitment is made here.

Please allow reasonable time for a fix before public disclosure and avoid accessing data or systems without authorization.

## Deployment recommendations

- Keep the dashboard, dependencies, operating system, and integrations updated.
- Use least-privilege service credentials and rotate compromised secrets.
- Never expose Redis, PostgreSQL, administrative APIs, or internal service ports directly to the public internet without appropriate controls.
- Enable TLS, access controls, backups, and monitoring appropriate to your deployment.
- Keep production secrets out of source control, logs, and client-side bundles.

## Scope

Reports concerning vulnerabilities in Arrakis Control Dashboard are in scope. For vulnerabilities solely in third-party software or services, notify the appropriate upstream maintainer or vendor as well.
