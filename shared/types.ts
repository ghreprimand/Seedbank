/**
 * Seedbank core domain types.
 *
 * These types define the shape of Seedbank data shared by the client,
 * server, imports, and exports. All IDs are UUIDs.
 */

// ── Enums / unions ──────────────────────────────────────────────────

/** Idea categories — what kind of project is this? */
export const CATEGORIES = [
  'game',
  'app',
  'tool',
  'art-project',
  'local-ai',
  'mobile',
  'browser',
  'open-source-utility',
] as const;

export type BuiltInCategory = (typeof CATEGORIES)[number];
export type Category = string;

/** Human-readable labels for categories */
export const CATEGORY_LABELS: Record<string, string> = {
  'game': 'Game',
  'app': 'App',
  'tool': 'Tool',
  'art-project': 'Art Project',
  'local-ai': 'Local AI',
  'mobile': 'Mobile',
  'browser': 'Browser',
  'open-source-utility': 'Open-Source Utility',
};

export interface CategoryDefinition {
  id: Category;
  label: string;
  color?: string;
  icon?: string;
  archived?: boolean;
  sortOrder: number;
  builtIn?: boolean;
}

export interface CategorySettings {
  schemaVersion: 1;
  items: CategoryDefinition[];
}

export const DEFAULT_CATEGORY_DEFINITIONS: CategoryDefinition[] = CATEGORIES.map((id, index) => ({
  id,
  label: CATEGORY_LABELS[id],
  sortOrder: index,
  builtIn: true,
}));

/**
 * Idea stages — gardening-themed lifecycle.
 *
 * seed        → rough / new / just captured
 * sprout      → stronger concept, some structure
 * pitch       → bloom — developed enough to explain clearly
 * prototype   → greenhouse — actively being built / experimented with
 * plot        → full active project
 * shelved     → dormant — paused but preserved
 * cold-storage → deep archive, still searchable
 * shipped     → market — done, released, or completed
 */
export const STAGES = [
  'seed',
  'sprout',
  'pitch',
  'prototype',
  'plot',
  'shelved',
  'cold-storage',
  'shipped',
] as const;

export type Stage = (typeof STAGES)[number];

/** Human-readable labels for stages */
export const STAGE_LABELS: Record<Stage, string> = {
  'seed': 'Seed',
  'sprout': 'Sprout',
  'pitch': 'Bloom',
  'prototype': 'Greenhouse',
  'plot': 'Plot',
  'shelved': 'Dormant',
  'cold-storage': 'Cold Storage',
  'shipped': 'Market',
};

/** Emoji/icon hints for stages (used in badges) */
export const STAGE_ICONS: Record<Stage, string> = {
  'seed': '🌱',
  'sprout': '🌿',
  'pitch': '🌸',
  'prototype': '🏡',
  'plot': '🌳',
  'shelved': '💤',
  'cold-storage': '❄️',
  'shipped': '🧑‍🌾',
};

export type IdeaFieldVisibilityKey =
  | 'title'
  | 'pitch'
  | 'tags'
  | 'moodLabels'
  | 'excitementScore'
  | 'hook'
  | 'whyItMightWork'
  | 'fullNotes'
  | 'risks'
  | 'techStack'
  | 'aesthetic'
  | 'retrospective'
  | 'jamScore'
  | 'links'
  | 'images'
  | 'relatedIdeaIds'
  | 'landscapeAnalysis';

const ALL_IDEA_FIELDS: readonly IdeaFieldVisibilityKey[] = [
  'title',
  'fullNotes',
  'hook',
  'whyItMightWork',
  'pitch',
  'risks',
  'techStack',
  'aesthetic',
  'retrospective',
  'tags',
  'moodLabels',
  'excitementScore',
  'jamScore',
  'links',
  'images',
  'relatedIdeaIds',
  'landscapeAnalysis',
];

export const IDEA_FIELD_VISIBILITY_KEYS = ALL_IDEA_FIELDS;

/**
 * Progressive disclosure field visibility by stage.
 * The detail editor can still expose all fields via an explicit user override.
 */
