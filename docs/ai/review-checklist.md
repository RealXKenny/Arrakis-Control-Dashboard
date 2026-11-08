# Pull request / agent review checklist

- [ ] Task scope, target branch and existing working tree inspected
- [ ] Changes follow `AGENTS.md` and architecture ownership
- [ ] No secret values, `.env`, credentials, generated files or unexpected assets added
- [ ] Server/browser boundaries and auth/ownership checks preserved
- [ ] Redis Cluster and standalone behavior considered where relevant
- [ ] Focused tests added or updated; failures attributed with evidence
- [ ] Formatting, typecheck, lint, unit tests and relevant build/browser checks run
- [ ] Documentation, changelog and architecture inventory updated if applicable
- [ ] Git diff reviewed; no unrequested destructive operation or release
