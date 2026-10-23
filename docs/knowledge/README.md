# WaFine knowledge base

Short, current, public-safe notes. A new contributor or a fresh AI session should read these five files and know the project. Keep each under about 80 lines.

| File | Answers |
|---|---|
| [overview.md](overview.md) | What WaFine is, for whom, what the launch promises |
| [architecture.md](architecture.md) | Components, request path, data, auth, limits |
| [decisions.md](decisions.md) | Owner decisions that shape the product, with the reason |
| [conventions.md](conventions.md) | How we work: commands, PR flow, hard rules |
| [glossary.md](glossary.md) | Terms used across the docs |
| [roadmap.md](roadmap.md) | Milestones, items and their dependencies (generated) |

Rules for this folder:
- No real hostnames, IPs, account or project identifiers, emails or secrets. Use placeholders such as `<web-host>`.
- Do not list unfixed vulnerabilities here. They live in the private vault until fixed.
- Update the file in the same PR that changes the behavior. Date each decision as dd/mm/yyyy.
- The release export ships this folder, so write for a public reader.
