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
          { type: 'p', text: 'Seedbank is a personal idea vault for people who collect more sparks than they can build immediately. Ideas are stored in a local SQLite database, backed up automatically, and cached in the browser for offline use.' },
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
          { type: 'p', text: 'Run npm run dev from the project root. Open http://localhost:5173.' },
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
        keywords: ['category', 'type', 'app', 'game', 'tool', 'art', 'mobile', 'browser', 'open source'],
        blocks: [
          { type: 'p', text: 'Categories describe what kind of project an idea is. They appear as colour-coded badges on idea cards.' },
          { type: 'ul', items: [
            'App, Game, Tool, Art Project',
            'Local AI, Mobile, Browser, Open-Source Utility',
          ]},
          { type: 'p', text: 'Categories are optional — a seed doesn\'t need one to be valid.' },
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
        keywords: ['thinking partner', 'ai', 'chat', 'conversation', 'assistant', 'claude', 'openai', 'anthropic', 'ollama'],
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
          { type: 'p', text: 'The Thinking Partner uses whichever AI provider you\'ve set as default in Settings → AI & Agents. Configure API keys there.' },
          { type: 'tip', text: 'Conversation history is saved per idea. Picking up where you left off is automatic.' },
        ],
      },
      {
        id: 'ai-suggestions',
        title: 'AI Field Suggestions',
        keywords: ['suggestion', 'ai', 'field', 'pitch', 'hook', 'risks', 'tech stack', 'draft', 'generate'],
        blocks: [
          { type: 'p', text: 'Many idea fields have a ✨ button that sends the current idea context to the AI and returns a draft value. You always review and edit the suggestion before saving.' },
          { type: 'ul', items: [
            'Pitch — a clear one-paragraph summary.',
            'Hook — a memorable one-liner.',
            'Why it might work — your optimistic case.',
            'Risks — common failure modes for this type of idea.',
            'Tech stack — suggested technologies for the category.',
          ]},
          { type: 'tip', text: 'Suggestions work best when the title and notes have enough context. Sparse ideas get generic results.' },
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
        keywords: ['agent', 'claude code', 'codex', 'cli', 'run', 'develop', 'generate', 'scaffold', 'sandbox'],
        blocks: [
          { type: 'p', text: 'Seedbank can launch a local CLI agent (Claude Code or Codex CLI) against a scratch workspace seeded with your idea\'s content. This is separate from the Thinking Partner chat.' },
          { type: 'h3', text: 'Linking an agent' },
          { type: 'p', text: 'Go to Settings → AI & Agents. Expand the Claude Code or Codex CLI card, enter the binary path, and click Link. Seedbank runs --version to confirm the binary exists.' },
          { type: 'h3', text: 'Develop with agent' },
          { type: 'p', text: 'On any idea detail page, click "Develop with agent". The agent receives the idea as a markdown brief and works in a scratch workspace. Its transcript streams live in the panel.' },
          { type: 'h3', text: 'Accepting changes' },
          { type: 'p', text: 'When the agent proposes files, a checklist appears. You select which files to accept before anything is saved. No file is written without your explicit approval.' },
          { type: 'tip', text: 'Agent credentials never leave your machine. Seedbank only stores the binary path and a "linked" flag — not your API keys or tokens.' },
        ],
      },
      {
        id: 'agent-safety',
        title: 'Agent Safety Rails',
        keywords: ['agent', 'safety', 'sandbox', 'kill', 'timeout', 'cap', 'security', 'filesystem'],
        blocks: [
          { type: 'p', text: 'Agent runs are time-capped and require explicit review before any output is saved.' },
          { type: 'ul', items: [
            'Seedbank sets the working directory to a per-idea scratch workspace and validates applied file paths to prevent directory traversal.',
            'The agent process is not OS-sandboxed — it can access your filesystem. Use the linked binary only if you trust it.',
            'Runtime cap: 5 minutes per run, 30-minute absolute maximum.',
            'A Kill button is always visible in the agent panel.',
            'No agent output auto-writes to your canonical idea fields.',
            'Every proposed file change requires explicit accept/reject before it is saved.',
          ]},
          { type: 'tip', text: 'If a run gets stuck, use the Kill button. The workspace is cleaned up on your next session.' },
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
        id: 'settings-ai',
        title: 'Settings — AI & Agents',
        indexLabel: 'AI & Agents',
        keywords: ['settings', 'ai', 'agents', 'provider', 'openai', 'anthropic', 'ollama', 'api key', 'model', 'budget', 'token', 'link', 'claude code', 'codex'],
        blocks: [
          { type: 'p', text: 'Settings → AI & Agents is where you configure AI providers and link local CLI agents.' },
          { type: 'h3', text: 'Providers' },
          { type: 'ul', items: [
            'OpenAI — enter your API key. Supports GPT-4o and other models.',
            'Anthropic — enter your API key. Supports Claude 3.x models.',
            'Ollama — set the base URL (default: http://localhost:11434). No key required.',
          ]},
          { type: 'h3', text: 'Default provider' },
          { type: 'p', text: 'The radio button next to each provider sets which one the Thinking Partner and field suggestions use.' },
          { type: 'h3', text: 'Token budget' },
          { type: 'p', text: 'Set a daily token limit. Usage is tracked in the last-24h and last-7d readouts. Setting 0 disables the limit.' },
          { type: 'h3', text: 'Agents' },
          { type: 'p', text: 'Enter the binary path for Claude Code or Codex CLI and click Link. See the Agents section for full details.' },
          { type: 'tip', text: 'API keys are stored server-side. The browser never sees the raw key — only a "has key" boolean.' },
        ],
      },
      {
        id: 'settings-theme',
        title: 'Settings — Theme',
        indexLabel: 'Theme',
        keywords: ['settings', 'theme', 'colour', 'dark mode', 'light mode', 'match system', 'paper', 'parchment', 'meadow', 'dusk', 'hearth', 'rainwash', 'loam', 'moss', 'peat', 'canopy'],
        blocks: [
          { type: 'p', text: 'Settings → Theme lets you choose from 10 palettes, all switchable live without a reload.' },
          { type: 'h3', text: 'Light themes' },
          { type: 'ul', items: [
            'Paper — default, off-white, sage and clay.',
            'Parchment — warmer cream, aged amber.',
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
            'Loam — deep earth-brown, bright sage.',
            'Moss — charcoal-green, copper accents.',
            'Peat — black-soil umber, muted lichen.',
            'Canopy — forest understory, bark/copper.',
          ]},
          { type: 'h3', text: 'Match system' },
          { type: 'p', text: 'The Match system toggle auto-selects Paper (light) or Loam (dark) based on your OS preference. Picking a theme manually overrides it.' },
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
        keywords: ['settings', 'backup', 'schedule', 'daily', 'weekly', 'manual', 'export', 'json', 'retention', 'restore'],
        blocks: [
          { type: 'p', text: 'Settings → Backups controls automatic database backups and JSON archive exports.' },
          { type: 'h3', text: 'Backup frequency' },
          { type: 'ul', items: [
            'Off — no automatic backups.',
            'Daily — backup runs once every 24 hours.',
            'Weekly — backup runs once every 7 days.',
          ]},
          { type: 'h3', text: 'JSON export' },
          { type: 'p', text: 'When enabled, every backup also writes a full JSON archive to <seedbank-data-dir>/exports/ (exact path shown in Settings → API & Server).' },
          { type: 'h3', text: 'Retention' },
          { type: 'p', text: 'Seedbank keeps the latest 10 database backups. Older ones are pruned automatically.' },
          { type: 'h3', text: 'Manual backup' },
          { type: 'p', text: 'Click "Run backup now" to trigger an immediate backup regardless of schedule.' },
          { type: 'tip', text: 'A startup backup is always taken when the server starts, regardless of schedule settings.' },
        ],
      },
      {
        id: 'settings-integrations',
        title: 'Settings — Integrations',
        indexLabel: 'Integrations',
        keywords: ['settings', 'integrations', 'scaffold', 'graduation', 'project', 'plugin', 'adapter', 'external', 'project root'],
        blocks: [
          { type: 'p', text: 'Settings → Integrations shows the available graduation adapters and lets you configure where Seedbank creates project scaffolds.' },
          { type: 'h3', text: 'How adapters work' },
          { type: 'p', text: 'Each adapter takes a graduated idea and creates a project scaffold in an external project root that you control. At minimum you set a project root directory; the adapter creates files there.' },
          { type: 'h3', text: 'Built-in adapters' },
          { type: 'ul', items: [
            'Local project scaffold — creates a standalone project directory with idea context files. Works with any local workflow.',
            'Archon adapter (optional) — for users who run Archon locally. Creates an Archon-compatible project folder. Not required to use Seedbank.',
          ]},
          { type: 'tip', text: 'Configure at least one adapter before using the Graduation flow. Any adapter with a valid project root will work.' },
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
        keywords: ['graduation', 'graduate', 'project', 'scaffold', 'shipped', 'archon', 'integration', 'readiness'],
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
          { type: 'tip', text: 'Configure integrations in Settings → Integrations before attempting graduation.' },
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
          { type: 'h3', text: 'Graduation adapters (project scaffold)' },
          { type: 'p', text: 'When an idea is ready to ship, graduation adapters create a project scaffold in an external project root you configure. The local project scaffold adapter works with any directory. Optional adapters (like Archon) integrate with specific local tools — they are not required.' },
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
        keywords: ['adapter', 'graduation', 'scaffold', 'project root', 'external project', 'local project', 'archon', 'optional'],
        blocks: [
          { type: 'p', text: 'Graduation adapters create a project scaffold when you graduate an idea. Configure them in Settings → Integrations.' },
          { type: 'h3', text: 'Local project scaffold (built-in)' },
          { type: 'p', text: 'Creates a standalone project directory in a project root you specify. Works with any local development setup — version control, any language, any editor. This adapter requires no external tools.' },
          { type: 'h3', text: 'Archon adapter (optional, local only)' },
          { type: 'p', text: 'An optional adapter for people who run the Archon project manager locally. Creates an Archon-compatible project folder with context files. Not installed by default and not required to use Seedbank or any other feature.' },
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
          { type: 'tip', text: 'AI features do send idea content to your chosen AI provider (OpenAI, Anthropic, or Ollama). With Ollama, everything stays local.' },
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
          { type: 'p', text: 'The server at localhost:4800 is not reachable. Make sure npm run dev is running. Check the terminal for errors.' },
          { type: 'h3', text: 'AI features not working' },
          { type: 'p', text: 'Check Settings → AI & Agents. Verify the API key is saved and the correct provider is set as default. Use "Test connection" to confirm the key is valid.' },
          { type: 'h3', text: 'Ideas lost after browser clear' },
          { type: 'p', text: 'If the server was running when ideas were captured, they are in the SQLite database and safe. If the server was offline when ideas were captured, they are in IndexedDB. Open the Data Migration dialog (if prompted on startup) to move them to SQLite.' },
          { type: 'h3', text: 'Agent run hangs' },
          { type: 'p', text: 'Click the Kill button in the agent panel. If the panel is gone, restart the server (ctrl+C and npm run dev again).' },
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
