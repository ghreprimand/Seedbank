import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { AiService } from './ai/service.js';
import { registerAiRoutes } from './ai/routes.js';
import { AiStore } from './ai/store.js';
import {
  dataDir,
  dbPath,
  openDatabase,
} from './db.js';
import { BackupService } from './backups/service.js';
import { registerBackupRoutes } from './backups/routes.js';
import { IntegrationRegistry } from './integrations/registry.js';
import {
  expandHome,
  readmeFor,
  targetStageFor,
  uniqueProjectDir,
} from './integrations/scaffold.js';
import {
  ensurePublishableIdea,
  getGitHubAuthStatus,
  getIdeaGitHubRepoStatus,
  GitHubPublishError,
  parseGitHubPublishRequest,
  publishIdeaProject,
  repoNameFromIdeaTitle,
  updateIdeaProjectOnGitHub,
} from './integrations/githubClient.js';
import { authMiddleware, requireImplicitLocal, requireScope } from './middleware/auth.js';
import { archiveToMarkdown, ideaToMarkdown, parseMarkdownArchive } from './markdown.js';
import { openApiSpec } from './openapi.js';
import { SeedbankRepository, type ImportArchive, type ListIdeasOptions } from './repository.js';
import { folderOpenCommand } from './systemOpen.js';
import { ApiTokenStore, TOKEN_SCOPES, type TokenScope } from './tokens.js';
import { WebhookEmitter, normalizeWebhookUrl, toWebhookEventList } from './webhooks.js';
import type { AiConfigPatch } from './ai/types.js';
import type {
  AggregateSettings,
  AiProjectDraftApplyRequest,
  AiProjectDraftFile,
  AiProjectGenerateRequest,
  AiProviderInstanceId,
  AiReasoningEffort,
  AiTextVerbosity,
  BackupConfig,
  CategoryDefinition,
  CategorySettings,
  Category,
  Idea,
  PublicToken,
  ServerInfo,
  Stage,
  ThemeName,
  UiThemeConfig,
  ShortcutBinding,
  ShortcutConfig,
  WebhooksConfig,
} from '../../shared/types.js';
import { DEFAULT_CATEGORY_DEFINITIONS, STAGES } from '../../shared/types.js';

const PORT = Number(process.env.PORT ?? 4800);
const app = express();
const database = openDatabase();
const repository = new SeedbankRepository(database);
const integrations = new IntegrationRegistry(repository);
const aiService = new AiService(repository, new AiStore(database));
const tokenStore = new ApiTokenStore(database);

const SETTINGS_KEYS = {
  uiTheme: 'ui.theme',
  uiShortcuts: 'ui.shortcuts',
  aiConfig: 'ai.config',
  aiConfigLegacy: 'ai:config',
  backupConfig: 'backup.config',
  apiWebhooks: 'api.webhooks',
  categoryConfig: 'categories.config',
} as const;

const PROJECT_DRAFT_DEFAULT_PROMPT = [
  'Generate repository-ready starter documentation for this idea.',
  'Return README.md, SPEC.md, IMPLEMENTATION_NOTES.md, and TODO.md.',
  'Keep the README useful for a GitHub repository: what it is, why it exists, setup assumptions, and first milestone.',
  'Keep the other files practical and scoped to the smallest useful version.',
].join(' ');

const AI_REASONING_EFFORTS: readonly AiReasoningEffort[] = ['minimal', 'low', 'medium', 'high'];
const AI_TEXT_VERBOSITIES: readonly AiTextVerbosity[] = ['low', 'medium', 'high'];

const backupService = new BackupService(repository, SETTINGS_KEYS.backupConfig);

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

const DEFAULT_CATEGORY_CONFIG: CategorySettings = {
  schemaVersion: 1,
  items: DEFAULT_CATEGORY_DEFINITIONS,
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
const IMAGES_ROOT = path.join(dataDir, 'images');
const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);
const uploadImage = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const ideaId = routeParam(req, 'id');
      const destination = path.join(IMAGES_ROOT, ideaId);
      fs.mkdirSync(destination, { recursive: true });
      cb(null, destination);
    },
    filename: (_req, file, cb) => {
      const extFromName = path.extname(file.originalname || '').toLowerCase();
      const ext = IMAGE_EXTENSIONS.has(extFromName)
        ? extFromName
        : (file.mimetype === 'image/png'
            ? '.png'
            : file.mimetype === 'image/gif'
              ? '.gif'
              : file.mimetype === 'image/webp'
                ? '.webp'
                : '.jpg');
      cb(null, `${Date.now()}-${randomUUID().slice(0, 8)}${ext}`);
    },
  }),
  fileFilter: (_req, file, cb) => {
    cb(null, IMAGE_MIME_TYPES.has(file.mimetype));
  },
  limits: { fileSize: 10 * 1024 * 1024 },
});

