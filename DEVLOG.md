# Seedbank — Development Log

Newest entries at the top.

---

## 2026-05-15 — Thinking Partner Grounding and Image Gallery Fix

Tightened two rough edges found during project testing.

What changed:
- Thinking Partner's base system prompt now explicitly grounds questions in the current idea context: title, pitch, stage, notes, risks, build notes, tags, and scores.
- Thinking Partner context now includes field-label metadata so providers know that `fullNotes` means The Spark / Raw Notes, `hook` means Concept, `whyItMightWork` means The Case, and `techStack` means Build Notes.
- The context payload also lists which idea fields are actually filled in, so sparse ideas should get missing-detail questions instead of invented critique.
- Organic prompt buttons now ask for project-specific questions instead of broad generic prompts.
- Devil's Advocate now challenges an assumption that is actually present in the idea context; when the context is too sparse, it asks for the missing detail needed to critique accurately.
- Seed/Sprout stage guidance no longer blocks critique outright; it keeps critique lightweight unless the user explicitly asks for it.
- Thinking Partner messages now display newest-first in the panel while the stored history remains chronological for prompt construction.
- Thinking Partner's header now reads the effective Thinking Partner feature route and then the preflight result after opening, so it matches the provider/model that will actually receive the request.
- Image gallery rendering now resolves Seedbank API image paths through the configured API base URL, so uploads display correctly when the frontend and API run on different ports.
- Image fetch/delete routes now handle dotted filenames such as `.png` through explicit route parsing, and image reads stream files with a known content type instead of relying on `sendFile`.

Validation:
- `npm run typecheck`
- `npm run lint -w client`
- `npm test -w server`
- `npm run build`

---

## 2026-05-15 — Project Generation Workflow

Reworked the idea-detail project workflow so it matches how users actually want to move from seed to repo. The old visible action generated draft files in a modal and left folder creation/GitHub publishing as separate concepts. The new flow is local-first and repo-oriented from one section.

What changed:
- Added a Project generation section near the bottom of idea detail pages.
- The section creates a local project folder when the idea does not already have one.
- It uses the existing Project drafting AI route to generate repo-ready docs and writes them directly to the project folder.
- The standard file set is now `README.md`, `SPEC.md`, `IMPLEMENTATION_NOTES.md`, and `TODO.md`.
- If the AI omits one of those required repo docs, the server adds a conservative fallback before writing files.
- The section shows the current/new project path and links to Settings → Project Graduation when the preferred project folder has not been explicitly configured.
- GitHub publishing now sits in the same section, so the intended flow is: generate local project files first, then create/push the GitHub repo.
- The file generation brief field is tall enough for the default prompt, and the GitHub repo button stays disabled with a setup link until the local `gh` session is linked.
- The section now checks the idea's GitHub link or local `origin` remote against GitHub before showing repo actions.
- When GitHub confirms the repo already exists, Seedbank shows the repo link and an Update GitHub repo action instead of another create button.
- Update GitHub repo stages the local project folder, commits changed files when present, configures `origin`, and pushes `main`.
- Graduated project links now call back to the local Seedbank server to open the folder with the system file explorer instead of relying on browser-blocked `file://` URLs.
- On Linux, Seedbank now prefers a real installed file manager such as Dolphin, Nautilus, Nemo, or Thunar before falling back to `xdg-open`, because `xdg-open` can be configured to route folders through a browser or wrapper script.
- Duplicate idea now treats project wiring as instance-specific: it clears the local `graduatedTo` folder and removes GitHub links, while preserving normal reference links and idea content.

Safety and permissions:
- Existing project files are not overwritten.
- File paths still reject absolute paths, parent traversal, hidden directories, and empty files.
- GitHub repo status and update calls still rely on `gh` CLI auth; Seedbank does not store GitHub tokens.
- The generate endpoint requires both `ai:suggest` and `write:ideas` for bearer-token callers because it sends content to AI and updates the idea's local project path.
- The folder-open endpoint is local-session only and reads the stored idea project path rather than accepting arbitrary filesystem paths from the browser.

## 2026-05-15 — Project Draft Parser Hardening

Fixed a project-drafting failure seen while testing a sparse Seed-stage idea through the Codex account route. The idea did not need more fields filled out; the failure came from the AI returning JSON-like object syntax that was close to valid JSON but used unquoted keys/trailing commas.

What changed:
- The shared AI JSON extractor now attempts a conservative repair pass for common model output drift: unquoted object keys and trailing commas.
- Project draft parsing still runs the existing file-path sanitizer after repair, so unsafe absolute paths, parent traversal, and hidden directories remain rejected.
- Added regression tests for sparse project-draft prompts, strict JSON, repaired Codex-style object output, and unsafe-path filtering.

Validation:
- `npm run typecheck`
- `npm run lint -w client`
- `npm test -w server` (120 passing)

## 2026-05-15 — Claude Reauth Callback UX

Polished the Claude account reauth flow after a confusing manual test. The OAuth tab is expected to redirect to Seedbank's local callback page and replace the long Claude URL with a simple "linked" page, but the Settings card was not actively watching for that callback to finish.

