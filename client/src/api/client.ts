import { db } from '@/db';
import * as localIdeas from '@/db/ideas';
import { duplicateIdeaPayload } from '../../../shared/ideaDuplication';
import type {
  AggregateSettings,
  AiChatMessage,
  AiConfigInput,
  AiFieldAssistChatRequest,
  AiFieldAssistMessage,
  AiFieldSuggestionRequest,
  AiMethodCapability,
  AiProjectDraftApplyRequest,
  AiProjectDraftApplyResult,
  AiProjectGenerateRequest,
  AiProjectGenerateResult,
  AiLandscapeAnalysisRequest,
  AiLandscapeAnalysisResult,
  AiModelListResult,
  AiProjectDraftRequest,
  AiProjectDraftResult,
  AiProviderDescriptor,
  AiProviderHealth,
  AiPreflightRequest,
  AiPreflightResult,
  AiPublicConfig,
  AiSuggestion,
  AiSuggestionField,
  AiUsageDetail as AiUsageDetailResponse,
  GraduationReadiness,
  GraduationResult,
  Idea,
  IdeaFilters,
  IdeaVersion,
  IntegrationHealthResult,
  IntegrationSummary,
  LandscapeReport,
  PublicToken,
  StageTransition,
} from '@/lib/types';

export type ConnectionStatus = 'checking' | 'online' | 'offline';

export interface ApiStats {
  totalIdeas: number;
  stageStats: Record<string, number>;
  categoryStats: Record<string, number>;
}

export interface SeedbankArchive {
  seedbankVersion: 1;
  exportedAt: string;
  ideas: Idea[];
  versions: IdeaVersion[];
  stageTransitions?: StageTransition[];
  landscapeReports?: LandscapeReport[];
}

export interface MigrationInspection {
  shouldPrompt: boolean;
  localIdeaCount: number;
  localVersionCount: number;
  serverIdeaCount: number;
}

export interface MigrationProgress {
  current: number;
  total: number;
  label: string;
}

export interface AiSuggestResponse {
  mode?: string;
  text: string;
  ideaIds?: string[];
}

export interface CompostResponse {
  items: Idea[];
  retentionDays: number;
  purged: number;
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

export interface BackupStatus {
  config: {
    frequency: BackupFrequency;
    exportJson: boolean;
    retentionCount: number;
    destinations: BackupDestinationConfig[];
  };
  lastRun: {
    timestamp: string;
    backupPath: string | null;
    exportPath: string | null;
    reason: string;
    artifacts?: BackupArtifactResult[];
    destinations?: BackupDestinationResult[];
  } | null;
  latestDatabaseBackup: { path: string; timestamp: string } | null;
  latestJsonExport: { path: string; timestamp: string } | null;
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

export interface BackupDestinationTestResult {
  destinationId: string;
  label: string;
  type: BackupDestinationType;
  ok: boolean;
  message: string;
  detail?: string;
}

export interface BackupRestoreValidationResult {
  testedAt: string;
  ok: boolean;
  database: {
    path: string;
    ok: boolean;
    sizeBytes: number | null;
    ideaCount?: number;
    versionCount?: number;
    error?: string;
  };
  jsonExport: {
    path: string;
    ok: boolean;
    sizeBytes: number | null;
    ideaCount?: number;
    versionCount?: number;
    error?: string;
  };
}

export interface IntegrationWithReadiness extends IntegrationSummary {
  readiness?: GraduationReadiness;
}

export interface GraduationResponse {
  result: GraduationResult;
  idea: Idea;
}

export interface GitHubPublishStatus {
  available: boolean;
  authenticated: boolean;
  message?: string;
  login?: string;
  name?: string;
  avatarUrl?: string;
  profileUrl?: string;
  publicRepos?: number;
  followers?: number;
  following?: number;
  totalPrivateRepos?: number;
  ownedPrivateRepos?: number;
  privateGists?: number;
  plan?: {
    name?: string;
    privateRepos?: number;
    collaborators?: number;
    space?: number;
  };
  scopes?: string[];
}

export interface GitHubPublishRequest {
  repoName: string;
  owner?: string;
  visibility: 'public' | 'private';
  pushInitial: boolean;
}

export interface GitHubPublishResponse {
  repoCreated: boolean;
  pushed: boolean;
  repoUrl?: string;
  remoteUrl?: string;
  projectPath: string;
  message: string;
  error?: string;
  idea?: Idea;
}

export interface ProjectFolderOpenResponse {
  ok: boolean;
  path: string;
  message: string;
}

export interface GitHubRepoStatus {
  available: boolean;
  authenticated: boolean;
  projectPath?: string;
  repoKnown: boolean;
  exists: boolean;
  source: 'idea-link' | 'git-remote' | 'none';
  repoUrl?: string;
  remoteUrl?: string;
  owner?: string;
  name?: string;
  private?: boolean;
  defaultBranch?: string;
  message: string;
}

export interface GitHubRepoUpdateResponse {
  pushed: boolean;
  committed: boolean;
  repoUrl: string;
  remoteUrl?: string;
  projectPath: string;
  message: string;
  error?: string;
  idea?: Idea;
}

export interface AiConversationResponse {
  messages: AiChatMessage[];
}

export interface IdeaImageMutationResponse {
  images: string[];
  path?: string;
  ok?: boolean;
}

const API_BASE_URL = import.meta.env.VITE_SEEDBANK_API_URL ?? 'http://localhost:4800';


const MIGRATION_MARKER = 'seedbank:migrated-to-api:v1';

let connectionStatus: ConnectionStatus = 'checking';
const listeners = new Set<(status: ConnectionStatus) => void>();

export function subscribeToConnectionStatus(listener: (status: ConnectionStatus) => void) {
  listeners.add(listener);
  listener(connectionStatus);
  return () => listeners.delete(listener);
}

function setConnectionStatus(status: ConnectionStatus) {
  if (connectionStatus === status) return;
  connectionStatus = status;
  for (const listener of listeners) listener(status);
}

export function apiUrl(path: string) {
  return `${API_BASE_URL}${path}`;
}

function toQueryString(params: Record<string, string | string[] | number | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) search.append(key, item);
    } else {
      search.set(key, String(value));
    }
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      headers: {
        Accept: 'application/json',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
      ...init,
    });
  } catch (error) {
    setConnectionStatus('offline');
    throw error;
  }

  if (!response.ok) {
    setConnectionStatus(response.status >= 500 ? 'offline' : 'online');
    const message = await readApiErrorMessage(response);
    throw new Error(`Seedbank API ${response.status}: ${message}`);
  }

  setConnectionStatus('online');

  if (response.status === 204) return undefined as T;
  const text = await response.text();
  const contentType = response.headers.get('content-type') ?? '';
  return text && contentType.includes('application/json') ? JSON.parse(text) as T : text as T;
}