export const STAGE_FIELD_VISIBILITY: Record<Stage, readonly IdeaFieldVisibilityKey[]> = {
  seed: [
    'title',
    'fullNotes',
    'tags',
    'moodLabels',
    'excitementScore',
    'landscapeAnalysis',
  ],
  sprout: [
    'title',
    'fullNotes',
    'hook',
    'tags',
    'moodLabels',
    'excitementScore',
    'landscapeAnalysis',
  ],
  pitch: [
    'title',
    'fullNotes',
    'hook',
    'whyItMightWork',
    'pitch',
    'tags',
    'moodLabels',
    'excitementScore',
    'landscapeAnalysis',
  ],
  prototype: [
    'title',
    'fullNotes',
    'hook',
    'whyItMightWork',
    'pitch',
    'risks',
    'techStack',
    'tags',
    'moodLabels',
    'excitementScore',
    'landscapeAnalysis',
  ],
  plot: [
    'title',
    'fullNotes',
    'hook',
    'whyItMightWork',
    'pitch',
    'risks',
    'techStack',
    'aesthetic',
    'tags',
    'moodLabels',
    'excitementScore',
    'jamScore',
    'links',
    'images',
    'relatedIdeaIds',
    'landscapeAnalysis',
  ],
  shelved: ALL_IDEA_FIELDS,
  'cold-storage': ALL_IDEA_FIELDS,
  shipped: ALL_IDEA_FIELDS,
};

// ── Link type ───────────────────────────────────────────────────────

/** A labeled URL reference attached to an idea */
export interface IdeaLink {
  url: string;
  label: string;
}

// ── Core idea type ──────────────────────────────────────────────────

/**
 * The main Idea record stored in IndexedDB.
 *
 * Fields map to the readme spec:
 *   title, pitch, category, stage, tags, moodLabels,
 *   fullNotes, hook, whyItMightWork, risks, techStack,
 *   jamScore, excitementScore, relatedIdeaIds, links, images,
 *   createdAt, updatedAt
 */
export interface Idea {
  /** UUID v4, generated client-side */
  id: string;

  // ── Identity ────────────────────────────────────────
  title: string;
  /** One-line pitch */
  pitch: string;
  category: Category;
  stage: Stage;

  // ── Taxonomy ────────────────────────────────────────
  tags: string[];
  /** Mood / vibe labels (e.g. "cozy", "chaotic", "meditative") */
  moodLabels: string[];

  // ── Long-form fields ────────────────────────────────
  /** Full pitch notes / detailed description */
  fullNotes: string;
  /** Hook or 30-second demo concept */
  hook: string;
  /** Why this idea might work */
  whyItMightWork: string;
  /** Risks and blockers */
  risks: string;
  /** Tech stack notes */
  techStack: string;
  /** Visual tone, style direction, or aesthetic references */
  aesthetic: string;
  /** What happened after execution: lessons, outcomes, follow-ups */
  retrospective: string;

  // ── Scores ──────────────────────────────────────────
  /** Feasibility 1–5 (0 = unscored) */
  jamScore: number;
  /** Personal excitement 1–5 (0 = unscored) */
  excitementScore: number;

  // ── Relations ───────────────────────────────────────
  /** IDs of related ideas (cross-references) */
  relatedIdeaIds: string[];
  /** External links with labels */
  links: IdeaLink[];
  /** Paths or data-URIs for attached images */
  images: string[];

  // ── Timestamps ──────────────────────────────────────
  createdAt: Date;
  updatedAt: Date;
  /** Soft-delete timestamp. Undefined/null means active. */
  deletedAt?: Date | null;
  /** External graduation target added by integrations in later phases. */
  graduatedTo?: string | null;
}

export interface StageTransition {
  id: string;
  ideaId: string;
  fromStage: Stage;
  toStage: Stage;
  transitionedAt: Date;
  auto: boolean;
}

export interface LandscapeReport {
  id: string;
  ideaId: string;
  sections: AiLandscapeAnalysisSections;
  provider: string;
  model: string;
  createdAt: Date;
}

// ── Version snapshot ────────────────────────────────────────────────

/**
 * A point-in-time snapshot of an idea's content fields.
 * Stored in a separate table so we never lose history.
 *
 * Contains all the "content" fields of Idea (everything except id,
 * relatedIdeaIds, createdAt, updatedAt — those are structural).
 */
export interface IdeaVersion {
  /** UUID v4 */
  id: string;
  /** The idea this version belongs to */
  ideaId: string;
  /** Human label, e.g. "first spark", "stronger pitch", auto-generated */
  versionLabel: string;
  /** Optional notes about what changed */
  notes: string;
  /** ISO timestamp of when the snapshot was taken */
  timestamp: Date;
  /** Serialized snapshot of the idea's content fields */
  snapshot: IdeaSnapshot;
}

/**
 * The subset of Idea fields that get versioned.
 * Structural fields (id, relatedIdeaIds, timestamps) are excluded.
 */
export interface IdeaSnapshot {
  title: string;
  pitch: string;
  category: Category;
  stage: Stage;
  tags: string[];
  moodLabels: string[];
  fullNotes: string;
  hook: string;
  whyItMightWork: string;
  risks: string;
  techStack: string;
  aesthetic: string;
  retrospective: string;
  jamScore: number;
  excitementScore: number;
  links: IdeaLink[];
  images: string[];
}