What changed:
- After opening the Claude sign-in tab, Seedbank now polls Claude account status briefly and refreshes the Settings state as soon as the callback exchange succeeds.
- The manual callback input is now labeled as a fallback path instead of implying the normal flow should leave a URL for the user to paste.
- The login status copy now distinguishes between "waiting for browser sign-in" and manual callback mode.

Validation:
- `npm run typecheck`
- `npm run lint -w client`

## 2026-05-15 — GitHub Publishing V1

Added optional GitHub publishing as a post-graduation workflow. The design stays deliberately local-first: Seedbank creates or uses a local project folder first, then the user explicitly publishes that folder to GitHub.

What shipped:
- Settings → Project Graduation now includes a GitHub Publishing card.
- The card checks the local `gh` CLI session and shows account proof when linked: avatar, login/name, profile link, public repos, followers/following, and private/plan metadata when GitHub returns it.
- Unauthenticated states explain how to install GitHub CLI, run `gh auth login`, and refresh status.
- Idea Detail now shows a Publish to GitHub action once an idea has a local `graduatedTo` project path.
- The publish modal asks for repo name, optional owner, public/private visibility, and whether to push initial files.
- Server endpoints:
  - `GET /api/integrations/github/status`
  - `POST /api/integrations/github/publish/:ideaId`
- Server publishing creates the GitHub repo and can initialize git, make an initial commit, set `main`, add/update `origin`, and push.
- Successful repo creation adds or updates a single `GitHub` link on the idea.
- Partial failures are explicit: a repo can be created while the push fails, and the response tells the user what happened instead of hiding the state.

Security and operational choices:
- Seedbank does not store GitHub tokens or PATs.
- Auth comes from the user's local `gh` CLI session; token reads happen only through bounded `gh` calls.
- Git and GitHub operations use `execFile`/fetch with timeouts and output caps, not shell interpolation.
- GitHub publishing is optional and never required for normal project graduation.

Documentation updated:
- In-app manual includes a GitHub Publishing section with setup and workflow notes.
- Contextual help covers the Settings card, publish button, and publish modal.
- `docs/SETTINGS.md`, `docs/INTEGRATIONS.md`, and `docs/API.md` describe the setup, endpoints, and local-first behavior.

Validation:
- `npm run typecheck`
- `npm run lint -w client`
- `npm test -w server` (116 passing)
- `npm run build`

## 2026-05-15 — Lifecycle Release Checkpoint, Parser Hardening, and Neutral Project Context

Closed the stage-lifecycle work as a committable release checkpoint and captured the late polish that happened after the main Phase 6 sweep.

Final implementation notes:
- Landscape Analysis parsing was hardened for real provider output:
  - exact JSON string sections still map directly
  - snake_case / alternate section keys are normalized
  - nested objects and arrays are flattened into readable labels and bullets
  - markdown section headers are parsed when JSON is not returned
  - raw text falls back to Overall Viability instead of disappearing
- Saved landscape reports are normalized on read as well, so earlier reports that were persisted as nested/raw JSON render cleanly without requiring a new AI run.
- Project graduation now creates `AGENTS.md` instead of `CLAUDE.md`. The content is still agent-facing project context, but the file name is provider-neutral for Codex, Claude, Gemini, or any other coding assistant.
- Project graduation copy in Settings, docs, and the in-app manual now consistently describes `README.md` + `AGENTS.md`.
- Added a scaffold regression test that verifies `AGENTS.md` is created and `CLAUDE.md` is not.

Validation at checkpoint:
- `npm run typecheck`
- `npm run lint -w client`
- `npm test -w server` (110 passing)
- `npm run build`

Repository practice going forward:
- Keep devlog updates attached to each substantial feature/fix batch.
- Commit and push after validation rather than letting large completed work sit only in the working tree.
- Use smaller follow-up commits for GitHub/project-folder integration work so feature review stays tractable.

## 2026-05-15 — Terminology, Lifecycle UX Redistribution, and Docs Truth Sweep

Completed a full docs/devlog truth sweep after the final lifecycle refinements landed. This pass reconciles naming, stage semantics, progressive disclosure behavior, and persisted AI outputs with the current implementation.

What changed in-product (and is now documented consistently):
- Stage display names were finalized to garden-native language while keeping DB stage keys unchanged:
  - `pitch` → **Bloom**
  - `prototype` → **Greenhouse**
  - `shelved` → **Dormant**
  - `shipped` → **Market**
- Field labels now follow a deliberate cognitive arc:
  - `fullNotes` → **The Spark** / **Raw Notes** (stage-contextual)
  - `hook` → **Concept**
  - `whyItMightWork` → **The Case**
  - `pitch` → **Elevator Pitch**
  - `techStack` → **Build Notes**
  - `jamScore` display → **Feasibility**
- The board language and layout are now **Stages View** (swim lanes), with a persisted `Grid | Stages` toggle.
- Progressive disclosure was redistributed so each stage introduces meaningful new responsibilities:
  - Seed: title, The Spark, tags, mood, excitement, landscape analysis
  - Sprout: + Concept
  - Bloom: + The Case, Elevator Pitch
  - Greenhouse: + Risks, Build Notes
  - Plot: + Aesthetic & Style, Feasibility, links, images, related ideas
  - Dormant/Cold Storage: all core fields
  - Market: all fields including Retrospective
