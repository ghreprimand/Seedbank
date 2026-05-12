# Agents

Seedbank can link a local **Claude Code** or **Codex CLI** agent to help develop an idea further. Agents are a *tool*, not an autonomous co-creator: they run in a sandboxed scratch workspace, produce proposed files, and stop. Every file they produce must be explicitly accepted by you before it touches your idea record.

---

## Philosophy

The Thinking Partner (inline AI chat) stays in the question-and-reflection posture documented in [AI_GUIDE.md](./AI_GUIDE.md). Agents are a separate, more powerful surface: they can write multi-file outputs. The tradeoffs are:

- Agents can write `SPEC.md`, `RESEARCH.md`, prototype code, etc. in one pass.
- They operate on a **read-only copy** of your idea fields — not on the idea directly.
- Every proposed file is a whole-file accept/reject decision. There is no partial-apply.
- Canonical idea fields (pitch, hook, why it might work, risks, tags, etc.) are **never** overwritten automatically.

---

## Linking an agent

Go to **Settings → AI & Agents → Agents**.

### Claude Code

Claude Code is Anthropic's official CLI (`claude`). To link it:

1. Install Claude Code: `npm install -g @anthropic-ai/claude-code` (or follow the official install instructions).
2. Authenticate Claude Code with your Anthropic account outside Seedbank (run `claude` once; it will prompt for auth).
3. In Seedbank, enter the path to the binary (e.g. `/usr/local/bin/claude`) **or** leave the path blank and click **Detect** to find it on `$PATH`.
4. Click **Link**. The server runs `claude --version` to validate and stores the resolved path.

### Codex CLI

Codex CLI is OpenAI's open-source CLI (`codex`). To link it:

1. Install: `npm install -g @openai/codex` (or follow the official install instructions).
2. Set up your OpenAI credentials via the CLI or `OPENAI_API_KEY` environment variable.
3. In Seedbank, enter the binary path or use **Detect**.
4. Click **Link**.

### What Seedbank stores

- The resolved binary path (server-side only, in the `settings` table under `agents.config`).
- The version string returned by `--version`.
- A `linkedAt` timestamp.
- A boolean `claudeLinked` / `codexLinked` flag (visible to the UI as a `hasX` status).

**No API keys or session tokens are stored by Seedbank.** The linked CLI manages its own credentials (keychain, config files, environment variables) outside the Seedbank process. When Seedbank spawns the agent, it inherits the server process's environment — the CLI finds its own credentials through normal means.

---

## Two agent surfaces

### "Develop with agent" (Idea detail → scratch workspace)

Available from the idea detail page once at least one agent is linked. A button labeled **Develop with agent** appears next to the Thinking Partner chat panel.

**What happens:**

1. A modal panel opens. You choose the agent (if both are linked) and write an initial prompt — for example, *"Write a SPEC.md, a RESEARCH.md, and a prototype outline based on the idea fields below."*
2. Click **Start**. The server creates a scratch workspace at:
   ```
   ~/.seedbank/scratch/<ideaId>/<runId>/
   ```
   and seeds it with `IDEA.md` (all idea fields as Markdown) and optionally `ATTACHMENTS.md` (a list of existing attachment paths if the idea has any).
3. The agent CLI is spawned with your prompt in that workspace. Its stdout/stderr is streamed in real time to the **Transcript** pane inside the modal.
4. When the run ends (completed, stopped, or failed), the server walks the workspace, collects all files it wrote (excluding `IDEA.md` and `ATTACHMENTS.md`), and returns the list as **proposed files**.
5. You review the file list (expandable per-file), select the ones you want, and click **Apply selected files**. Selected files are copied to:
   ```
   ~/.seedbank/attachments/<ideaId>/<runId>/
   ```
   and added to the idea's attachment list (`idea.images`). Nothing else on the idea changes.

### "Continue with agent" (Graduated projects)

Available on the idea detail page after an idea has been graduated via an integration (Archon or Generic project). A **Continue with agent** button appears in the graduation banner.

**What happens:**

The same modal panel opens, but instead of a scratch workspace the agent receives the existing graduated project directory as its working directory. The project path is the `graduatedTo` value from the graduation result. The path must be inside a configured integration project root (Archon root or generic project root) — the server validates this before spawning.

