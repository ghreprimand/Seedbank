# AI Guide

Seedbank's AI features are designed to help you develop your own ideas. The AI is a thinking partner: it asks questions, reflects gaps, and offers focused suggestions — it does not take over the creative direction, and all features are opt-in.

---

## Provider Setup

Provider configuration lives in **Settings → AI & Agents**. Navigate there via the gear icon (⚙) in the header, or go directly to `/settings/ai-agents`.

### One card per service

Settings → AI & Agents shows a single card per service family. Each card is the section — there is no separate connection-method toggle row above it.

- **Claude** — defaults to your Claude.ai subscription (account login). The API-key path is available via the card's kebab (`⋯`) menu under *Use API key instead*.
- **Codex / OpenAI** — defaults to local Codex CLI account login. The API-key path is available via *Use OpenAI API key instead* in the same menu.
- **Local Models** — pick a server type (Ollama, LM Studio, vLLM, llama.cpp, LocalAI, custom localhost) from the inline dropdown. Additional local instances accumulate behind `+ Add another local instance`.
- **External / Cloud** — built-in OpenRouter, Groq, Mistral, Together, Fireworks, or any custom HTTPS endpoint. Additional cloud instances accumulate behind `+ Add another cloud provider`.

Each card header reads at a glance: icon · service name · status dot + word (`Connected`, `Key needed`, `Unreachable`, `Local`, `Not tested`) · default chip when applicable · `⋯` menu · expand chevron. Click anywhere on the left half of the row, or the chevron, to expand the card and edit the model, key, or run probes.

Each saved provider method is stored as a provider instance. Built-in instances cover OpenAI API, Anthropic API, Claude account, Codex account, Ollama, local OpenAI-compatible, and cloud OpenAI-compatible. Additional instances ("LM Studio laptop", "OpenRouter personal", "Groq work") can be added as needed; each keeps its own label, URL, model list, enabled state, probe status, and routing identity.

### Kebab menu actions

Every card's `⋯` menu surfaces card-level actions that used to live on the surface:

- **Set as default** — promotes this provider instance to the global default.
- **Use API key instead** / **Use subscription instead** (Claude and Codex only) — switches the visible card between the account-login and API-key paths for this service family.
- **Use Codex login instead** / **Use OpenAI API key instead** (Codex family equivalent).
- Sign out controls when an account is connected.

Switching the mode swaps which provider instance the card represents; the kebab item is named for the *other* path, so the action is always "go to the alternative."

**OpenAI API** — enter your API key and model name (e.g. `gpt-4.1-mini`). Calls are made server-side to `api.openai.com`. Idea content is sent to OpenAI's servers.

**Anthropic API** — enter your API key and model name (e.g. `claude-sonnet-4-6`). Calls are made server-side to `api.anthropic.com`. Works well for reflective critique and longer contextual responses. Idea content is sent to Anthropic's servers.

**Ollama** — configure the base URL (usually `http://localhost:11434`) and model name (e.g. `llama3.2`). No API key required. Calls stay on the configured Ollama host. Useful for local-only experimentation or privacy-sensitive archives.

**Custom / OpenAI-compatible endpoint** — choose a preset or enter a compatible endpoint URL, API key when required, and model name. Use this for OpenRouter, Groq, Mistral, Together, Fireworks, LM Studio, vLLM, llama.cpp, LocalAI, or another service that accepts OpenAI Chat Completions requests. Local and cloud instances are stored separately so a local LM Studio server does not overwrite an OpenRouter setup.

**Claude account** — account-auth method with login/status controls shown in the Claude service area. Use this to route AI chat through a Claude.ai subscription with Seedbank's native OAuth flow rather than an Anthropic API key. This is separate from Anthropic API billing. Seedbank requests the Claude Code-compatible account scopes needed for current account-model inference and sends Claude account requests in the same native-style shape: concrete model IDs such as `claude-sonnet-4-6`, Claude Code system blocks, adaptive thinking for supported Sonnet/Opus models, and context-management edits. Older Claude account logins that are missing the required scope are shown as needing re-login.

**Codex account** — account-auth method that talks to the local Codex app-server over JSON-RPC. This requires a compatible Codex CLI/runtime installed locally and logged in on the same computer. It is separate from OpenAI API billing and does not use an OpenAI API key. On Windows, Seedbank resolves common npm-installed Codex locations and starts the runtime through Node.js when needed.