// ── Filter / search types ───────────────────────────────────────────

export type SortField = 'createdAt' | 'updatedAt' | 'excitementScore' | 'title';
export type SortDirection = 'asc' | 'desc';

export interface IdeaFilters {
  /** Free-text search across title, pitch, notes, tags */
  query?: string;
  /** Filter to these categories (empty = all) */
  categories?: Category[];
  /** Filter to these stages (empty = all) */
  stages?: Stage[];
  /** Filter to ideas that have ALL of these tags */
  tags?: string[];
  /** Sort field */
  sortBy?: SortField;
  /** Sort direction */
  sortDirection?: SortDirection;
}

// ── Integration / graduation types ─────────────────────────────────

export interface GraduationReadiness {
  ready: boolean;
  missing: string[];
  score: number;
}

/** Describes a single field in an integration's configuration form. */
export type ConfigFieldType = 'path' | 'url' | 'port' | 'text' | 'secret' | 'boolean';

export interface ConfigFieldDescriptor {
  /** Matches a key in the configure() config object. */
  key: string;
  label: string;
  type: ConfigFieldType;
  placeholder?: string;
  helpText?: string;
  required?: boolean;
}

export type IntegrationHealthStatus = 'ok' | 'degraded' | 'unreachable' | 'unconfigured';

export interface IntegrationHealthResult {
  status: IntegrationHealthStatus;
  message?: string;
  latencyMs?: number;
}

export interface IntegrationSummary {
  id: string;
  name: string;
  description: string;
  icon: string;
  configured: boolean;
  /** Schema driving the dynamic config form in the UI. */
  configSchema: ConfigFieldDescriptor[];
  /** Current non-secret config values for pre-populating the form. */
  configValues: Record<string, string>;
  /** Manual section to deep-link help buttons to. */
  helpSectionId?: string;
}

export interface GraduationResult {
  integrationId: string;
  ideaId: string;
  projectName: string;
  path: string;
  url?: string;
  graduatedTo: string;
  stage: Stage;
  filesCreated: string[];
  message: string;
}

// ── AI assistance types ────────────────────────────────────────────

export type AiProviderId =
  | 'openai'
  | 'anthropic'
  | 'ollama'
  | 'openai-compatible'
  | 'claude-account'
  | 'codex-account';

export const AI_PROVIDER_IDS: readonly AiProviderId[] = [
  'openai',
  'anthropic',
  'ollama',
  'openai-compatible',
  'claude-account',
  'codex-account',
] as const;

export type AiProviderInstanceId = string;

export const AI_PROVIDER_INSTANCE_IDS: readonly AiProviderInstanceId[] = [
  'claude-api',
  'claude-account',
  'openai-api',
  'codex-account',
  'ollama',
  'local-openai-compatible',
  'cloud-openai-compatible',
] as const;

export type AiProviderFamily = 'api' | 'local' | 'custom-endpoint' | 'account';
export type AiProviderAuthMode = 'api-key' | 'local-server' | 'account' | 'none';
export type AiProviderDataResidency = 'cloud' | 'local' | 'user-controlled';
export type AiProviderInstanceConnectionMode =
  | 'api-key'
  | 'account-login'
  | 'local-server'
  | 'openai-compatible-cloud'
  | 'openai-compatible-local';

export type AiOpenAICompatiblePresetId =
  | 'openrouter'
  | 'groq'
  | 'mistral'
  | 'together'
  | 'fireworks'
  | 'lm-studio'
  | 'vllm'
  | 'llama-cpp'
  | 'localai'
  | 'custom';

export type AiProviderCapability =
  | 'chat'
  | 'streaming'
  | 'model-discovery'
  | 'local'
  | 'api-key'
  | 'account-auth';

export type AiProviderErrorCode =
  | 'not_configured'
  | 'bad_url'
  | 'unreachable'
  | 'model_missing'
  | 'http_error'
  | 'parse_error'
  | 'unknown';

export interface AiProviderDescriptor {
  id: AiProviderId;
  label: string;
  shortLabel: string;
  family: AiProviderFamily;
  transport:
    | 'openai-responses'
    | 'anthropic-messages'
    | 'ollama-chat'
    | 'openai-chat-completions'
    | 'claude-account-native'
    | 'codex-account-app-server';
  authMode: AiProviderAuthMode;
  dataResidency: AiProviderDataResidency;
  defaultModel: string;
  capabilities: AiProviderCapability[];
  requiresApiKey: boolean;
  local: boolean;
  modelDiscovery: boolean;
  baseUrl?: string;
  presetId?: AiOpenAICompatiblePresetId;
  beta?: boolean;
}

