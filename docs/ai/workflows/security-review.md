# Agent task template — security review

**Scope:** [routes, feature, integrations]
**Threats:** [authz bypass, injection, CSRF, SSRF, secrets, resource exhaustion]

Review controls and trust boundaries; cite concrete file paths and reproduction evidence; prioritize findings by impact and exploitability. Do not print secrets, probe production without authorization or claim an issue is resolved without tests. Keep remediation minimal and reviewable.