Proposed-file collection does not run in Continue mode (the project already has existing files). The transcript is still streamed and persisted.

---

## Safety rails (A6)

### Runtime cap

Each run has a hard timeout, configurable in `agents.config.runtimeCapMinutes`.

| Setting | Default | Maximum |
|---------|---------|---------|
| `runtimeCapMinutes` | 5 minutes | 30 minutes |

When the cap is reached, the server sends `SIGTERM` to the agent process. After 5 seconds, if the process has not exited, it is sent `SIGKILL`.

### Daily run budget

A per-day limit on the number of agent runs, configurable in `agents.config.dailyRunBudget` (default: 20 runs per 24-hour window). This prevents accidental runaway loops or scripts from exhausting CLI quota.

### Kill switch

A **Stop** button is visible in the agent modal for the entire duration of the run. Clicking it:

1. Aborts the SSE stream from the browser side.
2. Sends a `POST /api/agents/runs/:id/stop` request, which sends `SIGTERM` to the agent process (SIGKILL after 5 seconds if needed).
3. Updates the run status to `stopped` and finalizes the transcript.

### Transcript persistence

All agent stdout and stderr is written to:
```
~/.seedbank/agent-runs/<runId>.log
```
Transcripts are capped at 256 KB. If the cap is reached, a `...[truncated at 256KB]` marker is appended and further output is dropped. Transcripts are not automatically deleted — they remain available for inspection.

### No silent canonical-field writes

The Apply step copies files to `attachments/` and adds them to `idea.images`. The Thinking Partner's "Apply to Pitch / Hook / …" confirm flow is the only path to overwriting canonical fields, and it is entirely separate from the agent surface. Agents cannot trigger it.

---

## Filesystem boundaries

### Scratch runs

The agent's working directory is `~/.seedbank/scratch/<ideaId>/<runId>/`. Files created anywhere under this directory are eligible to be collected as proposed files. The server validates that any applied file path is inside the workspace before copying it — symlinks that escape the sandbox are rejected.

### Continue runs

The agent works inside the graduated project directory. The server validates that the `projectPath` is inside a configured integration root (Archon project root or generic project root) before spawning. Absolute paths and paths with `..` traversal are rejected.

### Data directory

The default data directory is `~/.seedbank/` (override with `SEEDBANK_DATA_DIR`). All agent artifacts (scratch workspaces, transcripts, attachments) live inside it.

---

## MCP read-only context

External Claude or Codex sessions can also pull ideas from Seedbank directly using the MCP-style read endpoints. This does not involve the agent runner — it is a separate API surface for providing idea context to an agent running entirely outside Seedbank.

See [docs/SETTINGS.md — API & Server — MCP](./SETTINGS.md#mcp-model-context-protocol-endpoints) for endpoint details and the filesystem path exposure caveat.

---

## What agents cannot do

- Modify or delete ideas in the database.
- Access any file outside the sandbox directory (scratch run) or integration project root (continue run).
- Run multiple concurrent runs for the same idea (the daily budget and runtime cap apply globally).
- Auto-apply files — every file must go through the user's explicit accept step.
- Access other ideas in the archive (the workspace only contains `IDEA.md` for the specific idea).
- Contact external network addresses other than those the CLI itself is configured to reach (e.g. the provider's API).

---

## Troubleshooting

**Agent fails to start immediately.**
The server logs the exact error. Common causes: the CLI binary is not executable, the CLI's credentials are expired, or the daily run budget has been reached.

**`claude --version` fails during linking.**
Ensure `claude` is installed and that its setup has been completed (the first-run authentication). On some systems the binary is in `~/.npm-global/bin/` or a similar location not on the default server `$PATH` — in that case enter the full absolute path manually.

**Transcript appears empty.**
Some CLI versions buffer stdout heavily. The transcript is assembled from the persisted log file after the run ends; a zero-byte transcript may indicate the CLI exited immediately without writing to stdout (check for a `[stderr]` prefix in the transcript for error details).

**Files not appearing in proposed-file list after run.**
The server collects files written anywhere under the scratch workspace except `IDEA.md` and `ATTACHMENTS.md`. If the agent wrote files to an absolute path outside the workspace, they will not be collected. Review the transcript for the agent's file-creation steps.