export type AiMethodServiceFamily = 'claude' | 'codex-openai' | 'local-inference' | 'external-router';
export type AiMethodConnection = 'api-key' | 'account' | 'local-server' | 'openai-compatible';
export type AiMethodChannel = 'chat-model';
export type AiMethodAvailability = 'available' | 'auth-required' | 'unavailable';
export type AiProviderInstanceAvailability = 'available' | 'auth-required' | 'unavailable';

export interface AiProviderInstanceDescriptor {
  id: AiProviderInstanceId;
  provider: AiProviderId;
  label: string;
  family: AiProviderFamily;
  connectionMode: AiProviderInstanceConnectionMode;
  dataResidency: AiProviderDataResidency;
  capabilities: AiProviderCapability[];
  featureRoutable: boolean;
  modelDiscovery: boolean;
  requiresApiKey: boolean;
  local: boolean;
  defaultModel: string;
  baseUrl?: string;
  presetId?: AiOpenAICompatiblePresetId;
}

export type AiProviderRegistryRequiredField =
  | 'apiKey'
  | 'accountLogin'
  | 'runtime'
  | 'baseUrl'
  | 'model'
  | 'preset';

export interface AiProviderInstanceRegistryEntry {
  id: AiProviderInstanceId;
  provider: AiProviderId;
  family: AiProviderFamily;
  connectionMode: AiProviderInstanceConnectionMode;
  dataResidency: AiProviderDataResidency;
  requiredFields: AiProviderRegistryRequiredField[];
  supportsModelDiscovery: boolean;
  supportsHealthCheck: boolean;
  supportsPreflight: boolean;
  supportsUsageAuditMetadata: boolean;
}

export type AiProviderDiagnosticCode =
  | 'missing_key'
  | 'invalid_url'
  | 'unreachable_endpoint'
  | 'model_missing'
  | 'auth_required'
  | 'runtime_unavailable'
  | 'content_residency';

export interface AiProviderInstanceDiagnostic {
  instanceId: AiProviderInstanceId;
  provider: AiProviderId;
  code: AiProviderDiagnosticCode;
  message: string;
  severity: 'info' | 'warning' | 'error';
  dataResidency?: AiProviderDataResidency;
  detail?: string;
}

export interface AiProviderInstanceConfig {
  id: AiProviderInstanceId;
  provider: AiProviderId;
  label: string;
  family: AiProviderFamily;
  connectionMode: AiProviderInstanceConnectionMode;
  dataResidency: AiProviderDataResidency;
  capabilities: AiProviderCapability[];
  featureRoutable: boolean;
  modelDiscovery: boolean;
  configuredModel: string;
  discoveredModels: AiModelInfo[];
  /**
   * Optional per-instance model allowlist for broad catalog providers such as OpenRouter.
   * Empty/undefined means every discovered model is available for routing.
   */
  enabledModelIds?: string[];
  lastProbeStatus?: 'connected' | 'key-needed' | 'unreachable' | 'not-tested';
  lastProbedAt?: string;
  available: AiProviderInstanceAvailability;
  availabilityReason?: string;
  authenticated?: boolean;
  requiresApiKey: boolean;
  hasApiKey: boolean;
  local: boolean;
  baseUrl?: string;
  presetId?: AiOpenAICompatiblePresetId;
}

export type AiClaudeServiceMethod = 'anthropic-api-key' | 'claude-account-native';
export type AiCodexOpenAIServiceMethod = 'openai-api-key' | 'codex-account-app-server';
export type AiLocalModelServiceMethod =
  | 'ollama'
  | 'lm-studio'
  | 'vllm'
  | 'llama-cpp'
  | 'localai'
  | 'custom-local';

export interface AiMethodCapability {
  id: string;
  label: string;
  serviceFamily: AiMethodServiceFamily;
  connectionMethod: AiMethodConnection;
  channel: AiMethodChannel;
  featureRoutable: boolean;
  availability: AiMethodAvailability;
  availabilityReason?: string;
  providerId?: AiProviderId;
  presetId?: AiOpenAICompatiblePresetId;
  local?: boolean;
  beta?: boolean;
}