- New fields shipped:
  - `aesthetic` (Aesthetic & Style)
  - `retrospective` (Retrospective)
- Image Gallery shipped as a Plot-stage capability with upload/browse/delete and lightbox flow.
- Landscape analysis now persists to DB (`landscape_reports`) and reloads on mount, so analysis is reference material, not ephemeral output.
- Progressive teaser behavior now includes direct stage-advance actions and stage-only reset controls.
- AI assist language uses **Scope Down** instead of the prior jam/hackathon framing.
- Graduated project scaffolds now create `AGENTS.md` instead of `CLAUDE.md`, keeping the starter context useful for Codex, Claude, Gemini, or any other coding assistant.

Design rationale captured:
- **Garden-themed stages:** improves conceptual consistency and makes lifecycle movement feel coherent across UI, help text, and AI stage personalities.
- **Field relabeling:** aligns with how ideas mature mentally: spark → concept → case → pitch → build, reducing terminology friction.
- **Swim lanes over kanban columns:** better vertical scanning for many stages, less horizontal compression, and more natural scrolling on mixed desktop/mobile usage.
- **Disclosure redistribution:** each stage should unlock genuinely new work, not just more text boxes; this keeps early capture lightweight and later planning intentional.
- **Landscape persistence:** viability analyses often become decision artifacts; persisting them prevents rework and supports longitudinal comparison as ideas evolve.
- **Feasibility label:** broadens usefulness beyond hackathons and better matches long-form product or art-project evaluation.
- **Image gallery at Plot stage:** visual identity and reference curation become most valuable once the idea enters concrete execution.
- **AGENTS.md over CLAUDE.md:** Seedbank should not assume a specific assistant. The generated project context is agent-facing, but the file name and copy should stay provider-neutral.

Documentation surfaces updated in this sweep:
- `DEVLOG.md` (this entry), `CHANGELOG.md`, `README.md`
- `docs/ARCHITECTURE.md`, `docs/API.md`, `docs/SETTINGS.md`, `docs/AI_GUIDE.md`
- In-app manual and contextual help copy alignment (stage/field terminology and workflow guidance)

Validation rerun after documentation updates:
- `npm run typecheck`
- `npm run lint -w client`
- `npm test -w server`
- `npm run build`

## 2026-05-15 — Stage Lifecycle Enhancement Final Sweep (Phase 6)

Completed the final documentation and repo-hygiene pass for the stage lifecycle rollout. This closes the loop on Phases 1-5 by making the product and architecture intent explicit everywhere users and contributors look first (manual, contextual help, docs, README, changelog, and devlog).

Design rationale captured in this pass:
- **Why stage matters:** stages now represent timeline and readiness state, not just labels. Transition timestamps and timelines make idea momentum visible over time.
- **Progressive disclosure philosophy:** early capture should stay low-friction; users can still override and expose all fields when they need full control.
- **Stages view choice:** native HTML5 drag/drop kept bundle weight low while making stage promotion tactile and immediately legible.
- **AI personality tuning:** stage-aware prompt personalities keep assistance context-appropriate (exploratory at Seed, sharpening at Bloom, practical at build stages, reflective for dormant/market).
- **Landscape analysis as early research:** viability scanning is now available from Seed stage to help users decide whether to deepen, pivot, or shelve before over-investing.

Documentation updates completed:
- In-app manual sections verified/updated for Lifecycle Stages, Health Check, Stages View, Landscape Analysis, and Stage-Aware AI notes.
- Contextual help entries verified/updated for `idea-header`, `stage`, `health-check`, `promotion-nudge`, `stage-timeline`, `progressive-disclosure-teaser`, `stages-view`, and `landscape-analysis`.
- `docs/ARCHITECTURE.md` now documents stage transition persistence, readiness module usage, Stages view architecture, and landscape-analysis routing.
- `docs/SETTINGS.md` now notes the Garden `Grid | Stages` local preference (`seedbank:garden-view-mode`).
- `docs/API.md` now includes explicit stage-transition endpoint behavior notes in addition to landscape-analysis endpoint coverage.
- `README.md` feature list now calls out lifecycle intelligence, progressive disclosure/readiness nudges, Stages view, stage-aware AI, and landscape analysis.
- `CHANGELOG.md` now includes a consolidated "Stage lifecycle enhancement (Phases 1-6)" release summary.

Privacy/safety audit:
- Scanned for obvious leak patterns (tokens/keys/private-key markers and machine-specific absolute paths).
- No real credentials or machine-specific sensitive values were introduced in this documentation sweep.

## 2026-05-14 — Account Reauth Notice and Documentation Audit

