# Decisions

Each entry: decision, date, reason. Owner decisions are final. Add new ones at the top.

- **Alpha, not v1.0.0** (19/10/2026). Releases are `v0.1.x` until the owner says otherwise. Reason: the product is invite-only and several features are not built.
- **Docs are public** (18/10/2026). No Basic Auth. Reason: docs are part of the product pitch and must be indexable. A test blocks internal terms.
- **Media on Cloudflare R2, EU** (18/10/2026). OCI Object Storage is not used. Reason: simpler, EU jurisdiction, bucket-scoped token.
- **Keep all data** (18/10/2026). No retention or expiry by default. Reason: owner rule.
- **Virgin go-live** (18/10/2026). Production starts with an empty database, empty media and no WhatsApp sessions.
- **Invite-only waitlist, no pricing at launch** (17/10/2026). Reason: learn from the first users first.
- **Languages: EN, FR, AR (Darija, right-to-left)** (17/10/2026). Arabic copy needs a native check.
- **Open-core on OpenWA** (17/10/2026). Credit OpenWA, Ai4x Academy and ZawIA.Tech.
- **Brand** (18/10/2026). Palette pine `#1c5c42`, clay `#a5562f`, paper `#fcfaf6`. No mascots, illustrations or WhatsApp and Anthropic logos. A non-affiliation footer is required.
- **Own accounts only** (19/10/2026). Web, API edge and docs run on the owner's own Vercel and tailnet. No third-party hosting.
- **One-commit public repo** (20/10/2026). `zawia-tech/wafine` receives a snapshot per release with no history. Development continues in the private working repo.
- **Future-dated posts stay hidden** (19/10/2026). A post appears on its UTC date. Drafts are noindexed.