export const AI_PROVIDER_DISPLAY: Record<AiProviderId, Pick<AiProviderDescriptor, 'label' | 'shortLabel' | 'family' | 'authMode' | 'dataResidency'>> = {
  openai: {
    label: 'OpenAI API',
    shortLabel: 'OpenAI',
    family: 'api',
    authMode: 'api-key',
    dataResidency: 'cloud',
  },
  anthropic: {
    label: 'Anthropic API',
    shortLabel: 'Anthropic',
    family: 'api',
    authMode: 'api-key',
    dataResidency: 'cloud',
  },
  ollama: {
    label: 'Ollama / local models',
    shortLabel: 'Ollama',
    family: 'local',
    authMode: 'local-server',
    dataResidency: 'local',
  },
  'openai-compatible': {
    label: 'Custom / OpenAI-compatible endpoint',
    shortLabel: 'Custom endpoint',
    family: 'custom-endpoint',
    authMode: 'api-key',
    dataResidency: 'user-controlled',
  },
  'claude-account': {
    label: 'Claude account (beta)',
    shortLabel: 'Claude account',
    family: 'account',
    authMode: 'account',
    dataResidency: 'cloud',
  },
  'codex-account': {
    label: 'Codex account (beta)',
    shortLabel: 'Codex account',
    family: 'account',
    authMode: 'account',
    dataResidency: 'cloud',
  },
};

export function aiProviderLabel(provider: AiProviderId, variant: 'full' | 'short' = 'full'): string {
  const display = AI_PROVIDER_DISPLAY[provider];
  return variant === 'short' ? display.shortLabel : display.label;
}

export function isAiProviderId(value: unknown): value is AiProviderId {
  return typeof value === 'string' && (AI_PROVIDER_IDS as readonly string[]).includes(value);
}

export interface AiProviderHealth {
  provider: AiProviderId;
  providerInstanceId?: AiProviderInstanceId;
  ok: boolean;
  code: 'ok' | AiProviderErrorCode;
  message: string;
  status?: number;
  model?: string;
  providerFamily?: AiProviderFamily;
  transport?: AiProviderDescriptor['transport'];
  requestedModel?: string;
  resolvedModelId?: string;
  contentLeavesDevice?: boolean;
  normalizedBaseUrl?: string;
  ollama?: AiOllamaDiagnostics;
  diagnostics?: AiProviderInstanceDiagnostic[];
}

export interface AiOllamaModelCapabilities {
  tools: boolean;
  vision: boolean;
  thinking: boolean;
  contextWindow?: number;
  contextManagement?: boolean;
  compact?: boolean;
  promptCaching?: boolean;
}

export type AiOllamaModelResidency = 'resident' | 'idle' | 'not-loaded';

export interface AiOllamaLiveStatus {
  up: boolean;
  version?: string;
  loadedModel?: string;
  selectedModelResidency?: AiOllamaModelResidency;
}

export interface AiOllamaDiagnostics {
  endpoint?: string;
  responseDetail?: string;
  capabilityWarning?: string;
  modelCapabilities?: AiOllamaModelCapabilities;
  live?: AiOllamaLiveStatus;
}

export interface AiModelInfo {
  id: string;
  name?: string;
  displayName?: string;
  capabilities?: AiOllamaModelCapabilities;
}

export interface AiClaudeAccountDiagnostics {
  authenticated: boolean;
  catalogFresh: boolean;
}

export interface AiCodexAccountDiagnostics {
  authenticated: boolean;
  available?: boolean;
  unavailableReason?: string;
  catalogFresh?: boolean;
  accountEmail?: string;
  planType?: string;
  loginUrl?: string;
  userCode?: string;
}

export interface AiModelListResult {
  provider: AiProviderId;
  ok: boolean;
  models: AiModelInfo[];
  code?: AiProviderErrorCode;
  message?: string;
  normalizedBaseUrl?: string;
  ollama?: AiOllamaDiagnostics;
  claudeAccount?: AiClaudeAccountDiagnostics;
  codexAccount?: AiCodexAccountDiagnostics;
}

export type AiFeatureId =
  | 'thinking-partner'
  | 'field-suggestions'
  | 'health-check'
  | 'discover-insights'
  | 'landscape-analysis'
  | 'project-drafting'
  | 'default';

export interface AiFeatureRoute {
  provider: AiProviderId | 'default';
  providerInstanceId?: AiProviderInstanceId;
  model?: string;
  effort?: AiReasoningEffort;
  verbosity?: AiTextVerbosity;
}

export interface AiEffectiveFeatureRoute {
  provider: AiProviderId;
  providerInstanceId: AiProviderInstanceId;
  model: string;
  effort?: AiReasoningEffort;
  verbosity?: AiTextVerbosity;
  inherited: boolean;
}

export type AiReasoningEffort = 'minimal' | 'low' | 'medium' | 'high';
export type AiTextVerbosity = 'low' | 'medium' | 'high';

export type AiBudgetScope = 'global' | 'feature' | 'provider' | 'provider-family' | 'provider-instance' | 'model';