### Account reauth notices

Claude account and Codex account can require reauth if their underlying account session expires or becomes unavailable. When this browser previously saw one of those account transports authenticated, but the current server status says auth is missing, Seedbank shows a persistent reauth notice in the app shell. The notice links directly to **Settings → AI & Agents** (`/settings/ai-agents`) so you can sign in again from the right account card.

The reminder is intentionally local and minimal: it stores only a browser-side flag that the account was seen authenticated before. It does not store provider credentials. Logging out from the Claude or Codex account card clears the reminder for that account.

### Model discovery and saved instances

When a provider becomes usable, Seedbank tries to discover available models and persists them under that provider instance. Discovery runs after API-key saves, Claude/Codex account login/status checks, manual **List saved models**, server startup, and a background refresh cycle. Provider cards show how many models are available, and expanded cards show a preview of the catalog.

For broad catalog providers such as OpenRouter, you can choose which discovered models are enabled in Seedbank. Enabled models are the ones shown in Feature Defaults and in Ask AI's temporary provider/model picker.

The provider health badge is also stored per instance. If you test an Ollama server and it connects, leaving and returning to Settings keeps the card visibly connected until a later probe changes that status.

### Choosing a default provider

Each provider card's kebab (`⋯`) menu has a **Set as default** item. Selecting it promotes that provider instance to the global default; the card border picks up a sage accent and shows `· default` in its header. Feature Defaults can inherit the global default or override it per feature. The global default also has a default model and effort selector in Feature Defaults.

### Provider API keys vs. Seedbank tokens

**Provider API keys** (OpenAI API, Anthropic API, OpenRouter, Groq, Mistral, Together, Fireworks, or another custom endpoint) are credentials for external AI services. They are stored server-side, encrypted at rest. Public API responses expose only key-presence booleans such as `hasOpenAIKey`, `hasAnthropicKey`, `hasLocalOpenAICompatibleKey`, and `hasCloudOpenAICompatibleKey` — the raw key value is never sent to the browser. All AI calls are proxied through the Seedbank server; the browser has no direct contact with the provider.

**Seedbank personal access tokens** are a separate concept. They are bearer tokens you generate in **Settings → API & Server** to call the Seedbank REST API from scripts, external tools, or remote hosts. They do not interact with provider API keys.

### Custom / OpenAI-compatible endpoint

The **Custom / OpenAI-compatible endpoint** card accepts any endpoint that uses OpenAI Chat Completions requests. Configure:

| Field | Description |
|---|---|
| Base URL | Full endpoint root, e.g. `https://openrouter.ai/api/v1` or `http://localhost:8080/v1` |
| API key | Optional bearer token for the endpoint |
| Model | Model identifier string as accepted by the endpoint |

This lets you use providers such as OpenRouter, LM Studio, vLLM, LiteLLM gateways, Groq, Mistral, and locally-hosted inference servers that expose a `/v1/chat/completions` endpoint.

### Feature Defaults

Feature Defaults let you route each AI feature independently (Thinking Partner, field suggestions, health checks, Discover insights, Project drafting):

- Inherit the global default provider/model, or
- Pin a specific provider/model per feature.
- Pick from discovered models when available; free-text model IDs remain possible for custom endpoints.
- Set reasoning effort when the selected provider/model supports it.

Unavailable account transports can appear as options for visibility, but save is blocked when a route targets unavailable account providers. For account-login routes, first install and sign in to the matching local runtime, then refresh status in Settings.

### Ask AI provider/model picker

The field-level **Ask AI** modal starts with the effective `field-suggestions` route. If Field suggestions is set to **Use global default**, the modal uses the global default provider/model; otherwise it uses the feature override.

The provider/model pill in the modal header is clickable. It opens a temporary picker of configured, enabled provider instances and their available models. Changing that picker affects the current Ask AI run only — it does not rewrite Settings. Preflight privacy warnings, confirmation prompts, one-shot suggestions, and field-assist chat all use the selected provider/model.

### Advanced routing and fallback

Seedbank does not implement native provider routing, model cascading, or multi-provider fallback. For those patterns, use a gateway like **OpenRouter** or **LiteLLM** as your custom provider base URL — they handle routing, fallback, rate-limit balancing, and multi-model strategies. Point Seedbank at the gateway URL and treat it as a single provider.

---

