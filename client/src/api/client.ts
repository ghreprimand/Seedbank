import { db } from '@/db';
import * as localIdeas from '@/db/ideas';
import type {
  AggregateSettings,
  AiChatMessage,
  AiConfigInput,
  AiPublicConfig,
  AiSuggestion,
  AiSuggestionField,
  GraduationReadiness,
  GraduationResult,
  Idea,
  IdeaFilters,
  IdeaVersion,
  IntegrationSummary,
} from '@/lib/types';

export type ConnectionStatus = 'checking' | 'online' | 'offline';

export interface ApiStats {
  totalIdeas: number;
  stageStats: Record<string, number>;
}

export interface SeedbankArchive {
  seedbankVersion: 1;
  exportedAt: string;
  ideas: Idea[];
  versions: IdeaVersion[];
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

export interface BackupStatus {
  config: {
    frequency: BackupFrequency;
    exportJson: boolean;
  };
  lastRun: {
    timestamp: string;
    backupPath: string | null;
    exportPath: string | null;
    reason: string;
  } | null;
  latestDatabaseBackup: { path: string; timestamp: string } | null;
  latestJsonExport: { path: string; timestamp: string } | null;
  paths: {
    backupsDir: string;
    exportsDir: string;
  };
}

export interface IntegrationWithReadiness extends IntegrationSummary {
  readiness?: GraduationReadiness;
}

export interface GraduationResponse {
  result: GraduationResult;
  idea: Idea;
}

export interface AiConversationResponse {
  messages: AiChatMessage[];
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

function apiUrl(path: string) {
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
    throw new Error(`Seedbank API ${response.status}: ${response.statusText}`);
  }

  setConnectionStatus('online');

  if (response.status === 204) return undefined as T;
  const text = await response.text();
  const contentType = response.headers.get('content-type') ?? '';
  return text && contentType.includes('application/json') ? JSON.parse(text) as T : text as T;
}

function hydrateIdea(raw: Idea): Idea {
  return {
    ...raw,
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
  return createIdea({
    ...original,
    id: crypto.randomUUID(),
    title: `Copy of ${original.title}`,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  });
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
    const stats = await request<Partial<ApiStats> & { ideaCount?: number; total?: number; byStage?: Record<string, number> }>('/api/stats');
    return {
      totalIdeas: stats.totalIdeas ?? stats.ideaCount ?? stats.total ?? 0,
      stageStats: stats.stageStats ?? stats.byStage ?? {},
    };
  } catch {
    const active = (await localIdeas.getAllIdeas()).filter((idea) => !idea.deletedAt);
    const stageStats = active.reduce<Record<string, number>>((stats, idea) => {
      stats[idea.stage] = (stats[idea.stage] ?? 0) + 1;
      return stats;
    }, {});
    return {
      totalIdeas: active.length,
      stageStats,
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
): Promise<AiSuggestResponse> {
  return request<AiSuggestResponse>('/api/ai/suggest', {
    method: 'POST',
    body: JSON.stringify({ mode, context, prompt }),
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

export async function getAiConversation(ideaId: string): Promise<AiChatMessage[]> {
  const response = await request<AiConversationResponse>(`/api/ai/conversations/${encodeURIComponent(ideaId)}`);
  return response.messages.map(hydrateAiMessage);
}

export async function suggestIdeaField(
  ideaId: string,
  field: AiSuggestionField,
  currentValue: string,
): Promise<AiSuggestion> {
  return request<AiSuggestion>('/api/ai/suggest', {
    method: 'POST',
    body: JSON.stringify({ ideaId, field, currentValue }),
  });
}

export async function streamAiChat(
  ideaId: string,
  message: string,
  onDelta: (delta: string) => void,
): Promise<AiChatMessage> {
  const response = await fetch(apiUrl('/api/ai/chat'), {
    method: 'POST',
    headers: {
      Accept: 'text/event-stream',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ideaId, message }),
  });

  if (!response.ok || !response.body) {
    setConnectionStatus(response.status >= 500 ? 'offline' : 'online');
    throw new Error(`Seedbank API ${response.status}: ${response.statusText}`);
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

// ── Aggregate Settings ────────────────────────────────────────────────────────

export async function getAggregateSettings(): Promise<AggregateSettings> {
  return request<AggregateSettings>('/api/settings');
}

export type SettingsSection = 'ui' | 'ai' | 'api' | 'agents' | 'backups';

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
