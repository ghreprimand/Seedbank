/**
 * Seedbank In-App Manual — structured content source.
 *
 * Each section has a stable `id` used for deep-linking (?help=project-drafting),
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
  | { type: 'kbd'; keys: string[]; description: string }
  | { type: 'code'; text: string };

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
            'Stages — the lifecycle from Seed through to Market.',
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
          { type: 'tip', text: 'Use the bottom-right Help controls to enter Help Mode, then click labeled UI regions for contextual guidance.' },
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
          { type: 'tip', text: 'All non-deleted ideas are shown by default, including Dormant and Cold Storage. Use Stage filters to focus specific lifecycle states.' },
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
            'The Spark / Raw Notes — your original brain dump plus ongoing raw thinking.',
            'Concept — what the idea is, explained clearly in plain language.',
            'The Case — why this is worth building and what need it serves.',
            'Elevator Pitch — a distilled one-line version of the concept.',
            'Risks & Blockers — what could go wrong.',
            'Build Notes — intended technology, architecture direction, scope, and first steps.',
            'Aesthetic & Style — visual direction, references, and tone.',
            'Retrospective — outcomes, lessons learned, and follow-up thoughts.',
            'Tags — freeform labels for cross-cutting themes.',
            'Image Gallery — uploaded visuals, screenshots, and references.',
            'Links — reference URLs (documentation, inspiration, prior art).',
            'Related ideas — cross-link seeds that share territory.',
          ]},
          { type: 'h3', text: 'Scores' },
          { type: 'p', text: 'Rate Personal Excitement (🔥) and Feasibility (⚡) on a 1–5 scale. Scores are used for sorting and health checks.' },
          { type: 'h3', text: 'Image gallery' },
          { type: 'p', text: 'At Plot stage and beyond, you can upload images (mockups, references, screenshots), open them in a lightbox, and delete individual items. Image paths are stored with the idea and files are kept in Seedbank data storage.' },
          { type: 'tip', text: 'Use the AI suggestion button (✨) next to a field to get a context-aware draft. You stay in control — suggestions are never auto-applied.' },
        ],
      },
      {
        id: 'stages-view',
        title: 'Stages View',
        keywords: ['stages', 'board', 'swim lanes', 'drag and drop', 'grid', 'view toggle', 'workflow'],
        blocks: [
          { type: 'p', text: 'Stages View turns stage changes into a visual workflow. Each row is a lifecycle stage, and cards tile left-to-right inside that row.' },
          { type: 'h3', text: 'Using the view toggle' },
          { type: 'p', text: 'In The Garden header, switch between Grid and Stages. The selection is saved locally so your preferred view persists.' },
          { type: 'h3', text: 'Moving ideas' },
          { type: 'ul', items: [
            'Desktop: drag a card and drop it on another stage row.',
            'Touch devices: tap a card to open a stage picker, then choose the destination stage.',
            'Stage changes here use the same underlying update as the idea detail stage picker.',
          ]},
          { type: 'h3', text: 'Row behavior' },
          { type: 'ul', items: [
            'The board respects all current filters (category, stage, tags, and search).',
            'Dormant, Cold Storage, and Market rows start collapsed to keep focus on active work.',
            'Empty stages collapse to a thin row with a "No ideas in this stage" hint.',
          ]},
        ],
      },
      {
        id: 'stages',
        title: 'Lifecycle Stages',
        keywords: ['stage', 'lifecycle', 'seed', 'sprout', 'bloom', 'greenhouse', 'plot', 'dormant', 'cold storage', 'market', 'status'],
        blocks: [
          { type: 'p', text: 'Every idea moves through gardening-themed stages that reflect how developed it is. Stages are now an active lifecycle signal, not just a label.' },
          { type: 'ul', items: [
            '🌱 Seed — rough / new / just captured.',
            '🌿 Sprout — stronger concept, some structure.',
            '🌸 Bloom — developed enough to explain clearly.',
            '🏡 Greenhouse — actively being built or experimented with.',
            '🌳 Plot — full active project.',
            '💤 Dormant — paused but preserved.',
            '❄️ Cold Storage — deep archive, still searchable.',
            '🧑‍🌾 Market — done, released, or completed.',
          ]},
          { type: 'h3', text: 'Progressive disclosure by stage' },
          { type: 'ul', items: [
            'Seed shows: title, The Spark (raw notes), tags, mood labels, excitement score, and landscape analysis.',
            'Sprout adds: Concept.',
            'Bloom adds: The Case and Elevator Pitch.',
            'Greenhouse adds: Risks & Blockers and Build Notes.',
            'Plot adds: Aesthetic & Style, Feasibility, links, image gallery, and related ideas.',
            'Dormant and Cold Storage show all fields.',
            'Market shows all fields, including Retrospective.',
          ]},
          { type: 'p', text: 'If you want full control immediately, use the "Show all fields anyway" toggle in Idea Detail. This override is local to your session and never stored in the idea record.' },
          { type: 'p', text: 'The Stage Timeline panel records stage transitions with timestamps (for example, Seed → Sprout 3d ago) so you can see when ideas advanced.' },
          { type: 'p', text: 'The Stage Progress panel shows the next lifecycle stage, the advisory checklist for getting there, and a direct move action. When an edit completes the checklist, Seedbank advances the idea automatically.' },
          { type: 'tip', text: 'Change stage any time from the idea detail stage picker or Stage Progress panel. Readiness checks guide the workflow, but they never block manual stage changes.' },
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
          { type: 'p', text: 'Seedbank automatically creates version snapshots when you make meaningful edits.' },
          { type: 'h3', text: 'Viewing history' },
          { type: 'p', text: 'Open the Version History panel on the idea detail page to inspect snapshots. Each snapshot shows a timestamp and summary details.' },
          { type: 'h3', text: 'Restoring a version' },
          { type: 'p', text: 'Click Restore on any snapshot. The current state becomes a new snapshot first, so you can undo the restore.' },
          { type: 'tip', text: 'Auto-snapshots trigger on meaningful field changes, including score changes.' },
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
          { type: 'tip', text: 'Expired entries are purged when the Compost view is loaded.' },
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
          { type: 'p', text: 'The Health Check combines two layers: field quality feedback and stage-aware readiness criteria.' },
          { type: 'h3', text: 'What it checks' },
          { type: 'ul', items: [
            'Elevator Pitch clarity and length.',
            'Concept presence.',
            'The Case presence.',
            'Risks acknowledgement.',
            'Build Notes specificity.',
            'Excitement / Feasibility score balance.',
          ]},
          { type: 'h3', text: 'Stage-aware readiness' },
          { type: 'ul', items: [
            'Seed → Sprout: The Spark has enough detail.',
            'Sprout → Bloom: Concept is filled.',
            'Bloom → Greenhouse: The Case and Elevator Pitch are filled.',
            'Greenhouse → Plot: Risks & Blockers and Build Notes are filled.',
          ]},
          { type: 'p', text: 'If all criteria are met, Seedbank can advance the idea automatically and the panels show a move action. Otherwise they show exactly what is missing. Tags remain useful for discovery, but they are optional and never required for stage progress.' },
          { type: 'p', text: 'Run it from the idea detail page in the Health Check panel by clicking Check. No fields are auto-updated — you decide what to change.' },
          { type: 'tip', text: 'Health Check works best when Concept and Elevator Pitch have some content.' },
        ],
      },
      {
        id: 'landscape-analysis',
        title: 'Landscape Analysis',
        keywords: ['landscape', 'viability', 'market', 'alternatives', 'positioning', 'demand', 'ai'],
        blocks: [
          { type: 'p', text: 'Landscape Analysis is an AI-assisted viability scan you can run directly from an idea detail page (available from Seed stage onward).' },
          { type: 'p', text: 'Each run is saved to the idea and reloaded automatically when you return, so analysis is not lost after navigation or refresh. The panel always shows the latest saved run with its timestamp and provider/model route.' },
          { type: 'h3', text: 'Output sections' },
          { type: 'ul', items: [
            'Existing Alternatives — overlap and maturity of similar solutions.',
            'Gaps & Pain Points — underserved needs and user frustrations.',
            'Demand Signals — indicators people actively seek this kind of solution.',
            'Positioning Angle — what could make this idea compelling.',
            'Overall Viability — candid conclusion about the opportunity.',
          ]},
          { type: 'p', text: 'The goal is honest assessment, not optimism by default. Use it to decide whether to deepen, pivot, or shelve an idea. When a report already exists, use Re-analyze to generate and save an updated read.' },
          { type: 'tip', text: 'This analysis reflects the AI\'s available knowledge. Results are strongest with providers that support web search (Claude, Codex, some Ollama web-tool setups). Treat it as a starting point for your own research, not a definitive market report.' },
        ],
      },
      {
        id: 'thinking-partner',
        title: 'Thinking Partner',
        keywords: ['thinking partner', 'ai', 'chat', 'conversation', 'assistant', 'openai', 'anthropic', 'ollama', 'provider', 'key'],
        blocks: [
          { type: 'p', text: 'The Thinking Partner is an AI chat panel attached to each idea. It asks questions, reflects patterns, and helps scope ideas — it doesn\'t generate ideas for you.' },
          { type: 'p', text: 'Questions are grounded in the current idea fields, stage, notes, risks, build notes, tags, and scores. If the idea is sparse, the assistant should ask for missing context instead of inventing a generic critique.' },
          { type: 'p', text: 'For early-stage ideas, preset prompts use future-facing planning language. They should give a small grounded insight, an actionable next move, and a follow-up question rather than implying the project has already been built or dogfooded.' },
          { type: 'h3', text: 'Prompt modes' },
          { type: 'ul', items: [
            'What If — explores alternative directions.',
            'Devil\'s Advocate — challenges assumptions.',
            'Scope Down — finds a smallest viable version.',
            'User Story — frames the idea from a user\'s perspective.',
          ]},
          { type: 'h3', text: 'Custom questions' },
          { type: 'p', text: 'Use the Custom question field at the bottom of the panel for normal back-and-forth chat. Custom questions keep the per-idea Thinking Partner history, while preset buttons run against fresh current idea context so older conversation drift does not steer the preset response.' },
          { type: 'h3', text: 'Stage-aware AI' },
          { type: 'p', text: 'Thinking Partner and field suggestions automatically adapt to the idea stage. Seed and Sprout are exploratory, Bloom is sharpening and critical, Greenhouse/Plot are implementation-focused, Dormant/Cold Storage are reflective about revival, and Market is retrospective.' },
          { type: 'h3', text: 'Provider' },
          { type: 'p', text: 'By default the Thinking Partner uses the global AI provider set in Settings → AI & Agents. You can route it to a different provider in Feature Defaults → Thinking Partner. Supported provider types: direct API key (Anthropic API, OpenAI API), account login (Claude account or Codex account), local inference (Ollama, LM Studio, vLLM, llama.cpp, LocalAI), and external cloud endpoints (OpenRouter, Groq, Mistral, Together, Fireworks).' },
          { type: 'tip', text: 'Conversation history is saved per idea. Picking up where you left off is automatic.' },
        ],
      },
      {
        id: 'ai-suggestions',
        title: 'AI Field Suggestions',
        keywords: ['suggestion', 'ai', 'field', 'elevator pitch', 'concept', 'the case', 'risks', 'build notes', 'draft', 'generate', 'guided', 'modal', 'intent', 'playbook', 'refine', 'conversation', 'apply', 'improve', 'fresh', 'explain'],
        blocks: [
          { type: 'p', text: 'Fields like The Spark/Raw Notes, Concept, The Case, Elevator Pitch, Risks, and Build Notes have a ✨ button that opens the AI Assistance modal. You choose how you want help, review the result, and apply only what you want.' },
          { type: 'p', text: 'Each field has its own output shape. For example, Elevator Pitch aims for a crisp one-liner, The Case explains why the idea is worth building, Risks & Blockers lists concrete failure modes, and Build Notes focuses on implementation direction.' },
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
            'Scope down — frames the smallest feasible version you could build.',
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
          { type: 'p', text: 'Applied suggestions are saved as plain field text. Line breaks are preserved in the editor; markdown is not specially rendered inside editable idea fields.' },
          { type: 'h3', text: 'Conversation mode' },
          { type: 'p', text: 'When you choose Ask a question, a short chat panel opens for this field only. This conversation is not saved to the idea\'s Thinking Partner history. Type your question and use "Apply to field" on any assistant reply to use it.' },
          { type: 'h3', text: 'Which provider is used' },
          { type: 'p', text: 'The provider badge in the modal header shows the configured provider instance and model that will handle the request — for example "Anthropic API · claude-sonnet-4-5" or "OpenRouter · gpt-4o-mini". Field suggestions use the provider set in Settings → AI & Agents → Feature Defaults → Field suggestions. If no override is set, the global default is used. Confirm the badge before sending if data privacy matters to you.' },
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
            'Draw from Storage — randomly surfaces a dormant or cold-storage idea.',
            'Cross-Pollinate — finds pairs of ideas that share territory.',
            'Pattern Insights — AI analysis of themes and gaps across your whole garden.',
            'Idea Weather — a playful summary of your idea portfolio health.',
          ]},
        ],
      },
    ],
  },

  {
    label: 'Project Drafting',
    sections: [
      {
        id: 'project-drafting',
        title: 'Project Drafting',
        indexLabel: 'Project Drafting',
        keywords: ['project', 'draft', 'generate', 'files', 'readme', 'spec', 'todo', 'implementation', 'ai', 'model', 'effort', 'github', 'folder'],
        blocks: [
          { type: 'p', text: 'Project generation turns the current idea into a local project folder with repository-ready starter files. The standard file set is README.md, SPEC.md, IMPLEMENTATION_NOTES.md, and TODO.md. It uses the normal AI provider system, so it can run through an API-key provider, Claude account login, Codex account login, a local model, or an OpenAI-compatible endpoint.' },
          { type: 'tip', text: 'Configure the provider, model, reasoning effort, budgets, and remote-provider confirmation for this feature in Settings → AI & Agents → Feature Defaults → Project drafting.' },
          { type: 'h3', text: 'How to generate project files' },
          { type: 'ul', items: [
            'Open an idea detail page.',
            'Use the Project generation section near the bottom of the page.',
            'Set a preferred project folder in Settings → Project Graduation, or let Seedbank use its default graduated-project folder.',
            'Adjust the file generation brief if you want a specific scope.',
            'Click Create project files. Seedbank creates the folder when needed, generates the repo docs, and writes them into that folder.',
            'Use Create GitHub repo from the same section when you are ready to publish and push the generated files.',
            'After GitHub confirms the repo exists, the section shows the repo link and Update GitHub repo for later commits and pushes.',
          ]},
          { type: 'h3', text: 'Local-first output' },
          { type: 'p', text: 'Project generation never overwrites canonical idea fields such as pitch, hook, notes, risks, or tech stack. Files are written to the project folder, and existing files are protected from accidental overwrite.' },
          { type: 'h3', text: 'Routing and privacy' },
          { type: 'p', text: 'Before sending idea content, Seedbank runs the same AI preflight used by other assist features. If the selected route is remote and confirmation is required by guardrails, the request uses the confirmation token produced by preflight. Disabled features, blocked providers, model allowlists, and token budgets are enforced server-side.' },
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
        keywords: ['settings', 'general', 'import', 'export', 'keyboard', 'shortcuts', 'hotkey', 'keybind', 'remap', 'custom'],
        blocks: [
          { type: 'p', text: 'Settings → General contains import/export controls and customizable keyboard shortcuts.' },
          { type: 'h3', text: 'Import / Export' },
          { type: 'ul', items: [
            'Export JSON — full archive of all ideas and version history.',
            'Export Markdown — human-readable single-file export.',
            'Import — accepts Seedbank JSON archives and Markdown files.',
          ]},
          { type: 'h3', text: 'Keyboard shortcuts' },
          { type: 'p', text: 'All three main shortcuts can be remapped to any key combination you prefer. Click the key badge next to an action, then press your desired key (with optional modifier keys held down). The new binding is saved immediately.' },
          { type: 'ul', items: [
            'Focus search — default: / (forward slash). Moves focus to the search bar.',
            'Open quick capture — default: N. Opens the quick idea capture modal.',
            'Open manual — default: ? (Shift+/). Opens this manual.',
            'Close modal / blur search — always Esc. This cannot be changed.',
          ]},
          { type: 'h3', text: 'Using modifier keys' },
          { type: 'p', text: 'Hold Ctrl, Alt, Shift, or ⌘ while pressing the key to record a modifier combination (e.g. Ctrl+K or Alt+N). Bindings that include a modifier key fire even while a text field is focused. Plain-key bindings (no modifiers) are silenced while you are typing.' },
          { type: 'h3', text: 'Conflict detection' },
          { type: 'p', text: 'If two actions share the same binding, a warning appears on both rows. Fix it by remapping one of them. Esc, Tab, F-keys, and common browser combos (Ctrl+W, Ctrl+T, etc.) are blocked and cannot be recorded.' },
          { type: 'h3', text: 'Resetting to defaults' },
          { type: 'p', text: 'Click the circular-arrow icon next to a customised binding to restore it to its default key. The "default" label reappears when no override is stored.' },
          { type: 'tip', text: 'Changes take effect immediately — no page reload needed. The new binding is active the moment you finish recording.' },
        ],
      },
      {
        id: 'provider-chooser',
        title: 'Which AI Provider Should I Use?',
        indexLabel: 'Choosing a Provider',
        keywords: ['provider', 'choose', 'which', 'claude', 'openai', 'anthropic', 'ollama', 'openrouter', 'subscription', 'api key', 'account login', 'local', 'cloud', 'decision', 'guide'],
        blocks: [
          { type: 'p', text: 'Not sure which AI provider to pick? Use this guide to match your setup. Settings → AI & Agents groups providers by service family: Claude, Codex/OpenAI, Local Models, and External/cloud. Each provider card has a ⋯ menu for Set as default and, where available, switching between subscription/account login and API-key paths.' },
          { type: 'h3', text: 'I have a Claude subscription (claude.ai)' },
          { type: 'p', text: 'Claude account login lets you sign in with your Claude.ai account and route AI chat through it using Seedbank\'s native OAuth flow. Click "Log in with Claude" in the card and follow the browser prompt. Once authenticated, use the card\'s ⋯ menu to set it as the global default, or route individual features to it in Feature Defaults. Idea content is sent to Anthropic\'s servers.' },
          { type: 'p', text: 'If you prefer a direct API-key path, open the Claude card\'s ⋯ menu and choose "Use API key instead", then enter a key from console.anthropic.com.' },
          { type: 'h3', text: 'I have a ChatGPT or OpenAI account' },
          { type: 'p', text: 'ChatGPT is a separate product from the OpenAI API. To use Seedbank with OpenAI models through API billing, create an API key at platform.openai.com. If the Codex login card is showing, open its ⋯ menu and choose "Use OpenAI API key instead", then enter the key in the OpenAI card. API usage is billed separately from a ChatGPT subscription.' },
          { type: 'h3', text: 'I want to use Codex account login' },
          { type: 'p', text: 'Codex account login routes AI chat through the local Codex app-server auth flow, which communicates with OpenAI on your behalf. This requires a compatible Codex runtime installed locally. If the OpenAI API card is showing, use its ⋯ menu to choose "Use Codex login instead". If you want direct OpenAI model routing without that path, use the OpenAI API key method from platform.openai.com.' },
          { type: 'h3', text: 'I have an Anthropic API key' },
          { type: 'p', text: 'Use the Claude card\'s ⋯ menu to choose "Use API key instead", enter your Anthropic API key, set a model (e.g. claude-sonnet-4-5 or claude-3-5-haiku-20241022), save, test, and set it as the global default from the same ⋯ menu. Your idea content is sent to Anthropic\'s servers when AI features run.' },
          { type: 'h3', text: 'I have an OpenAI API key' },
          { type: 'p', text: 'Use the OpenAI card, or choose "Use OpenAI API key instead" from the Codex card\'s ⋯ menu. Enter your API key, set a model (e.g. gpt-4o or gpt-4o-mini), save, test, and set it as the global default from the ⋯ menu. Your idea content is sent to OpenAI\'s servers when AI features run.' },
          { type: 'h3', text: 'I run Ollama locally' },
          { type: 'p', text: 'Ollama runs AI models on your own machine. In the Local Models area, set the Ollama base URL (default: http://localhost:11434), enter the name of a model you have pulled (e.g. llama3.2 or mistral), save, test, and set it as the global default from the ⋯ menu. No API key is needed. Idea content stays on your configured Ollama host.' },
          { type: 'h3', text: 'I use a local server like LM Studio, vLLM, llama.cpp, or LocalAI' },
          { type: 'p', text: 'In the Local Models area, choose the server type (LM Studio, vLLM, llama.cpp, LocalAI, or custom local), confirm the local server URL and model ID, then save and test. Use "+ Add another local instance" when you run multiple local endpoints. Local servers usually do not need an API key. Idea content stays on the configured local host.' },
          { type: 'h3', text: 'I use OpenRouter, Groq, Mistral, Together, or Fireworks' },
          { type: 'p', text: 'In the External/cloud area, use the cloud provider card or expand "+ Add another cloud provider". For OpenRouter, select the OpenRouter preset, confirm the endpoint URL, enter the model ID, add your OpenRouter API key, save, then use Test or List models. Idea content is sent to that provider\'s servers.' },
          { type: 'tip', text: 'To keep all AI inference private on this machine, use Ollama or a local custom endpoint (LM Studio, vLLM, or llama.cpp) with a localhost URL, then enable Local-only mode in Usage & Guardrails. Also check each Feature Default row — individual features can route to different providers.' },
        ],
      },
      {
        id: 'settings-ai',
        title: 'Settings — AI & Agents',
        indexLabel: 'AI & Agents',
        keywords: ['settings', 'ai', 'agents', 'provider', 'openai', 'anthropic', 'ollama', 'custom', 'openrouter', 'api key', 'account login', 'model', 'budget', 'token', 'link', 'claude code', 'codex', 'feature defaults', 'routing', 'effort', 'field suggestions', 'effective', 'guardrails', 'privacy', 'local', 'cloud', 'data', 'usage', 'audit', 'allowlist', 'rate limit', 'preflight'],
        blocks: [
          { type: 'p', text: 'Settings → AI & Agents is where you configure provider instances, per-feature routing, token budgets, and guardrails.' },
          { type: 'h3', text: 'Service-first layout' },
          { type: 'p', text: 'Providers are grouped by service family: Claude service, Codex/OpenAI service, Local Models, and External/cloud. Each visible card is one configured provider instance. Claude and Codex/OpenAI use the card\'s ⋯ menu to switch between subscription/account-login and API-key paths when both are available.' },
          { type: 'h3', text: 'Provider cards and the ⋯ menu' },
          { type: 'p', text: 'Provider cards show a colored status dot with a word such as Connected, Needs key, Unreachable, or Not tested. Expand a card to edit its model, URL, or key. Use Test/List actions to probe the saved configuration. The ⋯ menu holds Set as default and account/path actions such as Sign out, Use API key instead, Use subscription instead, Use Codex login instead, or Use OpenAI API key instead.' },
          { type: 'h3', text: 'Claude service' },
          { type: 'ul', items: [
            'Claude subscription — native OAuth routing using your Claude.ai subscription. Log in from the card; sign out from the card menu when authenticated.',
            'Anthropic API — direct API-key routing for Claude models. Choose "Use API key instead" from the ⋯ menu, enter a key from console.anthropic.com, then save, test, and list models.',
          ]},
          { type: 'h3', text: 'Codex / OpenAI service' },
          { type: 'ul', items: [
            'Codex login — routes through local Codex app-server auth via JSON-RPC. Requires a compatible Codex install. Effort selector for reasoning models.',
            'OpenAI API — direct API-key routing for OpenAI models. Choose "Use OpenAI API key instead" from the ⋯ menu when the Codex login card is active. Effort selector is shown for reasoning models (o3, o4-mini, etc.).',
          ]},
          { type: 'h3', text: 'Account reauth notices' },
          { type: 'p', text: 'If this browser previously saw Claude or Codex account auth succeed, but the current server status says the account is signed out or requires auth, Seedbank shows a persistent reauth notice. The notice links directly to Settings → AI & Agents so you can sign in again from the right card. Logging out intentionally clears the reminder.' },
          { type: 'tip', text: 'Claude account login and Codex account login are normal routable provider methods. Project drafting uses those same configured methods when selected in Feature Defaults.' },
          { type: 'h3', text: 'Local inference' },
          { type: 'ul', items: [
            'Ollama — native adapter; base URL defaults to http://localhost:11434; model is the tag name from "ollama list".',
            'Local OpenAI-compatible — choose the local server type, save its URL/model, and use "+ Add another local instance" for extra LM Studio, vLLM, llama.cpp, LocalAI, or custom localhost instances. Each instance has its own label, URL, model list, and probe status.',
          ]},
          { type: 'h3', text: 'External / cloud' },
          { type: 'ul', items: [
            'Cloud OpenAI-compatible — configure the main cloud card or expand "+ Add another cloud provider" for saved OpenRouter, Groq, Mistral, Together, Fireworks, or custom HTTPS instances. For OpenRouter, select the preset, confirm the URL, enter model and key, save, then Test or List models. For broad catalogs, use the enabled-model checklist to choose which discovered models Seedbank should expose.',
          ]},
          { type: 'h3', text: 'Model discovery' },
          { type: 'p', text: 'When a provider becomes usable, Seedbank lists available models and saves them to that provider instance. Discovery runs after API-key saves, account login/status checks, manual List models actions, server startup, and a background refresh cycle. Provider cards show the model count and keep their last tested status after you leave the page.' },
          { type: 'h3', text: 'Provider API keys vs. Seedbank tokens' },
          { type: 'p', text: 'Provider API keys (OpenAI API, Anthropic API, OpenRouter, or another custom endpoint) are stored server-side, encrypted at rest. The browser never sees the raw value — only a "has key" boolean. These are separate from Seedbank personal access tokens, which are bearer tokens for the Seedbank REST API itself (Settings → API & Server).' },
          { type: 'h3', text: 'Global default provider' },
          { type: 'p', text: 'The "Set as default" item in a configured provider card\'s ⋯ menu marks that instance as the global default. The global default row in Feature Defaults controls the default provider instance, model, effort, and verbosity where supported.' },
          { type: 'h3', text: 'Feature Defaults' },
          { type: 'p', text: 'Routes each named AI feature to a specific provider instance, model, and effort level independently. Provider/model controls use discovered model dropdowns when available and still allow custom model IDs.' },
          { type: 'ul', items: [
            'Thinking Partner — the conversational chat panel on each idea page.',
            'Field suggestions — the "Ask AI" button on The Spark/Raw Notes, Concept, The Case, Elevator Pitch, Risks, and Build Notes fields.',
            'Health Check — the AI readiness summary on each idea.',
            'Discover insights — pattern analysis and cross-pollination in the Discover view.',
            'Project drafting — reviewable project files generated from an idea.',
            'Other features (fallback) — provider used by any future AI feature not listed above.',
          ]},
          { type: 'h3', text: 'Effort selector in Feature Defaults' },
          { type: 'p', text: 'An effort control (low / medium / high) appears in a Feature Default row only when the selected provider and model support reasoning effort — for example OpenAI API with o3 or o4-mini, or Codex account login with a reasoning model. The control is hidden for models that do not support effort to keep the UI uncluttered.' },
          { type: 'h3', text: '"Use global default" and the Effective readout' },
          { type: 'p', text: 'Setting a feature\'s provider to "Use global default" means it inherits whichever instance is currently set as the global default. The Effective readout beneath each row shows the resolved provider, model, and effort that will actually be used — accounting for inheritance.' },
          { type: 'h3', text: 'Ask AI provider picker' },
          { type: 'p', text: 'The Ask AI modal starts with the effective Field suggestions route. Click the provider/model pill in the modal header to choose another configured provider/model for the current run. Preflight warnings, Confirm & run prompts, one-shot suggestions, and field-assist chat all use that temporary selection. Permanent defaults are still managed here in Settings.' },
          { type: 'h3', text: 'Usage & Guardrails' },
          { type: 'p', text: 'Token totals for the last 24 hours and 7 days are shown at the top. The detail section has four tabs: By feature, By provider, By model, and Events. By model exposes resolved-model granularity, useful for tracking which exact model variant each request used. Audit events include provider instance, model, effort, and whether content left the device.' },
          { type: 'h3', text: 'Privacy and data flow' },
          { type: 'p', text: 'The privacy notice at the top of the settings page reflects the global default provider instance. Local instances (Ollama, local OpenAI-compatible with a localhost URL) show a lock badge. Cloud instances (Anthropic API, Claude account, OpenAI API, Codex account, cloud OpenAI-compatible) show an amber shield. Account-login providers (Claude account, Codex account) additionally note the account-login path. Custom endpoint with user-controlled URL shows a mixed notice.' },
          { type: 'tip', text: 'The privacy notice reflects the global default only. Feature Defaults can route individual features to different providers — check each row for data residency. To keep all inference local, set local providers for every Feature Default row and enable Local-only mode.' },
          { type: 'h3', text: 'Token budget' },
          { type: 'p', text: 'Set a daily token limit enforced server-side. Setting 0 disables the limit. Per-minute rate limiting still applies regardless.' },
          { type: 'h3', text: 'Advanced controls' },
          { type: 'p', text: 'Expand "Advanced controls" for fine-grained guardrails, all enforced server-side on the next AI request:' },
          { type: 'ul', items: [
            'Local-only mode — blocks all cloud providers server-side. Idea content never leaves your machine while on.',
            'Cloud provider alerts — "Show a warning" pauses the AI Assistance modal before cloud requests. "Require Confirm & run" asks for explicit confirmation each time.',
            'Feature enable — disable AI for individual features. Disabled features return an error with a Settings link.',
            'Provider methods — enable or disable concrete configured provider instances. Disabled methods are hidden from setup and Feature Defaults and blocked server-side.',
            'Per-feature daily token caps — 0 inherits the global budget.',
            'Model allowlist — comma-separated model IDs; requests using any other model are blocked.',
          ]},
          { type: 'p', text: 'When an AI request is blocked (feature disabled, budget exhausted, model not allowed), the error message includes a direct link to Settings → AI & Agents → Usage & Guardrails.' },
          { type: 'tip', text: 'Provider API keys are stored server-side, encrypted. The browser never sees the raw key. The reauth reminder stores only a local "previously authenticated" flag, not credentials.' },
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
            'Tokens are scoped: read:ideas, write:ideas, ai:suggest, and mcp:read.',
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
          { type: 'p', text: 'Read-only endpoints at /api/mcp/ideas, /api/mcp/ideas/:id, and /api/mcp/search expose seeds as context for external Claude or Codex sessions. External/bearer clients should use a token with mcp:read scope; local loopback requests can use implicit local auth.' },
          { type: 'tip', text: 'The OpenAPI spec at /api/openapi.json documents every endpoint.' },
        ],
      },
      {
        id: 'settings-backups',
        title: 'Settings — Backups',
        indexLabel: 'Backups',
        keywords: ['settings', 'backup', 'schedule', 'daily', 'weekly', 'manual', 'export', 'json', 'retention', 'restore', 'rclone', 'remote', 'destination', 'local', 'network', 'folder', 'cloud', 'google drive', 'dropbox', 'onedrive', 's3', 'backblaze'],
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
            'Rclone remote — copy files to cloud storage (Google Drive, S3, Backblaze, Dropbox, OneDrive, and 70+ other providers) or a remote server. Requires rclone to be installed and configured separately. See the "Cloud Backup Setup" guide for step-by-step instructions.',
          ]},
          { type: 'h3', text: 'What is rclone?' },
          { type: 'p', text: 'Rclone is separate, open-source software that Seedbank does not bundle. You install it on the same machine that runs the Seedbank server. Once installed, run rclone config to add a named remote, then enter that remote\'s path in Seedbank as remote-name:folder/path (e.g. gdrive:backups/seedbank or mys3:seedbank-backups). Visit rclone.org to download.' },
          { type: 'tip', text: 'Run rclone listremotes in a terminal to see the names of your configured remotes. Run rclone version to confirm it is installed.' },
          { type: 'h3', text: 'Manual backup' },
          { type: 'p', text: 'Click "Run backup now" to trigger an immediate backup regardless of schedule.' },
          { type: 'h3', text: 'Test restore (safe validation)' },
          { type: 'p', text: 'Restore validation reads and checks your latest local backup files — it does not replace live data. It validates the local copies Seedbank has stored on this machine. Rclone remote destinations are delivery targets; to verify a remote backup, download the files from the remote first, then validate them locally.' },
          { type: 'ul', items: [
            'Remote restore-check recipe: 1) download the backup DB/JSON from your rclone destination, 2) place those files in your local backup/export folder on this machine, 3) run Test restore to validate the local copy.',
          ]},
          { type: 'tip', text: 'On startup, Seedbank creates a safety snapshot after migrations, then runs backup schedule checks. Additional scheduled backups run only when the current frequency is due (daily/weekly).' },
        ],
      },
      {
        id: 'cloud-backup-setup',
        title: 'Cloud Backup Setup (rclone)',
        indexLabel: 'Cloud Backup Setup',
        keywords: ['rclone', 'cloud', 'backup', 'google drive', 'gdrive', 'dropbox', 'onedrive', 'backblaze', 'b2', 's3', 'sftp', 'ssh', 'r2', 'cloudflare', 'install', 'config', 'remote', 'setup'],
        blocks: [
          { type: 'p', text: 'Rclone is free, open-source software that knows how to copy files to 70+ cloud storage providers. You install it once on the Seedbank machine, add one or more named remotes via rclone config, then paste the remote path into Settings → Backups. No credentials ever touch Seedbank — rclone handles all auth.' },

          { type: 'h3', text: 'Step 1 — Install rclone' },
          { type: 'p', text: 'macOS (Homebrew):' },
          { type: 'code', text: 'brew install rclone' },
          { type: 'p', text: 'Linux (official installer — also works on Raspberry Pi / NAS):' },
          { type: 'code', text: 'curl https://rclone.org/install.sh | sudo bash' },
          { type: 'p', text: 'Windows — download the installer from rclone.org/downloads/ or use winget:' },
          { type: 'code', text: 'winget install Rclone.Rclone' },
          { type: 'p', text: 'Verify the install:' },
          { type: 'code', text: 'rclone version' },

          { type: 'h3', text: 'Step 2 — Add a remote (general)' },
          { type: 'p', text: 'Run the interactive config wizard. It will ask you which provider you want and walk you through auth:' },
          { type: 'code', text: 'rclone config' },
          { type: 'ul', items: [
            'Type n to create a new remote.',
            'Enter a short name (no spaces) — e.g. gdrive, mybucket, myb2. You will use this name in Seedbank.',
            'Choose your provider from the numbered list.',
            'Follow the prompts for your provider (details per provider below).',
            'At the end, run rclone listremotes to confirm the remote appears.',
          ]},

          { type: 'h3', text: 'Step 3 — Enter the path in Seedbank' },
          { type: 'p', text: 'In Settings → Backups, click "+ Rclone remote", then set the remote path field to:' },
          { type: 'code', text: 'remote-name:folder/path\n\nExamples:\n  gdrive:backups/seedbank\n  myb2:my-bucket-name/seedbank\n  mydropbox:Backups/Seedbank\n  sftp-nas:volume1/seedbank' },
          { type: 'p', text: 'Click Test destination to verify the connection before saving.' },

          { type: 'h3', text: 'Google Drive' },
          { type: 'p', text: 'During rclone config, choose "Google Drive". When prompted, let rclone open a browser window and log in with your Google account. Accept the permissions. The token is stored locally; Seedbank never sees it.' },
          { type: 'code', text: '# Example remote path for Google Drive:\ngdrive:Backups/Seedbank\n\n# List what is in the remote after setup:\nrclone ls gdrive:Backups/Seedbank' },
          { type: 'tip', text: 'If you are running Seedbank on a headless server with no browser, add --auth-no-open-browser during rclone config and paste the URL into a browser on another machine.' },

          { type: 'h3', text: 'Dropbox' },
          { type: 'p', text: 'Choose "Dropbox" during rclone config. Rclone opens a browser window for OAuth. After auth, the token is stored in your rclone config file.' },
          { type: 'code', text: '# Example remote path:\nmydropbox:Apps/Seedbank\n\n# Verify:\nrclone lsd mydropbox:' },

          { type: 'h3', text: 'Microsoft OneDrive' },
          { type: 'p', text: 'Choose "Microsoft OneDrive" during rclone config. Rclone opens a browser for Microsoft OAuth. Works with personal OneDrive, OneDrive for Business, and SharePoint libraries.' },
          { type: 'code', text: '# Example remote path:\nonedrive:Backups/Seedbank\n\n# Verify:\nrclone lsd onedrive:' },

          { type: 'h3', text: 'Backblaze B2' },
          { type: 'p', text: 'Log in to backblaze.com → App Keys → Add a new application key. Copy the keyID and applicationKey. During rclone config choose "Backblaze B2" and paste those values.' },
          { type: 'code', text: '# Example remote path (bucket:path):\nmyb2:my-bucket-name/seedbank\n\n# Create bucket if needed:\nrclone mkdir myb2:my-bucket-name\n\n# Verify:\nrclone ls myb2:my-bucket-name/seedbank' },

          { type: 'h3', text: 'Amazon S3 (and S3-compatible: Cloudflare R2, Wasabi, MinIO, etc.)' },
          { type: 'p', text: 'During rclone config choose "Amazon S3 Compliant Storage Providers". For AWS, choose "Amazon Web Services (AWS) S3". For R2 or Wasabi, choose "Cloudflare R2 Storage" or "Wasabi Object Storage" respectively. Enter your access key ID and secret access key. For AWS, choose the region that matches your bucket.' },
          { type: 'code', text: '# AWS S3 example:\nmys3:my-bucket-name/seedbank\n\n# Cloudflare R2 example:\nmyr2:my-bucket-name/seedbank\n\n# Create the folder prefix:\nrclone mkdir mys3:my-bucket-name/seedbank\n\n# Verify:\nrclone ls mys3:my-bucket-name/seedbank' },
          { type: 'tip', text: 'Create an IAM user with s3:PutObject, s3:GetObject, s3:ListBucket, and s3:DeleteObject on the target bucket. Use those credentials in rclone rather than your root AWS credentials.' },

          { type: 'h3', text: 'SFTP / SSH (home server, NAS, VPS)' },
          { type: 'p', text: 'During rclone config choose "SSH/SFTP Connection". Enter the hostname, port (default 22), username, and choose key file or password auth.' },
          { type: 'code', text: '# Example remote path:\nsftp-nas:/volume1/backups/seedbank\n\n# Test connectivity:\nrclone ls sftp-nas:/volume1/backups/seedbank\n\n# Tip: use SSH key auth for unattended backups:\n# In rclone config, set key_file to your ~/.ssh/id_ed25519 path.' },

          { type: 'h3', text: 'Verifying your setup' },
          { type: 'p', text: 'After configuring a remote in rclone and adding it in Seedbank, run a manual backup and then check the remote:' },
          { type: 'code', text: '# See what Seedbank has copied:\nrclone ls gdrive:Backups/Seedbank\n\n# Size on remote:\nrclone size gdrive:Backups/Seedbank\n\n# Sync a remote copy to a local folder for manual inspection:\nrclone copy gdrive:Backups/Seedbank ~/seedbank-remote-check/' },

          { type: 'h3', text: 'Headless / server install' },
          { type: 'p', text: 'For OAuth providers (Drive, Dropbox, OneDrive) on a server without a browser, run rclone config on a local machine that does have a browser, then copy the resulting rclone.conf to the server.' },
          { type: 'code', text: '# Default config location:\n# Linux/Mac:  ~/.config/rclone/rclone.conf\n# Windows:    %APPDATA%\\rclone\\rclone.conf\n\n# Copy config to server:\nscp ~/.config/rclone/rclone.conf user@myserver:~/.config/rclone/rclone.conf' },
          { type: 'tip', text: 'Keep your rclone.conf backed up separately — it contains the OAuth tokens that grant access to your cloud storage. Treat it like a password file.' },
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
        keywords: ['settings', 'integrations', 'scaffold', 'graduation', 'project', 'plugin', 'adapter', 'external', 'project root', 'readme', 'agents.md', 'folder', 'github', 'gh', 'publish'],
        blocks: [
          { type: 'p', text: 'Settings → Project Graduation tells Seedbank where to create project folders when you graduate an idea.' },
          { type: 'h3', text: 'Project root' },
          { type: 'p', text: 'Set the parent folder where Seedbank creates new project directories. Each graduated idea gets its own subfolder named after the idea title. Example: root /path/to/Projects + idea "Password manager" → /path/to/Projects/password-manager/.' },
          { type: 'h3', text: 'What files Seedbank creates' },
          { type: 'ul', items: [
            'README.md — always. Contains your idea title, brief, and key context.',
            'AGENTS.md — always. AI-agent context for use with Codex, Claude, Gemini, or another coding assistant.',
            'package.json + starter file — for all ideas except games.',
            'project.godot stub — for game ideas.',
          ]},
          { type: 'h3', text: 'Test connection' },
          { type: 'p', text: 'After saving the project root, click "Test connection" to check that the saved path can be found or created later. The check passes if the path already exists as a directory, or if its parent folder exists (the directory is created on first graduation).' },
          { type: 'h3', text: 'Custom adapters (advanced)' },
          { type: 'p', text: 'Custom local adapters integrate with a specific local workflow tool. They appear in a collapsed Advanced section. Most users do not need them — the built-in Local Project scaffold works for all project types.' },
          { type: 'h3', text: 'GitHub publishing (optional)' },
          { type: 'p', text: 'GitHub publishing is a separate post-graduation step. It never replaces local project creation and is never required to graduate an idea.' },
          { type: 'ul', items: [
            'Install Git and GitHub CLI (`gh`) on this machine, then run `gh auth login`.',
            'Use the GitHub Publishing card in this tab to verify linked account status.',
            'Seedbank displays profile/account details returned by GitHub via gh for confirmation.',
            'Seedbank does not store GitHub tokens; gh CLI owns authentication state.',
          ]},
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
        keywords: ['graduation', 'graduate', 'project', 'scaffold', 'market', 'integration', 'readiness', 'adapter'],
        blocks: [
          { type: 'p', text: 'Graduation turns a mature seed into a real project scaffold. It runs readiness checks, creates files via the chosen adapter, and updates the idea stage based on the adapter result.' },
          { type: 'h3', text: 'How to graduate' },
          { type: 'ul', items: [
            'Open the idea detail page.',
            'Click "Graduate idea" (available once stage is Bloom or later).',
            'Review the readiness checklist — yellow items are warnings, not blockers.',
            'Choose an adapter (local project scaffold, or any configured adapter).',
            'Confirm — files are created in your configured project root and the idea stage is updated by the selected adapter.',
          ]},
          { type: 'h3', text: 'After graduation' },
          { type: 'p', text: 'The idea shows a "Graduated" badge that opens the generated project path in your system file explorer from the local Seedbank server.' },
          { type: 'h3', text: 'Generated files' },
          { type: 'ul', items: [
            'README.md — summary and context you can share with collaborators.',
            'AGENTS.md — starter context for an AI coding session.',
            'package.json + starter file — for non-game ideas.',
            'project.godot stub — for game ideas.',
          ]},
          { type: 'h3', text: 'Where projects are saved' },
          { type: 'p', text: 'Projects are created under the root folder you set in Settings → Project Graduation. Each graduated idea gets its own subfolder.' },
          { type: 'h3', text: 'Using README.md and AGENTS.md' },
          { type: 'p', text: 'Open README.md first to confirm goals, scope, and constraints. Then use AGENTS.md as ready-to-paste context when you start an AI coding session, so the assistant has your project intent from the start.' },
          { type: 'h3', text: 'Advanced custom adapters' },
          { type: 'p', text: 'Most users only need Local Project scaffold. Advanced custom adapters are optional and intended for specific local workflows.' },
          { type: 'tip', text: 'Configure a project root in Settings → Project Graduation before attempting graduation.' },
        ],
      },
      {
        id: 'github-publishing',
        title: 'GitHub Publishing',
        keywords: ['github', 'publish', 'repository', 'repo', 'gh', 'cli', 'private', 'public', 'push', 'origin'],
        blocks: [
          { type: 'p', text: 'GitHub publishing is optional and local-first. Seedbank creates/uses your local project folder first, then you explicitly choose whether to publish that folder to GitHub.' },
          { type: 'h3', text: 'Setup' },
          { type: 'ul', items: [
            'Install Git and GitHub CLI (`gh`), then run `gh auth login`.',
            'Choose GitHub.com and your preferred git protocol (HTTPS or SSH).',
            'Authorize repository access if you plan to publish private repos.',
            'Open Settings → Project Graduation and refresh the GitHub status card.',
          ]},
          { type: 'h3', text: 'Publish flow' },
          { type: 'ul', items: [
            'Open an idea and use Project generation to create the local folder and starter files.',
            'Click Create GitHub repo from the Project generation section.',
            'Set repository name, visibility, and whether to push initial files.',
            'After the repo exists, use Update GitHub repo to commit changed local files when present and push main.',
            'Confirm and review success or partial-failure result details.',
          ]},
          { type: 'h3', text: 'What Seedbank stores' },
          { type: 'p', text: 'Seedbank stores idea data and links in its normal database. It does not store GitHub PATs or gh credentials.' },
          { type: 'tip', text: 'If an idea has not been graduated yet, publish is intentionally disabled until a local project folder exists.' },
        ],
      },
    ],
  },

  {
    label: 'API & Automation',
    sections: [
      {
        id: 'api-automation-overview',
        title: 'API & Automation Overview',
        indexLabel: 'Overview',
        keywords: ['api', 'automation', 'external', 'rest', 'webhook', 'mcp', 'openapi', 'token', 'agent'],
        blocks: [
          { type: 'p', text: 'API & Automation features let you connect Seedbank to scripts, workflow tools, and external AI sessions without changing your core app flow.' },
          { type: 'h3', text: 'REST API' },
          { type: 'p', text: 'Use the local REST API at localhost:4800 for scripts and automations. The full spec is at /api/openapi.json and linked in Settings → API & Server.' },
          { type: 'h3', text: 'Personal access tokens' },
          { type: 'p', text: 'Create scoped bearer tokens in Settings → API & Server for automation clients. Use the smallest scopes needed, then revoke tokens when a workflow is retired.' },
          { type: 'h3', text: 'Outbound webhooks' },
          { type: 'p', text: 'Send idea lifecycle events to another tool by saving a webhook URL and selecting events. Common targets include Zapier, n8n, and custom HTTP services.' },
          { type: 'h3', text: 'MCP endpoints' },
          { type: 'p', text: 'MCP is a read-only API shape for AI tools that support model context protocol connections. Use it when you want an external AI session to read your ideas as context.' },
          { type: 'tip', text: 'Project scaffold setup lives in Settings → Project Graduation and the Graduation help section, not in API & Automation. Project drafting uses Settings → AI & Agents feature routing.' },
        ],
      },
      {
        id: 'api-automation-rest',
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
          { type: 'tip', text: 'The full endpoint list with request/response shapes is in [docs/API.md](https://github.com/ghreprimand/Seedbank/blob/main/docs/API.md).' },
        ],
      },
      {
        id: 'api-automation-webhooks',
        title: 'Outbound Webhooks',
        indexLabel: 'Webhooks',
        keywords: ['webhook', 'outbound', 'http', 'post', 'event', 'automation', 'zapier', 'n8n', 'idea.created', 'idea.graduated', 'idea.shipped'],
        blocks: [
          { type: 'p', text: 'Seedbank sends an HTTP POST with the full idea JSON to your configured URL when lifecycle events occur.' },
          { type: 'h3', text: 'Events' },
          { type: 'ul', items: [
            'idea.created — a new idea is planted.',
            'idea.graduated — an idea has been graduated to a project.',
            'idea.shipped — an idea is marked as Market stage.',
          ]},
          { type: 'h3', text: 'Setup' },
          { type: 'p', text: 'Go to Settings → API & Server → Webhooks. Enter a URL and tick the events you want. Any publicly reachable HTTP endpoint works — a Zapier webhook, an n8n trigger URL, a local webhook proxy, or your own server.' },
          { type: 'tip', text: 'For local testing, use a tool like ngrok or smee.io to expose a localhost port, or point the webhook at a request-bin service.' },
        ],
      },
      {
        id: 'api-automation-mcp',
        title: 'MCP Context Endpoints',
        indexLabel: 'MCP',
        keywords: ['mcp', 'model context protocol', 'claude', 'codex', 'llm', 'context', 'search', 'read-only', 'bearer', 'token'],
        blocks: [
          { type: 'p', text: 'The MCP endpoints make your seed garden readable as context for external AI sessions. They are read-only; external/bearer clients should use a token with mcp:read scope, while local loopback requests can use implicit local auth.' },
          { type: 'ul', items: [
            'GET /api/mcp/ideas — paginated idea summaries (`items`, `total`, `limit`, `offset`).',
            'GET /api/mcp/ideas/:id — full idea detail plus rendered markdown.',
            'GET /api/mcp/search?q=<query> — idea summaries matching a search query.',
          ]},
          { type: 'h3', text: 'Usage' },
          { type: 'p', text: 'Configure an external AI tool or agent to call these endpoints (with Authorization: Bearer <your-token>) before or during a session. The tool can then reference your ideas when answering questions or generating content.' },
          { type: 'tip', text: 'Create a dedicated token with mcp:read scope for MCP access. Revoke it from Settings → API & Server if it is no longer needed.' },
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
          { type: 'p', text: 'Seedbank is local-first. Your idea data stays on your machine unless you enable cloud AI providers or offsite backup destinations.' },
          { type: 'ul', items: [
            'Database: <seedbank-data-dir>/seedbank.db (SQLite). Default location shown in Settings → API & Server → Server Info.',
            'Backups: <seedbank-data-dir>/backups/',
            'JSON exports: <seedbank-data-dir>/exports/',
            'Seedbank does not send idea data to cloud services unless you configure a cloud AI provider or offsite backup destination.',
          ]},
          { type: 'tip', text: 'AI features send idea content to your configured AI provider. Local providers (Ollama, LM Studio, vLLM, llama.cpp, LocalAI at localhost) keep content on this machine. Cloud providers (OpenAI API, Anthropic API, OpenRouter, Groq, Mistral, and others) send content to external servers. Feature Defaults can route individual features to different providers — verify each route if privacy matters.' },
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
            'AI account sessions are handled by their provider login flow; Seedbank does not store account passwords.',
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
          { type: 'p', text: 'Check Settings → AI & Agents. For API-key methods, verify the key is saved and use "Test connection". For Claude or Codex account methods, use the account card to refresh status or sign in again. A persistent reauth notice links directly there when Seedbank previously saw the account authenticated but current auth is missing.' },
          { type: 'h3', text: 'Ideas lost after browser clear' },
          { type: 'p', text: 'If the server was running when ideas were captured, they are in the SQLite database and safe. If the server was offline when ideas were captured, they are in IndexedDB. Open the Data Migration dialog (if prompted on startup) to move them to SQLite.' },
          { type: 'h3', text: 'Project drafting fails' },
          { type: 'p', text: 'Check Settings → AI & Agents → Feature Defaults → Project drafting. Verify the selected provider is authenticated, the model is allowed by guardrails, and the daily token budget has not been reached.' },
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