async function readApiErrorMessage(response: Response): Promise<string> {
  let message = response.statusText;
  try {
    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      const body = await response.json() as Record<string, unknown>;
      if (typeof body?.error === 'string') return body.error;
      if (typeof body?.message === 'string') return body.message;
      return message;
    }
    const text = (await response.text()).trim();
    if (text) message = text;
  } catch {
    // Keep statusText when body is unreadable.
  }
  return message;
}

function hydrateIdea(raw: Idea): Idea {
  return {
    ...raw,
    aesthetic: raw.aesthetic ?? '',
    retrospective: raw.retrospective ?? '',
    createdAt: new Date(raw.createdAt),
    updatedAt: new Date(raw.updatedAt),
    deletedAt: raw.deletedAt ? new Date(raw.deletedAt) : raw.deletedAt,
  };
}

function hydrateVersion(raw: IdeaVersion): IdeaVersion {
  return {
    ...raw,
    timestamp: new Date(raw.timestamp),
  };
}

function hydrateAiMessage(raw: AiChatMessage): AiChatMessage {
  return {
    ...raw,
    createdAt: new Date(raw.createdAt),
  };
}

function hydrateStageTransition(raw: StageTransition): StageTransition {
  return {
    ...raw,
    transitionedAt: new Date(raw.transitionedAt),
  };
}

function hydrateLandscapeReport(raw: LandscapeReport): LandscapeReport {
  return {
    ...raw,
    createdAt: new Date(raw.createdAt),
  };
}

function extractIdeas(payload: Idea[] | { ideas?: Idea[]; data?: Idea[]; items?: Idea[] }): Idea[] {
  if (Array.isArray(payload)) return payload.map(hydrateIdea);
  const ideas = payload.ideas ?? payload.data ?? payload.items ?? [];
  return ideas.map(hydrateIdea);
}

function extractIdea(payload: Idea | { idea?: Idea; data?: Idea }): Idea {
  return hydrateIdea(('idea' in payload ? payload.idea : undefined) ?? ('data' in payload ? payload.data : undefined) ?? payload as Idea);
}

function extractVersions(payload: IdeaVersion[] | { versions?: IdeaVersion[]; data?: IdeaVersion[] }): IdeaVersion[] {
  if (Array.isArray(payload)) return payload.map(hydrateVersion);
  const versions = payload.versions ?? payload.data ?? [];
  return versions.map(hydrateVersion);
}

