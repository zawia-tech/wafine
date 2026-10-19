## What & why
<!-- One or two sentences. Link the issue/task: "Closes #12", "Ref #12" -->

## Journey step (J1–J7) / release gate
<!-- If applicable: J1–J7 and the gate passed. Otherwise state "N/A". -->

## How it was tested
<!-- e.g. `scripts/tf oci validate`, `bash -n stack/*.sh`, `./stack/preflight.sh` on the VM, unit tests, screenshots. Include evidence. -->

## Checklist
- [ ] No secrets in the diff (`.env`, `*.tfvars`, keys, tokens, passwords, QR codes, phone numbers)
- [ ] No personal phone numbers or PII
- [ ] `OpenWA/` untouched, or only a deliberate submodule pin bump (then: env vars re-checked against the new `OpenWA/docker-compose.yml`)
- [ ] IaC changes ran through `scripts/tf <oci|cloudflare|aws> validate` (and `plan` output pasted/redacted if appropriate)
- [ ] Lint/typecheck/tests updated or passing (BFF: typecheck→lint→test; Web: typecheck→test; shell: `scripts/lint`)
- [ ] Task tracker updated if this finishes or adds work
- [ ] Documentation updated (README, agent instructions, docs/)

<!-- The Claude observer reviews PRs with comments only. Merging is a human decision. -->