export interface AiBudgetState {
  scope: AiBudgetScope;
  id: string;
  limit: number;
  used: number;
  remaining: number | null;
  window: 'day';
  enabled: boolean;
}

export interface AiGuardrailsConfig {
  featureEnabled: Partial<Record<AiFeatureId, boolean>>;
  providerEnabled: Partial<Record<AiProviderId, boolean>>;
  providerInstanceEnabled: Partial<Record<AiProviderInstanceId, boolean>>;
  allowedModels: string[];
  featureDailyTokenBudgets: Partial<Record<AiFeatureId, number>>;
  providerDailyTokenBudgets: Partial<Record<AiProviderId, number>>;
  providerFamilyDailyTokenBudgets: Partial<Record<AiProviderFamily, number>>;
  providerInstanceDailyTokenBudgets: Partial<Record<AiProviderInstanceId, number>>;
  modelDailyTokenBudgets: Record<string, number>;
  warnOnRemoteProvider: boolean;
  requireConfirmationForRemoteProvider: boolean;
}

export interface AiPreflightRequest {
  feature: AiFeatureId;
  providerInstanceId?: AiProviderInstanceId;
  model?: string;
  effort?: AiReasoningEffort;
  verbosity?: AiTextVerbosity;
}

export interface AiPreflightResult {
  feature: AiFeatureId;
  provider: AiProviderId;
  model: string;
  providerFamily?: AiProviderFamily;
  transport?: AiProviderDescriptor['transport'];
  requestedModel?: string;
  resolvedModelId?: string;
  local: boolean;
  contentLeavesDevice?: boolean;
  contentLeavesMachine: boolean;
  allowed: boolean;
  requiresConfirmation: boolean;
  warnings: string[];
  blockers: string[];
  budgets: AiBudgetState[];
  confirmationToken?: string;
}

export interface AiProjectDraftFile {
  path: string;
  content: string;
  description?: string;
}

export interface AiProjectDraftRequest {
  ideaId: string;
  prompt?: string;
  aiConfirmationToken?: string;
  providerInstanceId?: AiProviderInstanceId;
  model?: string;
  effort?: AiReasoningEffort;
  verbosity?: AiTextVerbosity;
}

export interface AiProjectDraftResult {
  summary: string;
  files: AiProjectDraftFile[];
  provider: AiProviderId;
  providerInstanceId: AiProviderInstanceId;
  model: string;
}

export interface AiProjectDraftApplyRequest {
  ideaId: string;
  files: AiProjectDraftFile[];
}

export interface AiProjectDraftApplyResult {
  targetPath: string;
  filesWritten: string[];
}

export interface AiLandscapeAnalysisRequest {
  ideaId: string;
  prompt?: string;
  aiConfirmationToken?: string;
  providerInstanceId?: AiProviderInstanceId;
  model?: string;
  effort?: AiReasoningEffort;
  verbosity?: AiTextVerbosity;
}

export interface AiLandscapeAnalysisSections {
  existingAlternatives: string;
  gapsAndPainPoints: string;
  demandSignals: string;
  positioningAngle: string;
  overallViability: string;
}

export interface AiLandscapeAnalysisResult {
  sections: AiLandscapeAnalysisSections;
  provider: AiProviderId;
  providerInstanceId: AiProviderInstanceId;
  model: string;
  report: LandscapeReport;
}

export interface AiUsageBucket {
  key: string;
  feature?: string;
  provider?: string;
  providerInstanceId?: AiProviderInstanceId;
  model?: string;
  providerFamily?: AiProviderFamily;
  transport?: AiProviderDescriptor['transport'];
  requestedModel?: string;
  resolvedModelId?: string;
  contentLeavesDevice?: boolean;
  count: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  lastUsedAt: string | null;
}

export interface AiAuditEvent {
  id: string;
  type: 'guardrail_denied' | 'provider_error';
  feature: string;
  provider: string;
  providerInstanceId?: AiProviderInstanceId;
  model: string;
  providerFamily?: AiProviderFamily;
  transport?: AiProviderDescriptor['transport'];
  requestedModel?: string;
  resolvedModelId?: string;
  contentLeavesDevice?: boolean;
  message: string;
  createdAt: string;
}

export interface AiUsageDetail {
  windows: {
    last24h: number;
    last7d: number;
  };
  byRoute24h: AiUsageBucket[];
  byFeature: AiUsageBucket[];
  byProvider: AiUsageBucket[];
  byModel: AiUsageBucket[];
  recentAuditEvents: AiAuditEvent[];
}

