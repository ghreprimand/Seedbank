/**
 * Seedbank In-App Manual — structured content source.
 *
 * Each section has a stable `id` used for deep-linking (?help=agents),
 * a `title`, optional `keywords` for search, and `content` in plain text /
 * lightweight markdown-ish strings rendered as paragraphs + bullets.
 *
 * Add new sections here; the ManualModal auto-picks them up.
 */

export interface ManualSection {
  id: string;
  title: string;
  /** Short label used in the index sidebar. Falls back to title. */
  indexLabel?: string;
  keywords: string[];
  /**
   * Body content as an array of blocks.
   * 'h3' → sub-heading, 'p' → paragraph, 'ul' → bullet list, 'tip' → callout box.
   */
  blocks: ManualBlock[];
}

export type ManualBlock =
  | { type: 'p'; text: string }
  | { type: 'h3'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'tip'; text: string }
  | { type: 'kbd'; keys: string[]; description: string };

export interface ManualGroup {
  label: string;
  sections: ManualSection[];
}

// ── Content ──────────────────────────────────────────────────────────────────

export const MANUAL_GROUPS: ManualGroup[] = [
  {
    label: 'Getting Started',
    sections: [
      {
        id: 'overview',
        title: 'What is Seedbank?',
        keywords: ['overview', 'about', 'intro', 'what is', 'seedbank', 'start'],
        blocks: [
          { type: 'p', text: 'Seedbank is a personal idea vault for people who collect more sparks than they can build immediately. Ideas are stored in a local SQLite database, backed up automatically, and cached in the browser as an offline fallback when the server is unreachable.' },
          { type: 'p', text: 'The app is built around the way ideas actually mature. A seed can start as a title and a messy paragraph, then gain a pitch, hook, risks, tech-stack notes, links, related ideas, scores, and version history.' },
          { type: 'h3', text: 'Key concepts' },
          { type: 'ul', items: [
            'Seeds — individual ideas with fields, stages, scores, and history.',
            'Garden — the main board view. Filter, search, and organise seeds.',
            'Stages — the lifecycle from Seed through to Shipped.',
            'Thinking Partner — the AI chat assistant, framed as a collaborator, not a generator.',
            'Graduation — turning a mature idea into a real project scaffold.',
          ]},
          { type: 'tip', text: 'Press N anywhere to capture a new idea quickly. Press / to jump to search.' },
        ],
      },
      {
        id: 'quick-start',
        title: 'Quick Start',
        keywords: ['quick start', 'new idea', 'capture', 'plant', 'seed', 'getting started'],
        blocks: [
          { type: 'p', text: 'Run npm start from the project root. Open http://localhost:5173 in your browser.' },
          { type: 'h3', text: 'Capture your first idea' },
          { type: 'ul', items: [
            'Click "Plant a Seed" (top-right) or press N.',
            'Give it a title — that\'s all that\'s required.',
            'Add notes, a pitch, or any other fields you have now.',
            'Save. The idea lands in your Garden at the Seed stage.',
          ]},
          { type: 'h3', text: 'Keyboard shortcuts' },
          { type: 'kbd', keys: ['N'], description: 'Open quick capture' },
          { type: 'kbd', keys: ['/'], description: 'Focus search' },
          { type: 'kbd', keys: ['Esc'], description: 'Close modal / clear focus' },
          { type: 'kbd', keys: ['?'], description: 'Open this manual' },
        ],
      },
    ],
  },

  {
    label: 'Garden & Ideas',
    sections: [
      {
        id: 'garden',
        title: 'The Garden',
        keywords: ['garden', 'board', 'list', 'filter', 'sort', 'search', 'view'],
        blocks: [
          { type: 'p', text: 'The Garden is the main idea board. It shows all active ideas as cards you can filter, search, and sort.' },
          { type: 'h3', text: 'Filtering' },
          { type: 'ul', items: [
            'Stage — show only ideas at a particular lifecycle stage.',
            'Category — filter by type (App, Game, Tool, etc.).',
            'Search — full-text across title, pitch, notes, and tags.',
            'Multiple filters combine with AND logic.',
          ]},
          { type: 'h3', text: 'Sorting' },
          { type: 'ul', items: [
            'Updated — most recently changed ideas first (default).',
            'Created — newest ideas first.',
            'Score — highest-scored ideas first.',
            'Title — alphabetical.',
          ]},
          { type: 'tip', text: 'Shelved and Cold Storage ideas are hidden by default. Use the stage filter to find them.' },
        ],
      },
      {
        id: 'idea-editing',
        title: 'Editing an Idea',
        keywords: ['edit', 'idea', 'fields', 'title', 'pitch', 'notes', 'hook', 'risks', 'tech stack', 'tags', 'links', 'score', 'save'],
        blocks: [
          { type: 'p', text: 'Click any idea card to open the detail view. Fields auto-save after a short debounce — you rarely need to click Save.' },
          { type: 'h3', text: 'Core fields' },
          { type: 'ul', items: [
            'Title — the name of the idea.',
            'Notes — raw thinking, questions, links, anything.',
            'Pitch — a concise one-paragraph sell (used by health check).',
            'Hook — the memorable one-liner.',
            'Why it might work — your most optimistic case.',
            'Risks — what could go wrong.',
            'Tech stack — intended technology.',
            'Tags — freeform labels for cross-cutting themes.',
            'Links — reference URLs (documentation, inspiration, prior art).',
            'Related ideas — cross-link seeds that share territory.',
          ]},
          { type: 'h3', text: 'Scores' },
          { type: 'p', text: 'Rate excitement (🔥), effort (⚡), and market (🌍) on a 1–5 scale. Scores are used for sorting and health checks.' },
          { type: 'tip', text: 'Use the AI suggestion button (✨) next to a field to get a context-aware draft. You stay in control — suggestions are never auto-applied.' },
        ],
      },
      {
        id: 'stages',
        title: 'Lifecycle Stages',
        keywords: ['stage', 'lifecycle', 'seed', 'sprout', 'pitch', 'prototype', 'plot', 'shelved', 'cold storage', 'shipped', 'status'],
        blocks: [
          { type: 'p', text: 'Every idea moves through gardening-themed stages that reflect how developed it is.' },
          { type: 'ul', items: [
            '🌱 Seed — rough / new / just captured.',
            '🌿 Sprout — stronger concept, some structure.',
            '📋 Pitch — developed enough to explain clearly.',
            '🔨 Prototype — actively being built or experimented with.',
            '🌳 Plot — full active project.',
            '❄️ Shelved — paused but preserved.',
            '🗄️ Cold Storage — deep archive, still searchable.',
            '🚀 Shipped — done, released, or completed.',
          ]},
          { type: 'tip', text: 'Change stage from the idea detail page or by using the Graduation flow for Shipped.' },
        ],
      },
      {
        id: 'categories',
        title: 'Categories',
        keywords: ['category', 'type', 'app', 'game', 'tool', 'art', 'mobile', 'browser', 'open source', 'custom', 'rename', 'add'],
        blocks: [
          { type: 'p', text: 'Categories describe what kind of project an idea is. They appear as badges on idea cards and can be used to filter your garden.' },
          { type: 'ul', items: [
            'App, Game, Tool, Art Project',
            'Local AI, Mobile, Browser, Open-Source Utility',
          ]},
          { type: 'p', text: 'You can add your own categories, rename the built-ins, change their colors and icons, and reorder them. Go to Settings → Categories to manage your taxonomy.' },
          { type: 'tip', text: 'Categories are optional — a seed doesn\'t need one to be valid.' },
        ],
      },
      {
        id: 'version-history',
        title: 'Version History',
        keywords: ['version', 'history', 'snapshot', 'restore', 'undo', 'timeline'],
        blocks: [
          { type: 'p', text: 'Seedbank automatically creates version snapshots when you make meaningful edits. You can also create a manual snapshot any time.' },
          { type: 'h3', text: 'Viewing history' },
          { type: 'p', text: 'Open an idea and click the clock icon or "Version history" link. Each snapshot shows a timestamp and a label.' },
          { type: 'h3', text: 'Restoring a version' },
          { type: 'p', text: 'Click Restore on any snapshot. The current state becomes a new snapshot first, so you can undo the restore.' },
          { type: 'tip', text: 'Auto-snapshots only trigger on content changes (not score tweaks). Use manual snapshots to bookmark important moments.' },
        ],
      },
      {
        id: 'compost',
        title: 'Compost Bin',
        keywords: ['compost', 'delete', 'trash', 'restore', 'purge', 'recover', 'bin'],
        blocks: [
          { type: 'p', text: 'Deleted ideas go to Compost, not permanent deletion. They stay there for 30 days before being purged.' },
          { type: 'h3', text: 'Access Compost' },
          { type: 'p', text: 'Click the trash icon in the header. You can restore any idea or permanently delete it before the 30-day window.' },
          { type: 'tip', text: 'Compost is purged automatically on server startup and periodically while the server is running.' },
        ],
      },
    ],
  },

  {
    label: 'Discovery & AI',
    sections: [
      {
        id: 'health-check',
        title: 'Idea Health Check',
        keywords: ['health check', 'completeness', 'readiness', 'score', 'gaps', 'feedback', 'ai'],
        blocks: [
          { type: 'p', text: 'The Health Check analyses your idea against a completeness rubric and returns field-by-field feedback.' },
          { type: 'h3', text: 'What it checks' },
          { type: 'ul', items: [
            'Pitch clarity and length.',
            'Hook presence.',
            'Risks acknowledgement.',
            'Tech-stack specificity.',
            'Excitement / effort / market score balance.',
          ]},
          { type: 'p', text: 'Run it from the idea detail page using the health icon or the Thinking Partner chat. No fields are auto-updated — you decide what to change.' },
          { type: 'tip', text: 'Health Check works best when Pitch and Hook fields have some content.' },
        ],
      },
      {
        id: 'thinking-partner',
        title: 'Thinking Partner',
        keywords: ['thinking partner', 'ai', 'chat', 'conversation', 'assistant', 'openai', 'anthropic', 'ollama', 'provider', 'key'],
        blocks: [
          { type: 'p', text: 'The Thinking Partner is an AI chat panel attached to each idea. It asks questions, reflects patterns, and helps scope ideas — it doesn\'t generate ideas for you.' },
          { type: 'h3', text: 'Prompt modes' },
          { type: 'ul', items: [
            'What If — explores alternative directions.',
            'Devil\'s Advocate — challenges assumptions.',
            'Scope Down — finds a smallest viable version.',
            'User Story — frames the idea from a user\'s perspective.',
          ]},
          { type: 'h3', text: 'Provider' },
          { type: 'p', text: 'By default the Thinking Partner uses the global AI provider set in Settings → AI & Agents. You can route it to a different provider or model in Settings → AI & Agents → Feature Defaults → Thinking Partner. Built-in provider types are OpenAI API, Anthropic API, Ollama / local models, and OpenRouter / custom endpoint (OpenRouter, Groq, LM Studio, vLLM, and similar).' },
          { type: 'tip', text: 'Conversation history is saved per idea. Picking up where you left off is automatic.' },
        ],
      },
      {
        id: 'ai-suggestions',
        title: 'AI Field Suggestions',
        keywords: ['suggestion', 'ai', 'field', 'pitch', 'hook', 'risks', 'tech stack', 'draft', 'generate', 'guided', 'modal', 'intent', 'playbook', 'refine', 'conversation', 'apply', 'improve', 'fresh', 'explain'],
        blocks: [
          { type: 'p', text: 'Fields like Pitch, Hook, Why It Might Work, Risks, and Tech Stack have a ✨ button that opens the AI Assistance modal. You choose how you want help, review the result, and apply only what you want.' },
          { type: 'h3', text: 'Choosing an intent' },
          { type: 'p', text: 'The modal opens with an intent selection step. Pick the mode that fits your situation:' },
          { type: 'ul', items: [
            '✏️ Improve this field — rewrites the existing value while preserving your intent.',
            '🌱 Write from scratch — generates a fresh draft, ignoring the current value entirely.',
            '🔍 Expand my draft — adds depth and detail to what is already there.',
            '💬 Ask a question — opens a short conversation scoped to this field. Not saved to Thinking Partner.',
          ]},
          { type: 'h3', text: 'Playbooks' },
          { type: 'p', text: 'Expand the Playbooks panel to apply a named prompt template. Available playbooks vary by field:' },
          { type: 'ul', items: [
            'Marketing pitch — leads with the clear benefit for the target user.',
            'Jam / hackathon — frames the smallest version that could ship in a weekend.',
            'Honest & direct — plain language, no buzzwords.',
            'Surface hidden risks — non-obvious failure modes and assumptions.',
            'Technical depth — concrete stack choices and trade-offs.',
          ]},
          { type: 'h3', text: 'Review, refine, and apply' },
          { type: 'p', text: 'After the AI runs you see a side-by-side view of your current value and the suggestion. Three actions are available:' },
          { type: 'ul', items: [
            'Apply — replaces the field value with the suggestion.',
            'Refine… — adds a follow-up instruction ("Make it shorter", "More technical") and re-runs.',
            'Reject — discards the suggestion and returns to intent selection.',
          ]},
          { type: 'h3', text: 'Conversation mode' },
          { type: 'p', text: 'When you choose Ask a question, a short chat panel opens for this field only. This conversation is not saved to the idea\'s Thinking Partner history. Type your question and use "Apply to field" on any assistant reply to use it.' },
          { type: 'h3', text: 'Which provider is used' },
          { type: 'p', text: 'The provider badge in the modal header shows which AI model will handle the request. Field suggestions use the provider set in Settings → AI & Agents → Feature Defaults → Field suggestions. If no override is set, the global default is used.' },
          { type: 'tip', text: 'Suggestions work best when the title and notes have context. Sparse ideas get generic results.' },
        ],
      },
      {
        id: 'discover',
        title: 'Discover Page',
        keywords: ['discover', 'daily', 'random', 'cross-pollinate', 'pattern', 'insights', 'weather', 'draw'],
        blocks: [
          { type: 'p', text: 'The Discover page surfaces ideas and connections you might not think of while looking at the full board.' },
          { type: 'h3', text: 'Tools' },
          { type: 'ul', items: [
            'Daily Seed — one idea highlighted for today.',
            'Draw from Storage — randomly surfaces a shelved or cold-storage idea.',
            'Cross-Pollinate — finds pairs of ideas that share territory.',
            'Pattern Insights — AI analysis of themes and gaps across your whole garden.',
            'Idea Weather — a playful summary of your idea portfolio health.',
          ]},
        ],
      },
    ],
  },

  {
    label: 'Agents',
    sections: [
      {
        id: 'agents',
        title: 'AI Agents (CLI)',
        indexLabel: 'Agents Overview',
        keywords: ['agent', 'claude code', 'codex', 'cli', 'run', 'develop', 'generate', 'scaffold', 'transcript', 'auth', 'environment'],
        blocks: [
          { type: 'p', text: 'Seedbank can launch a local CLI agent (Claude Code or Codex CLI) against a scratch workspace seeded with your idea\'s content. This is separate from the Thinking Partner chat and is strictly opt-in.' },
          { type: 'h3', text: 'Linking an agent' },
          { type: 'p', text: 'Go to Settings → AI & Agents. Expand the Claude Code or Codex CLI card, enter the binary path, and click Link. Seedbank runs --version to confirm the binary exists and stores the version. You can also use the detect button to search $PATH automatically.' },
          { type: 'h3', text: 'Agent authentication' },
          { type: 'p', text: 'Agents use their own CLI-managed credentials — not Seedbank\'s provider API keys. Claude Code authenticates via "claude auth login" or ANTHROPIC_API_KEY in the environment. Codex CLI uses OPENAI_API_KEY or its own config. Seedbank stores only the binary path and a linked flag.' },
          { type: 'h3', text: 'Develop with agent' },
          { type: 'p', text: 'On any idea detail page, click "Develop with agent". The agent receives the idea as a markdown brief and works in a scratch workspace. Its transcript streams live in the panel. Previous run transcripts are accessible via "Continue with agent".' },
          { type: 'h3', text: 'Accepting changes' },
          { type: 'p', text: 'When the agent proposes files, a checklist appears. You select which files to accept before anything is saved. No file is written without your explicit approval.' },
          { type: 'tip', text: 'Seedbank stores only the binary path and a linked flag — your provider API keys and agent credentials are never stored in or passed through Seedbank.' },
        ],
      },
      {
        id: 'agent-safety',
        title: 'Agent Safety Rails',
        keywords: ['agent', 'safety', 'kill', 'timeout', 'cap', 'security', 'filesystem', 'workspace', 'boundary'],
        blocks: [
          { type: 'p', text: 'Agent runs are time-capped and require explicit review before any output is saved.' },
          { type: 'ul', items: [
            'Seedbank sets the working directory to a per-idea scratch workspace and validates applied file paths to prevent directory traversal.',
            'The agent process is not OS-sandboxed — it can access your filesystem with the same permissions as the Seedbank server process. Only link binaries you trust.',
            'Agents inherit the environment variables of the Seedbank server process, which is how CLI auth (ANTHROPIC_API_KEY, OPENAI_API_KEY) is passed through.',
            'Runtime cap: 5 minutes per run, 30-minute absolute maximum.',
            'A Kill button is always visible in the agent panel; it terminates the process immediately.',
            'No agent output auto-writes to your canonical idea fields.',
            'Every proposed file change requires explicit accept/reject before it is saved.',
          ]},
          { type: 'tip', text: 'If a run gets stuck, use the Kill button. The scratch workspace is preserved for review and cleaned up on your next session.' },
        ],
      },
    ],
  },

  {
    label: 'Settings',
    sections: [
      {
        id: 'settings-general',
        title: 'Settings — General',
        indexLabel: 'General',
        keywords: ['settings', 'general', 'import', 'export', 'keyboard', 'shortcuts'],
        blocks: [
          { type: 'p', text: 'Settings → General contains import/export controls and a keyboard shortcut reference.' },
          { type: 'h3', text: 'Import / Export' },
          { type: 'ul', items: [
            'Export JSON — full archive of all ideas and version history.',
            'Export Markdown — human-readable single-file export.',
            'Import — accepts Seedbank JSON archives and Markdown files.',
          ]},
          { type: 'h3', text: 'Keyboard shortcuts' },
          { type: 'ul', items: [
            'N — open quick capture.',
            '/ — focus search.',
            '? — open this manual.',
            'Esc — close modals.',
          ]},
        ],
      },
      {
        id: 'provider-chooser',
        title: 'Which AI Provider Should I Use?',
        indexLabel: 'Choosing a Provider',
        keywords: ['provider', 'choose', 'which', 'claude', 'openai', 'anthropic', 'ollama', 'openrouter', 'subscription', 'api key', 'local', 'decision', 'guide'],
        blocks: [
          { type: 'p', text: 'Not sure which provider to pick? Use this guide to match your situation.' },
          { type: 'h3', text: 'I have a Claude subscription (claude.ai)' },
          { type: 'p', text: 'Native Claude account support is planned. In the meantime, use the Anthropic API provider with an Anthropic API key — visit console.anthropic.com to create one.' },
          { type: 'h3', text: 'I have a ChatGPT or OpenAI account' },
          { type: 'p', text: 'ChatGPT is a separate product from the OpenAI API. To use Seedbank with OpenAI models, create an API key at platform.openai.com and enter it in the OpenAI API provider card. API usage is billed separately from a ChatGPT subscription.' },
          { type: 'h3', text: 'I have an Anthropic API key' },
          { type: 'p', text: 'Choose the Anthropic API provider, enter your API key, set a model (e.g. claude-sonnet-4-5 or claude-3-5-haiku-20241022), and set it as the global default. Your idea content is sent to Anthropic\'s servers when AI features run.' },
          { type: 'h3', text: 'I have an OpenAI API key' },
          { type: 'p', text: 'Choose the OpenAI API provider, enter your API key, set a model (e.g. gpt-4o or gpt-4o-mini), and set it as the global default. Your idea content is sent to OpenAI\'s servers when AI features run.' },
          { type: 'h3', text: 'I run Ollama locally' },
          { type: 'p', text: 'Ollama runs AI models on your own machine. Choose the Ollama provider, set the base URL (default: http://localhost:11434), and enter the name of a model you have pulled (e.g. llama3.2 or mistral). No API key is needed. Idea content stays on your configured Ollama host.' },
          { type: 'h3', text: 'I use OpenRouter (or Groq, Mistral, LM Studio, vLLM, etc.)' },
          { type: 'p', text: 'Choose OpenRouter / custom endpoint. Enter your API key (for cloud services like OpenRouter, Groq, and Mistral) or leave it blank (for local servers like LM Studio, vLLM, llama.cpp, and LocalAI). Use the preset selector to populate the base URL quickly, then enter the model name.' },
          { type: 'tip', text: 'To keep all AI inference private on this machine, use Ollama or a local custom endpoint (LM Studio, vLLM, or llama.cpp) at a localhost URL and enable Local-only mode in Usage & Guardrails.' },
        ],
      },
      {
        id: 'settings-ai',
        title: 'Settings — AI & Agents',
        indexLabel: 'AI & Agents',
        keywords: ['settings', 'ai', 'agents', 'provider', 'openai', 'anthropic', 'ollama', 'custom', 'openrouter', 'api key', 'model', 'budget', 'token', 'link', 'claude code', 'codex', 'feature defaults', 'routing', 'field suggestions', 'effective', 'guardrails', 'privacy', 'local', 'cloud', 'data', 'usage', 'audit', 'allowlist', 'rate limit', 'preflight'],
        blocks: [
          { type: 'p', text: 'Settings → AI & Agents is where you configure AI providers, per-feature routing, the daily token budget, and linked CLI agents.' },
          { type: 'h3', text: 'Providers' },
          { type: 'p', text: 'Four provider types are available. The selected global default is used by all AI features unless overridden in Feature Defaults (see below).' },
          { type: 'ul', items: [
            'OpenAI — enter your API key. Supports GPT-4o and other models. Idea content is sent to OpenAI\'s servers.',
            'Anthropic — enter your API key. Supports Claude models. Idea content is sent to Anthropic\'s servers.',
            'Ollama — set the base URL (default: http://localhost:11434). No key required. Calls stay on the configured Ollama host (local machine or a user-provided LAN/server URL).',
            'OpenRouter / custom endpoint — configure OpenRouter or any service that accepts OpenAI Chat Completions requests: Groq, Mistral, LM Studio, vLLM, llama.cpp, LocalAI, or a custom gateway.',
          ]},
          { type: 'h3', text: 'Provider API keys vs. Seedbank tokens' },
          { type: 'p', text: 'Provider API keys (OpenAI API, Anthropic API, OpenRouter, or another custom endpoint) are stored server-side, encrypted at rest. The browser never sees the raw value — only a "has key" boolean. These are separate from Seedbank personal access tokens, which are bearer tokens for the Seedbank REST API itself (Settings → API & Server).' },
          { type: 'h3', text: 'Global default provider' },
          { type: 'p', text: 'The "Set default" button on each provider card sets the global default. All AI features — Thinking Partner, field suggestions, health checks, and Discover insights — use this provider unless you route them individually in Feature Defaults.' },
          { type: 'h3', text: 'Feature Defaults' },
          { type: 'p', text: 'Feature Defaults lets you route each named AI feature to a specific provider and model, independently of the global default.' },
          { type: 'ul', items: [
            'Thinking Partner — the conversational chat panel on each idea page.',
            'Field suggestions — the "Ask AI" button on Pitch, Hook, Why It Might Work, Risks, and Tech Stack fields.',
            'Health Check — the AI readiness summary on each idea.',
            'Discover insights — pattern analysis and cross-pollination in the Discover view.',
            'Other features (fallback) — provider used by any future AI feature not listed above. This row does not affect or override the named features above.',
          ]},
          { type: 'h3', text: '"Use global default" option' },
          { type: 'p', text: 'Setting a feature\'s provider to "Use global default" means it inherits whichever provider is currently set as the global default. If you later change the global default, this feature automatically follows. The Effective readout beneath each model field shows exactly which provider and model will be used, accounting for inheritance.' },
          { type: 'h3', text: 'Effective readout' },
          { type: 'p', text: 'The "Effective: provider · model" line under each Feature Default row shows the resolved provider and model that will actually be used when that feature runs — it accounts for whether the route is a specific override or is inheriting the global default.' },
          { type: 'h3', text: 'Usage & Guardrails' },
          { type: 'p', text: 'The Usage & Guardrails section sits below Feature Defaults and controls how much AI Seedbank uses and whether idea content leaves your machine.' },
          { type: 'h3', text: 'Privacy and data flow' },
          { type: 'p', text: 'A notice at the top of the guardrails section shows whether your current global provider keeps inference local or sends field content to a cloud service:' },
          { type: 'ul', items: [
            'Local providers (Ollama, LM Studio, vLLM, llama.cpp, LocalAI) — inference runs on the configured local host. If you point to a remote host, content is sent only to that host.',
            'Cloud providers (OpenAI API, Anthropic API, OpenRouter, Groq, Mistral, Together, Fireworks) — field content from your ideas is sent to that provider\'s servers when AI features run.',
            'Custom endpoint — data residency depends on where your endpoint runs. Verify with your endpoint\'s operator.',
          ]},
          { type: 'tip', text: 'To keep AI inference private on this machine, configure Ollama or a local custom endpoint (LM Studio, vLLM, or llama.cpp) with a localhost URL and set it as the global default.' },
          { type: 'h3', text: 'Token budget' },
          { type: 'p', text: 'Set a daily token limit. The limit is enforced server-side; requests that exceed it return an error. Usage is shown for the last 24 h and last 7 d. Setting 0 disables the limit. Per-minute rate limiting still applies regardless of the budget.' },
          { type: 'h3', text: 'Usage history' },
          { type: 'p', text: 'Token totals are displayed for the last 24 hours and last 7 days. Three tabs show usage grouped by feature, by provider, and recent guardrail events (denied requests or provider errors).' },
          { type: 'h3', text: 'Advanced controls' },
          { type: 'p', text: 'Expand "Advanced controls" to configure fine-grained guardrails. All settings are saved server-side and enforced on the next AI request:' },
          { type: 'ul', items: [
            'Local-only mode — one toggle that blocks all cloud providers (server-enforced). Idea content never leaves your machine while this is on.',
            'Cloud provider alerts — "Show a warning" causes the AI Assistance modal (✨ buttons on idea fields) to pause and display a warning before sending to a cloud provider. "Require a Confirm & run click" makes the modal ask for an explicit confirmation before each cloud request. Both settings are preflight-checked by the AI modal before running.',
            'Feature enable — disable AI for individual features server-side. Disabled features return a clear error with a Settings link.',
            'Provider enable — disable specific providers server-side (e.g. block OpenAI but keep Anthropic).',
            'Per-feature daily token caps — set a budget per feature. 0 inherits the global budget. Exhausted budgets return a clear error with a Settings link.',
            'Model allowlist — comma-separated model IDs. Requests using any other model are blocked server-side.',
          ]},
          { type: 'p', text: 'When an AI request is blocked (feature disabled, budget exhausted, model not allowed), the error message includes a direct link to Settings → AI & Agents → Usage & Guardrails to adjust the relevant setting.' },
          { type: 'h3', text: 'Agents' },
          { type: 'p', text: 'Enter the binary path for Claude Code or Codex CLI and click Link. Agents use their own CLI auth — not Seedbank\'s provider keys. See the Agents section for full details.' },
          { type: 'tip', text: 'Provider API keys are stored server-side, encrypted. The browser never sees the raw key. Agent credentials are never stored in Seedbank at all.' },
        ],
      },
      {
        id: 'settings-theme',
        title: 'Settings — Theme',
        indexLabel: 'Theme',
        keywords: ['settings', 'theme', 'colour', 'dark mode', 'light mode', 'match system', 'paper', 'chalk', 'meadow', 'dusk', 'hearth', 'rainwash', 'woad', 'moss', 'peat', 'canopy'],
        blocks: [
          { type: 'p', text: 'Settings → Theme lets you choose from 10 palettes, all switchable live without a reload.' },
          { type: 'h3', text: 'Light themes' },
          { type: 'ul', items: [
            'Paper — default, off-white, sage and clay.',
            'Chalk — cool mineral/blue-gray paper, crisp slate-tinted ink.',
            'Meadow — light green-tinted, sage-forward.',
            'Dusk — warm taupe, evening field-journal feel.',
          ]},
          { type: 'h3', text: 'Mid-depth themes' },
          { type: 'ul', items: [
            'Hearth — warm clay/adobe, golden ochre accents.',
            'Rainwash — cool sage/stone, after-rain palette.',
          ]},
          { type: 'h3', text: 'Dark themes' },
          { type: 'ul', items: [
            'Woad — deep botanical blue-indigo, warm terracotta accents.',
            'Moss — charcoal-green, copper accents.',
            'Peat — black-soil umber, muted lichen.',
            'Canopy — forest understory, bark/copper.',
          ]},
          { type: 'h3', text: 'Match system' },
          { type: 'p', text: 'The Match system toggle auto-selects Paper (light) or Peat (dark) based on your OS preference. Picking a theme manually overrides it.' },
        ],
      },
      {
        id: 'settings-api',
        title: 'Settings — API & Server',
        indexLabel: 'API & Server',
        keywords: ['settings', 'api', 'server', 'token', 'bearer', 'webhook', 'mcp', 'openapi', 'port', 'uptime', 'scope'],
        blocks: [
          { type: 'p', text: 'Settings → API & Server exposes server info, personal access tokens, webhooks, and OpenAPI docs.' },
          { type: 'h3', text: 'Server info' },
          { type: 'p', text: 'Shows port, version, uptime, database path, and last backup time.' },
          { type: 'h3', text: 'Personal access tokens' },
          { type: 'ul', items: [
            'Tokens are scoped: read:ideas, write:ideas, ai:suggest, or mcp:read.',
            'Token creation is restricted to localhost browser sessions.',
            'The raw token is shown once — copy it immediately.',
            'Tokens are SHA-256 hashed at rest; the server never stores the raw value.',
            'Revoke any token at any time from this tab.',
          ]},
          { type: 'h3', text: 'Webhooks' },
          { type: 'ul', items: [
            'Set a URL and choose which events fire a payload.',
            'Supported events: idea.created, idea.graduated, idea.shipped.',
            'Payload is the full idea JSON.',
          ]},
          { type: 'h3', text: 'MCP endpoints' },
          { type: 'p', text: 'Read-only endpoints at /api/mcp/ideas and /api/mcp/search expose seeds as context for external Claude or Codex sessions. Requires a bearer token with mcp:read scope.' },
          { type: 'tip', text: 'The OpenAPI spec at /api/openapi.json documents every endpoint.' },
        ],
      },
      {
        id: 'settings-backups',
        title: 'Settings — Backups',
        indexLabel: 'Backups',
        keywords: ['settings', 'backup', 'schedule', 'daily', 'weekly', 'manual', 'export', 'json', 'retention', 'restore', 'rclone', 'remote', 'destination', 'local', 'network', 'folder', 'cloud'],
        blocks: [
          { type: 'p', text: 'Settings → Backups controls automatic database backups, JSON archive exports, and optional offsite destinations.' },
          { type: 'h3', text: 'Backup frequency' },
          { type: 'ul', items: [
            'Off — no automatic backups.',
            'Daily — backup runs once every 24 hours.',
            'Weekly — backup runs once every 7 days.',
          ]},
          { type: 'h3', text: 'JSON export' },
          { type: 'p', text: 'When enabled, every backup also writes a full JSON archive to <seedbank-data-dir>/exports/ (exact path shown in Settings → API & Server).' },
          { type: 'h3', text: 'Retention' },
          { type: 'p', text: 'Retention is configurable. Seedbank keeps your chosen number of database snapshots and prunes older ones automatically.' },
          { type: 'h3', text: 'Offsite destinations' },
          { type: 'p', text: 'After each backup run, Seedbank can copy files to one or more destinations. Two types are available:' },
          { type: 'ul', items: [
            'Local / network folder — copy backup files to a folder on this machine or a mounted network share. No extra software required. This is the easiest option.',
            'Rclone remote — copy files to cloud storage (Google Drive, S3, Backblaze, Dropbox, etc.) or a remote server. Requires rclone to be installed and configured separately on the Seedbank machine.',
          ]},
          { type: 'h3', text: 'What is rclone?' },
          { type: 'p', text: 'Rclone is separate, open-source software that Seedbank does not include. You install and configure it on the same machine that runs the Seedbank server. Once installed, you run rclone config to add a named remote, then enter that remote\'s path in Seedbank as remote-name:folder (e.g. mys3:seedbank-backups or gdrive:backups/seedbank). Visit rclone.org to get started.' },
          { type: 'tip', text: 'Run rclone listremotes in a terminal to see the names of your configured remotes.' },
          { type: 'h3', text: 'Manual backup' },
          { type: 'p', text: 'Click "Run backup now" to trigger an immediate backup regardless of schedule.' },
          { type: 'h3', text: 'Test restore (safe validation)' },
          { type: 'p', text: 'Restore validation reads and checks your latest local backup files — it does not replace live data. It validates the local copies Seedbank has stored on this machine. Rclone remote destinations are delivery targets; to verify a remote backup, download the files from the remote first, then validate them locally.' },
          { type: 'tip', text: 'A startup backup is always taken when the server starts, regardless of schedule settings.' },
        ],
      },
      {
        id: 'settings-categories',
        title: 'Settings — Categories',
        indexLabel: 'Categories',
        keywords: ['settings', 'categories', 'category', 'rename', 'add', 'delete', 'archive', 'reorder', 'color', 'icon', 'taxonomy', 'custom'],
        blocks: [
          { type: 'p', text: 'Settings → Categories lets you manage the full list of categories used to label ideas. You can add your own categories, rename or recolor the built-in ones, change their order, and archive categories you no longer need.' },
          { type: 'h3', text: 'Adding a category' },
          { type: 'p', text: 'Click "Add category", enter a name, pick an optional color and emoji icon, then click "Add category" to save. The category immediately appears in the idea editor and filter bar.' },
          { type: 'h3', text: 'Renaming or recoloring' },
          { type: 'p', text: 'Click the pencil icon on any row. Edit the name, icon, or color, then press Enter or click the checkmark.' },
          { type: 'h3', text: 'Reordering' },
          { type: 'p', text: 'Use the ↑/↓ buttons on the left of each row to change the order. The order here is reflected in the category picker and filter bar.' },
          { type: 'h3', text: 'Archiving and restoring' },
          { type: 'p', text: 'Archiving hides a category from the picker and filters. Ideas already using an archived category keep their assignment — the category label still shows on the idea card. Click "Archived" at the bottom to see and restore archived categories.' },
          { type: 'h3', text: 'Deleting a custom category' },
          { type: 'p', text: 'Custom categories (ones you created) can be permanently deleted if no ideas are currently assigned to them. Built-in categories cannot be deleted — archive them instead.' },
          { type: 'tip', text: 'If you want to remove a category that is still in use, archive it first. Then update or reassign the affected ideas before deleting.' },
        ],
      },
      {
        id: 'settings-integrations',
        title: 'Settings — Project Graduation',
        indexLabel: 'Project Graduation',
        keywords: ['settings', 'integrations', 'scaffold', 'graduation', 'project', 'plugin', 'adapter', 'external', 'project root', 'readme', 'claude.md', 'folder'],
        blocks: [
          { type: 'p', text: 'Settings → Project Graduation tells Seedbank where to create project folders when you graduate an idea.' },
          { type: 'h3', text: 'Project root' },
          { type: 'p', text: 'Set the parent folder where Seedbank creates new project directories. Each graduated idea gets its own subfolder named after the idea title. Example: root /Users/you/Projects + idea "Password manager" → /Users/you/Projects/password-manager/.' },
          { type: 'h3', text: 'What files Seedbank creates' },
          { type: 'ul', items: [
            'README.md — always. Contains your idea title, brief, and key context.',
            'CLAUDE.md — always. AI context for use with Claude Code, Codex, or another AI coding session.',
            'package.json + starter file — for all ideas except games.',
            'project.godot stub — for game ideas.',
          ]},
          { type: 'h3', text: 'Test connection' },
          { type: 'p', text: 'After saving the project root, click "Test connection" to check that the saved path can be found or created later. The check passes if the path already exists as a directory, or if its parent folder exists (the directory is created on first graduation).' },
          { type: 'h3', text: 'Custom adapters (advanced)' },
          { type: 'p', text: 'Custom local adapters integrate with a specific local workflow tool. They appear in a collapsed Advanced section. Most users do not need them — the built-in Local Project scaffold works for all project types.' },
          { type: 'tip', text: 'Configure at least one adapter before using the Graduation flow. Save the project root, then click Test connection to verify.' },
        ],
      },
      {
        id: 'settings-about',
        title: 'Settings — About',
        indexLabel: 'About',
        keywords: ['settings', 'about', 'version', 'github', 'license', 'attribution'],
        blocks: [
          { type: 'p', text: 'Settings → About shows the app version, GitHub link, and license attribution.' },
        ],
      },
    ],
  },

  {
    label: 'Import / Export',
    sections: [
      {
        id: 'import-export',
        title: 'Import & Export',
        keywords: ['import', 'export', 'json', 'markdown', 'backup', 'archive', 'migrate'],
        blocks: [
          { type: 'p', text: 'Seedbank can export your entire garden as JSON (machine-readable archive) or Markdown (human-readable). Both formats can be imported back.' },
          { type: 'h3', text: 'Export JSON' },
          { type: 'p', text: 'Full archive — all ideas, all version history, export timestamp. Use for backups and migration.' },
          { type: 'h3', text: 'Export Markdown' },
          { type: 'p', text: 'One Markdown section per idea. Good for reading in any text editor or sharing with others.' },
          { type: 'h3', text: 'Import' },
          { type: 'ul', items: [
            'Seedbank JSON archive — restores ideas preserving IDs and version history.',
            'Markdown file — parses idea blocks into new seeds.',
          ]},
          { type: 'tip', text: 'Import is additive — it won\'t overwrite existing ideas with the same ID unless you choose to.' },
        ],
      },
    ],
  },

  {
    label: 'Graduation',
    sections: [
      {
        id: 'graduation',
        title: 'Graduating an Idea',
        keywords: ['graduation', 'graduate', 'project', 'scaffold', 'shipped', 'integration', 'readiness', 'adapter'],
        blocks: [
          { type: 'p', text: 'Graduation turns a mature seed into a real project scaffold. It runs readiness checks, creates files via the chosen adapter, and advances the idea to Shipped.' },
          { type: 'h3', text: 'How to graduate' },
          { type: 'ul', items: [
            'Open the idea detail page.',
            'Click "Graduate idea" (available once stage is Pitch or later).',
            'Review the readiness checklist — yellow items are warnings, not blockers.',
            'Choose an adapter (local project scaffold, or any configured adapter).',
            'Confirm — files are created in your configured project root and the idea moves to Shipped.',
          ]},
          { type: 'h3', text: 'After graduation' },
          { type: 'p', text: 'The idea shows a "Graduated to" badge. Use "Continue with agent" to hand the project to a CLI agent for follow-on work.' },
          { type: 'tip', text: 'Configure a project root in Settings → Project Graduation before attempting graduation.' },
        ],
      },
    ],
  },

  {
    label: 'Integrations',
    sections: [
      {
        id: 'integrations-overview',
        title: 'Integrating Seedbank with External Tools',
        indexLabel: 'Overview',
        keywords: ['integration', 'external', 'rest', 'api', 'webhook', 'mcp', 'cli', 'adapter', 'openapi', 'automation', 'token', 'project root'],
        blocks: [
          { type: 'p', text: 'Seedbank exposes several integration surfaces for connecting to external tools, workflows, and AI systems. These work regardless of which external platform you use.' },
          { type: 'h3', text: 'REST API' },
          { type: 'p', text: 'Every Seedbank operation is available via a REST API at localhost:4800. The full spec is at /api/openapi.json and browsable in Settings → API & Server. Use it for scripting, automation, or building custom integrations.' },
          { type: 'h3', text: 'Personal access tokens' },
          { type: 'p', text: 'Generate scoped bearer tokens in Settings → API & Server to authenticate API requests. Scopes: read:ideas (read-only), write:ideas (create/update/graduate), ai:suggest (AI endpoints), mcp:read (MCP context endpoints). Tokens are intended for local scripting and integrations — creation is restricted to localhost sessions.' },
          { type: 'h3', text: 'Outbound webhooks' },
          { type: 'p', text: 'Set a URL and choose events to receive HTTP POST payloads when ideas change state. Supported events: idea.created, idea.graduated, idea.shipped. Use webhooks to trigger external workflows — Zapier, n8n, a local script, or any HTTP endpoint.' },
          { type: 'h3', text: 'MCP (model context protocol)' },
          { type: 'p', text: 'Read-only MCP endpoints expose your seed garden as context for external AI sessions. Configure /api/mcp/ideas and /api/mcp/search with a bearer token to give Claude, Codex, or another LLM session access to your ideas without exporting anything manually.' },
          { type: 'h3', text: 'CLI agents' },
          { type: 'p', text: 'Link a local Claude Code or Codex CLI binary in Settings → AI & Agents. Use "Develop with agent" on any idea to launch a time-capped run with the idea as context. The agent works in a scratch workspace; you review proposed files before anything is saved.' },
          { type: 'h3', text: 'Project graduation (project scaffold)' },
          { type: 'p', text: 'When an idea is ready, graduating it creates a project folder — with README.md and CLAUDE.md pre-filled with your idea\'s context — in a directory you set in Settings → Project Graduation. The built-in Local Project scaffold adapter works with any directory and any toolchain. Optional custom adapters (shown in Advanced) integrate with specific local tools and are not required.' },
          { type: 'tip', text: 'All integration paths that write to your filesystem (graduation adapters, agent workspaces) require your explicit confirmation before any file is created or saved.' },
        ],
      },
      {
        id: 'integrations-rest',
        title: 'REST API & OpenAPI',
        indexLabel: 'REST API',
        keywords: ['rest', 'api', 'openapi', 'endpoint', 'curl', 'http', 'json', 'bearer', 'token', 'auth'],
        blocks: [
          { type: 'p', text: 'The Seedbank REST API runs at http://localhost:4800. It uses JSON throughout and supports both unauthenticated local requests and bearer-token auth for scripted access.' },
          { type: 'h3', text: 'Authentication' },
          { type: 'ul', items: [
            'No token — works from a local browser session (same origin).',
            'Bearer token — include Authorization: Bearer <token> for scripting or cross-origin access.',
          ]},
          { type: 'h3', text: 'OpenAPI spec' },
          { type: 'p', text: 'Machine-readable spec at GET /api/openapi.json. Import it into any HTTP client (Insomnia, Bruno, curl) or code-generation tool.' },
          { type: 'h3', text: 'Example' },
          { type: 'ul', items: [
            'GET /api/ideas — list ideas (filter, search, sort, paginate)',
            'POST /api/ideas — create an idea',
            'PATCH /api/ideas/:id — update an idea',
            'POST /api/ai/suggest — field suggestion (requires ai:suggest scope)',
            'POST /api/integrations/:id/graduate/:ideaId — graduate an idea',
          ]},
          { type: 'tip', text: 'The full endpoint list with request/response shapes is in docs/API.md in the project repository.' },
        ],
      },
      {
        id: 'integrations-webhooks',
        title: 'Outbound Webhooks',
        indexLabel: 'Webhooks',
        keywords: ['webhook', 'outbound', 'http', 'post', 'event', 'automation', 'zapier', 'n8n', 'idea.created', 'idea.graduated', 'idea.shipped'],
        blocks: [
          { type: 'p', text: 'Seedbank sends an HTTP POST with the full idea JSON to your configured URL when lifecycle events occur.' },
          { type: 'h3', text: 'Events' },
          { type: 'ul', items: [
            'idea.created — a new idea is planted.',
            'idea.graduated — an idea has been graduated to a project.',
            'idea.shipped — an idea is marked as shipped.',
          ]},
          { type: 'h3', text: 'Setup' },
          { type: 'p', text: 'Go to Settings → API & Server → Webhooks. Enter a URL and tick the events you want. Any publicly reachable HTTP endpoint works — a Zapier webhook, an n8n trigger URL, a local webhook proxy, or your own server.' },
          { type: 'tip', text: 'For local testing, use a tool like ngrok or smee.io to expose a localhost port, or point the webhook at a request-bin service.' },
        ],
      },
      {
        id: 'integrations-mcp',
        title: 'MCP Context Endpoints',
        indexLabel: 'MCP',
        keywords: ['mcp', 'model context protocol', 'claude', 'codex', 'llm', 'context', 'search', 'read-only', 'bearer', 'token'],
        blocks: [
          { type: 'p', text: 'The MCP endpoints make your seed garden readable as context for external AI sessions. They are read-only and require a bearer token with mcp:read scope.' },
          { type: 'ul', items: [
            'GET /api/mcp/ideas — returns all ideas as a JSON array.',
            'GET /api/mcp/search?q=<query> — returns ideas matching a search query.',
          ]},
          { type: 'h3', text: 'Usage' },
          { type: 'p', text: 'Configure an external AI tool or agent to call these endpoints (with Authorization: Bearer <your-token>) before or during a session. The tool can then reference your ideas when answering questions or generating content.' },
          { type: 'tip', text: 'Create a dedicated token with mcp:read scope for MCP access. Revoke it from Settings → API & Server if it is no longer needed.' },
        ],
      },
      {
        id: 'integrations-adapters',
        title: 'Graduation Adapters',
        indexLabel: 'Adapters',
        keywords: ['adapter', 'graduation', 'scaffold', 'project root', 'external project', 'local project', 'custom', 'optional'],
        blocks: [
          { type: 'p', text: 'Graduation adapters create a project scaffold when you graduate an idea. Configure them in Settings → Project Graduation.' },
          { type: 'h3', text: 'Local project scaffold (built-in)' },
          { type: 'p', text: 'Creates a standalone project directory in a project root you specify. Works with any local development setup — version control, any language, any editor. This adapter requires no external tools.' },
          { type: 'h3', text: 'Custom local adapters (optional)' },
          { type: 'p', text: 'Optional adapters can integrate with a specific local workflow tool or project manager. Each adapter may require its own workspace or project paths — expand the Advanced section and fill in the required fields. Custom adapters are not required and do not affect any other Seedbank features.' },
          { type: 'h3', text: 'Custom adapters' },
          { type: 'p', text: 'Adapters are server-side plugins in server/src/integrations/. You can add a custom adapter by implementing the integration interface and registering it — see docs/INTEGRATIONS.md.' },
          { type: 'tip', text: 'Graduation is not required. You can mark an idea as Shipped without graduating it to any scaffold.' },
        ],
      },
    ],
  },

  {
    label: 'Privacy & Security',
    sections: [
      {
        id: 'privacy',
        title: 'Privacy & Data Storage',
        keywords: ['privacy', 'data', 'storage', 'local', 'sqlite', 'where', 'database', 'file'],
        blocks: [
          { type: 'p', text: 'Seedbank is a local-first app. All your data stays on your machine.' },
          { type: 'ul', items: [
            'Database: <seedbank-data-dir>/seedbank.db (SQLite). Default location shown in Settings → API & Server → Server Info.',
            'Backups: <seedbank-data-dir>/backups/',
            'JSON exports: <seedbank-data-dir>/exports/',
            'No data is sent to any cloud service by Seedbank itself.',
          ]},
          { type: 'tip', text: 'AI features do send idea content to your chosen AI provider (OpenAI API, Anthropic API, OpenRouter / custom endpoint, or Ollama). With Ollama or a local custom endpoint on localhost, everything stays on this machine.' },
        ],
      },
      {
        id: 'security',
        title: 'Security',
        keywords: ['security', 'token', 'api key', 'auth', 'bearer', 'hash', 'local only', 'localhost'],
        blocks: [
          { type: 'p', text: 'Seedbank\'s API is intended for local use. Several security properties are worth knowing:' },
          { type: 'ul', items: [
            'AI provider API keys are stored server-side and never exposed to the browser.',
            'Personal access tokens are SHA-256 hashed at rest — the server never stores the raw token.',
            'New access tokens can only be created from localhost browser sessions.',
            'Agent credentials stay in your OS keychain or CLI tool — Seedbank only stores the binary path.',
            'Bearer-token auth is additive: the app still works without a token for local browser use.',
          ]},
          { type: 'tip', text: 'Avoid exposing port 4800 to the public internet. Seedbank has no user accounts and is designed for single-user local use.' },
        ],
      },
      {
        id: 'troubleshooting',
        title: 'Troubleshooting',
        keywords: ['troubleshoot', 'error', 'offline', 'broken', 'fix', 'connection', 'database', 'server', 'help'],
        blocks: [
          { type: 'h3', text: 'App shows offline banner' },
          { type: 'p', text: 'The server at localhost:4800 is not reachable. Make sure Seedbank is running — run npm start (or check npm run status). Check the log with: bash scripts/seedbank logs' },
          { type: 'h3', text: 'AI features not working' },
          { type: 'p', text: 'Check Settings → AI & Agents. Verify the API key is saved and the correct provider is set as default. Use "Test connection" to confirm the key is valid.' },
          { type: 'h3', text: 'Ideas lost after browser clear' },
          { type: 'p', text: 'If the server was running when ideas were captured, they are in the SQLite database and safe. If the server was offline when ideas were captured, they are in IndexedDB. Open the Data Migration dialog (if prompted on startup) to move them to SQLite.' },
          { type: 'h3', text: 'Agent run hangs' },
          { type: 'p', text: 'Click the Kill button in the agent panel. If the panel is gone, restart Seedbank: run npm stop then npm start (or ctrl+C if using npm run dev directly).' },
          { type: 'h3', text: 'Database corruption' },
          { type: 'p', text: 'Restore from a recent backup in <seedbank-data-dir>/backups/ (exact path shown in Settings → API & Server). Rename the backup file to seedbank.db and replace the current database.' },
        ],
      },
    ],
  },
];

// ── Flat section list for search ─────────────────────────────────────────────

export const ALL_SECTIONS: ManualSection[] = MANUAL_GROUPS.flatMap((g) => g.sections);

/** Find a section by id. Returns undefined if not found. */
export function findSection(id: string): ManualSection | undefined {
  return ALL_SECTIONS.find((s) => s.id === id);
}

/**
 * Simple search: returns sections whose title, keywords, or block text
 * contains every word of the query (case-insensitive).
 */
export function searchManual(query: string): ManualSection[] {
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 1);
  if (words.length === 0) return [];

  return ALL_SECTIONS.filter((section) => {
    const haystack = [
      section.title,
      ...section.keywords,
      ...section.blocks.flatMap((b) => {
        if (b.type === 'p' || b.type === 'h3' || b.type === 'tip') return [b.text];
        if (b.type === 'ul') return b.items;
        if (b.type === 'kbd') return [b.description];
        return [];
      }),
    ]
      .join(' ')
      .toLowerCase();
    return words.every((w) => haystack.includes(w));
  });
}