function uiThemeConfig(): UiThemeConfig {
  const stored = repository.getSetting<Partial<UiThemeConfig>>(SETTINGS_KEYS.uiTheme) ?? {};
  return {
    ...DEFAULT_THEME_CONFIG,
    ...stored,
    // Always return a valid, migrated theme name so callers never see a legacy value.
    name: migrateServerThemeName(stored.name),
  };
}

// ── Keyboard shortcut helpers ─────────────────────────────────────────────────

/** Reserved / modifier keys that cannot be used as the primary key of a binding. */
const RESERVED_KEYS = new Set([
  'escape', 'tab', 'control', 'alt', 'shift', 'meta', 'os',
  'capslock', 'numlock', 'scrolllock',
  'f1','f2','f3','f4','f5','f6','f7','f8','f9','f10','f11','f12',
]);

/** Browser-reserved combos (ctrl/meta + key) that cannot be overridden. */
const BROWSER_RESERVED_CTRL: Set<string> = new Set([
  'w','t','n','r','l','p','s','a','c','v','x','z','y',
  'f4', // alt+f4 is handled via 'alt' combos; ctrl+f4 = close tab
]);

function isValidBinding(b: unknown): b is ShortcutBinding {
  if (!b || typeof b !== 'object') return false;
  const candidate = b as Record<string, unknown>;
  const key = typeof candidate.key === 'string' ? candidate.key.toLowerCase() : '';
  if (!key || RESERVED_KEYS.has(key)) return false;

  const hasCtrl = !!candidate.ctrl;
  const hasMeta = !!candidate.meta;
  if ((hasCtrl || hasMeta) && BROWSER_RESERVED_CTRL.has(key)) return false;

  return true;
}

function sanitizeShortcutConfig(raw: unknown): ShortcutConfig {
  if (!raw || typeof raw !== 'object') return {};
  const obj = raw as Record<string, unknown>;
  const result: ShortcutConfig = {};
  const actions: (keyof ShortcutConfig)[] = ['focusSearch', 'openQuickCapture', 'openManual'];
  for (const action of actions) {
    const candidate = obj[action];
    if (candidate === null) {
      // null = reset to default (omit from stored config)
    } else if (isValidBinding(candidate)) {
      const b = candidate as ShortcutBinding;
      result[action] = {
        key: b.key.toLowerCase(),
        ...(b.ctrl  ? { ctrl:  true } : {}),
        ...(b.alt   ? { alt:   true } : {}),
        ...(b.shift ? { shift: true } : {}),
        ...(b.meta  ? { meta:  true } : {}),
      };
    }
  }
  return result;
}

function uiShortcutsConfig(): ShortcutConfig {
  const stored = repository.getSetting<ShortcutConfig>(SETTINGS_KEYS.uiShortcuts) ?? {};
  return sanitizeShortcutConfig(stored);
}

// ── End keyboard shortcut helpers ─────────────────────────────────────────────

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

