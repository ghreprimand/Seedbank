import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { AiService } from './ai/service.js';
import { AiStore } from './ai/store.js';
import {
  backupsDir,
  createDatabaseBackup,
  dbPath,
  exportsDir,
  latestFileInfo,
  openDatabase,
  writeArchiveExport,
} from './db.js';
import { IntegrationRegistry } from './integrations/registry.js';
import { archiveToMarkdown, parseMarkdownArchive } from './markdown.js';
import { SeedbankRepository, type ImportArchive, type ListIdeasOptions } from './repository.js';
import type { AiConfigPatch } from './ai/types.js';
import type {
  AgentsPublicConfig,
  AggregateSettings,
  BackupConfig,
  BackupFrequency,
  BackupRunRecord,
  BackupStatus,
  Category,
  PublicToken,
  ServerInfo,
  Stage,
  UiThemeConfig,
  WebhooksConfig,
} from '../../shared/types.js';

const PORT = Number(process.env.PORT ?? 4800);
const app = express();
const database = openDatabase();
const repository = new SeedbankRepository(database);
const integrations = new IntegrationRegistry(repository);
const aiService = new AiService(repository, new AiStore(database));

const DEFAULT_BACKUP_CONFIG: BackupConfig = {
  frequency: 'daily',
  exportJson: true,
};

interface AgentStoredConfig {
  claudeLinked: boolean;
  codexLinked: boolean;
  claudeCliPath?: string;
  codexCliPath?: string;
}

interface StoredApiToken extends PublicToken {
  hash: string;
}

const SETTINGS_KEYS = {
  uiTheme: 'ui.theme',
  aiConfig: 'ai.config',
  aiConfigLegacy: 'ai:config',
  apiTokens: 'api.tokens',
  apiWebhooks: 'api.webhooks',
  agentsConfig: 'agents.config',
} as const;

const DEFAULT_THEME_CONFIG: UiThemeConfig = {
  name: 'paper',
  matchSystem: false,
};

const DEFAULT_AGENTS_CONFIG: AgentStoredConfig = {
  claudeLinked: false,
  codexLinked: false,
};

function readServerVersion(): string {
  const candidates = [
    path.resolve(process.cwd(), 'server/package.json'),
    path.resolve(process.cwd(), 'package.json'),
  ];

  for (const candidate of candidates) {
    try {
      const raw = fs.readFileSync(candidate, 'utf8');
      const parsed = JSON.parse(raw) as { version?: unknown };
      if (typeof parsed.version === 'string' && parsed.version.trim()) return parsed.version;
    } catch {
      // ignore and try next candidate
    }
  }

  return '0.0.0';
}

const SERVER_VERSION = readServerVersion();

function backupConfig(): BackupConfig {
  return {
    ...DEFAULT_BACKUP_CONFIG,
    ...(repository.getSetting<Partial<BackupConfig>>('backup.config') ?? {}),
  };
}

function backupIntervalMs(frequency: BackupFrequency): number | null {
  if (frequency === 'daily') return 24 * 60 * 60 * 1000;
  if (frequency === 'weekly') return 7 * 24 * 60 * 60 * 1000;
  return null;
}

function runBackup(reason: string): BackupRunRecord {
  const now = new Date();
  const config = backupConfig();
  const backupPath = createDatabaseBackup(now);
  const exportPath = config.exportJson
    ? writeArchiveExport(JSON.stringify(repository.exportArchive(true), null, 2), now)
    : null;
  const record: BackupRunRecord = {
    timestamp: now.toISOString(),
    backupPath,
    exportPath,
    reason,
  };
  repository.setSetting('backup.lastRun', record);
  return record;
}

function backupStatus(): BackupStatus {
  return {
    config: backupConfig(),
    lastRun: repository.getSetting<BackupRunRecord>('backup.lastRun') ?? null,
    latestDatabaseBackup: latestFileInfo(backupsDir, /^seedbank-.*\.db$/),
    latestJsonExport: latestFileInfo(exportsDir, /^seedbank-archive-.*\.json$/),
    paths: {
      backupsDir,
      exportsDir,
    },
  };
}

