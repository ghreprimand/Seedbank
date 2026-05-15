# AI Guide

Seedbank's AI features are designed to help you develop your own ideas. The AI is a thinking partner: it asks questions, reflects gaps, and offers focused suggestions — it does not take over the creative direction, and all features are opt-in.

---

## Provider Setup

Provider configuration lives in **Settings → AI & Agents**. Navigate there via the gear icon (⚙) in the header, or go directly to `/settings/ai-agents`.

### Service-first setup

Settings → AI & Agents is organized by service family first, then connection method:

- **Claude service**: Anthropic API key, Claude account native OAuth
- **Codex/OpenAI service**: OpenAI API key, Codex account app-server auth
- **Local inference**: Ollama plus as many local OpenAI-compatible servers as you configure (LM Studio, vLLM, llama.cpp, LocalAI, custom localhost URL)
- **External/cloud routers**: OpenRouter, Groq, Mistral, Together, Fireworks, or other custom cloud endpoints

Each provider method is stored as a provider instance. Built-in instances cover OpenAI API, Anthropic API, Claude account, Codex account, Ollama, local OpenAI-compatible, and cloud OpenAI-compatible. You can also add additional local or external instances, such as "LM Studio laptop", "Ollama server", "OpenRouter personal", or "Groq work". Each saved instance has its own label, URL, model list, enabled state, health/probe status, and routing identity.

**OpenAI API** — enter your API key and model name (e.g. `gpt-4.1-mini`). Calls are made server-side to `api.openai.com`. Idea content is sent to OpenAI's servers.

**Anthropic API** — enter your API key and model name (e.g. `claude-sonnet-4-20250514`). Calls are made server-side to `api.anthropic.com`. Works well for reflective critique and longer contextual responses. Idea content is sent to Anthropic's servers.

**Ollama** — configure the base URL (usually `http://localhost:11434`) and model name (e.g. `llama3.2`). No API key required. Calls stay on the configured Ollama host. Useful for local-only experimentation or privacy-sensitive archives.

**Custom / OpenAI-compatible endpoint** — choose a preset or enter a compatible endpoint URL, API key when required, and model name. Use this for OpenRouter, Groq, Mistral, Together, Fireworks, LM Studio, vLLM, llama.cpp, LocalAI, or another service that accepts OpenAI Chat Completions requests. Local and cloud instances are stored separately so a local LM Studio server does not overwrite an OpenRouter setup.

**Claude account** — account-auth method with login/status controls shown in the Claude service area. Use this to route AI chat through a Claude.ai subscription with Seedbank's native OAuth flow rather than an Anthropic API key.

**Codex account** — account-auth method that talks to the local Codex app-server over JSON-RPC. This requires a compatible Codex runtime installed locally. It is not OpenAI API billing.

### Account reauth notices

Claude account and Codex account can require reauth if their underlying account session expires or becomes unavailable. When this browser previously saw one of those account transports authenticated, but the current server status says auth is missing, Seedbank shows a persistent reauth notice in the app shell. The notice links directly to **Settings → AI & Agents** (`/settings/ai-agents`) so you can sign in again from the right account card.

The reminder is intentionally local and minimal: it stores only a browser-side flag that the account was seen authenticated before. It does not store provider credentials. Logging out from the Claude or Codex account card clears the reminder for that account.

### Model discovery and saved instances

When a provider becomes usable, Seedbank tries to discover available models and persists them under that provider instance. Discovery runs after API-key saves, Claude/Codex account login/status checks, manual **List saved models**, server startup, and a background refresh cycle. Provider cards show how many models are available, and expanded cards show a preview of the catalog.

For broad catalog providers such as OpenRouter, you can choose which discovered models are enabled in Seedbank. Enabled models are the ones shown in Feature Defaults and in Ask AI's temporary provider/model picker.

The provider health badge is also stored per instance. If you test an Ollama server and it connects, leaving and returning to Settings keeps the card visibly connected until a later probe changes that status.

### Choosing a default provider

A **Set default** radio button on each provider card sets the global default provider instance. Feature Defaults can inherit that global default or override it per feature. The global default also has a default model and effort selector in Feature Defaults.

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

Unavailable account transports can appear as options for visibility, but save is blocked when a route targets unavailable account providers.

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

- Ask questions before suggesting.
- Reflect what is already in the idea.
- Ground questions in the current idea fields, stage, notes, risks, build notes, tags, and scores.
- Ask for missing context when the idea is sparse instead of inventing a generic critique.
- Challenge assumptions gently.
- Avoid generating unrelated ideas.
- Keep the user's creativity in control.

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

**What If** — asks one provocative "what if" question and waits for the user's response before going further. Good for breaking a stale framing, finding a surprising angle, or exploring inversions or constraints.

**Devil's Advocate** — challenges the weakest assumption that is actually present in the idea context without dismissing it. If the idea is too sparse, it asks for the missing detail needed to identify a real risk.

**Scope Down** — pushes the idea toward the smallest feasible version. Good for first prototypes and reducing a broad concept to one screen, one mechanic, or one workflow.

**User Story** — asks about a specific person in a specific situation. Good for clarifying who the idea serves, avoiding abstract feature lists, and finding the moment of need.

## Stage-Aware AI Personality

Thinking Partner and field-assist prompts automatically adapt by stage:

- **Seed / Sprout**: exploratory, generative, and momentum-focused.
- **Bloom**: sharpening and critical framing around audience/differentiation.
- **Greenhouse / Plot**: practical execution, feasibility, and concrete next steps.
- **Dormant / Cold Storage**: reflective revival framing.
- **Market**: retrospective synthesis of what worked and what to carry forward.

---

## Idea Health Check

The Idea Health Check appears on the idea detail page. It combines AI summary text with field-by-field readiness feedback for: Pitch, Hook, Why It Might Work, Risks, Tech Stack, and Tags.

Each field is marked as strong or needing attention, giving a concrete next editing target. No fields are auto-updated — you decide what to change.

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
