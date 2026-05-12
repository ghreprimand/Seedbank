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
  dataDir,
  exportsDir,
  latestFileInfo,
  openDatabase,
  writeArchiveExport,
} from './db.js';
import { IntegrationRegistry } from './integrations/registry.js';
import { authMiddleware, requireImplicitLocal, requireScope } from './middleware/auth.js';
import { archiveToMarkdown, ideaToMarkdown, parseMarkdownArchive } from './markdown.js';
import { openApiSpec } from './openapi.js';
import { SeedbankRepository, type ImportArchive, type ListIdeasOptions } from './repository.js';
import { ApiTokenStore, TOKEN_SCOPES, type TokenScope } from './tokens.js';
import { WebhookEmitter, normalizeWebhookUrl, toWebhookEventList } from './webhooks.js';
import { AgentService } from './agents/service.js';
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
  ThemeName,
  UiThemeConfig,
  WebhooksConfig,
} from '../../shared/types.js';

const PORT = Number(process.env.PORT ?? 4800);
const app = express();
const database = openDatabase();
const repository = new SeedbankRepository(database);
const integrations = new IntegrationRegistry(repository);
const aiService = new AiService(repository, new AiStore(database));
const tokenStore = new ApiTokenStore(database);
const agentService = new AgentService(repository, () => integrations.configuredRoots());

const DEFAULT_BACKUP_CONFIG: BackupConfig = {
  frequency: 'daily',
  exportJson: true,
};

interface AgentStoredConfig {
  claudeLinked: boolean;
  codexLinked: boolean;
  claudeCliPath?: string;
  codexCliPath?: string;
  claudeVersion?: string;
  codexVersion?: string;
  runtimeCapMinutes?: number;
  dailyRunBudget?: number;
}

const SETTINGS_KEYS = {
  uiTheme: 'ui.theme',
  aiConfig: 'ai.config',
  aiConfigLegacy: 'ai:config',
  backupConfig: 'backup.config',
  apiWebhooks: 'api.webhooks',
  agentsConfig: 'agents.config',
} as const;

const DEFAULT_THEME_CONFIG: UiThemeConfig = {
  name: 'paper',
  matchSystem: false,
};

/**
 * Legacy theme names that were removed in v2.2. Maps old name → replacement.
 * Used in uiThemeConfig() and migrateLegacySettings() so callers never see a
 * stale name after an upgrade.
 */
const LEGACY_THEME_MIGRATIONS: Partial<Record<string, ThemeName>> = {
  loam: 'peat',
  parchment: 'paper',
};

const VALID_THEME_NAMES_SERVER: readonly ThemeName[] = [
  'paper', 'chalk', 'meadow', 'dusk',
  'hearth', 'rainwash',
  'woad', 'moss', 'peat', 'canopy',
];

/**
 * Migrate a possibly-legacy theme name to a current valid ThemeName.
 * Falls back to 'paper' for unknown names.
 */
function migrateServerThemeName(name: string | undefined): ThemeName {
  if (!name) return 'paper';
  if (Object.prototype.hasOwnProperty.call(LEGACY_THEME_MIGRATIONS, name)) {
    return LEGACY_THEME_MIGRATIONS[name]!;
  }
  return (VALID_THEME_NAMES_SERVER as readonly string[]).includes(name)
    ? (name as ThemeName)
    : 'paper';
}

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
const webhookEmitter = new WebhookEmitter(SERVER_VERSION, () => webhooksConfig());