/** Normalise a raw category ID to a URL/file-safe lowercase hyphen slug. */
function normalizeCategoryId(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeCategoryDefinition(input: unknown, index: number): CategoryDefinition | null {
  if (!input || typeof input !== 'object') return null;
  const row = input as Record<string, unknown>;
  const rawId = typeof row.id === 'string' ? row.id.trim() : '';
  if (!rawId) return null;

  // Look up by the exact stored ID first; for custom IDs also try the normalised form
  // so import round-trips work even when the on-disk value slightly diverges.
  const builtIn = DEFAULT_CATEGORY_DEFINITIONS.find((category) => category.id === rawId);

  // For custom (non-built-in) IDs, normalize to lowercase-hyphen convention.
  // Built-in IDs are always stored as-is (they already conform).
  // Reject custom IDs that normalize to empty (e.g. emoji-only strings) rather
  // than falling back to the raw non-conforming value.
  const normalizedCustomId = builtIn ? rawId : normalizeCategoryId(rawId);
  if (!builtIn && !normalizedCustomId) return null;
  const id = normalizedCustomId;

  const label = typeof row.label === 'string' && row.label.trim()
    ? row.label.trim()
    : builtIn?.label ?? id;
  const sortOrder = typeof row.sortOrder === 'number' && Number.isFinite(row.sortOrder)
    ? Math.floor(row.sortOrder)
    : builtIn?.sortOrder ?? DEFAULT_CATEGORY_DEFINITIONS.length + index;
  const normalized: CategoryDefinition = {
    id,
    label,
    sortOrder,
    // Only mark as built-in when the ID genuinely matches a built-in definition.
    // Ignore any client-supplied builtIn: true for non-built-in IDs.
    builtIn: !!builtIn,
    archived: row.archived === true,
  };
  if (typeof row.color === 'string' && row.color.trim()) normalized.color = row.color.trim();
  if (typeof row.icon === 'string' && row.icon.trim()) normalized.icon = row.icon.trim();
  return normalized;
}

function categoryConfig(input?: Partial<CategorySettings>): CategorySettings {
  const stored = input ?? repository.getSetting<Partial<CategorySettings>>(SETTINGS_KEYS.categoryConfig) ?? {};
  const definitions = new Map<string, CategoryDefinition>();

  for (const category of DEFAULT_CATEGORY_CONFIG.items) {
    definitions.set(category.id, { ...category });
  }

  if (Array.isArray(stored.items)) {
    stored.items.forEach((item, index) => {
      const normalized = normalizeCategoryDefinition(item, index);
      if (normalized) definitions.set(normalized.id, normalized);
    });
  }

  return {
    schemaVersion: 1,
    items: [...definitions.values()].sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label)),
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
  const shortcuts = uiShortcutsConfig();
  return {
    ui: {
      theme: uiThemeConfig(),
      ...(Object.keys(shortcuts).length > 0 ? { shortcuts } : {}),
    },
    categories: categoryConfig(),
    ai: aiService.getPublicConfig(),
    api: {
      tokens: publicTokens(),
      webhooks: webhooksConfig(),
    },
    backups: backupService.status({ includeSensitiveDestinationPaths: true }),
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

  const storedCategories = repository.getSetting<Partial<CategorySettings>>(SETTINGS_KEYS.categoryConfig);
  const normalizedCategories = categoryConfig(storedCategories);
  if (storedCategories === undefined || JSON.stringify(storedCategories) !== JSON.stringify(normalizedCategories)) {
    repository.setSetting(SETTINGS_KEYS.categoryConfig, normalizedCategories);
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

function positionalRouteParam(req: Request, index: number): string {
  const params = req.params as Record<string, string | string[] | undefined>;
  const value = params[String(index)];
  const raw = Array.isArray(value) ? value[0] ?? '' : value ?? '';
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function safeFilename(raw: string): string {
  const name = path.basename(raw);
  if (!name || name === '.' || name === '..') return '';
  return name;
}

function imagePublicPath(ideaId: string, filename: string): string {
  return `/api/images/${encodeURIComponent(ideaId)}/${encodeURIComponent(filename)}`;
}

function imageContentType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
}

function imageFilenameParam(req: Request): string {
  const dottedName = routeParam(req, 'name');
  const extension = routeParam(req, 'ext');
  if (dottedName && extension) return `${dottedName}.${extension}`;
  return routeParam(req, 'filename') || positionalRouteParam(req, 1);
}

function safeDraftRelativePath(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const raw = value.trim().replace(/\\/g, '/');
  if (!raw || raw.startsWith('/') || raw.startsWith('~') || raw.includes('\0')) return undefined;
  const parts = raw.split('/').filter(Boolean);
  if (parts.some((part) => part === '.' || part === '..' || part.startsWith('.'))) return undefined;
  return parts.join('/');
}

function isInsidePath(childPath: string, parentPath: string): boolean {
  const relative = path.relative(path.resolve(parentPath), path.resolve(childPath));
  return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

function openFolderInFileManager(folderPath: string): Promise<void> {
  const { command, args } = folderOpenCommand(folderPath);
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    });
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };
    child.once('error', (err) => {
      settle(() => reject(err));
    });
    child.once('spawn', () => {
      child.unref();
    });
    child.once('close', (code) => {
      if (code && code !== 0) {
        settle(() => reject(new Error(`${command} exited with code ${code}`)));
      }
    });
    setTimeout(() => {
      settle(resolve);
    }, 750);
  });
}

function clientKey(req: Request): string {
  return req.ip || req.socket.remoteAddress || 'local';
}

function parseProviderInstanceId(value: unknown): AiProviderInstanceId | undefined {
  return typeof value === 'string' && value.trim()
    ? value.trim() as AiProviderInstanceId
    : undefined;
}

function parseAiReasoningEffort(value: unknown): AiReasoningEffort | undefined {
  return typeof value === 'string' && AI_REASONING_EFFORTS.includes(value as AiReasoningEffort)
    ? value as AiReasoningEffort
    : undefined;
}

function parseAiTextVerbosity(value: unknown): AiTextVerbosity | undefined {
  return typeof value === 'string' && AI_TEXT_VERBOSITIES.includes(value as AiTextVerbosity)
    ? value as AiTextVerbosity
    : undefined;
}