function uiThemeConfig(): UiThemeConfig {
  return {
    ...DEFAULT_THEME_CONFIG,
    ...(repository.getSetting<Partial<UiThemeConfig>>(SETTINGS_KEYS.uiTheme) ?? {}),
  };
}

function webhooksConfig(): WebhooksConfig {
  const stored = repository.getSetting<Partial<WebhooksConfig>>(SETTINGS_KEYS.apiWebhooks) ?? {};
  const url = typeof stored.url === 'string' ? stored.url : null;
  const events = Array.isArray(stored.events)
    ? stored.events.filter((event): event is string => typeof event === 'string' && event.trim().length > 0)
    : [];
  return { url, events };
}

function isStoredApiToken(value: unknown): value is StoredApiToken {
  if (!value || typeof value !== 'object') return false;
  const token = value as Record<string, unknown>;
  return typeof token.id === 'string'
    && typeof token.name === 'string'
    && Array.isArray(token.scopes)
    && token.scopes.every((scope) => typeof scope === 'string')
    && typeof token.hash === 'string'
    && typeof token.createdAt === 'string'
    && (typeof token.lastUsedAt === 'string' || token.lastUsedAt === null || typeof token.lastUsedAt === 'undefined');
}

function storedApiTokens(): StoredApiToken[] {
  const stored = repository.getSetting<unknown>(SETTINGS_KEYS.apiTokens);
  if (!Array.isArray(stored)) return [];

  return stored
    .filter(isStoredApiToken)
    .map((token) => ({
      id: token.id,
      name: token.name,
      scopes: token.scopes.filter((scope) => scope.trim().length > 0),
      hash: token.hash,
      createdAt: token.createdAt,
      lastUsedAt: typeof token.lastUsedAt === 'string' ? token.lastUsedAt : null,
    }));
}

function publicTokens(): PublicToken[] {
  return storedApiTokens().map(({ hash: _hash, ...token }) => token);
}

function agentsStoredConfig(): AgentStoredConfig {
  const stored = repository.getSetting<Partial<AgentStoredConfig>>(SETTINGS_KEYS.agentsConfig) ?? {};
  return {
    ...DEFAULT_AGENTS_CONFIG,
    ...stored,
    claudeLinked: Boolean(stored.claudeLinked ?? stored.claudeCliPath),
    codexLinked: Boolean(stored.codexLinked ?? stored.codexCliPath),
  };
}

function agentsPublicConfig(): AgentsPublicConfig {
  const stored = agentsStoredConfig();
  return {
    claudeLinked: Boolean(stored.claudeLinked),
    codexLinked: Boolean(stored.codexLinked),
  };
}

function serverInfo(): ServerInfo {
  return {
    port: PORT,
    version: SERVER_VERSION,
    uptimeMs: Math.round(process.uptime() * 1000),
    dbPath,
  };
}

function aggregateSettings(): AggregateSettings {
  return {
    ui: { theme: uiThemeConfig() },
    ai: aiService.getPublicConfig(),
    api: {
      tokens: publicTokens(),
      webhooks: webhooksConfig(),
    },
    agents: agentsPublicConfig(),
    backups: backupStatus(),
    integrations: integrations.list(),
    server: serverInfo(),
  };
}

function migrateLegacySettings(): void {
  const legacyAiConfig = repository.getSetting<unknown>(SETTINGS_KEYS.aiConfigLegacy);
  const nextAiConfig = repository.getSetting<unknown>(SETTINGS_KEYS.aiConfig);
  if (legacyAiConfig !== undefined && nextAiConfig === undefined) {
    repository.setSetting(SETTINGS_KEYS.aiConfig, legacyAiConfig);
  }
}

function runScheduledBackupIfDue() {
  const config = backupConfig();
  const interval = backupIntervalMs(config.frequency);
  if (!interval) return;

  const lastRun = repository.getSetting<BackupRunRecord>('backup.lastRun');
  const lastRunTime = lastRun ? new Date(lastRun.timestamp).getTime() : 0;
  if (!lastRunTime || Date.now() - lastRunTime >= interval) {
    runBackup('scheduled');
  }
}

