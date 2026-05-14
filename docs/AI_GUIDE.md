# AI Guide

Seedbank's AI features are designed to help you develop your own ideas. The AI is a thinking partner: it asks questions, reflects gaps, and offers focused suggestions — it does not take over the creative direction, and all features are opt-in.

---

## Provider Setup

Provider configuration lives in **Settings → AI & Agents**. Navigate there via the gear icon (⚙) in the header, or go directly to `/settings/ai-agents`.

### Service-first setup

Settings → AI & Agents is organized by service family first, then connection method:

- **Claude service**: Anthropic API key, Claude account/native OAuth, Claude Code CLI
- **Codex/OpenAI service**: OpenAI API key, Codex account/app-server, Codex CLI
- **Local inference**: Ollama + local OpenAI-compatible servers (LM Studio, vLLM, llama.cpp, LocalAI, custom localhost URL)
- **External/cloud routers**: OpenRouter, Groq, Mistral, Together, Fireworks, custom cloud endpoint

The local and cloud OpenAI-compatible cards are two views of one shared OpenAI-compatible configuration. Saving either card replaces the same preset/base URL/model/key values.

**OpenAI API** — enter your API key and model name (e.g. `gpt-4.1-mini`). Calls are made server-side to `api.openai.com`. Idea content is sent to OpenAI's servers.

**Anthropic API** — enter your API key and model name (e.g. `claude-sonnet-4-20250514`). Calls are made server-side to `api.anthropic.com`. Works well for reflective critique and longer contextual responses. Idea content is sent to Anthropic's servers.

**Ollama** — configure the base URL (usually `http://localhost:11434`) and model name (e.g. `llama3.2`). No API key required. Calls stay on the configured Ollama host. Useful for local-only experimentation or privacy-sensitive archives.

**Custom / OpenAI-compatible endpoint** — choose a preset or enter a compatible endpoint URL, API key when required, and model name. Use this for OpenRouter, Groq, Mistral, Together, Fireworks, LM Studio, vLLM, llama.cpp, LocalAI, or another service that accepts OpenAI Chat Completions requests.

**Claude account** — account-auth method with login/status controls shown in the Claude service area. RC posture is still coming-soon/unavailable for normal production routing.

**Codex account** — experimental account-auth method, available only with explicit server opt-in (`SEEDBANK_ENABLE_CODEX_ACCOUNT`). This is not OpenAI API billing and not the same as linked Codex CLI agent launching.

**Claude Code CLI / Codex CLI** — file-producing agent methods inside their respective service areas. These are review-first development tools, not Feature Defaults chat providers.

### Choosing a default provider

A **Set default** radio button on each provider card determines which provider the Thinking Partner and field suggestions use. The default is stored server-side.

### Provider API keys vs. Seedbank tokens

**Provider API keys** (OpenAI API, Anthropic API, OpenRouter, Groq, Mistral, Together, Fireworks, or another custom endpoint) are credentials for external AI services. They are stored server-side, encrypted at rest. Public API responses expose only booleans such as `hasOpenAIKey`, `hasAnthropicKey`, and `hasOpenAICompatibleKey` — the raw key value is never sent to the browser. All AI calls are proxied through the Seedbank server; the browser has no direct contact with the provider.

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

Feature Defaults let you route each AI feature independently (Thinking Partner, field suggestions, health checks, Discover insights):

- Inherit the global default provider/model, or
- Pin a specific provider/model per feature.
- Route only chat/model-capable methods. CLI agent methods are intentionally excluded from chat routing.

Unavailable account transports can appear as options for visibility, but save is blocked when a route targets unavailable account providers.

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
- **Per-feature caps** and additional provider/model caps.
- **Model allowlist** to permit only approved model IDs.

---

## Thinking Partner Chat

The Thinking Partner panel is available on the idea detail page. It sees the current idea fields and the persisted conversation history for that idea.

Configure providers in **Settings → AI & Agents** — a small **Settings** link in the panel header navigates there directly.

The system behavior is intentionally constrained:

- Ask questions before suggesting.
- Reflect what is already in the idea.
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
| `risks` | Identify missing blockers or failure modes |
| `techStack` | Suggest implementation tools and constraints |
| `hook` | Clarify the 30-second demo |
| `whyItMightWork` | Strengthen the argument for the idea |

---

## Organic Prompt Modes

Organic modes are available in the AI chat panel.

**What If** — asks one provocative "what if" question and waits for the user's response before going further. Good for breaking a stale framing, finding a surprising angle, or exploring inversions or constraints.

**Devil's Advocate** — challenges the weakest assumption in the idea without dismissing it. Good for finding hidden risks, testing whether the idea has a real user, and separating excitement from evidence.

**Scope Down** — pushes the idea toward the smallest viable test. Good for jam projects, first prototypes, and reducing a broad concept to one screen, one mechanic, or one workflow.

**User Story** — asks about a specific person in a specific situation. Good for clarifying who the idea serves, avoiding abstract feature lists, and finding the moment of need.

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

## Agents (separate surface)

The **Develop with agent** and **Continue with agent** buttons on the idea detail page launch a strictly opt-in, more powerful feature: a local Claude Code or Codex CLI agent that can produce multi-file outputs (specs, research docs, prototype scaffolds). Agents are distinct from the Thinking Partner — they write files, not chat messages.

### How agents authenticate

Agents use their **own** CLI-managed authentication — not Seedbank's provider API keys. Claude Code authenticates via `claude auth login` (or `ANTHROPIC_API_KEY` in the environment); Codex CLI uses `OPENAI_API_KEY` or its own config. Seedbank only stores the binary path and a linked flag. No agent credentials are stored in or passed through Seedbank.

Agents inherit the environment variables of the Seedbank server process. If `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` is set in that environment, the agent will pick it up. This is the standard CLI auth mechanism — it is not a Seedbank feature.

### Workspace boundaries

Seedbank sets the agent's working directory to a per-idea scratch workspace and validates all applied file paths for directory traversal. The agent process is **not OS-sandboxed** — it can access your filesystem with the same permissions as the Seedbank server process. Only link agent binaries you trust.

### Transcript and output handling

The agent transcript streams live in the panel. When the agent proposes file changes, a checklist appears — you select which files to accept before anything is saved. No file is written without explicit approval.

Transcripts are stored per-run in the Seedbank database. Previous run transcripts are visible from the idea detail page via the **Continue with agent** button.

### Runtime controls

- **Runtime cap:** 5 minutes per run, 30-minute absolute maximum.
- **Kill button:** always visible in the agent panel; terminates the process immediately.
- No output auto-writes to canonical idea fields.

### MCP context for agent sessions

For external agent sessions (outside Seedbank's own agent runner), read-only MCP endpoints expose seeds as context:

| Endpoint | Description |
|---|---|
| `GET /api/mcp/ideas` | Paginated idea list with stage/category filtering |
| `GET /api/mcp/ideas/:id` | Full idea detail with rendered Markdown |
| `GET /api/mcp/search` | Full-text search over ideas |

All MCP endpoints require a bearer token with `mcp:read` scope, created in Settings → API & Server. See [`docs/API.md`](./API.md) for the full MCP surface.