function parseProjectDraftApplyFiles(value: unknown): AiProjectDraftFile[] | null {
  if (!Array.isArray(value)) return null;
  const files: AiProjectDraftFile[] = [];
  for (const item of value.slice(0, 8)) {
    if (!item || typeof item !== 'object') return null;
    const file = item as { path?: unknown; content?: unknown; description?: unknown };
    const safePath = safeDraftRelativePath(file.path);
    if (!safePath || typeof file.content !== 'string' || !file.content.trim()) return null;
    files.push({
      path: safePath,
      content: file.content.slice(0, 80000),
      ...(typeof file.description === 'string' ? { description: file.description.slice(0, 500) } : {}),
    });
  }
  return files.length > 0 ? files : null;
}

function projectRootForGeneration(): string {
  const stored = repository.getSetting<{ projectRoot?: string }>('integration:generic-project') ?? {};
  return expandHome(stored.projectRoot?.trim() || '~/Projects/Seedbank-Graduated');
}

function repoDocFallbacks(idea: Idea): AiProjectDraftFile[] {
  return [
    {
      path: 'README.md',
      description: 'GitHub-facing project overview',
      content: readmeFor(idea, 'Seedbank project generation'),
    },
    {
      path: 'SPEC.md',
      description: 'Smallest useful version specification',
      content: [
        `# ${idea.title || 'Untitled Project'} Spec`,
        '',
        '## Problem',
        '',
        idea.pitch || 'Define the core problem this project solves.',
        '',
        '## Smallest Useful Version',
        '',
        idea.hook || 'Describe the smallest coherent product or prototype.',
        '',
        '## Success Criteria',
        '',
        '- A user can understand the project from the README.',
        '- The first milestone is small enough to build and test.',
        '- Open questions and risks are captured before implementation expands.',
        '',
      ].join('\n'),
    },
    {
      path: 'IMPLEMENTATION_NOTES.md',
      description: 'Build notes and constraints',
      content: [
        `# ${idea.title || 'Untitled Project'} Implementation Notes`,
        '',
        '## Suggested Approach',
        '',
        idea.techStack || 'Choose the simplest stack that can validate the core workflow.',
        '',
        '## Context',
        '',
        idea.fullNotes || 'Add project context as implementation decisions become clearer.',
        '',
        '## Risks',
        '',
        idea.risks || 'List technical, product, and scope risks here.',
        '',
      ].join('\n'),
    },
    {
      path: 'TODO.md',
      description: 'Initial build checklist',
      content: [
        '# TODO',
        '',
        '- [ ] Confirm the smallest useful version.',
        '- [ ] Create a basic project skeleton.',
        '- [ ] Implement the first end-to-end workflow.',
        '- [ ] Add a README usage example.',
        '- [ ] Review risks before expanding scope.',
        '',
      ].join('\n'),
    },
  ];
}

function ensureRepoDocs(idea: Idea, files: AiProjectDraftFile[]): AiProjectDraftFile[] {
  const next = [...files];
  const existing = new Set(next.map((file) => file.path.toLowerCase()));
  for (const fallback of repoDocFallbacks(idea)) {
    if (!existing.has(fallback.path.toLowerCase())) {
      next.push(fallback);
      existing.add(fallback.path.toLowerCase());
    }
  }
  return next.slice(0, 12);
}

function writeDraftFilesToProject(targetRoot: string, files: AiProjectDraftFile[]): string[] {
  const written: string[] = [];
  for (const file of files) {
    const destination = path.resolve(targetRoot, file.path);
    if (!isInsidePath(destination, targetRoot)) {
      throw new Error(`Unsafe draft file path: ${file.path}`);
    }
    if (fs.existsSync(destination)) {
      throw new Error(`File already exists: ${file.path}`);
    }
  }
  for (const file of files) {
    const destination = path.resolve(targetRoot, file.path);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, file.content, { encoding: 'utf8', flag: 'wx' });
    written.push(file.path);
  }
  return written;
}

function upsertGitHubIdeaLink(ideaId: string, repoUrl: string) {
  const idea = repository.getIdea(ideaId, true);
  if (!idea) return undefined;
  const normalizedUrl = repoUrl.trim();
  if (!normalizedUrl) return idea;

  const nextLinks = idea.links.filter((link) => {
    const isGitHubLabel = link.label.trim().toLowerCase() === 'github';
    const sameUrl = link.url.trim() === normalizedUrl;
    return !isGitHubLabel && !sameUrl;
  });
  nextLinks.push({ label: 'GitHub', url: normalizedUrl });
  return repository.updateIdea(ideaId, { links: nextLinks });
}