app.use(cors({
  origin(origin, callback) {
    if (!origin || /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error(`CORS origin not allowed: ${origin}`));
  },
}));
app.use(express.json({ limit: '25mb' }));

function asyncRoute(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void> | void,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function stringParam(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function splitParam(value: unknown): string[] | undefined {
  if (Array.isArray(value)) return value.flatMap((item) => splitParam(item) ?? []);
  if (typeof value !== 'string' || !value.trim()) return undefined;
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function boolParam(value: unknown): boolean {
  return value === true || value === 'true' || value === '1';
}

function routeParam(req: Request, name: string): string {
  const value = req.params[name];
  return Array.isArray(value) ? value[0] ?? '' : value;
}

function clientKey(req: Request): string {
  return req.ip || req.socket.remoteAddress || 'local';
}

function contextIdeas(context: unknown): Array<Record<string, unknown>> {
  if (!context || typeof context !== 'object') return [];
  const value = (context as { ideas?: unknown }).ideas;
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object') : [];
}

function contextIdea(context: unknown): Record<string, unknown> | undefined {
  if (!context || typeof context !== 'object') return undefined;
  const value = (context as { idea?: unknown }).idea;
  return value && typeof value === 'object' ? value as Record<string, unknown> : undefined;
}

function stringField(source: Record<string, unknown> | undefined, key: string): string {
  const value = source?.[key];
  return typeof value === 'string' ? value : '';
}

function fallbackAiSuggestion(mode: string, context: unknown): string {
  const ideas = contextIdeas(context);
  const idea = contextIdea(context);
  const title = stringField(idea, 'title') || 'this idea';
  const risks = stringField(idea, 'risks');
  const pitch = stringField(idea, 'pitch');

  if (mode === 'pattern-insights') {
    const categories = new Map<string, number>();
    for (const item of ideas) {
      const category = stringField(item, 'category');
      if (category) categories.set(category, (categories.get(category) ?? 0) + 1);
    }
    const strongest = [...categories.entries()].sort((a, b) => b[1] - a[1])[0];
    return strongest
      ? `Your archive leans toward ${strongest[0]} ideas (${strongest[1]} total). Look for shared infrastructure, reusable UI, or a common starter template that could make several of them easier to test.`
      : 'Your archive is still forming patterns. Add a few more developed pitches, risks, and tech notes, then look for repeated constraints.';
  }

  if (mode === 'smart-cross-pollinate') {
    const first = stringField(ideas[0], 'title') || 'one idea';
    const second = stringField(ideas[1], 'title') || 'another idea';
    return `${first} and ${second} may combine well if one supplies the user workflow and the other supplies the interaction model. Try asking what shared problem both are circling.`;
  }

  if (mode === 'health-check') {
    const missing: string[] = [];
    if (!pitch.trim()) missing.push('pitch');
    if (!risks.trim()) missing.push('risks');
    if (!stringField(idea, 'hook').trim()) missing.push('hook');
    if (!stringField(idea, 'techStack').trim()) missing.push('tech stack');
    return missing.length
      ? `${title} has a useful core, but the next best pass is to fill in ${missing.join(', ')}. Start with one concrete user and one thing that could make the idea fail.`
      : `${title} looks well-rounded. The next useful question is whether the smallest test can be built in a day or needs a narrower first slice.`;
  }

  if (mode === 'devils-advocate') {
    return `What assumption behind ${title} would make the whole idea weaker if it turned out false? Name that assumption, then write the smallest way to test it.`;
  }

  if (mode === 'scope-down') {
    return `What is the smallest version of ${title} that proves the hook without accounts, sync, polish, or edge cases? Keep only one user action and one visible result.`;
  }

  if (mode === 'user-story') {
    return `Who is already trying to solve the problem behind ${title} today, and what are they doing awkwardly instead? Describe that person in one concrete scene.`;
  }

  return `What if ${title} had to be tested with one screen, one interaction, and no setup? What would you keep?`;
}

function listOptionsFromQuery(query: Request['query']): ListIdeasOptions {
  return {
    query: stringParam(query.query),
    categories: splitParam(query.categories) as Category[] | undefined,
    stages: splitParam(query.stages) as Stage[] | undefined,
    tags: splitParam(query.tags),
    sortBy: stringParam(query.sortBy) as ListIdeasOptions['sortBy'],
    sortDirection: stringParam(query.sortDirection) as ListIdeasOptions['sortDirection'],
    page: Number(query.page) || 1,
    limit: Number(query.limit) || 100,
    includeDeleted: boolParam(query.includeDeleted),
  };
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, port: PORT });
});