function backupConfig(): BackupConfig {
  return {
    ...DEFAULT_BACKUP_CONFIG,
    ...(repository.getSetting<Partial<BackupConfig>>(SETTINGS_KEYS.backupConfig) ?? {}),
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
  const stored = repository.getSetting<Partial<UiThemeConfig>>(SETTINGS_KEYS.uiTheme) ?? {};
  return {
    ...DEFAULT_THEME_CONFIG,
    ...stored,
    // Always return a valid, migrated theme name so callers never see a legacy value.
    name: migrateServerThemeName(stored.name),
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

function publicTokens(): PublicToken[] {
  return tokenStore.list();
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
    ...(stored.claudeVersion ? { claudeVersion: stored.claudeVersion } : {}),
    ...(stored.codexVersion ? { codexVersion: stored.codexVersion } : {}),
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
  // Migrate AI config key rename (pre-v2.0).
  const legacyAiConfig = repository.getSetting<unknown>(SETTINGS_KEYS.aiConfigLegacy);
  const nextAiConfig = repository.getSetting<unknown>(SETTINGS_KEYS.aiConfig);
  if (legacyAiConfig !== undefined && nextAiConfig === undefined) {
    repository.setSetting(SETTINGS_KEYS.aiConfig, legacyAiConfig);
    try {
      repository.deleteSetting(SETTINGS_KEYS.aiConfigLegacy);
    } catch {
      // Keep startup resilient for partial/older DB states.
    }
  }

  // Migrate legacy theme names (v2.2 — Loam→Peat, Parchment→Paper).
  // Persist the migrated value so subsequent reads are clean.
  const storedTheme = repository.getSetting<Partial<UiThemeConfig>>(SETTINGS_KEYS.uiTheme);
  if (
    storedTheme?.name !== undefined &&
    Object.prototype.hasOwnProperty.call(LEGACY_THEME_MIGRATIONS, storedTheme.name)
  ) {
    repository.setSetting(SETTINGS_KEYS.uiTheme, {
      ...storedTheme,
      name: LEGACY_THEME_MIGRATIONS[storedTheme.name]!,
    });
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
app.set('trust proxy', false);
app.use(express.json({ limit: '25mb' }));
app.use('/api', authMiddleware(tokenStore));

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

function validScopes(input: unknown): TokenScope[] | null {
  if (!Array.isArray(input)) return null;
  const rawScopes = input.filter((scope): scope is string => typeof scope === 'string');
  if (rawScopes.length !== input.length) return null;

  const allowed = new Set<string>(TOKEN_SCOPES);
  const normalized = [...new Set(rawScopes.map((scope) => scope.trim()).filter(Boolean))];
  if (normalized.some((scope) => !allowed.has(scope))) return null;
  return normalized as TokenScope[];
}

function numberParam(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function summaryScore(jamScore: number, excitementScore: number): number {
  return Math.round(((jamScore + excitementScore) / 2) * 10) / 10;
}

function ideaSummary(idea: ReturnType<SeedbankRepository['getIdea']> extends infer T ? Exclude<T, undefined> : never) {
  return {
    id: idea.id,
    title: idea.title,
    pitch: idea.pitch,
    hook: idea.hook,
    stage: idea.stage,
    category: idea.category,
    score: summaryScore(idea.jamScore, idea.excitementScore),
    updatedAt: idea.updatedAt,
  };
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, port: PORT });
});

app.get('/api/openapi.json', (_req, res) => {
  res.json(openApiSpec);
});

app.get('/api/server/info', requireScope('read:ideas'), asyncRoute((_req, res) => {
  res.json(serverInfo());
}));

app.get('/api/tokens', requireScope('write:ideas'), asyncRoute((_req, res) => {
  res.json({ items: tokenStore.list() });
}));

app.post('/api/tokens', requireScope('write:ideas'), requireImplicitLocal, asyncRoute((req, res) => {
  const body = req.body as { name?: unknown; scopes?: unknown };
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const scopes = validScopes(body?.scopes);
  if (!name) {
    res.status(400).json({ error: 'Token name is required.' });
    return;
  }
  if (!scopes || scopes.length === 0) {
    res.status(400).json({ error: `Scopes must be a non-empty subset of: ${TOKEN_SCOPES.join(', ')}` });
    return;
  }
  const created = tokenStore.create(name, scopes);
  res.status(201).json({
    ...created.record,
    token: created.token,
  });
}));

app.post('/api/agents/link', requireScope('agents:run'), asyncRoute((req, res) => {
  const body = req.body as { provider?: string; cliPath?: string };
  if (!body.provider) {
    res.status(400).json({ error: 'provider is required.' });
    return;
  }
  res.json(agentService.link(body.provider, body.cliPath));
}));

app.delete('/api/agents/link/:provider', requireScope('agents:run'), asyncRoute((req, res) => {
  res.json(agentService.unlink(routeParam(req, 'provider')));
}));

app.post('/api/agents/runs', requireScope('agents:run'), asyncRoute((req, res) => {
  const body = req.body as { ideaId?: string; projectPath?: string; provider?: string; prompt?: string };
  if (!body.provider || !body.prompt) {
    res.status(400).json({ error: 'provider and prompt are required.' });
    return;
  }

  const created = agentService.startRun({
    ideaId: body.ideaId,
    projectPath: body.projectPath,
    provider: body.provider as 'claude' | 'codex',
    prompt: body.prompt,
  });
  res.status(202).json(created);
}));

app.get('/api/agents/runs/:id', requireScope('agents:run'), asyncRoute((req, res) => {
  res.json(agentService.getRun(routeParam(req, 'id')));
}));

app.get('/api/agents/runs/:id/stream', requireScope('agents:run'), asyncRoute((req, res) => {
  const runId = routeParam(req, 'id');
  const current = agentService.getRun(runId);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });

  res.write(`event: state\ndata: ${JSON.stringify({ type: 'state', runId, state: current.state, timestamp: new Date().toISOString() })}\n\n`);
  if (current.transcript) {
    res.write(`event: delta\ndata: ${JSON.stringify({ type: 'delta', runId, delta: current.transcript, timestamp: new Date().toISOString() })}\n\n`);
  }
  if (current.state !== 'running') {
    res.write(`event: done\ndata: ${JSON.stringify({ type: 'done', runId, state: current.state, timestamp: new Date().toISOString() })}\n\n`);
    res.end();
    return;
  }

  const unsubscribe = agentService.subscribe(runId, (event) => {
    res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    if (event.type === 'done') {
      unsubscribe();
      res.end();
    }
  });

  req.on('close', () => {
    unsubscribe();
  });
}));

app.post('/api/agents/runs/:id/stop', requireScope('agents:run'), asyncRoute((req, res) => {
  agentService.stopRun(routeParam(req, 'id'));
  res.status(202).json({ ok: true });
}));

app.post('/api/agents/runs/:id/apply', requireScope('agents:run'), asyncRoute((req, res) => {
  const body = req.body as { paths?: string[] };
  const result = agentService.applyRunPaths(routeParam(req, 'id'), { paths: body.paths ?? [] });
  res.json(result);
}));

app.delete('/api/tokens/:id', requireScope('write:ideas'), asyncRoute((req, res) => {
  const removed = tokenStore.revoke(routeParam(req, 'id'));
  if (!removed) {
    res.status(404).json({ error: 'Token not found.' });
    return;
  }
  res.status(204).send();
}));

app.get('/api/settings', requireScope('read:ideas'), asyncRoute((_req, res) => {
  res.json(aggregateSettings());
}));

app.patch('/api/settings/:section', requireScope('write:ideas'), asyncRoute((req, res) => {
  const section = routeParam(req, 'section');

  if (section === 'ui') {
    const VALID_THEMES: readonly ThemeName[] = [
      'paper', 'chalk', 'meadow', 'dusk',
      'hearth', 'rainwash',
      'woad', 'moss', 'peat', 'canopy',
    ];
    const body = req.body as { theme?: Partial<UiThemeConfig> };
    if (body?.theme?.name !== undefined && !VALID_THEMES.includes(body.theme.name)) {
      res.status(400).json({ error: `Invalid theme name: ${String(body.theme.name)}` });
      return;
    }
    const current = uiThemeConfig();
    const nextTheme: UiThemeConfig = {
      name: (VALID_THEMES.includes(body?.theme?.name as ThemeName) ? body?.theme?.name : current.name) as ThemeName,
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
      const nextUrl = normalizeWebhookUrl(body.webhooks.url, current.url);
      if (nextUrl === 'invalid') {
        res.status(400).json({ error: 'Webhook URL must use http:// or https://.' });
        return;
      }
      const nextEvents = body.webhooks.events === undefined
        ? current.events
        : toWebhookEventList(body.webhooks.events);
      if (nextEvents === null) {
        res.status(400).json({ error: 'Invalid webhook events.' });
        return;
      }
      const next: WebhooksConfig = {
        url: nextUrl,
        events: nextEvents,
      };
      repository.setSetting(SETTINGS_KEYS.apiWebhooks, next);
    }
    res.json(aggregateSettings());
    return;
  }

  if (section === 'agents') {
    const body = req.body as {
      claudeCliPath?: unknown;
      codexCliPath?: unknown;
      runtimeCapMinutes?: unknown;
      dailyRunBudget?: unknown;
    };
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
      runtimeCapMinutes: typeof body.runtimeCapMinutes === 'number'
        ? Math.min(30, Math.max(1, Math.floor(body.runtimeCapMinutes)))
        : current.runtimeCapMinutes,
      dailyRunBudget: typeof body.dailyRunBudget === 'number'
        ? Math.max(1, Math.floor(body.dailyRunBudget))
        : current.dailyRunBudget,
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
    repository.setSetting(SETTINGS_KEYS.backupConfig, { frequency, exportJson });
    res.json(aggregateSettings());
    return;
  }

  res.status(400).json({ error: `Unsupported settings section: ${section}` });
}));

app.get('/api/ideas', requireScope('read:ideas'), asyncRoute((req, res) => {
  res.json(repository.listIdeas(listOptionsFromQuery(req.query)));
}));

app.get('/api/mcp/ideas', requireScope('mcp:read'), asyncRoute((req, res) => {
  const limit = numberParam(req.query.limit, 50, 1, 200);
  const offset = numberParam(req.query.offset, 0, 0, 10_000);
  const stage = stringParam(req.query.stage) as Stage | undefined;
  const category = stringParam(req.query.category) as Category | undefined;

  const listed = repository.listIdeas({
    limit: 500,
    includeDeleted: false,
    sortBy: 'updatedAt',
    sortDirection: 'desc',
    stages: stage ? [stage] : undefined,
    categories: category ? [category] : undefined,
  });
  const items = listed.items.slice(offset, offset + limit).map(ideaSummary);
  res.json({
    items,
    total: listed.total,
    limit,
    offset,
  });
}));

app.get('/api/mcp/ideas/:id', requireScope('mcp:read'), asyncRoute((req, res) => {
  const idea = repository.getIdea(routeParam(req, 'id'));
  if (!idea) {
    res.status(404).json({ error: 'Idea not found' });
    return;
  }

  res.json({
    idea,
    rendered: {
      document: ideaToMarkdown(idea),
      sections: {
        pitch: idea.pitch,
        fullNotes: idea.fullNotes,
        hook: idea.hook,
        whyItMightWork: idea.whyItMightWork,
        risks: idea.risks,
        techStack: idea.techStack,
      },
    },
    attachments: idea.images.map((pathValue) => ({ path: pathValue })),
  });
}));

app.get('/api/mcp/search', requireScope('mcp:read'), asyncRoute((req, res) => {
  const q = stringParam(req.query.q) ?? '';
  const limit = numberParam(req.query.limit, 50, 1, 200);
  if (!q) {
    res.json({ items: [], total: 0, limit });
    return;
  }

  const listed = repository.listIdeas({
    query: q,
    limit: 500,
    includeDeleted: false,
    sortBy: 'updatedAt',
    sortDirection: 'desc',
  });
  const items = listed.items.slice(0, limit).map(ideaSummary);
  res.json({
    items,
    total: listed.total,
    limit,
  });
}));

app.get('/api/compost', requireScope('write:ideas'), asyncRoute((_req, res) => {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const purged = repository.purgeDeletedBefore(cutoff);
  res.json({
    items: repository.listDeletedIdeas(),
    retentionDays: 30,
    purged,
  });
}));

app.post('/api/compost/:id/restore', requireScope('write:ideas'), asyncRoute((req, res) => {
  const idea = repository.restoreDeletedIdea(routeParam(req, 'id'));
  if (!idea) {
    res.status(404).json({ error: 'Deleted idea not found' });
    return;
  }
  res.json(idea);
}));

app.delete('/api/compost/:id', requireScope('write:ideas'), asyncRoute((req, res) => {
  const purged = repository.purgeIdea(routeParam(req, 'id'));
  if (!purged) {
    res.status(404).json({ error: 'Idea not found' });
    return;
  }
  res.status(204).send();
}));

app.get('/api/ideas/:id', requireScope('read:ideas'), asyncRoute((req, res) => {
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

app.post('/api/ideas', requireScope('write:ideas'), asyncRoute((req, res) => {
  const idea = repository.createIdea(req.body);
  webhookEmitter.emit('idea.created', idea);
  res.status(201).json(idea);
}));

app.patch('/api/ideas/:id', requireScope('write:ideas'), asyncRoute((req, res) => {
  const ideaId = routeParam(req, 'id');
  const previous = repository.getIdea(ideaId, true);
  const idea = repository.updateIdea(ideaId, req.body);
  if (!idea) {
    res.status(404).json({ error: 'Idea not found' });
    return;
  }
  if (previous?.stage !== 'shipped' && idea.stage === 'shipped') {
    webhookEmitter.emit('idea.shipped', idea);
  }

  res.json(idea);
}));

app.delete('/api/ideas/:id', requireScope('write:ideas'), asyncRoute((req, res) => {
  const idea = repository.softDeleteIdea(routeParam(req, 'id'));
  if (!idea) {
    res.status(404).json({ error: 'Idea not found' });
    return;
  }

  res.json(idea);
}));

app.get('/api/ideas/:id/versions', requireScope('read:ideas'), asyncRoute((req, res) => {
  const id = routeParam(req, 'id');
  if (!repository.getIdea(id, true)) {
    res.status(404).json({ error: 'Idea not found' });
    return;
  }

  res.json(repository.getVersions(id));
}));

app.post('/api/ideas/:id/versions', requireScope('write:ideas'), asyncRoute((req, res) => {
  const body = req.body as { label?: string; notes?: string };
  const version = repository.createVersion(routeParam(req, 'id'), body.label ?? 'Manual snapshot', body.notes ?? '');
  if (!version) {
    res.status(404).json({ error: 'Idea not found' });
    return;
  }

  res.status(201).json(version);
}));

app.post('/api/ideas/:id/versions/restore/:versionId', requireScope('write:ideas'), asyncRoute((req, res) => {
  const idea = repository.restoreVersion(routeParam(req, 'id'), routeParam(req, 'versionId'));
  if (!idea) {
    res.status(404).json({ error: 'Idea or version not found' });
    return;
  }

  res.json(idea);
}));

app.get('/api/stats', requireScope('read:ideas'), asyncRoute((_req, res) => {
  res.json(repository.getStats());
}));

app.get('/api/ai/config', requireScope('read:ideas'), asyncRoute((_req, res) => {
  res.json(aiService.getPublicConfig());
}));

app.get('/api/ai/usage', requireScope('read:ideas'), asyncRoute((_req, res) => {
  res.json(aiService.getUsageSummary());
}));

app.post('/api/ai/config', requireScope('write:ideas'), asyncRoute((req, res) => {
  res.json(aiService.configure(req.body ?? {}));
}));

app.get('/api/ai/conversations/:ideaId', requireScope('read:ideas'), asyncRoute((req, res) => {
  res.json({ messages: aiService.getConversation(routeParam(req, 'ideaId')) });
}));

app.post('/api/ai/suggest', requireScope('ai:suggest'), asyncRoute(async (req, res) => {
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

app.post('/api/ai/chat', requireScope('ai:suggest'), async (req, res) => {
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

app.get('/api/backups', requireScope('read:ideas'), asyncRoute((_req, res) => {
  res.json(backupStatus());
}));

app.patch('/api/backups/config', requireScope('write:ideas'), asyncRoute((req, res) => {
  const body = req.body as Partial<BackupConfig>;
  const next: BackupConfig = {
    ...backupConfig(),
    frequency: body.frequency === 'off' || body.frequency === 'daily' || body.frequency === 'weekly'
      ? body.frequency
      : backupConfig().frequency,
    exportJson: typeof body.exportJson === 'boolean' ? body.exportJson : backupConfig().exportJson,
  };
  repository.setSetting(SETTINGS_KEYS.backupConfig, next);
  res.json(backupStatus());
}));

app.post('/api/backups/run', requireScope('write:ideas'), asyncRoute((_req, res) => {
  res.json({
    run: runBackup('manual'),
    status: backupStatus(),
  });
}));

app.get('/api/integrations', requireScope('read:ideas'), asyncRoute((req, res) => {
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

app.post('/api/integrations/:id/configure', requireScope('write:ideas'), asyncRoute((req, res) => {
  const configured = integrations.configure(routeParam(req, 'id'), req.body?.config ?? req.body ?? {});
  if (!configured) {
    res.status(404).json({ error: 'Integration not found' });
    return;
  }
  res.json(configured);
}));

app.post('/api/integrations/:id/graduate/:ideaId', requireScope('write:ideas'), asyncRoute(async (req, res) => {
  const payload = await integrations.graduate(routeParam(req, 'id'), routeParam(req, 'ideaId'));
  if (!payload) {
    res.status(404).json({ error: 'Integration or idea not found' });
    return;
  }
  webhookEmitter.emit('idea.graduated', payload.idea);
  res.json(payload);
}));

app.post('/api/export', requireScope('read:ideas'), asyncRoute((req, res) => {
  const body = req.body as { format?: string; includeDeleted?: boolean };
  const archive = repository.exportArchive(Boolean(body.includeDeleted));

  if (body.format === 'markdown') {
    res.type('text/markdown').send(archiveToMarkdown(archive.ideas));
    return;
  }

  res.json(archive);
}));

app.post('/api/import', requireScope('write:ideas'), asyncRoute((req, res) => {
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

migrateLegacySettings();
fs.mkdirSync(path.join(dataDir, 'scratch'), { recursive: true });
fs.mkdirSync(path.join(dataDir, 'agent-runs'), { recursive: true });

app.listen(PORT, () => {
  runScheduledBackupIfDue();
  setInterval(runScheduledBackupIfDue, 5 * 60 * 1000).unref();
  console.log(`Seedbank server listening on http://localhost:${PORT}`);
});
