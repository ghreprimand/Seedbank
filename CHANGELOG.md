# Changelog

## 2.0.0 — Permanent Idea Vault

Seedbank v2.0.0 turns the original browser-only idea sketchpad into a durable local application with a persistent backend, AI-assisted development, project graduation, recoverable delete, and automatic backups.

### Added

- **Monorepo workspace** with `client`, `server`, and `shared` packages.
- **Express API server** on port `4800`.
- **SQLite persistence** via `better-sqlite3` at `~/.seedbank/seedbank.db`.
- **Shared TypeScript domain types** used by both client and server.
- **REST API** for ideas, versions, stats, import/export, compost, backups, integrations, and AI.
- **Frontend API client** that uses the backend first and Dexie/IndexedDB as offline cache and fallback.
- **One-time browser data migration** from IndexedDB into SQLite.
- **Soft delete / Compost** with restore, purge, and 30-day retention.
- **Automatic backups** with startup database backups, scheduled daily/weekly backups, manual backup, and JSON archive exports.
- **Project graduation framework** with plugin-style integrations.
- **Archon integration** for creating project folders and context files.
- **Generic project scaffold integration** for local project creation without Archon.
- **Graduation UI** with readiness checks and post-graduation badges.
- **AI service layer** with OpenAI, Anthropic, and Ollama provider support.
- **Streaming AI chat** endpoint for per-idea Thinking Partner conversations.
- **AI field suggestions** for pitch, risks, tech stack, hook, and why-it-might-work fields.
- **Organic AI prompt modes**: What If, Devil's Advocate, Scope Down, and User Story.
- **Idea Health Check** with field-by-field readiness feedback.
- **Smart Cross-Pollinate** and **Pattern Insights** on the Discover page.
- **Public showcase documentation** in `README.md`, `CONTRIBUTING.md`, and `docs/`.

### Changed

- Ideas now survive browser storage clears because SQLite is the durable source of truth.
- The client data layer no longer talks directly to Dexie from UI components.
- Delete actions now move ideas to Compost instead of immediately removing them.
- Export/import can operate through the server API while preserving local fallback behavior.
- README now documents setup, platform notes, architecture, configuration, API groups, and development workflow.

### Data and Migration

- Existing IndexedDB data can be migrated into SQLite while preserving IDs, timestamps, and version history.
- SQLite startup backups keep the latest 10 `.db` copies.
- Scheduled JSON exports are written to `~/.seedbank/exports/`.

## 1.0.0 — Initial Release

Seedbank v1.0.0 was a local-first project idea manager built with React, TypeScript, and IndexedDB.

### Features

- Quick "Plant a Seed" flow with title and notes.
- 14-field editor for pitch, notes, hook, risks, tech stack, tags, scores, related ideas, links, and images.
- Board view with search, filters, and sorting.
- Gardening lifecycle stages from Seed to Shipped.
- Debounced auto-save to IndexedDB.
- Automatic version snapshots and restore.
- Discovery tools: Daily Seed, Cross-Pollinate, Draw from Storage, and Idea Weather.
- JSON and Markdown import/export.
- Keyboard shortcuts for capture and search.
- Responsive UI with custom paper/sage/ink/clay theme.