app.get('/api/settings', asyncRoute((_req, res) => {
  res.json(aggregateSettings());
}));

app.patch('/api/settings/:section', asyncRoute((req, res) => {
  const section = routeParam(req, 'section');

  if (section === 'ui') {
    const body = req.body as { theme?: Partial<UiThemeConfig> };
    const current = uiThemeConfig();
    const nextTheme: UiThemeConfig = {
      name: typeof body?.theme?.name === 'string' && body.theme.name.trim()
        ? body.theme.name.trim()
        : current.name,
      matchSystem: typeof body?.theme?.matchSystem === 'boolean'
        ? body.theme.matchSystem
        : current.matchSystem,
    };
    repository.setSetting(SETTINGS_KEYS.uiTheme, nextTheme);
    res.json(aggregateSettings());
    return;
  }

  if (section === 'ai') {
    aiService.configure((req.body ?? {}) as AiConfigPatch);
    res.json(aggregateSettings());
    return;
  }

  if (section === 'api') {
    const body = req.body as { webhooks?: Partial<WebhooksConfig>; tokens?: unknown };
    if (body?.tokens !== undefined) {
      res.status(400).json({ error: 'Tokens are managed via dedicated API endpoints.' });
      return;
    }
    if (body?.webhooks) {
      const current = webhooksConfig();
      const next: WebhooksConfig = {
        url: body.webhooks.url === null
          ? null
          : (typeof body.webhooks.url === 'string' ? body.webhooks.url : current.url),
        events: Array.isArray(body.webhooks.events)
          ? body.webhooks.events
            .filter((event): event is string => typeof event === 'string' && event.trim().length > 0)
          : current.events,
      };
      repository.setSetting(SETTINGS_KEYS.apiWebhooks, next);
    }
    res.json(aggregateSettings());
    return;
  }

  if (section === 'agents') {
    const body = req.body as { claudeCliPath?: unknown; codexCliPath?: unknown };
    const current = agentsStoredConfig();
    const claudeCliPath = typeof body.claudeCliPath === 'string' && body.claudeCliPath.trim()
      ? body.claudeCliPath.trim()
      : undefined;
    const codexCliPath = typeof body.codexCliPath === 'string' && body.codexCliPath.trim()
      ? body.codexCliPath.trim()
      : undefined;

    const next: AgentStoredConfig = {
      ...current,
      claudeCliPath: body.claudeCliPath === undefined ? current.claudeCliPath : claudeCliPath,
      codexCliPath: body.codexCliPath === undefined ? current.codexCliPath : codexCliPath,
    };
    next.claudeLinked = body.claudeCliPath === undefined ? current.claudeLinked : Boolean(next.claudeCliPath);
    next.codexLinked = body.codexCliPath === undefined ? current.codexLinked : Boolean(next.codexCliPath);
    repository.setSetting(SETTINGS_KEYS.agentsConfig, next);
    res.json(aggregateSettings());
    return;
  }

  if (section === 'backups') {
    const body = req.body as { config?: Partial<BackupConfig> };
    const current = backupConfig();
    const requested = body?.config ?? {};
    const frequency = requested.frequency === 'off' || requested.frequency === 'daily' || requested.frequency === 'weekly'
      ? requested.frequency
      : current.frequency;
    const exportJson = typeof requested.exportJson === 'boolean'
      ? requested.exportJson
      : current.exportJson;
    repository.setSetting('backup.config', { frequency, exportJson });
    res.json(aggregateSettings());
    return;
  }

  res.status(400).json({ error: `Unsupported settings section: ${section}` });
}));