## Stored Configuration

AI configuration is stored in the server `settings` table under `ai.config`. Public config responses expose model names and whether a key exists, but never key values. All provider API calls are made server-side.

---

## Token Budget & Usage Readout

A **daily token limit** input in Settings → AI & Agents controls how many tokens all AI features can consume in a 24-hour window. Below it, a mono-styled readout shows:

- Tokens used in the last 24 hours (with percentage of budget).
- Tokens used in the last 7 days.

Drawn from the `ai_usage` tracking table. The limit is enforced server-side — requests that would exceed the budget return an error. Setting the limit to `0` disables enforcement.

### Usage & Guardrails advanced controls

Advanced controls support stricter policy and spend constraints:

- **Local-only mode** to block remote-provider execution.
- **Cloud alerts** when selected routes send content off-machine.
- **Provider methods** to enable or disable concrete configured instances. Disabled instances disappear from setup cards and Feature Defaults and are blocked server-side.
- **Per-feature caps** and additional provider/model/instance caps.
- **Model allowlist** to permit only approved model IDs.

---

## Thinking Partner Chat

The Thinking Partner panel is available on the idea detail page. It sees the current idea fields and the persisted conversation history for that idea.

Configure providers in **Settings → AI & Agents** — a small **Settings** link in the panel header navigates there directly.

The system behavior is intentionally constrained:

- Treat the user's idea as the source material, not a prompt to invent unrelated ideas.
- Reflect what is already in the idea.
- Ground questions in the current idea fields, stage, notes, risks, build notes, tags, and scores.
- Ask for missing context when the idea is sparse instead of inventing a generic critique.
- For early-stage ideas, use future-facing planning language and do not imply the project has already been built, dogfooded, measured, or launched unless the notes say so.
- Challenge assumptions gently and tie the challenge to a concrete note.
- Avoid generating unrelated ideas.
- Keep the user's creativity in control.

Preset buttons such as **What If**, **Devil's Advocate**, **Scope Down**, and **User Story** run against fresh current idea context so stale conversation history does not steer them. The visible conversation stores the compact preset label, while the provider receives the full internal prompt.

The **Custom question** field at the bottom of the panel is normal back-and-forth chat. It uses the per-idea Thinking Partner history so you can continue a thread with the assistant while it still sees the current idea context.

Messages are streamed from `POST /api/ai/chat` and persisted per idea.

---

## Contextual Field Suggestions

Field-level AI prompts use `POST /api/ai/suggest`. Each suggestion is shown as a draft — you choose whether to apply it.
Applied suggestions are stored as plain field text. Seedbank preserves line breaks in the field editor, but does not render markdown inside editable idea fields.

Supported fields:

| Field | Prompt goal |
|---|---|
| `pitch` | Sharpen a one-line explanation |
| `fullNotes` | Expand or refine the full notes section |
| `risks` | Identify missing blockers or failure modes |
| `techStack` | Suggest implementation tools and constraints |
| `hook` | Clarify the 30-second demo |
| `whyItMightWork` | Strengthen the argument for the idea |
| `aesthetic` | Refine visual direction and style references |
| `retrospective` | Summarize outcomes, lessons, and carry-forward insights |

---

## Organic Prompt Modes

Organic modes are available in the AI chat panel.

**What If** — returns a compact thought unit: one grounded insight, one actionable next move, and one provocative "what if" question. Good for breaking a stale framing, finding a surprising angle, or exploring inversions or constraints.

**Devil's Advocate** — returns one grounded concern, one actionable way to test or reduce that concern before or during the first build, and one follow-up question. It challenges only assumptions that are actually present in the idea context.

**Scope Down** — returns one grounded insight about the core value, one actionable first-build scope cut, and one question that removes scope without removing that value.

**User Story** — returns one concrete first-use or first-dogfood scenario, one actionable thing to prepare or observe in that scenario, and one follow-up question. For personal daily-driver projects, it focuses on the user's intended repeated workflow rather than inventing an external user.

## Prompt Anchoring and Anti-Hallucination Rules

Field-suggestion and Thinking Partner prompts are explicitly constrained to prevent invented detail and to keep generated text aligned with the user's actual notes.

**Anchored field generation.** Several field suggestions name the upstream field they must use as their source of truth, so the model cannot quietly reframe the project:

| Field | Source-of-truth chain |
|---|---|
| Elevator Pitch | Concept → Raw Notes → The Case → title |
| Concept | Raw Notes → title → Elevator Pitch |
| The Case | Concept → Raw Notes → Elevator Pitch |
| Risks & Blockers | Concept + Build Notes |

If the upstream field is empty, the prompt falls back down the chain rather than inventing a framing.

**Shared anti-hallucination base.** Every per-field Ask AI call carries these rules in its base system prompt: *"do not add audiences, markets, users, deadlines, technologies, or claims that are not supported by the supplied idea context"* and *"treat empty fields as unknown — never invent details to fill the gap."* These apply across all four intent modes (`improve`, `fresh`, `explain`, `playbook`).

**Personal-tool framing.** If the notes describe a personal daily-driver or learning project, prompts ask the model to focus on the user's own workflow, friction, and validation criteria rather than inventing external users, markets, or growth framing.

**Playbook precedence.** When multiple playbooks are active and they would conflict, resolution order is: 1) Honest & Direct, 2) Devil's Advocate, 3) Scope Down, 4) Technical, 5) Marketing. Lower-priority playbooks contribute only where they do not contradict higher-priority ones. Marketing is intentionally last because it tends to invent claims; candor and challenge override it.

---

## Stage-Aware AI Personality

Thinking Partner and field-assist prompts automatically adapt by stage:

- **Seed / Sprout**: exploratory, generative, and momentum-focused.
- **Bloom**: sharpening and critical framing around audience/differentiation.
- **Greenhouse / Plot**: practical execution, feasibility, and concrete next steps.
- **Dormant / Cold Storage**: reflective revival framing.
- **Market**: retrospective synthesis of what worked and what to carry forward.

---

## Idea Health Check

The Idea Health Check appears on the idea detail page. It combines AI summary text with field-by-field readiness feedback for: Pitch, Hook, Why It Might Work, Risks, Tech Stack, and optional Tags.

Each field is marked as strong or needing attention, giving a concrete next editing target. No fields are auto-updated — you decide what to change.

Stage progress is shown separately on the idea detail page. Tags are optional and never block stage movement. If an edit completes the current stage checklist, Seedbank can advance the idea to the next stage automatically; you can also move stages manually at any time.

---

## Smart Cross-Pollinate

Smart Cross-Pollinate lives on the Discover page. Instead of showing only random pairs, Seedbank looks for ideas with useful contrast or shared traits, then asks the AI why they might combine well.

---

## Pattern Insights

Pattern Insights analyze the full archive and surface repeated themes, categories, tags, or constraints.

Example insights:

- Several local-first tools could share infrastructure.
- Multiple game ideas use the same mood or mechanic.
- Several app ideas need the same authentication or sync foundation.

---

## Failure Modes and Fallbacks

If the AI backend is unavailable, Seedbank keeps working:

- The editor still saves.
- Field checks can show deterministic local guidance.
- Discover still has non-AI pattern summaries.
- The Thinking Partner panel reports provider errors without losing the idea.

This preserves Seedbank's core promise: the archive remains useful even without a model provider.

---

## Project Generation

The **Project generation** section on the idea detail page asks the configured **Project drafting** route to generate repo-ready starter files from the current idea. It uses the same provider configuration, account auth, model selection, reasoning effort, token budgets, and guardrails as every other AI assist feature.

The standard outputs are `README.md`, `SPEC.md`, `IMPLEMENTATION_NOTES.md`, and `TODO.md`. The server accepts only safe relative paths, creates or reuses the idea's local project folder, writes files without overwriting existing files, and updates the idea's project path. Canonical idea fields are not overwritten. GitHub publishing remains a separate explicit action from the same section.

See [`docs/PROJECT_DRAFTING.md`](./PROJECT_DRAFTING.md) for the API shape and safety model.

### MCP context for external sessions

For external AI sessions, read-only MCP endpoints expose seeds as context:

| Endpoint | Description |
|---|---|
| `GET /api/mcp/ideas` | Paginated idea list with stage/category filtering |
| `GET /api/mcp/ideas/:id` | Full idea detail with rendered Markdown |
| `GET /api/mcp/search` | Full-text search over ideas |

External/bearer clients should use a token with `mcp:read` scope, created in Settings → API & Server. Local loopback requests can use implicit local auth without bearer token. See [`docs/API.md`](./API.md) for the full MCP surface.