function projectPathInsideConfiguredRoots(projectPath: string): boolean {
  const allowedRoots = integrations.configuredRoots().map((root) => path.resolve(root));
  return allowedRoots.length === 0 || allowedRoots.some((root) => isInsidePath(projectPath, root));
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
  res.json({
    ...openApiSpec,
    info: {
      ...(openApiSpec.info && typeof openApiSpec.info === 'object' ? openApiSpec.info : {}),
      version: SERVER_VERSION,
    },
  });
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
    const body = req.body as { theme?: Partial<UiThemeConfig>; shortcuts?: unknown };
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

    // Persist keyboard shortcuts patch if provided
    if (body?.shortcuts !== undefined) {
      const currentShortcuts = uiShortcutsConfig();
      // Merge incoming patch into existing config; null values remove the override
      const rawPatch = (body.shortcuts ?? {}) as Record<string, unknown>;
      const actions: (keyof ShortcutConfig)[] = ['focusSearch', 'openQuickCapture', 'openManual'];
      const merged: ShortcutConfig = { ...currentShortcuts };
      for (const action of actions) {
        if (!(action in rawPatch)) continue;
        const val = rawPatch[action];
        if (val === null) {
          delete merged[action]; // reset to default
        } else if (isValidBinding(val)) {
          const b = val as ShortcutBinding;
          merged[action] = {
            key: b.key.toLowerCase(),
            ...(b.ctrl  ? { ctrl:  true } : {}),
            ...(b.alt   ? { alt:   true } : {}),
            ...(b.shift ? { shift: true } : {}),
            ...(b.meta  ? { meta:  true } : {}),
          };
        } else {
          res.status(400).json({ error: `Invalid binding for "${action}".` });
          return;
        }
      }
      repository.setSetting(SETTINGS_KEYS.uiShortcuts, merged);
    }

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

  if (section === 'backups') {
    const body = req.body as { config?: Partial<BackupConfig> };
    backupService.configure(body?.config);
    res.json(aggregateSettings());
    return;
  }

  if (section === 'categories') {
    const body = req.body as { config?: Partial<CategorySettings>; items?: CategoryDefinition[] };
    // Normalise: accept { config: { items } } or { items } directly.
    const rawConfig = body?.config ?? (Array.isArray(body?.items) ? { items: body.items } : {});

    // Only process an items update when the caller explicitly supplies an array.
    // A body of {} or { config: {} } must be a no-op — passing an empty object
    // to categoryConfig() would cause it to skip stored items and wipe all
    // custom categories without running the safe-delete guard.
    if (!Array.isArray(rawConfig.items)) {
      res.json(aggregateSettings());
      return;
    }

    // Server-side safe-delete guard: reject removal of any custom category that
    // is currently assigned to one or more ideas. The client enforces this from
    // a cached stats snapshot; the server check closes the TOCTOU window where
    // ideas could be created in another session between the client stats load
    // and the PATCH request.
    const currentConfig = categoryConfig();
    const requestedIds = new Set(
      rawConfig.items.map((item: unknown) => {
        if (typeof item === 'object' && item !== null && 'id' in item) {
          const id = (item as { id: unknown }).id;
          return typeof id === 'string' ? id.trim() : '';
        }
        return '';
      }).filter(Boolean)
    );
    // Find custom (non-built-in) IDs present in current config but absent from the request.
    const removedCustomIds = currentConfig.items
      .filter((cat) => !cat.builtIn && !requestedIds.has(cat.id))
      .map((cat) => cat.id);
    if (removedCustomIds.length > 0) {
      const stats = repository.getStats();
      const inUse = removedCustomIds.filter((id) => (stats.byCategory[id] ?? 0) > 0);
      if (inUse.length > 0) {
        res.status(409).json({
          error: 'Cannot remove categories that are assigned to ideas',
          inUse,
        });
        return;
      }
    }

    const next = categoryConfig(rawConfig);
    repository.setSetting(SETTINGS_KEYS.categoryConfig, next);
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
        aesthetic: idea.aesthetic,
        retrospective: idea.retrospective,
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

app.get('/api/ideas/:id/stage-transitions', requireScope('read:ideas'), asyncRoute((req, res) => {
  const id = routeParam(req, 'id');
  if (!repository.getIdea(id, true)) {
    res.status(404).json({ error: 'Idea not found' });
    return;
  }

  res.json(repository.getStageTransitions(id));
}));

app.get('/api/ideas/:id/landscape-report', requireScope('read:ideas'), asyncRoute((req, res) => {
  const id = routeParam(req, 'id');
  if (!repository.getIdea(id, true)) {
    res.status(404).json({ error: 'Idea not found' });
    return;
  }

  res.json({ report: repository.getLatestLandscapeReport(id) });
}));

app.post(
  '/api/ideas/:id/images',
  requireScope('write:ideas'),
  uploadImage.single('image'),
  asyncRoute((req, res) => {
    const ideaId = routeParam(req, 'id');
    const idea = repository.getIdea(ideaId);
    if (!idea) {
      const uploadedPath = req.file?.path;
      if (uploadedPath && fs.existsSync(uploadedPath)) fs.rmSync(uploadedPath, { force: true });
      res.status(404).json({ error: 'Idea not found' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: 'image file is required (multipart field name: image).' });
      return;
    }

    const filename = safeFilename(req.file.filename);
    if (!filename) {
      res.status(400).json({ error: 'Invalid file name.' });
      return;
    }
    const imagePath = imagePublicPath(ideaId, filename);
    const images = idea.images.includes(imagePath)
      ? idea.images
      : [...idea.images, imagePath];
    const updated = repository.updateIdea(ideaId, { images });
    if (!updated) {
      res.status(500).json({ error: 'Failed to attach uploaded image.' });
      return;
    }
    res.status(201).json({ path: imagePath, images: updated.images });
  }),
);

app.get(/^\/api\/images\/([^/]+)\/([^/]+)$/, requireScope('read:ideas'), asyncRoute((req, res) => {
  const ideaId = routeParam(req, 'ideaId') || positionalRouteParam(req, 0);
  const filename = safeFilename(imageFilenameParam(req));
  if (!filename) {
    res.status(400).json({ error: 'Invalid image file name.' });
    return;
  }
  const filePath = path.join(IMAGES_ROOT, ideaId, filename);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'Image not found.' });
    return;
  }
  res.type(imageContentType(filename));
  const stream = fs.createReadStream(filePath);
  stream.on('error', (err) => {
    if (res.headersSent) {
      res.destroy(err);
      return;
    }
    res.status(500).json({ error: 'Failed to read image file.' });
  });
  stream.pipe(res);
}));

