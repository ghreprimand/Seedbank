import type { HelpEntry } from './helpTypes';

export const HELP_CONTENT_MAP: Record<string, HelpEntry> = {
  // Global shell
  'layout-header': {
    title: 'Header Bar',
    body: 'Global navigation and fast actions: search, Discover, Compost, Manual, Settings, and quick capture.',
    manualSection: 'quick-start',
  },
  'layout-search': {
    title: 'Global Search',
    body: 'Search ideas by title, pitch, notes, and tags. Press / from anywhere to focus this field.',
    manualSection: 'garden',
  },
  'layout-quick-capture': {
    title: 'Plant a Seed',
    body: 'Open quick capture to create a new idea with minimal friction.',
    manualSection: 'quick-start',
  },
  'layout-manual': {
    title: 'Manual',
    body: 'Open the in-app manual. You can also press ? from anywhere.',
    manualSection: 'overview',
  },
  'layout-settings-nav': {
    title: 'Settings Shortcut',
    body: 'Open Settings to manage providers, backups, categories, integrations, and app behavior.',
    manualSection: 'settings-general',
  },
  'layout-discover-nav': {
    title: 'Discover Shortcut',
    body: 'Open Discover to resurface, recombine, and analyze ideas across your archive.',
    manualSection: 'discover',
  },
  'layout-compost-nav': {
    title: 'Compost Shortcut',
    body: 'Open deleted ideas and restore or purge them during the retention window.',
    manualSection: 'compost',
  },
  'account-reauth-notice': {
    title: 'Account Reauth Needed',
    body: 'This persistent notice appears when Seedbank previously saw Claude or Codex account auth in this browser, but the current account transport is signed out.',
    details: 'Use the Open AI settings link to jump directly to Settings → AI & Agents and sign in again. Intentional logout clears the reminder.',
    manualSection: 'settings-ai',
  },

  // Board
  'garden-page': {
    title: 'The Garden',
    body: 'Your main board of active ideas. Filter, search, and sort to find what to work on next.',
    manualSection: 'garden',
  },
  'garden-filters': {
    title: 'Board Filters',
    body: 'Filter by category, stage, and tags. Filters combine with AND logic.',
    manualSection: 'garden',
  },
  'garden-grid': {
    title: 'Idea Cards',
    body: 'Each card opens the full idea detail view with fields, scores, links, and history.',
    manualSection: 'idea-editing',
  },

  // Discover
  'discover-page': {
    title: 'Discover',
    body: 'Use discovery tools to revisit ideas, find combinations, and inspect archive patterns.',
    manualSection: 'discover',
  },
  'discover-daily-seed': {
    title: 'Daily Seed',
    body: 'Randomly resurfaces an idea and prompt for a quick second look.',
    manualSection: 'discover',
  },
  'discover-cross-pollinate': {
    title: 'Cross-Pollinate',
    body: 'Pairs ideas to reveal non-obvious overlaps and mashup opportunities.',
    manualSection: 'discover',
  },
  'discover-storage-draw': {
    title: 'Draw from Storage',
    body: 'Pulls a shelved or cold-storage idea back into active attention.',
    manualSection: 'discover',
  },
  'discover-weather': {
    title: 'Idea Weather',
    body: 'Shows aggregate trends: stage distribution, top categories/tags, and archive insights.',
    manualSection: 'discover',
  },
  'discover-pattern-insight': {
    title: 'Pattern Insight',
    body: 'Runs an AI-assisted summary over archive patterns, repeated themes, and gaps.',
    manualSection: 'discover',
  },

  // Compost
  'compost-page': {
    title: 'Compost',
    body: 'Soft-deleted ideas live here temporarily. Restore them or purge immediately.',
    manualSection: 'compost',
  },
  'compost-list': {
    title: 'Deleted Ideas',
    body: 'Each row shows remaining retention days and recovery actions.',
    manualSection: 'compost',
  },

  // Idea detail
  'idea-detail-page': {
    title: 'Idea Detail',
    body: 'Main editor for title, stage, category, notes, scores, links, and AI-assisted workflows.',
    manualSection: 'idea-editing',
  },
  'idea-actions': {
    title: 'Idea Actions',
    body: 'Export, graduate, move to cold storage (or restore to shelved), duplicate, and delete from this control group.',
    manualSection: 'idea-editing',
  },
  'idea-header': {
    title: 'Title, Stage, Category',
    body: 'Set the core identity and lifecycle position of this idea.',
    manualSection: 'stages',
  },
  'idea-core-fields': {
    title: 'Core Idea Fields',
    body: 'Capture pitch, notes, hook, why it might work, risks, and tech stack. Auto-saves apply after edits.',
    manualSection: 'idea-editing',
  },
  'idea-tags-and-scores': {
    title: 'Tags, Mood, and Scores',
    body: 'Use labels and scores to make sorting and triage more meaningful.',
    manualSection: 'idea-editing',
  },
  'idea-links-related': {
    title: 'Links and Related Ideas',
    body: 'Attach references and connect related seeds for easier navigation and synthesis.',
    manualSection: 'idea-editing',
  },
  'health-check': {
    title: 'Idea Health Check',
    body: 'Analyzes completeness and quality signals across critical idea fields.',
    manualSection: 'health-check',
  },
  'agent-run': {
    title: 'Develop with Agent',
    body: 'Launches a linked coding agent against a generated workspace derived from this idea.',
    manualSection: 'agents',
  },
  'idea-thinking-partner': {
    title: 'Thinking Partner',
    body: 'Discuss and refine your idea with AI while retaining final editorial control.',
    manualSection: 'thinking-partner',
  },
  'idea-version-history': {
    title: 'Version History',
    body: 'Browse snapshots and restore prior versions of the idea.',
    manualSection: 'version-history',
  },
  'idea-delete-modal': {
    title: 'Delete Confirmation',
    body: 'Deletion moves the idea to Compost first, where it remains recoverable during retention.',
    manualSection: 'compost',
  },

  // Settings shell
  'settings-page': {
    title: 'Settings',
    body: 'Configure Seedbank behavior, integrations, providers, backups, and visual appearance.',
    manualSection: 'settings-general',
  },
  'settings-tab-nav': {
    title: 'Settings Tabs',
    body: 'Switch between General, AI & Agents, Theme, API & Server, Backups, Categories, Project Graduation, and About.',
    manualSection: 'settings-general',
  },
  'settings-tab-content': {
    title: 'Active Settings Tab',
    body: 'This panel shows controls for the currently selected settings section.',
    manualSection: 'settings-general',
  },

  // General
  'settings-general-data': {
    title: 'Import and Export',
    body: 'Archive-level import/export for JSON and Markdown backups.',
    manualSection: 'import-export',
  },
  'settings-general-shortcuts': {
    title: 'Keyboard Shortcuts',
    body: 'Quick reference for global keyboard shortcuts used across Seedbank.',
    manualSection: 'quick-start',
  },

  // AI settings
  'settings-ai-services': {
    title: 'AI Services',
    body: 'Top-level AI setup area. Configure provider methods here, then route features in Feature Defaults.',
    details: 'Provider cards in this section are actual backend routes. Changes here directly affect what AI service processes idea content.',
    manualSection: 'provider-chooser',
  },
  'settings-ai-claude-service': {
    title: 'Claude Service',
    body: 'Methods for Claude-family routing: Anthropic API key or Claude account login.',
    details: 'Both methods are chat/model routes available to Feature Defaults and Ask AI. Optional Claude Code CLI agent runs are separate and file-producing.',
    manualSection: 'settings-ai',
  },
  'settings-ai-codex-service': {
    title: 'Codex / OpenAI Service',
    body: 'Methods for OpenAI-family routing: OpenAI API key or Codex account login.',
    details: 'Codex account is an account-login provider route via local app-server auth. It is not Codex CLI and not the external cloud-router section.',
    manualSection: 'settings-ai',
  },
  'settings-ai-local-models': {
    title: 'Local Models',
    body: 'Configure local inference methods such as Ollama or local OpenAI-compatible servers.',
    details: 'Local instances can be saved separately (label, URL, model, status) and routed independently per feature.',
    manualSection: 'settings-ai',
  },
  'settings-ai-external-cloud': {
    title: 'External / Cloud',
    body: 'Configure hosted OpenAI-compatible providers (OpenRouter, Groq, Mistral, Together, Fireworks, custom HTTPS).',
    details: 'Requests routed here leave your machine. Use enabled-model subsets to limit what appears in Feature Defaults and Ask AI.',
    manualSection: 'settings-ai',
  },
  'settings-ai-provider-card': {
    title: 'Provider Method Card',
    body: 'This card configures one concrete provider method instance.',
    details: 'Set default, test/list models, and configure model/key/URL in one place. Each card represents a routable backend method.',
    manualSection: 'settings-ai',
  },
  'settings-ai-add-local-instance': {
    title: 'Add Local Instance',
    body: 'Create a new saved local provider instance with its own label, URL, and default model.',
    details: 'Use separate instances when you run multiple local servers so each can be routed independently in Feature Defaults.',
    manualSection: 'settings-ai',
  },
  'settings-ai-add-external-instance': {
    title: 'Add External Instance',
    body: 'Create a new saved external/cloud provider instance with its own endpoint, model, and API key.',
    details: 'Useful for separating personal/work accounts, provider experiments, or model-access policies.',
    manualSection: 'settings-ai',
  },
  'settings-ai-feature-defaults': {
    title: 'Feature Defaults',
    body: 'Route each AI feature to either the global default or a specific provider instance.',
    details: 'These routes are executed by the backend on every AI call. Row-level overrides do not change the global default.',
    manualSection: 'settings-ai',
  },
  'settings-ai-feature-defaults-global': {
    title: 'Global Default Route',
    body: 'Baseline provider/model/effort route inherited by feature rows using "Use global default".',
    details: 'If a row uses this inheritance mode, this global route is what actually runs for that feature.',
    manualSection: 'settings-ai',
  },
  'settings-ai-feature-defaults-row': {
    title: 'Feature Route Row',
    body: 'Per-feature runtime route configuration.',
    details: 'Select provider/model/effort per feature when you need different cost, quality, privacy, or latency tradeoffs.',
    manualSection: 'settings-ai',
  },
  'settings-ai-feature-provider': {
    title: 'Feature Provider Selector',
    body: 'Choose the provider instance for this feature route.',
    details: 'Choose "Use global default" to inherit; choose a specific instance to override this feature only.',
    manualSection: 'settings-ai',
  },
  'settings-ai-feature-model': {
    title: 'Feature Model Selector',
    body: 'Choose model ID for this feature route.',
    details: 'Discovered model lists come from the selected provider instance. Manual model IDs are still allowed.',
    manualSection: 'settings-ai',
  },
  'settings-ai-feature-effort': {
    title: 'Feature Effort Selector',
    body: 'Optional reasoning-depth control for compatible provider/model combinations.',
    details: 'Effort controls are hidden or disabled when unsupported by the selected model route.',
    manualSection: 'settings-ai',
  },
  'settings-ai-feature-verbosity': {
    title: 'Feature Verbosity Selector',
    body: 'Optional response-detail control for compatible routes.',
    details: 'Use lower verbosity for concise outputs and higher verbosity when you want more complete analysis.',
    manualSection: 'settings-ai',
  },
  'settings-ai-guardrails': {
    title: 'Usage and Guardrails',
    body: 'Control token budgets, provider availability, and safety-related routing constraints.',
    manualSection: 'settings-ai',
  },

  // Theme
  'settings-theme-picker': {
    title: 'Theme Picker',
    body: 'Select a visual theme for Seedbank or let it follow your operating system.',
    manualSection: 'settings-theme',
  },

  // API / server
  'settings-api-server': {
    title: 'Server Info',
    body: 'Server details plus API reference links (including openapi.json) for integrations and automation tooling.',
    manualSection: 'settings-api',
  },
  'settings-api-reference': {
    title: 'API Reference',
    body: 'Open the machine-readable OpenAPI document and API docs entry points.',
    details: 'Use this to inspect route contracts, generate clients, or wire automation tools.',
    manualSection: 'api-automation-rest',
  },
  'settings-api-tokens': {
    title: 'Personal Access Tokens',
    body: 'Create scoped API tokens for scripts and automations.',
    manualSection: 'settings-api',
  },
  'settings-api-webhooks': {
    title: 'Webhooks',
    body: 'Configure outbound event notifications for key idea lifecycle events.',
    manualSection: 'api-automation-webhooks',
  },

  // Backups
  'settings-backups-overview': {
    title: 'Backup Overview',
    body: 'Shows latest backup status and destination context.',
    manualSection: 'settings-backups',
  },
  'settings-backup-schedule': {
    title: 'Backup Schedule',
    body: 'Set frequency, retention, and JSON export behavior.',
    manualSection: 'settings-backups',
  },
  'settings-backup-destinations': {
    title: 'Backup Destinations',
    body: 'Configure and test local paths or rclone remotes for backup copies.',
    manualSection: 'settings-backups',
  },
  'settings-backup-restore-validation': {
    title: 'Restore Validation',
    body: 'Run validation checks to confirm backup archives are restorable.',
    manualSection: 'settings-backups',
  },

  // Categories
  'settings-categories-manager': {
    title: 'Category Manager',
    body: 'Add, rename, reorder, archive, and remove idea categories.',
    manualSection: 'settings-categories',
  },

  // Integrations
  'settings-integrations-page': {
    title: 'Project Graduation Integrations',
    body: 'Configure adapters that turn ideas into project scaffolds.',
    manualSection: 'settings-integrations',
  },
  'settings-integrations-card': {
    title: 'Integration Card',
    body: 'Set adapter-specific config and test connection health before graduating ideas.',
    manualSection: 'settings-integrations',
  },

  // About
  'settings-about': {
    title: 'About Seedbank',
    body: 'Version, source links, and app overview.',
    manualSection: 'settings-about',
  },

  // Modals
  'quick-capture-modal': {
    title: 'Quick Capture',
    body: 'Fast idea intake modal. Title is required; notes are optional and editable later.',
    manualSection: 'quick-start',
  },
  'import-export-modal': {
    title: 'Import and Export Modal',
    body: 'Archive-level data transfer for backup, restore, and migration workflows.',
    manualSection: 'import-export',
  },
  'graduation-modal': {
    title: 'Graduation Modal',
    body: 'Choose an integration and turn a mature idea into a project scaffold.',
    manualSection: 'graduation',
  },
  'manual-modal': {
    title: 'Manual Modal',
    body: 'Search and browse the in-app documentation by section.',
    manualSection: 'overview',
  },
  'ai-assist-modal': {
    title: 'Ask AI Modal',
    body: 'Contextual AI assistant for a specific field. Choose intent, review output, and apply only what you want.',
    manualSection: 'ai-suggestions',
  },
  'agent-run-modal': {
    title: 'Agent Run Panel',
    body: 'Run an optional Claude Code or Codex CLI agent against a scratch workspace (or continued project path).',
    details: 'This is file-producing agent execution, separate from Thinking Partner chat and Ask AI field suggestions.',
    manualSection: 'agents',
  },
  'agent-run-prompt': {
    title: 'Agent Prompt',
    body: 'Initial instruction sent to the selected CLI agent for this run.',
    details: 'Be explicit about desired files, scope boundaries, and output format to get cleaner proposals.',
    manualSection: 'agents',
  },
  'agent-run-transcript': {
    title: 'Agent Transcript',
    body: 'Live stream of stdout/stderr from the running agent process.',
    details: 'Use this to monitor progress, catch errors early, and decide when to stop or rerun.',
    manualSection: 'agents',
  },
  'agent-run-proposed-files': {
    title: 'Proposed Files',
    body: 'Files discovered from the run output for review and selection.',
    details: 'In scratch mode, select exactly which outputs to copy into idea attachments.',
    manualSection: 'agents',
  },
  'agent-run-apply': {
    title: 'Apply Selected Files',
    body: 'Copies selected scratch-run files into this idea’s attachments.',
    details: 'This does not auto-overwrite canonical idea fields such as pitch, hook, or notes.',
    manualSection: 'agents',
  },
};

export const FALLBACK_HELP_ENTRY: HelpEntry = {
  title: 'Context Help',
  body: 'No dedicated help entry is attached here yet. Try selecting a nearby labeled section or open the manual.',
  manualSection: 'overview',
};