Implemented a non-obtrusive account reauth notice for Claude and Codex account transports. The client now remembers, per browser, whether Claude account or Codex account auth has previously succeeded. If the aggregate settings/status later show that the same account transport is available but unauthenticated, the app shell shows a persistent bottom-right notice with a direct link to Settings → AI & Agents (`/settings/ai-agents`) and a refresh action. Intentional logout from the account cards clears the remembered flag so the notice does not nag after deliberate sign-out. The reminder stores only a local boolean marker, not provider credentials.

Removed the old separate CLI runner surface and replaced it with provider-routed Project drafting. The server no longer registers the old file-runner routes, no longer exposes the old run scope, and no longer includes runner state in aggregate settings or OpenAPI. The client removed the old run panel and now exposes **Draft project files** on the idea detail page. That panel calls `POST /api/ai/project-draft`, which resolves the new `project-drafting` Feature Defaults route, runs the same preflight/guardrail checks as other AI features, validates safe relative file paths from model JSON output, and returns reviewable files. A separate apply endpoint writes selected files into a graduated project path only when that path is inside a configured project root and the destination files do not already exist.

Settings → AI & Agents now includes a **Project drafting** row in Feature Defaults and Usage & Guardrails, so provider, model, effort, verbosity, account-auth route, token budgets, model allowlists, and remote-provider confirmation are configured the same way as Thinking Partner, field suggestions, health check, and Discover insights.

Documentation/manual/help updates:
- README, Settings docs, AI Guide, Project Drafting docs, Architecture docs, API docs, changelog, in-app manual, and contextual help were audited against the current implementation.
- Claude/Codex provider wording now consistently describes Claude native OAuth and Codex app-server account auth, and the old CLI runner documentation was removed.
- Backup docs now distinguish startup safety snapshots from scheduled daily/weekly backup checks.
- Contextual help includes the new reauth notice and links it to the AI & Agents manual section.

Validation:
- `npm run typecheck`
- `npm run lint -w client`
- `npm test -w server`
- `npm run build`

Privacy/safety:
- No secrets, keys, tokens, private paths, or machine-specific credentials were introduced in this change set.

---

## 2026-05-14 — Manual Contrast Fixes, Repo Doc Linking, and Conditional Privacy Copy

This pass addressed readability and wording issues reported in live theme testing of the in-app manual.

Manual rendering updates:
- `client/src/help/ManualModal.tsx` now renders manual `code` blocks with neutral, high-contrast theme tokens (`bg-ink-100`, `border-ink-300`, `text-ink-900`) instead of low-contrast green-on-green styling in darker palettes.
- Manual `tip` callouts were moved to neutral readable surfaces (`bg-paper-warm`, `border-ink-300`, `text-ink-800`) to avoid contrast collapse in dark themes.
- Added lightweight inline markdown-link support for manual `p`, `ul`, and `tip` blocks so referenced repo docs can be clicked directly.

Documentation/copy updates:
- Updated the manual REST reference tip to include a direct link to `docs/API.md` in the repository.
- Updated Settings → API & Server (`ApiServerTab`) to link `docs/API.md` directly instead of showing plain text only.
- Reframed absolute-local privacy statements to be conditional when cloud AI or offsite backup destinations are enabled.
- Updated the About one-liner to: “Local by default, cloud only if you opt in.”

Validation:
- `npm run typecheck`
- `npm run lint`

Privacy/safety:
- No secrets, keys, tokens, private paths, or machine-specific credentials were introduced in this change set.

---

## 2026-05-14 — Server Route Modularization and AI Service Helper Split

This pass continued the codebase audit cleanup after the default quality gates were stabilized.

Server startup is now slimmer: backup behavior moved into a dedicated `BackupService` plus backup route registration, and AI HTTP endpoints moved into `server/src/ai/routes.ts`. `server/src/index.ts` now stays closer to app wiring, shared settings, domain routes, and startup timers.

AI service internals were split conservatively. Prompt construction and field-suggestion parsing moved to `server/src/ai/prompts.ts`; guardrail primitives such as confirmation tokens, guardrail errors, and rate limiting moved to `server/src/ai/guardrails.ts`; usage-summary/audit helpers moved to `server/src/ai/usage.ts`. Provider execution and config behavior were preserved.

The Claude account tests also gained a shared cross-process auth snapshot lock so the default server test command remains stable even when Node runs test files in parallel.

Validation:
- `npm run typecheck`
- `npm run test -w server`
- `npm run lint`

Follow-up candidates remain: a deeper `ai/service.ts` config-normalization split, provider-by-provider extraction from `providers.ts`, and the larger client component splits.

---

## 2026-05-14 — Default Quality Gates Stabilized

This pass closed the audit's first priority before larger server modularization work: make the default quality gates trustworthy and green.

The server test flake was narrowed to Claude account tests that share process-level state (`globalThis.fetch`, account auth files, and catalog cache). Those tests now explicitly opt out of Node's per-file test concurrency, so `npm run test -w server` no longer depends on manually passing `--test-concurrency=1`.

The client lint failures were resolved without disabling React hook rules. The affected AI/settings components now avoid synchronous state syncing in effects by using derived values or render-time draft resets where local editable state is still needed. The cleanup touched the AI Assist route picker, AI & Agents method/server selectors, Claude account compact toggle, Feature Defaults drafts, model picker custom mode, provider-card auto-expand behavior, and Discover category-label dependency handling.