export interface AiPublicConfig {
  defaultProviderInstanceId: AiProviderInstanceId;
  providerInstances: Record<AiProviderInstanceId, AiProviderInstanceConfig>;
  provider: AiProviderId;
  claudeServiceMethod: AiClaudeServiceMethod;
  codexOpenAIServiceMethod: AiCodexOpenAIServiceMethod;
  localModelServiceMethod: AiLocalModelServiceMethod;
  openaiModel: string;
  anthropicModel: string;
  claudeAccountModel: string;
  claudeAccountCompact: boolean;
  codexAccountModel: string;
  openaiReasoningEffort?: AiReasoningEffort;
  openaiTextVerbosity?: AiTextVerbosity;
  codexReasoningEffort?: AiReasoningEffort;
  ollamaModel: string;
  ollamaBaseUrl: string;
  localOpenaiCompatiblePreset: AiOpenAICompatiblePresetId;
  localOpenaiCompatibleModel: string;
  localOpenaiCompatibleBaseUrl: string;
  cloudOpenaiCompatiblePreset: AiOpenAICompatiblePresetId;
  cloudOpenaiCompatibleModel: string;
  cloudOpenaiCompatibleBaseUrl: string;
  /** Legacy combined OpenAI-compatible selection for compatibility. */
  openaiCompatiblePreset: AiOpenAICompatiblePresetId;
  /** Legacy combined OpenAI-compatible model for compatibility. */
  openaiCompatibleModel: string;
  /** Legacy combined OpenAI-compatible base URL for compatibility. */
  openaiCompatibleBaseUrl: string;
  dailyTokenBudget: number;
  featureRoutes: Record<AiFeatureId, AiFeatureRoute>;
  effectiveFeatureRoutes: Record<AiFeatureId, AiEffectiveFeatureRoute>;
  guardrails: AiGuardrailsConfig;
  hasOpenAIKey: boolean;
  hasAnthropicKey: boolean;
  hasLocalOpenAICompatibleKey: boolean;
  hasCloudOpenAICompatibleKey: boolean;
  /** Legacy aggregate flag for compatibility during UI transition. */
  hasOpenAICompatibleKey: boolean;
  /** true when Claude account login can be started from this server session. */
  claudeAccountAvailable: boolean;
  claudeAccountAuthenticated: boolean;
  /** true when Codex account login is exposed; app-server status reports runtime failures separately. */
  codexAccountAvailable: boolean;
  codexAccountAuthenticated: boolean;
}

export type ThemeName =
  | 'paper' | 'chalk' | 'meadow' | 'dusk'         // light themes
  | 'hearth' | 'rainwash'                          // mid-depth themes
  | 'woad' | 'moss' | 'peat' | 'canopy';           // dark themes

export interface UiThemeConfig {
  name: ThemeName;
  matchSystem: boolean;
}

/**
 * A single key binding — key + optional modifiers.
 * `key` is a lowercase KeyboardEvent.key value (e.g. 'n', '/', '?', 'k').
 * Esc is always reserved; single-key bindings fire only when not typing.
 */
export interface ShortcutBinding {
  key: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  meta?: boolean;
}

/** User-configurable action → binding map. All fields optional; app supplies defaults. */
export interface ShortcutConfig {
  focusSearch?: ShortcutBinding;      // default: { key: '/' }
  openQuickCapture?: ShortcutBinding; // default: { key: 'n' }
  openManual?: ShortcutBinding;       // default: { key: '?' }
}

export interface WebhooksConfig {
  url: string | null;
  events: string[];
}

export interface PublicToken {
  id: string;
  name: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
}

export interface ServerInfo {
  port: number;
  version: string;
  uptimeMs: number;
  dbPath: string;
}

export type BackupFrequency = 'off' | 'daily' | 'weekly';

export type BackupDestinationType = 'local-path' | 'rclone-remote';

interface BackupDestinationBase {
  id: string;
  type: BackupDestinationType;
  label: string;
  enabled: boolean;
  includeDatabase: boolean;
  includeJsonExport: boolean;
}

export interface LocalPathBackupDestination extends BackupDestinationBase {
  type: 'local-path';
  localPath: string;
}

export interface RcloneBackupDestination extends BackupDestinationBase {
  type: 'rclone-remote';
  remotePath: string;
}

export type BackupDestinationConfig =
  | LocalPathBackupDestination
  | RcloneBackupDestination;

export interface BackupConfig {
  frequency: BackupFrequency;
  exportJson: boolean;
  retentionCount: number;
  destinations: BackupDestinationConfig[];
}

export interface BackupArtifactResult {
  type: 'database' | 'json-export';
  attempted: boolean;
  ok: boolean;
  path: string | null;
  error?: string;
}

export interface BackupDestinationResult {
  destinationId: string;
  label: string;
  type: BackupDestinationType;
  attempted: boolean;
  ok: boolean;
  copiedPaths: string[];
  error?: string;
}

