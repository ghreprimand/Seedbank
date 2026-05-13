import type {
  ConfigFieldDescriptor,
  GraduationReadiness,
  GraduationResult,
  Idea,
  IntegrationSummary,
} from '../../../shared/types.js';

export interface IntegrationConfigStore {
  getConfig<T extends object>(integrationId: string): T;
  setConfig(integrationId: string, config: Record<string, string>): void;
}

export type ConnectorKind = 'local-process' | 'local-http' | 'remote-http' | 'filesystem';

export interface HealthResult {
  status: 'ok' | 'degraded' | 'unreachable' | 'unconfigured';
  message?: string;
  latencyMs?: number;
}

export interface DiscoveryResult {
  label: string;
  config: Record<string, string>;
}

export interface ConnectorAction {
  id: string;
  label: string;
  icon?: string;
  requiresProjectPath?: boolean;
}

export interface ActionContext {
  ideaId?: string;
  projectPath?: string;
}

export interface ActionResult {
  ok: boolean;
  message?: string;
  data?: unknown;
}

export interface Integration {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly icon: string;
  readonly kind?: ConnectorKind;
  /** Schema driving the dynamic config form in the Settings UI. */
  readonly configSchema: ConfigFieldDescriptor[];
  /** Manual section to deep-link help buttons to. */
  readonly helpSectionId?: string;

  isConfigured(): boolean;
  configuredRoots?(): string[];
  configure(config: Record<string, string>): void;
  canGraduate(idea: Idea): GraduationReadiness;
  graduate(idea: Idea): Promise<GraduationResult>;

  /** Returns current non-secret config values for UI pre-population. */
  currentConfigValues(): Record<string, string>;

  /** Liveness / reachability probe. Returns fast (< 2 s). */
  healthCheck(): Promise<HealthResult>;

  /** Optional: probe for auto-discoverable configuration (e.g. running ports). */
  discover?(): Promise<DiscoveryResult[]>;

  /** Optional: additional actions beyond graduation. */
  actions?(): ConnectorAction[];

  /** Optional: execute a named action. */
  runAction?(actionId: string, context: ActionContext): Promise<ActionResult>;
}

export type IntegrationListItem = IntegrationSummary;