Validation:
- `npm run lint`
- `npm run typecheck`
- `npm run test -w server`
- Playwright smoke check confirmed the app rendered without browser console or page errors.

No behavior bugs were uncovered during this phase, so the larger modularization work remains a follow-up.

---

## 2026-05-14 — Granular Help Accuracy Pass + Docs/Manual Truth Sweep

This pass tightened contextual help and documentation to match the live code paths exactly.

Contextual help improvements:
- Reworked AI settings help from broad section buckets to control-level targeting (service cards, provider cards, feature-routing rows, provider/model/effort/verbosity selectors).
- Added provider-specific help copy so Codex account, OpenAI API, Anthropic API, local inference, and external/cloud routes no longer inherit misleading generic text.
- Added missing `data-help` wiring for high-complexity surfaces: Manual modal, Graduation modal, Project draft panel, and API Reference subsection.
- Updated stale help labels (`Settings` tab names, idea action wording, API/server descriptor).

Documentation/manual corrections from code audit:
- Updated README/docs/manual to reflect the provider-routed Project drafting workflow.
- Corrected API docs for current AI provider-instance routing shape and backup patch fields (`retentionCount`, `destinations`).
- Corrected settings/docs/manual backup behavior (startup is schedule-check-driven, not unconditional backup every boot).
- Corrected MCP auth wording to distinguish bearer external clients from implicit local loopback auth.
- Corrected manual behavior text for board defaults, stage icons/tips, version history flow, health-check trigger, and contextual-help control wording.

Validation and safety:
- `npm run typecheck`
- `npm run build`
- `git diff --check`
- Secret-pattern scan (keys/tokens/private-key signatures) on working tree
- Runtime restart confirmed at `http://localhost:5174`

## 2026-05-14 — Documentation Accuracy Sweep + Contextual Help Redesign

This session did two coordinated upgrades: (1) a code-based documentation/manual correction pass, and (2) a full contextual-help interaction redesign modeled on the Archon click-target flow.

The help system was rebuilt around a global mode instead of scattered inline popovers. A new floating bottom-right help control now toggles help mode, supports collapse-to-chevron state, and keeps clear exit affordances (banner + Esc). While help mode is active, capture-phase click interception resolves the nearest `data-help` target and opens a contextual popover anchored to that UI region. Help entries now come from a central map (`client/src/help/helpContentMap.ts`) with resolver support for dataset overrides and generic fallback entries for unlabeled controls. The app now applies hover/highlight affordances in help mode, and opening the manual exits help mode to avoid interaction conflicts.

Coverage expanded from sparse marker buttons to broad surface tagging across layout navigation, Garden, Discover, Compost, Idea Detail major sections, Settings shell/tabs, and key modals (quick capture, import/export, ask-AI, version history). Legacy `HelpButton` calls were kept as a compatibility bridge into the new global popover path.

Documentation/manual accuracy fixes were applied directly from implementation checks (server routes + client behavior), including:
- manual score model corrected to the two live fields (Personal Excitement + Feasibility),
- version-history snapshot behavior corrected (score edits are included),
- compost purge behavior corrected (purge on Compost load path),
- MCP docs/manual corrected to paginated `GET /api/mcp/ideas` response shape,
- graduation manual text corrected to adapter-defined stage updates (not hard-coded Market),
- API docs expanded for current AI/account/testing/settings integration routes and settings sections,
- settings docs corrected to runtime database filename/path conventions,
- agents docs corrected for current AI settings navigation and removed stale Detect-only wording.

Validation:
- `npm run typecheck`
- `npm run build`

---

## 2026-05-14 — AI Settings Persistence, Model Discovery, and Ask AI Route Selection

This session completed the AI & Agents settings refactor that moved the former monolithic settings tab into focused components under `client/src/pages/settings/ai/`. The tab now treats provider methods as persistent provider instances: account-login methods, API-key methods, local servers, and OpenAI-compatible cloud routers can each carry their own label, configured model, discovered models, enabled-model subset, probe status, guardrail state, and routing identity.

The server now persists discovered model catalogs on provider instances and refreshes them after auth/key events, account status checks, startup, and a background cycle. Claude account and Codex account model catalogs are populated automatically after login/status checks; local and external OpenAI-compatible instances can be added, listed, enabled, disabled, and routed independently. Probe/test results are persisted as `lastProbeStatus` and `lastProbedAt`, so cards no longer revert to "not tested" after navigation.

Feature Defaults were upgraded to choose provider instance, model, and reasoning effort. Discovered-model dropdowns are used where available while preserving custom model entry for custom endpoints. The Ask AI modal now starts from the effective Field suggestions route and exposes a clickable provider/model pill for per-run route overrides; preflight, one-shot suggestions, and field-assist chat all execute against that temporary selection without changing permanent settings.

Guardrails were tightened so disabled provider methods are hidden from setup and Feature Defaults and blocked server-side. The advanced controls now present a single concrete "Provider methods" enable list instead of separate duplicated provider-family and provider-instance lists.