app.get('/api/ideas', asyncRoute((req, res) => {
  res.json(repository.listIdeas(listOptionsFromQuery(req.query)));
}));

app.get('/api/compost', asyncRoute((_req, res) => {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const purged = repository.purgeDeletedBefore(cutoff);
  res.json({
    items: repository.listDeletedIdeas(),
    retentionDays: 30,
    purged,
  });
}));

app.post('/api/compost/:id/restore', asyncRoute((req, res) => {
  const idea = repository.restoreDeletedIdea(routeParam(req, 'id'));
  if (!idea) {
    res.status(404).json({ error: 'Deleted idea not found' });
    return;
  }
  res.json(idea);
}));

app.delete('/api/compost/:id', asyncRoute((req, res) => {
  const purged = repository.purgeIdea(routeParam(req, 'id'));
  if (!purged) {
    res.status(404).json({ error: 'Idea not found' });
    return;
  }
  res.status(204).send();
}));

app.get('/api/ideas/:id', asyncRoute((req, res) => {
  const id = routeParam(req, 'id');
  const idea = repository.getIdea(id, boolParam(req.query.includeDeleted));
  if (!idea) {
    res.status(404).json({ error: 'Idea not found' });
    return;
  }

  res.json({
    ...idea,
    versionCount: repository.getVersionCount(idea.id),
  });
}));

app.post('/api/ideas', asyncRoute((req, res) => {
  const idea = repository.createIdea(req.body);
  res.status(201).json(idea);
}));

app.patch('/api/ideas/:id', asyncRoute((req, res) => {
  const idea = repository.updateIdea(routeParam(req, 'id'), req.body);
  if (!idea) {
    res.status(404).json({ error: 'Idea not found' });
    return;
  }

  res.json(idea);
}));

app.delete('/api/ideas/:id', asyncRoute((req, res) => {
  const idea = repository.softDeleteIdea(routeParam(req, 'id'));
  if (!idea) {
    res.status(404).json({ error: 'Idea not found' });
    return;
  }

  res.json(idea);
}));

app.get('/api/ideas/:id/versions', asyncRoute((req, res) => {
  const id = routeParam(req, 'id');
  if (!repository.getIdea(id, true)) {
    res.status(404).json({ error: 'Idea not found' });
    return;
  }

  res.json(repository.getVersions(id));
}));

app.post('/api/ideas/:id/versions', asyncRoute((req, res) => {
  const body = req.body as { label?: string; notes?: string };
  const version = repository.createVersion(routeParam(req, 'id'), body.label ?? 'Manual snapshot', body.notes ?? '');
  if (!version) {
    res.status(404).json({ error: 'Idea not found' });
    return;
  }

  res.status(201).json(version);
}));

app.post('/api/ideas/:id/versions/restore/:versionId', asyncRoute((req, res) => {
  const idea = repository.restoreVersion(routeParam(req, 'id'), routeParam(req, 'versionId'));
  if (!idea) {
    res.status(404).json({ error: 'Idea or version not found' });
    return;
  }

  res.json(idea);
}));

app.get('/api/stats', asyncRoute((_req, res) => {
  res.json(repository.getStats());
}));

app.get('/api/ai/config', asyncRoute((_req, res) => {
  res.json(aiService.getPublicConfig());
}));

app.post('/api/ai/config', asyncRoute((req, res) => {
  res.json(aiService.configure(req.body ?? {}));
}));

app.get('/api/ai/conversations/:ideaId', asyncRoute((req, res) => {
  res.json({ messages: aiService.getConversation(routeParam(req, 'ideaId')) });
}));

app.post('/api/ai/suggest', asyncRoute(async (req, res) => {
  const body = req.body as {
    ideaId?: string;
    field?: string;
    currentValue?: string;
    mode?: string;
    prompt?: string;
    context?: unknown;
  };
  if (body.ideaId && body.field) {
    const suggestion = await aiService.suggest(
      body.ideaId,
      body.field as never,
      body.currentValue ?? '',
      clientKey(req),
    );
    res.json(suggestion);
    return;
  }

  res.json({
    mode: body.mode ?? 'suggest',
    text: fallbackAiSuggestion(body.mode ?? 'suggest', body.context ?? {}),
  });
}));