export interface BackupRunRecord {
  timestamp: string;
  backupPath: string | null;
  exportPath: string | null;
  reason: string;
  artifacts?: BackupArtifactResult[];
  destinations?: BackupDestinationResult[];
}

export interface FileTimestampInfo {
  path: string;
  timestamp: string;
}

export interface BackupStatus {
  config: BackupConfig;
  lastRun: BackupRunRecord | null;
  latestDatabaseBackup: FileTimestampInfo | null;
  latestJsonExport: FileTimestampInfo | null;
  rclone: {
    available: boolean;
    installed: boolean;
    configured: boolean;
    remoteCount: number;
    status: 'not-installed' | 'no-remotes' | 'ready' | 'error';
    message: string;
    version?: string;
    error?: string;
  };
  paths: {
    backupsDir: string;
    exportsDir: string;
  };
}

export interface AggregateSettings {
  ui: {
    theme: UiThemeConfig;
    shortcuts?: ShortcutConfig;
  };
  categories: CategorySettings;
  ai: AiPublicConfig;
  api: {
    tokens: PublicToken[];
    webhooks: WebhooksConfig;
  };
  backups: BackupStatus;
  integrations: IntegrationSummary[];
  server: ServerInfo;
}

export interface AiConfigInput {
  providerInstanceId?: AiProviderInstanceId;
  defaultProviderInstanceId?: AiProviderInstanceId;
  providerInstances?: Partial<Record<AiProviderInstanceId, Partial<AiProviderInstanceConfig>>>;
  providerInstanceApiKeys?: Partial<Record<AiProviderInstanceId, string>>;
  removedProviderInstanceIds?: AiProviderInstanceId[];
  provider?: AiProviderId;
  claudeServiceMethod?: AiClaudeServiceMethod;
  codexOpenAIServiceMethod?: AiCodexOpenAIServiceMethod;
  localModelServiceMethod?: AiLocalModelServiceMethod;
  openaiModel?: string;
  anthropicModel?: string;
  claudeAccountModel?: string;
  claudeAccountCompact?: boolean;
  codexAccountModel?: string;
  openaiReasoningEffort?: AiReasoningEffort | null;
  openaiTextVerbosity?: AiTextVerbosity | null;
  codexReasoningEffort?: AiReasoningEffort | null;
  ollamaModel?: string;
  ollamaBaseUrl?: string;
  localOpenaiCompatiblePreset?: AiOpenAICompatiblePresetId;
  localOpenaiCompatibleModel?: string;
  localOpenaiCompatibleBaseUrl?: string;
  cloudOpenaiCompatiblePreset?: AiOpenAICompatiblePresetId;
  cloudOpenaiCompatibleModel?: string;
  cloudOpenaiCompatibleBaseUrl?: string;
  localOpenaiCompatibleApiKey?: string;
  cloudOpenaiCompatibleApiKey?: string;
  openaiCompatiblePreset?: AiOpenAICompatiblePresetId;
  openaiCompatibleModel?: string;
  openaiCompatibleBaseUrl?: string;
  featureRoutes?: Partial<Record<AiFeatureId, AiFeatureRoute>>;
  guardrails?: Partial<AiGuardrailsConfig>;
  dailyTokenBudget?: number;
  openaiApiKey?: string;
  anthropicApiKey?: string;
  openaiCompatibleApiKey?: string;
}

export interface AiChatMessage {
  id: string;
  ideaId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: Date;
  provider?: string;
  model?: string;
}

export type AiSuggestionField =
  | 'pitch'
  | 'fullNotes'
  | 'risks'
  | 'techStack'
  | 'hook'
  | 'whyItMightWork'
  | 'aesthetic'
  | 'retrospective';

export interface AiSuggestion {
  field: AiSuggestionField;
  suggestion: string;
  rationale: string;
}

export interface AiFieldSuggestionRequest {
  ideaId: string;
  field: AiSuggestionField;
  currentValue: string;
  prompt?: string;
  omitCurrentValue?: boolean;
  aiConfirmationToken?: string;
  providerInstanceId?: AiProviderInstanceId;
  model?: string;
  effort?: AiReasoningEffort;
  verbosity?: AiTextVerbosity;
}

export interface AiFieldAssistMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AiFieldAssistChatRequest {
  ideaId: string;
  field: AiSuggestionField;
  currentValue?: string;
  message: string;
  history?: AiFieldAssistMessage[];
  aiConfirmationToken?: string;
  providerInstanceId?: AiProviderInstanceId;
  model?: string;
  effort?: AiReasoningEffort;
  verbosity?: AiTextVerbosity;
}