The About page and generated OpenAPI response now read the running server/package version instead of displaying the previous hard-coded `2.1.0` value. No release tag was created as part of this work.

## 2026-05-14 — AI Settings Frontend: Provider-Instance Routing, Claude Account Polish, Cloud Endpoint Guardrails

This session delivered three focused frontend-only commits on the AI settings surface. `f72351a` migrated Feature Defaults routing to configured provider instances (instead of coarse provider IDs), added instance-aware availability gating and model hints, surfaced compact provider-instance diagnostics in AI Services, updated the AI Assist modal badge to show effective provider instance/model/effort context, and aligned default client settings shape with provider-instance contracts in `client/src/stores/settings.ts`. Primary files were `client/src/pages/settings/AiAgentsTab.tsx`, `client/src/components/AiAssistModal.tsx`, and `client/src/stores/settings.ts`.

`39e12e8` polished Claude account login UX in `AiAgentsTab.tsx` by removing release-candidate placeholder tone, clarifying signed-out/auth-required state messaging, and improving manual callback wording while keeping the existing account-login callback flow intact. Terminology remains user-facing (`API key` vs `Account login`) without introducing CLI/native/app-server phrasing in normal UI copy.

`1815c2c` hardened External/Cloud endpoint UX in `AiAgentsTab.tsx`: added explicit cloud residency/data-leaves-device warnings, added custom-cloud HTTPS/non-local URL guardrails in-form, disabled Save for unsafe custom cloud URLs, and cleared stale cloud API key state when cloud preset/base URL changes without a replacement key. Targeted verification for each slice was `npm --prefix client run -s typecheck`, passing cleanly.

## 2026-05-13 — Backend Capability Contract And Account Runtime Truthfulness

This session delivered three backend slices to support the RC AI & Agents truthfulness gate and the new service-family-first IA model. First, preflight metadata was corrected in `97eee68` so account aliases (`codex-recommended`, `codex-fast`, `claude-*-latest`) no longer appear as authoritative `resolvedModelId` values. Second, Codex account runtime was made explicit and truthful in `db37483`: the app-server path is now opt-in (`SEEDBANK_ENABLE_CODEX_ACCOUNT`) with deterministic unavailable/auth-required messaging when disabled or not signed in, plus focused gate tests.

The main architecture slice landed in `b6801ae`: a new backend capability contract (`AiMethodCapability`) now exposes method-level metadata for Settings/UI via `GET /api/ai/method-capabilities`. It distinguishes service family (`claude`, `codex-openai`, `local-inference`, `external-router`), connection method (`api-key`, `account`, `local-server`, `openai-compatible`), chat/model channel support, feature-routability, and availability state with reasons.

In parallel, two no-edit feasibility artifacts were produced for deferred backup follow-ups: `rclone-probe-cache-feasibility.md` and `backup-readiness-followup-plan.md`, covering a server-side TTL refresh option for rclone readiness cache and a remote restore-validation “download then validate locally” docs recipe. These remain deferred pending operator/coordinator pull-in.

## 2026-05-13 — AI Provider Grouping, Account Truthfulness & Privacy Notice Hardening

This session resolved the last blocking RC gate: AI provider card truthfulness and grouping. Nine commits across five files closed all Reviewer and Tester findings through five gate cycles.

The core work (`db37483` through `3a7be31`) established truthful framing for the account-transport providers: the Claude account card now shows a "coming soon" violet pill and has no login flow (login is not yet available), and the Codex account runtime is gated behind a `SEEDBANK_ENABLE_CODEX_ACCOUNT` env-var opt-in defaulting to off. Both cards have their "Set default" button unconditionally hidden — the Claude card via `claudeAccountStatus === 'connected'` (never true), and the Codex card via `ai.codexAccountAvailable === true && ai.codexAccountAuthenticated === true && codexAccountStatus === 'connected'` (all false by default). A key hardening detail (`d0aaa9c`): the `ProviderCard` render guard was changed from `canSetDefault &&` to `canSetDefault === true` because JS evaluates `undefined && x` as `undefined`, which was triggering the prop's `= true` default and showing the button when `codexAccountAvailable` was absent from a stale server payload.

The provider reorganisation (`80fab24`) replaced the flat provider list with four labelled groups — Direct API providers, Local inference, External & custom endpoints, and Account & subscription transports — and split the `custom` OpenAI-compatible preset handling throughout. Two separate sets were introduced (`LOCAL_OPTGROUP_PRESETS` for the dropdown, `LOCAL_RESIDENCY_PRESETS` for data-residency logic) to fix a regression where the `custom` preset was claiming local data residency even when the user could point it at a remote URL. The privacy notice fix required two layered commits (`12fa410` and `793165d`): the first excluded `'custom'` from the residency set, but the `PrivacyNotice` component was overriding it via a preflight result (the default localhost URL passes `isLikelyLocalUrl()` on the server, returning `preflight.local = true`). The second commit added an `isCustomPreset` short-circuit in `PrivacyNotice` itself, making `'mixed'` unconditional for the custom preset regardless of preflight state. A follow-up (`d32c3de`) split the `GuardrailsSection` `useEffect` into two, adding `[ai.provider, ai.openaiCompatibleBaseUrl, ai.openaiCompatiblePreset]` as dependencies to the preflight effect so the notice re-evaluates correctly after any in-session config change.