function extractVersion(payload: IdeaVersion | { version?: IdeaVersion; data?: IdeaVersion }): IdeaVersion {
  return hydrateVersion(('version' in payload ? payload.version : undefined) ?? ('data' in payload ? payload.data : undefined) ?? payload as IdeaVersion);
}

function extractStageTransitions(
  payload: StageTransition[] | { items?: StageTransition[]; transitions?: StageTransition[]; data?: StageTransition[] },
): StageTransition[] {
  if (Array.isArray(payload)) return payload.map(hydrateStageTransition);
  return (payload.items ?? payload.transitions ?? payload.data ?? []).map(hydrateStageTransition);
}

async function cacheIdeas(ideas: Idea[]) {
  if (ideas.length === 0) return;
  await db.ideas.bulkPut(ideas);
}

async function cacheVersions(versions: IdeaVersion[]) {
  if (versions.length === 0) return;
  await db.versions.bulkPut(versions);
}

export async function refreshConnectionStatus(): Promise<ConnectionStatus> {
  setConnectionStatus('checking');
  try {
    await request('/api/stats');
    return 'online';
  } catch {
    setConnectionStatus('offline');
    return 'offline';
  }
}

export function newIdea(partial: Partial<Idea> = {}): Idea {
  return localIdeas.newIdea(partial);
}

export async function createIdea(partial: Partial<Idea> = {}): Promise<Idea> {
  const draft = localIdeas.newIdea(partial);
  try {
    const idea = extractIdea(await request<Idea | { idea?: Idea; data?: Idea }>('/api/ideas', {
      method: 'POST',
      body: JSON.stringify(draft),
    }));
    await db.ideas.put(idea);
    return idea;
  } catch {
    return localIdeas.createIdea(partial);
  }
}

export async function getIdea(id: string): Promise<Idea | undefined> {
  try {
    const idea = extractIdea(await request<Idea | { idea?: Idea; data?: Idea }>(`/api/ideas/${encodeURIComponent(id)}`));
    await db.ideas.put(idea);
    return idea.deletedAt ? undefined : idea;
  } catch {
    const idea = await localIdeas.getIdea(id);
    return idea?.deletedAt ? undefined : idea;
  }
}

export async function getAllIdeas(): Promise<Idea[]> {
  try {
    const ideas = extractIdeas(await request<Idea[] | { ideas?: Idea[]; data?: Idea[]; items?: Idea[] }>(
      `/api/ideas${toQueryString({ sortBy: 'updatedAt', sortDirection: 'desc' })}`,
    )).filter((idea) => !idea.deletedAt);
    await cacheIdeas(ideas);
    return ideas;
  } catch {
    return (await localIdeas.getAllIdeas()).filter((idea) => !idea.deletedAt);
  }
}