app.delete(/^\/api\/ideas\/([^/]+)\/images\/([^/]+)$/, requireScope('write:ideas'), asyncRoute((req, res) => {
  const ideaId = routeParam(req, 'id') || positionalRouteParam(req, 0);
  const filename = safeFilename(imageFilenameParam(req));
  if (!filename) {
    res.status(400).json({ error: 'Invalid image file name.' });
    return;
  }

  const idea = repository.getIdea(ideaId);
  if (!idea) {
    res.status(404).json({ error: 'Idea not found' });
    return;
  }

  const normalizedPath = imagePublicPath(ideaId, filename);
  const remainingImages = idea.images.filter((imagePath) =>
    imagePath !== normalizedPath && !imagePath.endsWith(`/${filename}`),
  );
  const updated = repository.updateIdea(ideaId, { images: remainingImages });
  if (!updated) {
    res.status(500).json({ error: 'Failed to update idea images.' });
    return;
  }

  const filePath = path.join(IMAGES_ROOT, ideaId, filename);
  if (fs.existsSync(filePath)) fs.rmSync(filePath, { force: true });
  res.json({ ok: true, images: updated.images });
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

app.post('/api/ai/project-generate', requireScope('ai:suggest'), requireScope('write:ideas'), asyncRoute(async (req, res) => {
  const body = (req.body ?? {}) as Partial<AiProjectGenerateRequest>;
  const ideaId = typeof body.ideaId === 'string' ? body.ideaId.trim() : '';
  if (!ideaId) {
    res.status(400).json({ error: 'ideaId is required.' });
    return;
  }

  const idea = repository.getIdea(ideaId);
  if (!idea) {
    res.status(404).json({ error: 'Idea not found.' });
    return;
  }

  const prompt = typeof body.prompt === 'string' && body.prompt.trim()
    ? body.prompt.trim()
    : PROJECT_DRAFT_DEFAULT_PROMPT;
  const draft = await aiService.draftProject(
    {
      ideaId,
      prompt,
      providerInstanceId: parseProviderInstanceId(body.providerInstanceId),
      ...(typeof body.model === 'string' && body.model.trim() ? { model: body.model.trim() } : {}),
      effort: parseAiReasoningEffort(body.effort),
      verbosity: parseAiTextVerbosity(body.verbosity),
    },
    clientKey(req),
    typeof body.aiConfirmationToken === 'string' ? body.aiConfirmationToken : undefined,
  );

  const existingProjectPath = idea.graduatedTo?.trim();
  const createdProject = !existingProjectPath;
  const targetRoot = existingProjectPath
    ? path.resolve(existingProjectPath)
    : uniqueProjectDir(projectRootForGeneration(), idea.title);
  const allowedRoots = integrations.configuredRoots().map((root) => path.resolve(root));
  if (allowedRoots.length > 0 && !allowedRoots.some((root) => isInsidePath(targetRoot, root))) {
    res.status(403).json({ error: 'Project path is outside configured project roots.' });
    return;
  }

  fs.mkdirSync(targetRoot, { recursive: true });
  const files = ensureRepoDocs(idea, draft.files);
  let filesWritten: string[];
  try {
    filesWritten = writeDraftFilesToProject(targetRoot, files);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(message.startsWith('File already exists:') ? 409 : 400).json({ error: message });
    return;
  }

  const stage = targetStageFor(idea.category, 'prototype');
  const updated = repository.updateIdea(idea.id, {
    graduatedTo: targetRoot,
    ...(STAGES.indexOf(idea.stage) < STAGES.indexOf(stage) ? { stage } : {}),
  });
  if (!updated) {
    res.status(500).json({ error: 'Project files were written, but the idea record could not be updated.' });
    return;
  }

  webhookEmitter.emit('idea.graduated', updated);
  res.json({
    ...draft,
    files,
    targetPath: targetRoot,
    filesWritten,
    createdProject,
    idea: updated,
  });
}));

app.post('/api/ai/project-draft/apply', requireScope('ai:suggest'), asyncRoute((req, res) => {
  const body = (req.body ?? {}) as Partial<AiProjectDraftApplyRequest>;
  const ideaId = typeof body.ideaId === 'string' ? body.ideaId.trim() : '';
  if (!ideaId) {
    res.status(400).json({ error: 'ideaId is required.' });
    return;
  }
  const idea = repository.getIdea(ideaId);
  if (!idea) {
    res.status(404).json({ error: 'Idea not found.' });
    return;
  }
  if (!idea.graduatedTo) {
    res.status(400).json({ error: 'This idea has not been graduated to a project path.' });
    return;
  }
  const targetRoot = path.resolve(idea.graduatedTo);
  const allowedRoots = integrations.configuredRoots().map((root) => path.resolve(root));
  if (!allowedRoots.some((root) => isInsidePath(targetRoot, root))) {
    res.status(403).json({ error: 'Graduated project path is outside configured project roots.' });
    return;
  }
  const files = parseProjectDraftApplyFiles(body.files);
  if (!files) {
    res.status(400).json({ error: 'files must be a non-empty array of safe relative text files.' });
    return;
  }

  const written: string[] = [];
  for (const file of files) {
    const destination = path.resolve(targetRoot, file.path);
    if (!isInsidePath(destination, targetRoot)) {
      res.status(400).json({ error: `Unsafe draft file path: ${file.path}` });
      return;
    }
    if (fs.existsSync(destination)) {
      res.status(409).json({ error: `File already exists: ${file.path}` });
      return;
    }
  }
  for (const file of files) {
    const destination = path.resolve(targetRoot, file.path);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, file.content, { encoding: 'utf8', flag: 'wx' });
    written.push(file.path);
  }

  res.json({ targetPath: targetRoot, filesWritten: written });
}));

app.post('/api/ideas/:id/open-project-folder', requireScope('read:ideas'), requireImplicitLocal, asyncRoute(async (req, res) => {
  const idea = repository.getIdea(routeParam(req, 'id'));
  if (!idea) {
    res.status(404).json({ error: 'Idea not found.' });
    return;
  }
  if (!idea.graduatedTo?.trim()) {
    res.status(400).json({ error: 'This idea has not been graduated to a project path.' });
    return;
  }

  const projectPath = path.resolve(idea.graduatedTo);
  let stat: fs.Stats;
  try {
    stat = fs.statSync(projectPath);
  } catch {
    res.status(404).json({ error: `Project folder does not exist: ${projectPath}` });
    return;
  }
  if (!stat.isDirectory()) {
    res.status(400).json({ error: `Project path is not a folder: ${projectPath}` });
    return;
  }

  try {
    await openFolderInFileManager(projectPath);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(503).json({ error: `Could not open the system file explorer: ${message}` });
    return;
  }
  res.json({ ok: true, path: projectPath, message: `Opened project folder: ${projectPath}` });
}));

app.get('/api/stats', requireScope('read:ideas'), asyncRoute((_req, res) => {
  res.json(repository.getStats());
}));

registerAiRoutes(app, aiService);
registerBackupRoutes(app, backupService);

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

app.get('/api/integrations/github/status', requireScope('read:ideas'), asyncRoute(async (_req, res) => {
  const status = await getGitHubAuthStatus();
  res.json(status);
}));

app.get('/api/integrations/github/repo-status/:ideaId', requireScope('read:ideas'), asyncRoute(async (req, res) => {
  const ideaId = routeParam(req, 'ideaId');
  const idea = repository.getIdea(ideaId);
  const { projectPath } = ensurePublishableIdea(idea);
  if (!projectPathInsideConfiguredRoots(projectPath)) {
    res.status(403).json({ error: 'Graduated project path is outside configured project roots.' });
    return;
  }

  const status = await getIdeaGitHubRepoStatus(idea!);
  res.json(status);
}));

app.post('/api/integrations/github/publish/:ideaId', requireScope('write:ideas'), asyncRoute(async (req, res) => {
  const ideaId = routeParam(req, 'ideaId');
  const idea = repository.getIdea(ideaId);
  const { projectPath } = ensurePublishableIdea(idea);
  const publishIdea = idea!;
  if (!projectPathInsideConfiguredRoots(projectPath)) {
    res.status(403).json({ error: 'Graduated project path is outside configured project roots.' });
    return;
  }

  const fallbackRepoName = repoNameFromIdeaTitle(publishIdea.title);
  const publishRequest = parseGitHubPublishRequest(req.body, fallbackRepoName);
  const result = await publishIdeaProject(publishIdea, publishRequest);
  let updatedIdea = publishIdea;
  if (result.repoUrl) {
    updatedIdea = upsertGitHubIdeaLink(ideaId, result.repoUrl) ?? publishIdea;
  }
  res.json({ ...result, idea: updatedIdea });
}));

app.post('/api/integrations/github/update/:ideaId', requireScope('write:ideas'), asyncRoute(async (req, res) => {
  const ideaId = routeParam(req, 'ideaId');
  const idea = repository.getIdea(ideaId);
  const { projectPath } = ensurePublishableIdea(idea);
  const updateIdea = idea!;
  if (!projectPathInsideConfiguredRoots(projectPath)) {
    res.status(403).json({ error: 'Graduated project path is outside configured project roots.' });
    return;
  }

  const result = await updateIdeaProjectOnGitHub(updateIdea);
  let updatedIdea = updateIdea;
  if (result.repoUrl) {
    updatedIdea = upsertGitHubIdeaLink(ideaId, result.repoUrl) ?? updateIdea;
  }
  res.json({ ...result, idea: updatedIdea });
}));

app.get('/api/integrations/:id/health', requireScope('read:ideas'), asyncRoute(async (req, res) => {
  const result = await integrations.healthCheck(routeParam(req, 'id'));
  if (!result) {
    res.status(404).json({ error: 'Integration not found' });
    return;
  }
  res.json(result);
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
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({ error: 'Image must be 10MB or smaller.' });
      return;
    }
    res.status(400).json({ error: err.message });
    return;
  }

  const message = err instanceof Error ? err.message : 'Unexpected server error';
  if (err instanceof GitHubPublishError) {
    res.status(err.statusCode).json({ error: message });
    return;
  }
  const statusCode = typeof (err as { statusCode?: unknown })?.statusCode === 'number'
    ? (err as { statusCode: number }).statusCode
    : 500;
  if (statusCode >= 500) console.error(err);
  res.status(statusCode).json({ error: message });
});

migrateLegacySettings();

app.listen(PORT, () => {
  backupService.runScheduledIfDue();
  setInterval(() => backupService.runScheduledIfDue(), 5 * 60 * 1000).unref();
  // Warm the Claude account auth cache at startup without blocking account login.
  void import('./ai/claude-account/auth.js').then(async ({ loadTokens }) => {
    const tokens = await loadTokens();
    const { setCachedClaudeAccountAuth } = await import('./ai/service.js');
    setCachedClaudeAccountAuth(tokens !== null && tokens.expiresAt > Date.now());
  }).catch(() => { /* auth file missing or unreadable — stays false */ });
  // Warm the Codex account auth cache without requiring Codex to be installed.
  void import('./ai/codex-account/session.js').then(async ({ codexAccountSession }) => {
    const status = await codexAccountSession.status();
    const { setCachedCodexAccountAuth } = await import('./ai/service.js');
    setCachedCodexAccountAuth(status.authenticated);
  }).catch(() => { /* Codex unavailable or not logged in — stays false */ });
  // Auto-discover models for connected providers — delayed so auth caches warm first.
  const MODEL_REFRESH_DELAY_MS = 10_000;
  const MODEL_REFRESH_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
  setTimeout(() => {
    void aiService.refreshAllDiscoveredModels();
    setInterval(() => void aiService.refreshAllDiscoveredModels(), MODEL_REFRESH_INTERVAL_MS).unref();
  }, MODEL_REFRESH_DELAY_MS);
  console.log(`Seedbank server listening on http://localhost:${PORT}`);
});
