# Seedbank — Development Log

Newest entries at the top.

---

## 2026-05-13 — Release Candidate Stabilization

This release-candidate wave focused on making Seedbank safer and easier to operate as a local-first app before public packaging.

- Added the AI provider registry, OpenAI-compatible transport support, provider presets, Ollama discovery/health improvements, and per-feature provider/model routing.
- Replaced the one-shot field suggestion flow with a guided AI assistance modal that supports intent selection, playbooks, refinement, review/apply, and isolated field-assist conversation.
- Expanded AI guardrails with scoped budgets, provider/feature toggles, model allowlists, preflight warnings/confirmations, usage detail, audit events, clearer errors, and privacy guidance.
- Improved backup retention, JSON exports, non-destructive test-restore, WAL-safe snapshots, destination abstraction, local/network paths, and rclone remote support.
- Expanded integration metadata, health checks, dynamic configuration UI, discovery/action stubs, and clearer project-scaffold behavior.
- Improved Help Mode discoverability and updated in-app manual copy for AI, backups, integrations, guardrails, and release behavior.
- Added archive release packaging for Linux, macOS, and Windows, including smoke checks, aggregate manifests, release documentation, and a trusted self-hosted macOS packaging path.

Validation completed for the stabilization wave included typecheck, build, targeted API/UI checks, release package smoke checks, and workflow/security review.

---

## 2026-05-12 — Public Product Definition And Packaging Direction

This wave clarified Seedbank as a local-first single-user app with platform-neutral integrations and a practical archive-based packaging path.

- Public documentation was reframed around local storage, local/LAN operation, generic project adapters, and explicit security boundaries.
- Launcher scripts and release packaging guidance were improved for Linux, macOS, and Windows.
- AI provider extensibility work was scoped around direct API providers, local providers, and OpenAI-compatible custom endpoints.
- Release packaging was intentionally kept archive-based for now; native installers, signing, notarization, and auto-update remain future work.

---

## 2026-05-12 — Help, Themes, API, And Settings Polish

This wave completed the broader settings and documentation surface needed for public use.

- Added and refined the Settings page structure across general settings, themes, backups, integrations, AI/agents, and API/server configuration.
- Added the searchable in-app manual and contextual help surfaces.
- Expanded theme support and cleaned up stale theme references.
- Implemented API/server settings for personal access tokens, webhook configuration, and OpenAPI discovery.
- Tightened public documentation around API scopes, local-first behavior, integration framing, and user-visible settings.

---

## 2026-05-12 — Settings Infrastructure, Theming System, And Settings Store

This wave established the application settings foundation.

- Added a seven-tab settings shell and moved scattered configuration into dedicated settings tabs.
- Added the runtime theming system using CSS custom properties and persisted theme preferences.
- Added a shared settings store that hydrates from the server, patches section-level settings, and falls back safely when offline.
- Migrated backup, integration, and theme settings to the shared store.