Additional fixes: a synchronous Feature Defaults save gate blocks routes to unavailable providers (`claude-account` always, `codex-account` when runtime unavailable); account-provider copy was clarified; the `codexAccountEnabledByEnv()` helper exported from `session.ts` and reused in `service.ts` to remove a duplicate inline IIFE. A read-only copy audit identified `docs/SETTINGS.md` AI & Agents section as stale (describes old four-card flat layout), backup step-by-step recipes as missing, and a restore procedure gap — all deferred pending Director assignment.

---

## 2026-05-13 — Configurable Categories Gate + Help Mode Coverage

This session resolved all review findings on the configurable categories UI slice (`576632c`) through a sequence of five follow-up commits, then expanded Help Mode contextual marker coverage to five previously uncovered surfaces.

The categories gate work (`b8c2f16` through `8286e75`) fixed: markdown export writing `undefined` for custom category IDs; Discover Pattern Insight prose using raw IDs instead of labels; the server `builtIn` spoof vulnerability (client-supplied `builtIn: true` for unknown IDs is now silently dropped); an empty-slug bypass where symbols-only names (e.g. `!!!`) could submit an empty-ID category; the Reviewer-flagged safe-delete guard running on every request path including empty-body PATCH calls. The most significant fix (`8286e75`) restructured the `PATCH /api/settings/categories` handler so that any body without an explicit `items` array is a strict no-op — the guard and the `setSetting` call are now both inside the `Array.isArray(rawConfig.items)` branch, preventing any body shape from accidentally wiping custom categories. The gate was confirmed closed by both Tester (PASS) and Reviewer Codex (ACCEPT) on the full chain.

Help Mode coverage (`e96f6d3`) added `HelpButton` markers to Board, Compost, Discover (page header + Pattern Insight card), Settings → General (Data section), and Settings → Theme (theme picker heading). This commit also fixed two pre-existing typecheck errors introduced by the in-progress Claude account provider WIP: missing `claudeAccountAuthenticated: false` in the default config objects in `client/src/stores/settings.ts` and `server/src/ai/service.ts`, and an unused `_config` parameter in the Claude account provider's `listModels()` method.

---

## 2026-05-13 — Release Candidate UX Foundation

This release-candidate wave split the next usability work into smaller reviewable commits after the stabilization pass. It added the first Help Mode discoverability slice, introduced shared AI provider metadata and clearer provider labels, cleaned public release workflow notes, clarified local-only/provider copy, and hardened Ollama runtime diagnostics with a real generation smoke test.

The branch is currently five commits ahead of `origin/main`: `34f1769` for the Help Mode banner/highlight behavior, `0bb9d61` for provider metadata and OpenRouter/custom endpoint naming, `d5b2039` for release workflow cleanup, `3897c62` for provider guardrail copy, and `6328924` for Ollama runtime checks. Typecheck/build passed after the stack, with only the existing Vite chunk-size warning.

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

---

## 2026-05-12 — Retrospective Detail: Docs, Screenshots, Themes, AI Foundations, And Release Packaging

Backfilled from commit history after the public development log was created. This section intentionally avoids author emails, local machine paths, credentials, and environment-specific private values.

The early May 12 work expanded the public documentation and API surface before the release-candidate push. Commits `542a5be` and `4ac12f9` added the standalone API reference and refreshed the architecture, integrations, settings, theming, agents, and AI guide docs. `41bed9e` then completed the API & Server settings tab UI, tying together server info, personal access token management, webhook configuration, and OpenAPI discovery. `41aa370`, `47b9619`, and `946292f` cleaned up stale links, updated the README and changelog for the current product state, and improved API error response polish.

Screenshot and public-showcase tooling followed in `553d898`, `d16a35c`, `f1d6cb4`, `d7c3aea`, and `19e442c`. The screenshot capture workflow became deterministic and path-neutral, generated screenshot outputs were ignored by default, and curated README screenshots were added for the v2.2 presentation. The related safety pass guarded against destructive screenshot seed behavior during documentation refreshes.

Theme and help work landed as a larger v2.2 slice. `8cf35b8` added four new themes, the in-app manual, and the contextual help system. Follow-up commits `ac8b580`, `7c44a4d`, `7d3be8a`, `50b9e59`, `3ce6603`, `342b91d`, and `3b46bf4` improved small-text contrast, tightened mobile/help behavior, expanded the theme count, renamed theme identities for distinctness, removed stale theme names from docs/scripts/comments, added legacy server-side theme migration, and documented the v2.2 release.

The product framing shifted toward platform-neutral local operation through `28b1064`, `36e21a6`, `de6fd6c`, `b490b40`, `9f90c2c`, `642f03a`, `01e448e`, `49e088b`, `b516465`, `3763222`, `9f4ce20`, and `9a4d97f`. The docs were reframed around generic integrations rather than one specific downstream workflow, launcher-first setup, local/LAN security boundaries, neutral provider language, scoped AI extensibility guidance, and accurate agent workspace wording. Sensitive or overly specific scaffold metadata was scrubbed, a workspace-path leak was removed from scaffold context, and overbroad isolation claims were softened.

