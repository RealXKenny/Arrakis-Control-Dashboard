# Security

To **report a vulnerability** use the private process in [SECURITY.md](../../SECURITY.md) (not a public issue).

| Guide                                                | Covers                                                                     |
| ---------------------------------------------------- | -------------------------------------------------------------------------- |
| [Security overview](security-overview.md)            | Controls in place, trust boundaries, **known limitations and accepted risks** |
| [Production hardening](production-hardening.md)      | What to configure and check before and after going live                      |
| [Secrets management](secrets-management.md)          | Generating, storing, hiding and rotating secrets                              |
| [Redis security](redis-security.md)                  | Authentication, TLS, network exposure, what an attacker with Redis gets       |
| [Release verification](release-verification.md)      | Checksums, what they do and do not prove, provenance follow-up                |
| [Incident response](incident-response.md)            | Stolen cookie, leaked secret, suspicious administrator activity               |

No system is completely secure. These pages describe what the code does and what was tested, and say what was not.