app.post('/api/ai/chat', async (req, res) => {
  const body = req.body as { ideaId?: string; message?: string };
  if (!body.ideaId || !body.message?.trim()) {
    res.status(400).json({ error: 'ideaId and message are required.' });
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });

  try {
    const message = await aiService.streamChat(
      body.ideaId,
      body.message.trim(),
      clientKey(req),
      (delta) => {
        res.write(`event: delta\ndata: ${JSON.stringify({ delta })}\n\n`);
      },
    );
    res.write(`event: message\ndata: ${JSON.stringify({ message })}\n\n`);
    res.write('event: done\ndata: {}\n\n');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'AI chat failed.';
    res.write(`event: error\ndata: ${JSON.stringify({ error: message })}\n\n`);
  } finally {
    res.end();
  }
});

app.get('/api/backups', asyncRoute((_req, res) => {
  res.json(backupStatus());
}));

app.patch('/api/backups/config', asyncRoute((req, res) => {
  const body = req.body as Partial<BackupConfig>;
  const next: BackupConfig = {
    ...backupConfig(),
    frequency: body.frequency === 'off' || body.frequency === 'daily' || body.frequency === 'weekly'
      ? body.frequency
      : backupConfig().frequency,
    exportJson: typeof body.exportJson === 'boolean' ? body.exportJson : backupConfig().exportJson,
  };
  repository.setSetting('backup.config', next);
  res.json(backupStatus());
}));

app.post('/api/backups/run', asyncRoute((_req, res) => {
  res.json({
    run: runBackup('manual'),
    status: backupStatus(),
  });
}));

app.get('/api/integrations', asyncRoute((req, res) => {
  const ideaId = stringParam(req.query.ideaId);
  const items = integrations.list().map((integration) => {
    if (!ideaId) return integration;
    const idea = repository.getIdea(ideaId);
    if (!idea) return integration;
    return {
      ...integration,
      readiness: integrations.readinessFor(integration.id, idea),
    };
  });
  res.json(items);
}));

app.post('/api/integrations/:id/configure', asyncRoute((req, res) => {
  const configured = integrations.configure(routeParam(req, 'id'), req.body?.config ?? req.body ?? {});
  if (!configured) {
    res.status(404).json({ error: 'Integration not found' });
    return;
  }
  res.json(configured);
}));

app.post('/api/integrations/:id/graduate/:ideaId', asyncRoute(async (req, res) => {
  const payload = await integrations.graduate(routeParam(req, 'id'), routeParam(req, 'ideaId'));
  if (!payload) {
    res.status(404).json({ error: 'Integration or idea not found' });
    return;
  }
  res.json(payload);
}));

app.post('/api/export', asyncRoute((req, res) => {
  const body = req.body as { format?: string; includeDeleted?: boolean };
  const archive = repository.exportArchive(Boolean(body.includeDeleted));

  if (body.format === 'markdown') {
    res.type('text/markdown').send(archiveToMarkdown(archive.ideas));
    return;
  }

  res.json(archive);
}));

app.post('/api/import', asyncRoute((req, res) => {
  const body = req.body as {
    archive?: ImportArchive;
    content?: string;
    format?: string;
    mode?: 'merge' | 'replace';
  };
  const mode = body.mode === 'replace' ? 'replace' : 'merge';

  if (body.format === 'markdown') {
    if (!body.content) {
      res.status(400).json({ error: 'Markdown import requires content.' });
      return;
    }
    res.json(repository.importArchive({ ideas: parseMarkdownArchive(body.content), versions: [] }, mode));
    return;
  }

  const archive = body.archive ?? req.body;
  res.json(repository.importArchive(archive, mode));
}));

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const message = err instanceof Error ? err.message : 'Unexpected server error';
  console.error(err);
  res.status(500).json({ error: message });
});

app.listen(PORT, () => {
  migrateLegacySettings();
  runScheduledBackupIfDue();
  setInterval(runScheduledBackupIfDue, 5 * 60 * 1000).unref();
  console.log(`Seedbank server listening on http://localhost:${PORT}`);
});