The late May 12 release-candidate foundation commits (`40eb8d5`, `54ddcf5`, `692a752`, `d018d99`) added the first AI guardrail and integration foundations, improved AI assistance/settings UX, introduced archive-based release packaging, and updated setup/provider guidance. Those commits are the basis for the May 13 stabilization entry above.

## 2026-05-11 — Persistent Backend, Project Graduation, Settings, API, Agents, And Local Launchers

Backfilled from commit history after the public development log was created. This section intentionally avoids author emails, local machine paths, credentials, and environment-specific private values.

Commit `633aabc` was the major architecture turn from browser-only/local-cache behavior into a persistent local application backend. It introduced the server-backed storage direction, project graduation support, and AI-assisted development workflows. This established Seedbank as a local-first app with a durable backend source of truth, while preserving the client-side experience and migration path.

The public documentation pass in `dac81d8` expanded the repo from a working app into a public-showcase project. The docs were broadened to explain setup, architecture, integrations, AI assistance, settings, local-first storage, and safe operating boundaries. `d5ef26a` then added cross-platform launcher scripts and desktop integration so the app could be started more like a local product than a loose development server.

The settings foundation landed through `ba33f73`, `c973847`, `4ebef09`, and `4cd2157`. The UI gained the initial settings page structure; the server gained namespaced settings and an aggregate settings endpoint; legacy settings migration received reviewer cleanup; and the client gained a settings store that hydrates from the API, persists section updates, mirrors relevant UI state, and falls back cleanly when offline.

The server/API layer expanded through `fc92ac6`, `9de2496`, `fa5dac7`, and `2d73bd2`. Seedbank gained personal access token support, token-scoped auth middleware, server info, token-gated read-only MCP endpoints, outbound lifecycle webhooks, and a generated OpenAPI spec at `/api/openapi.json`. `f6de4b0` connected the client-side connection indicator to the API settings surface so server status became actionable from the UI.

The first full theming system landed in `131a2db`: six themes, live theme switching, CSS-variable-backed tokens, and a no-FOUC boot path that applies the stored theme before React renders. This became the base for the larger theme expansion on May 12.

The AI & Agents surface began in `34af635`. That slice added the AI & Agents settings tab, cleaned up the AI chat panel, and introduced agent run surfaces for local development assistance. Follow-up hardening commits `8c5f06a`, `1db7f0c`, `f557989`, and `57d4b4d` tightened agent output application: transcript paths were hidden, path traversal was blocked, symlink edge cases were handled, and client/server contract mismatches from review were resolved.

## 2026-05-08 — Core Application Buildout: Data, Shell, Board, Detail, Import/Export, Discovery, Polish, And Docs

Backfilled from commit history after the public development log was created. This section intentionally avoids author emails, local machine paths, credentials, and environment-specific private values.

The main application buildout happened as a sequence of phase commits. `ad3cc38` created the data layer with shared types, Dexie schema, CRUD helpers, and automatic versioning. This gave ideas a structured local persistence model and made later import/export/version-history behavior possible.

`47093c3` added the app shell, routing, and quick capture flow. This established the main navigation frame and the fast idea-entry path. `e7e8f78` built the Board view with a card grid, filter bar, search, and empty states, making the core idea library browsable. `ce041f9` added the Idea Detail/editor view so individual ideas could be opened, edited, scored, staged, and expanded beyond quick capture.

`d82a4a5` added import and export support, creating the first durable migration/sharing path outside browser storage. `1a7beee` then added the discovery and "delight" features: Daily Seed, Cross-Pollinate, Idea Weather, and Draw from Storage. These shifted the product from a plain tracker toward an idea-recombination tool.

Visual and interaction polish followed in `a6a4d6b` and `bc084d4`. The app received a more complete visual treatment, keyboard shortcuts, an error boundary, favicon work, README updates, and final pre-doc polish. `bd05fb2` added JSDoc coverage across source files, CHANGELOG content, and metadata updates.

The review cleanup in `0fa0cf0` addressed Markdown round-trip behavior, switched to self-hosted fonts, and cleaned up lint findings. `1d306c3` normalized the README filename casing so docs links and repository conventions were consistent.

## 2026-05-07 — Project Definition And Initial Vite/React Scaffold

Backfilled from commit history after the public development log was created. This section intentionally avoids author emails, local machine paths, credentials, and environment-specific private values.

Seedbank started with documentation-first product framing. `3049980` added the initial README, defining the project as an idea manager for capturing, growing, rediscovering, and eventually acting on project ideas. `1fac70f` clarified the README workflow so the intended user path and garden metaphor were easier to follow.

The first implementation commit, `73e1f54`, scaffolded the app with Vite, React, TypeScript, Tailwind, path aliases, and Seedbank theme tokens. This established the frontend stack, base styling vocabulary, and project structure that the May 8 phase commits built on.
