# Glossary

- **BFF**: backend for frontend. The Hono API in `app/bff`.
- **OpenWA**: the open-source WhatsApp engine WaFine builds on.
- **Allowlist**: the set of E.164 phone numbers allowed to sign up.
- **Waitlist**: leads who asked for an invite. An admin approves them into the allowlist.
- **Session**: one linked WhatsApp number in OpenWA.
- **API key**: a scoped key minted by the BFF for a session, revocable.
- **MCP**: Model Context Protocol. How Claude and other agents use WaFine.
- **Pacing**: the gap and daily cap applied to auto-replies by `PacedReplySender`.
- **Send budget**: the BFF-side daily cap on REST and MCP sends.
- **Presigned link**: a short-lived URL the BFF mints so a user can read a media file.
- **Virgin deploy**: go-live with empty database, media and sessions.
- **Captain**: the coordinating agent or person who assigns work and reviews PRs.
- **Worker**: an agent that executes one brief in its own worktree.
- **A2A**: agent-to-agent message. Also the one-line status format workers send the captain.
- **Strip list / deny list**: files removed from, and terms forbidden in, the release export.