export async function updateIdea(
  id: string,
  changes: Partial<Omit<Idea, 'id' | 'createdAt'>>,
): Promise<Idea | undefined> {
  try {
    const updated = extractIdea(await request<Idea | { idea?: Idea; data?: Idea }>(`/api/ideas/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(changes),
    }));
    await db.ideas.put(updated);
    return updated;
  } catch {
    return localIdeas.updateIdea(id, changes);
  }
}

export async function deleteIdea(id: string): Promise<void> {
  try {
    const deleted = extractIdea(await request<Idea | { idea?: Idea; data?: Idea }>(
      `/api/ideas/${encodeURIComponent(id)}`,
      { method: 'DELETE' },
    ));
    await db.ideas.put(deleted);
  } catch {
    await localIdeas.updateIdea(id, { deletedAt: new Date() });
  }
}

export async function duplicateIdea(id: string): Promise<Idea | undefined> {
  const original = await getIdea(id);
  if (!original) return undefined;
  return createIdea(duplicateIdeaPayload(original, crypto.randomUUID(), new Date()));
}

export async function getVersions(ideaId: string): Promise<IdeaVersion[]> {
  try {
    const versions = extractVersions(await request<IdeaVersion[] | { versions?: IdeaVersion[]; data?: IdeaVersion[] }>(
      `/api/ideas/${encodeURIComponent(ideaId)}/versions`,
    ));
    await cacheVersions(versions);
    return versions;
  } catch {
    return localIdeas.getVersions(ideaId);
  }
}

export async function getStageTransitions(ideaId: string): Promise<StageTransition[]> {
  try {
    return extractStageTransitions(
      await request<StageTransition[] | { items?: StageTransition[]; transitions?: StageTransition[]; data?: StageTransition[] }>(
        `/api/ideas/${encodeURIComponent(ideaId)}/stage-transitions`,
      ),
    );
  } catch {
    return [];
  }
}

export async function uploadIdeaImage(ideaId: string, file: File): Promise<IdeaImageMutationResponse> {
  const form = new FormData();
  form.append('image', file);

  let response: Response;
  try {
    response = await fetch(apiUrl(`/api/ideas/${encodeURIComponent(ideaId)}/images`), {
      method: 'POST',
      headers: { Accept: 'application/json' },
      body: form,
    });
  } catch (error) {
    setConnectionStatus('offline');
    throw error;
  }

  if (!response.ok) {
    setConnectionStatus(response.status >= 500 ? 'offline' : 'online');
    throw new Error(`Seedbank API ${response.status}: ${await readApiErrorMessage(response)}`);
  }

  setConnectionStatus('online');
  return response.json() as Promise<IdeaImageMutationResponse>;
}

export async function deleteIdeaImage(ideaId: string, filename: string): Promise<IdeaImageMutationResponse> {
  const response = await request<IdeaImageMutationResponse>(
    `/api/ideas/${encodeURIComponent(ideaId)}/images/${encodeURIComponent(filename)}`,
    { method: 'DELETE' },
  );
  return response;
}

export async function createVersion(
  ideaId: string,
  label: string,
  notes = '',
): Promise<IdeaVersion | undefined> {
  try {
    const version = extractVersion(await request<IdeaVersion | { version?: IdeaVersion; data?: IdeaVersion }>(
      `/api/ideas/${encodeURIComponent(ideaId)}/versions`,
      {
        method: 'POST',
        body: JSON.stringify({ label, notes }),
      },
    ));
    await db.versions.put(version);
    return version;
  } catch {
    return localIdeas.createVersion(ideaId, label, notes);
  }
}

export async function restoreVersion(
  ideaId: string,
  versionId: string,
): Promise<Idea | undefined> {
  try {
    const restored = extractIdea(await request<Idea | { idea?: Idea; data?: Idea }>(
      `/api/ideas/${encodeURIComponent(ideaId)}/versions/restore/${encodeURIComponent(versionId)}`,
      { method: 'POST' },
    ));
    await db.ideas.put(restored);
    return restored;
  } catch {
    return localIdeas.restoreVersion(ideaId, versionId);
  }
}

export async function searchIdeas(filters: IdeaFilters = {}): Promise<Idea[]> {
  try {
    const ideas = extractIdeas(await request<Idea[] | { ideas?: Idea[]; data?: Idea[]; items?: Idea[] }>(
      `/api/ideas${toQueryString({
        query: filters.query,
        categories: filters.categories,
        stages: filters.stages,
        tags: filters.tags,
        sortBy: filters.sortBy,
        sortDirection: filters.sortDirection,
      })}`,
    )).filter((idea) => !idea.deletedAt);
    await cacheIdeas(ideas);
    return ideas;
  } catch {
    return (await localIdeas.searchIdeas(filters)).filter((idea) => !idea.deletedAt);
  }
}

export async function getStats(): Promise<ApiStats> {
  try {
    const stats = await request<Partial<ApiStats> & { ideaCount?: number; total?: number; byStage?: Record<string, number>; byCategory?: Record<string, number> }>('/api/stats');
    return {
      totalIdeas: stats.totalIdeas ?? stats.ideaCount ?? stats.total ?? 0,
      stageStats: stats.stageStats ?? stats.byStage ?? {},
      categoryStats: stats.categoryStats ?? stats.byCategory ?? {},
    };
  } catch {
    const active = (await localIdeas.getAllIdeas()).filter((idea) => !idea.deletedAt);
    const stageStats = active.reduce<Record<string, number>>((stats, idea) => {
      stats[idea.stage] = (stats[idea.stage] ?? 0) + 1;
      return stats;
    }, {});
    const categoryStats = active.reduce<Record<string, number>>((stats, idea) => {
      if (idea.category) stats[idea.category] = (stats[idea.category] ?? 0) + 1;
      return stats;
    }, {});
    return {
      totalIdeas: active.length,
      stageStats,
      categoryStats,
    };
  }
}

export async function getStageStats(): Promise<Record<string, number>> {
  return (await getStats()).stageStats;
}

export async function getIdeaCount(): Promise<number> {
  return (await getStats()).totalIdeas;
}

export async function getDeletedIdeas(): Promise<CompostResponse> {
  try {
    const response = await request<CompostResponse>('/api/compost');
    const items = response.items.map(hydrateIdea);
    await cacheIdeas(items);
    return { ...response, items };
  } catch {
    const items = (await db.ideas.toArray()).map(hydrateIdea).filter((idea) => idea.deletedAt);
    return { items, retentionDays: 30, purged: 0 };
  }
}

export async function restoreDeletedIdea(id: string): Promise<Idea | undefined> {
  try {
    const idea = extractIdea(await request<Idea | { idea?: Idea; data?: Idea }>(
      `/api/compost/${encodeURIComponent(id)}/restore`,
      { method: 'POST' },
    ));
    await db.ideas.put(idea);
    return idea;
  } catch {
    return localIdeas.updateIdea(id, { deletedAt: null });
  }
}

export async function purgeDeletedIdea(id: string): Promise<void> {
  try {
    await request<void>(`/api/compost/${encodeURIComponent(id)}`, { method: 'DELETE' });
    await db.ideas.delete(id);
  } catch {
    await localIdeas.deleteIdea(id);
  }
}

export async function aiSuggest(
  mode: string,
  context: Record<string, unknown>,
  prompt?: string,
  options: { aiConfirmationToken?: string } = {},
): Promise<AiSuggestResponse> {
  return request<AiSuggestResponse>('/api/ai/suggest', {
    method: 'POST',
    body: JSON.stringify({ mode, context, prompt, ...options }),
  });
}

export async function getAiConfig(): Promise<AiPublicConfig> {
  return request<AiPublicConfig>('/api/ai/config');
}

export async function updateAiConfig(config: AiConfigInput): Promise<AiPublicConfig> {
  return request<AiPublicConfig>('/api/ai/config', {
    method: 'POST',
    body: JSON.stringify(config),
  });
}

export async function getAiProviders(): Promise<AiProviderDescriptor[]> {
  const response = await request<{ providers: AiProviderDescriptor[] }>('/api/ai/providers');
  return response.providers;
}

export async function getAiMethodCapabilities(): Promise<AiMethodCapability[]> {
  const response = await request<{ methods: AiMethodCapability[] }>('/api/ai/method-capabilities');
  return response.methods;
}

export async function testAiProvider(config: AiConfigInput): Promise<AiProviderHealth> {
  return request<AiProviderHealth>('/api/ai/test', {
    method: 'POST',
    body: JSON.stringify(config),
  });
}

export async function listAiModels(config: AiConfigInput): Promise<AiModelListResult> {
  return request<AiModelListResult>('/api/ai/models', {
    method: 'POST',
    body: JSON.stringify(config),
  });
}

// ── Claude account auth ────────────────────────────────────────────────────────

export interface ClaudeAccountStatus {
  /** False only when this server session cannot expose Claude account login. */
  available?: boolean;
  unavailableReason?: string;
  authenticated: boolean;
  expiresAt: number | null;
  obtainedAt: number | null;
}

export interface ClaudeAccountLoginResult {
  authorizationUrl: string;
  state: string;
  manualFallback: boolean;
  manualReason?: string;
}

export async function getClaudeAccountStatus(): Promise<ClaudeAccountStatus> {
  return request<ClaudeAccountStatus>('/api/ai/claude-account/status');
}

export async function startClaudeAccountLogin(): Promise<ClaudeAccountLoginResult> {
  return request<ClaudeAccountLoginResult>('/api/ai/claude-account/login', { method: 'POST' });
}

export async function completeClaudeAccountLogin(url: string): Promise<{ ok: true }> {
  return request<{ ok: true }>('/api/ai/claude-account/login/complete', {
    method: 'POST',
    body: JSON.stringify({ url }),
  });
}

export async function logoutClaudeAccount(): Promise<{ ok: true }> {
  return request<{ ok: true }>('/api/ai/claude-account/logout', { method: 'POST' });
}

// ── Codex account auth ────────────────────────────────────────────────────────

export interface CodexAccountStatus {
  /** False when the local Codex app-server runtime cannot be reached. */
  available?: boolean;
  unavailableReason?: string;
  authenticated: boolean;
  accountEmail?: string;
  planType?: string;
  requiresOpenaiAuth?: boolean;
  userAgent?: string;
}

export interface CodexAccountLoginResult {
  ok: boolean;
  loginUrl?: string;
  userCode?: string;
  loginId?: string;
  message: string;
}

export async function getCodexAccountStatus(): Promise<CodexAccountStatus> {
  return request<CodexAccountStatus>('/api/ai/codex-account/status');
}

export async function startCodexAccountLogin(): Promise<CodexAccountLoginResult> {
  return request<CodexAccountLoginResult>('/api/ai/codex-account/login', { method: 'POST' });
}

export async function logoutCodexAccount(): Promise<{ ok: true }> {
  return request<{ ok: true }>('/api/ai/codex-account/logout', { method: 'POST' });
}

// ── AI conversations ──────────────────────────────────────────────────────────

export async function getAiConversation(ideaId: string): Promise<AiChatMessage[]> {
  const response = await request<AiConversationResponse>(`/api/ai/conversations/${encodeURIComponent(ideaId)}`);
  return response.messages.map(hydrateAiMessage);
}

export async function clearAiConversation(ideaId: string): Promise<void> {
  await request<{ ok: true }>(`/api/ai/conversations/${encodeURIComponent(ideaId)}`, { method: 'DELETE' });
}

export async function suggestIdeaField(
  ideaId: string,
  field: AiSuggestionField,
  currentValue: string,
  options: Pick<
    AiFieldSuggestionRequest,
    'prompt' | 'intent' | 'omitCurrentValue' | 'aiConfirmationToken' | 'providerInstanceId' | 'model' | 'effort' | 'verbosity'
  > = {},
): Promise<AiSuggestion> {
  return request<AiSuggestion>('/api/ai/suggest', {
    method: 'POST',
    body: JSON.stringify({ ideaId, field, currentValue, ...options }),
  });
}

export async function streamFieldAssistChat(
  requestBody: AiFieldAssistChatRequest,
  onDelta: (delta: string) => void,
): Promise<AiChatMessage> {
  return streamAiMessage('/api/ai/field-chat', requestBody, onDelta);
}

export async function streamAiChat(
  ideaId: string,
  message: string,
  onDelta: (delta: string) => void,
  options: { aiConfirmationToken?: string; freshContext?: boolean; displayMessage?: string } = {},
): Promise<AiChatMessage> {
  return streamAiMessage('/api/ai/chat', { ideaId, message, ...options }, onDelta);
}

async function streamAiMessage(
  path: string,
  requestBody: {
    ideaId: string;
    message: string;
    history?: AiFieldAssistMessage[];
    field?: AiSuggestionField;
    currentValue?: string;
    displayMessage?: string;
    aiConfirmationToken?: string;
    providerInstanceId?: string;
    model?: string;
    effort?: string;
    verbosity?: string;
  },
  onDelta: (delta: string) => void,
): Promise<AiChatMessage> {
  const response = await fetch(apiUrl(path), {
    method: 'POST',
    headers: {
      Accept: 'text/event-stream',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok || !response.body) {
    setConnectionStatus(response.status >= 500 ? 'offline' : 'online');
    const message = await readApiErrorMessage(response);
    throw new Error(`Seedbank API ${response.status}: ${message}`);
  }

  setConnectionStatus('online');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let assistantMessage: AiChatMessage | null = null;

  const handleChunk = (chunk: string) => {
    const event = chunk.split('\n').find((line) => line.startsWith('event:'))?.slice(6).trim();
    const data = chunk.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim()).join('\n');
    if (!event || !data || data === '{}') return;
    const payload = JSON.parse(data) as { delta?: string; message?: AiChatMessage; error?: string };
    if (event === 'delta' && payload.delta) onDelta(payload.delta);
    if (event === 'message' && payload.message) assistantMessage = hydrateAiMessage(payload.message);
    if (event === 'error') throw new Error(payload.error ?? 'AI chat failed.');
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split('\n\n');
    buffer = chunks.pop() ?? '';
    chunks.filter(Boolean).forEach(handleChunk);
  }
  if (buffer.trim()) handleChunk(buffer);

  if (!assistantMessage) throw new Error('AI chat ended without an assistant response.');
  return assistantMessage;
}

// ── AI Usage ─────────────────────────────────────────────────────────────────

export interface AiUsageSummary {
  last24h: number;
  last7d: number;
}

export async function getAiUsage(): Promise<AiUsageSummary> {
  return request<AiUsageSummary>('/api/ai/usage');
}

export interface AiUsageByRoute {
  route: string;
  provider: string;
  model: string;
  totalTokens: number;
  requests: number;
}

export interface AiUsageDetail {
  last24h: number;
  last7d: number;
  byRoute24h: AiUsageByRoute[];
  raw: AiUsageDetailResponse;
}

export async function getAiUsageDetail(): Promise<AiUsageDetail> {
  const detail = await request<AiUsageDetailResponse>('/api/ai/usage/detail');
  return {
    last24h: detail.windows.last24h,
    last7d: detail.windows.last7d,
    byRoute24h: detail.byRoute24h.map((bucket) => ({
      route: bucket.key,
      provider: bucket.provider ?? '',
      model: bucket.model ?? '',
      totalTokens: bucket.totalTokens,
      requests: bucket.count,
    })),
    raw: detail,
  };
}

export async function preflightAiRequest(input: AiPreflightRequest): Promise<AiPreflightResult> {
  return request<AiPreflightResult>('/api/ai/preflight', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function draftProjectFiles(input: AiProjectDraftRequest): Promise<AiProjectDraftResult> {
  return request<AiProjectDraftResult>('/api/ai/project-draft', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function analyzeLandscape(input: AiLandscapeAnalysisRequest): Promise<AiLandscapeAnalysisResult> {
  const result = await request<AiLandscapeAnalysisResult>('/api/ai/landscape-analysis', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return {
    ...result,
    report: hydrateLandscapeReport(result.report),
  };
}

export async function getLatestLandscapeReport(ideaId: string): Promise<{ report: LandscapeReport | null }> {
  const payload = await request<{ report: LandscapeReport | null }>(
    `/api/ideas/${encodeURIComponent(ideaId)}/landscape-report`,
  );
  return {
    report: payload.report ? hydrateLandscapeReport(payload.report) : null,
  };
}

export async function applyProjectDraftFiles(input: AiProjectDraftApplyRequest): Promise<AiProjectDraftApplyResult> {
  return request<AiProjectDraftApplyResult>('/api/ai/project-draft/apply', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function generateProjectFiles(input: AiProjectGenerateRequest): Promise<AiProjectGenerateResult> {
  const response = await request<AiProjectGenerateResult>('/api/ai/project-generate', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  response.idea = hydrateIdea(response.idea);
  return response;
}

// ── Aggregate Settings ────────────────────────────────────────────────────────

export async function getAggregateSettings(): Promise<AggregateSettings> {
  return request<AggregateSettings>('/api/settings');
}

export type SettingsSection = 'ui' | 'ai' | 'api' | 'backups' | 'categories';

export async function patchSettings(
  section: SettingsSection,
  body: unknown,
): Promise<AggregateSettings> {
  return request<AggregateSettings>(`/api/settings/${section}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

// ── Backups ───────────────────────────────────────────────────────────────────

export async function getBackupStatus(): Promise<BackupStatus> {
  return request<BackupStatus>('/api/backups');
}

export async function updateBackupConfig(config: Partial<BackupStatus['config']>): Promise<BackupStatus> {
  return request<BackupStatus>('/api/backups/config', {
    method: 'PATCH',
    body: JSON.stringify(config),
  });
}

export async function runBackupNow(): Promise<{ run: BackupStatus['lastRun']; status: BackupStatus }> {
  return request<{ run: BackupStatus['lastRun']; status: BackupStatus }>('/api/backups/run', {
    method: 'POST',
  });
}

export async function testBackupDestination(payload: {
  id?: string;
  destination?: BackupDestinationConfig;
}): Promise<BackupDestinationTestResult> {
  return request<BackupDestinationTestResult>('/api/backups/destinations/test', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function testBackupRestore(payload?: {
  backupPath?: string;
  exportPath?: string;
}): Promise<BackupRestoreValidationResult> {
  return request<BackupRestoreValidationResult>('/api/backups/test-restore', {
    method: 'POST',
    body: JSON.stringify(payload ?? {}),
  });
}

// ── API Tokens ────────────────────────────────────────────────────────────────

export interface TokenCreateRequest {
  name: string;
  scopes: string[];
}

/** Token creation response — includes the raw token value (shown once). */
export interface TokenCreateResponse extends PublicToken {
  token: string;
}

export async function listTokens(): Promise<PublicToken[]> {
  const res = await request<{ items: PublicToken[] }>('/api/tokens');
  return res.items;
}

export async function createToken(req: TokenCreateRequest): Promise<TokenCreateResponse> {
  return request<TokenCreateResponse>('/api/tokens', {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

export async function revokeToken(id: string): Promise<void> {
  await request<void>(`/api/tokens/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function getServerInfo(): Promise<import('@/lib/types').ServerInfo> {
  return request<import('@/lib/types').ServerInfo>('/api/server/info');
}

export async function getOpenApiSpec(): Promise<unknown> {
  return request<unknown>('/api/openapi.json');
}

// ── Integrations ──────────────────────────────────────────────────────────────

export async function getIntegrations(ideaId?: string): Promise<IntegrationWithReadiness[]> {
  const integrations = await request<IntegrationWithReadiness[]>(
    `/api/integrations${toQueryString({ ideaId })}`,
  );
  return integrations;
}

export async function configureIntegration(
  integrationId: string,
  config: Record<string, string>,
): Promise<IntegrationSummary> {
  return request<IntegrationSummary>(`/api/integrations/${encodeURIComponent(integrationId)}/configure`, {
    method: 'POST',
    body: JSON.stringify({ config }),
  });
}

export async function checkIntegrationHealth(integrationId: string): Promise<IntegrationHealthResult> {
  return request<IntegrationHealthResult>(`/api/integrations/${encodeURIComponent(integrationId)}/health`);
}

export async function graduateIdea(
  integrationId: string,
  ideaId: string,
): Promise<GraduationResponse> {
  const response = await request<GraduationResponse>(
    `/api/integrations/${encodeURIComponent(integrationId)}/graduate/${encodeURIComponent(ideaId)}`,
    { method: 'POST' },
  );
  response.idea = hydrateIdea(response.idea);
  return response;
}

export async function getGitHubPublishStatus(): Promise<GitHubPublishStatus> {
  return request<GitHubPublishStatus>('/api/integrations/github/status');
}

export async function getIdeaGitHubRepoStatus(ideaId: string): Promise<GitHubRepoStatus> {
  return request<GitHubRepoStatus>(`/api/integrations/github/repo-status/${encodeURIComponent(ideaId)}`);
}

export async function publishIdeaToGitHub(
  ideaId: string,
  payload: GitHubPublishRequest,
): Promise<GitHubPublishResponse> {
  const response = await request<GitHubPublishResponse>(
    `/api/integrations/github/publish/${encodeURIComponent(ideaId)}`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );
  if (response.idea) response.idea = hydrateIdea(response.idea);
  return response;
}

export async function updateIdeaGitHubRepo(ideaId: string): Promise<GitHubRepoUpdateResponse> {
  const response = await request<GitHubRepoUpdateResponse>(
    `/api/integrations/github/update/${encodeURIComponent(ideaId)}`,
    { method: 'POST' },
  );
  if (response.idea) response.idea = hydrateIdea(response.idea);
  return response;
}

export async function openIdeaProjectFolder(ideaId: string): Promise<ProjectFolderOpenResponse> {
  return request<ProjectFolderOpenResponse>(
    `/api/ideas/${encodeURIComponent(ideaId)}/open-project-folder`,
    { method: 'POST' },
  );
}

export async function exportArchive(format: 'json' | 'markdown'): Promise<string | SeedbankArchive> {
  return request<string | SeedbankArchive | { content?: string; archive?: SeedbankArchive }>('/api/export', {
    method: 'POST',
    body: JSON.stringify({ format }),
  }).then((payload) => {
    if (typeof payload === 'string') return payload;
    if ('content' in payload && payload.content) return payload.content;
    if ('archive' in payload && payload.archive) return payload.archive;
    return payload as SeedbankArchive;
  });
}

export async function importArchive(
  archive: SeedbankArchive,
  mode: 'merge' | 'replace' = 'merge',
): Promise<unknown> {
  const result = await request<unknown>('/api/import', {
    method: 'POST',
    body: JSON.stringify({ ...archive, mode }),
  });
  await cacheIdeas(archive.ideas.map(hydrateIdea));
  await cacheVersions(archive.versions.map(hydrateVersion));
  return result;
}

export async function inspectBrowserMigration(): Promise<MigrationInspection> {
  if (localStorage.getItem(MIGRATION_MARKER) === 'done') {
    return { shouldPrompt: false, localIdeaCount: 0, localVersionCount: 0, serverIdeaCount: 0 };
  }

  const [localIdeaCount, localVersionCount, status] = await Promise.all([
    db.ideas.count(),
    db.versions.count(),
    refreshConnectionStatus(),
  ]);

  if (status !== 'online' || localIdeaCount === 0) {
    return { shouldPrompt: false, localIdeaCount, localVersionCount, serverIdeaCount: 0 };
  }

  const serverIdeaCount = await getIdeaCount();
  return {
    shouldPrompt: localIdeaCount > serverIdeaCount,
    localIdeaCount,
    localVersionCount,
    serverIdeaCount,
  };
}

export async function migrateBrowserData(
  onProgress?: (progress: MigrationProgress) => void,
): Promise<void> {
  const [ideas, versions] = await Promise.all([
    db.ideas.toArray(),
    db.versions.toArray(),
  ]);
  const total = Math.max(ideas.length + versions.length, 1);
  onProgress?.({ current: 0, total, label: 'Preparing browser data' });

  await importArchive({
    seedbankVersion: 1,
    exportedAt: new Date().toISOString(),
    ideas,
    versions,
  });

  onProgress?.({ current: total, total, label: 'Migration complete' });
  localStorage.setItem(MIGRATION_MARKER, 'done');
}

export function markBrowserMigrationDone() {
  localStorage.setItem(MIGRATION_MARKER, 'done');
}
