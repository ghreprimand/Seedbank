import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import BetterSqlite3 from 'better-sqlite3';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
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
  BackupArtifactResult,
  BackupConfig,
  BackupDestinationConfig,
  BackupDestinationResult,
  BackupFrequency,
  BackupRunRecord,
  BackupStatus,
  CategoryDefinition,
  CategorySettings,
  AiFieldAssistMessage,
  AiFieldAssistChatRequest,
  AiFieldSuggestionRequest,
  AiFeatureId,
  AiPreflightRequest,
  AiSuggestionField,
  Category,
  PublicToken,
  ServerInfo,
  Stage,
  ThemeName,
  UiThemeConfig,
  WebhooksConfig,
} from '../../shared/types.js';
import { DEFAULT_CATEGORY_DEFINITIONS } from '../../shared/types.js';

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
  retentionCount: 10,
  destinations: [],
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
  categoryConfig: 'categories.config',
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

const MAX_BACKUP_RETENTION = 500;
const MIN_BACKUP_RETENTION = 1;
const MAX_RESTORE_JSON_BYTES = 25 * 1024 * 1024;
const RCLONE_PROBE_TIMEOUT_MS = 10_000;
const RCLONE_PROBE_MAX_BUFFER = 64 * 1024;

type RcloneReadinessStatus = BackupStatus['rclone'];

let rcloneProbeCache: RcloneReadinessStatus | null = null;

function normalizeBackupFrequency(input: unknown, fallback: BackupFrequency): BackupFrequency {
  return input === 'off' || input === 'daily' || input === 'weekly' ? input : fallback;
}

function normalizeBackupRetention(input: unknown, fallback: number): number {
  if (typeof input !== 'number' || Number.isNaN(input)) return fallback;
  return Math.min(MAX_BACKUP_RETENTION, Math.max(MIN_BACKUP_RETENTION, Math.floor(input)));
}

function normalizeBackupDestination(input: unknown, index: number): BackupDestinationConfig | null {
  if (!input || typeof input !== 'object') return null;
  const row = input as Record<string, unknown>;
  const type = row.type === 'local-path' || row.type === 'rclone-remote' ? row.type : null;
  if (!type) return null;
  const id = typeof row.id === 'string' && row.id.trim().length > 0
    ? row.id.trim()
    : `dest-${index + 1}`;
  const labelFallback = type === 'local-path' ? `Folder ${index + 1}` : `Rclone ${index + 1}`;
  const base = {
    id,
    type,
    label: typeof row.label === 'string' && row.label.trim().length > 0 ? row.label.trim() : labelFallback,
    enabled: row.enabled !== false,
    includeDatabase: row.includeDatabase !== false,
    includeJsonExport: row.includeJsonExport !== false,
  };
  if (type === 'local-path') {
    const localPath = typeof row.localPath === 'string' ? row.localPath.trim() : '';
    if (!localPath) return null;
    return { ...base, type, localPath };
  }
  const remotePath = typeof row.remotePath === 'string' ? row.remotePath.trim() : '';
  if (!remotePath) return null;
  return { ...base, type, remotePath };
}

function normalizeBackupDestinations(input: unknown, fallback: BackupDestinationConfig[]): BackupDestinationConfig[] {
  if (!Array.isArray(input)) return fallback;
  const normalized = input
    .map((value, index) => normalizeBackupDestination(value, index))
    .filter((value): value is BackupDestinationConfig => Boolean(value));
  return normalized;
}

function mergeBackupConfig(current: BackupConfig, requested: Partial<BackupConfig> | undefined): BackupConfig {
  const patch = requested ?? {};
  return {
    frequency: normalizeBackupFrequency(patch.frequency, current.frequency),
    exportJson: typeof patch.exportJson === 'boolean' ? patch.exportJson : current.exportJson,
    retentionCount: normalizeBackupRetention(patch.retentionCount, current.retentionCount),
    destinations: normalizeBackupDestinations(patch.destinations, current.destinations),
  };
}

function firstNonEmptyLine(output: string): string | undefined {
  return output.split('\n').find((line) => line.trim().length > 0)?.trim();
}

function safeRcloneProbeError(err: unknown, fallback: string): string {
  if (err instanceof Error && err.name === 'AbortError') {
    return 'Timed out while checking rclone.';
  }
  return fallback;
}

function isCommandNotFound(err: unknown): boolean {
  return Boolean(err && typeof err === 'object' && 'code' in err && (err as { code?: unknown }).code === 'ENOENT');
}

function rcloneAvailability(): RcloneReadinessStatus {
  if (rcloneProbeCache) return rcloneProbeCache;
  let version: string | undefined;
  try {
    const output = execFileSync('rclone', ['version'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
      timeout: RCLONE_PROBE_TIMEOUT_MS,
      maxBuffer: RCLONE_PROBE_MAX_BUFFER,
    });
    version = firstNonEmptyLine(output);
  } catch (err) {
    const notInstalled = isCommandNotFound(err);
    const message = notInstalled
      ? 'rclone is not installed or not on PATH.'
      : safeRcloneProbeError(err, 'Could not run rclone.');
    rcloneProbeCache = {
      available: false,
      installed: false,
      configured: false,
      remoteCount: 0,
      status: notInstalled ? 'not-installed' : 'error',
      message,
      error: message,
    };
    return rcloneProbeCache;
  }

  try {
    const output = execFileSync('rclone', ['listremotes'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
      timeout: RCLONE_PROBE_TIMEOUT_MS,
      maxBuffer: RCLONE_PROBE_MAX_BUFFER,
    });
    const remoteCount = output.split('\n').map((line) => line.trim()).filter(Boolean).length;
    rcloneProbeCache = {
      available: true,
      installed: true,
      configured: remoteCount > 0,
      remoteCount,
      status: remoteCount > 0 ? 'ready' : 'no-remotes',
      message: remoteCount > 0
        ? `${remoteCount} rclone remote${remoteCount === 1 ? '' : 's'} configured.`
        : 'rclone is installed, but no remotes are configured.',
      ...(version ? { version } : {}),
    };
  } catch (err) {
    const message = safeRcloneProbeError(err, 'Could not check configured rclone remotes.');
    rcloneProbeCache = {
      available: true,
      installed: true,
      configured: false,
      remoteCount: 0,
      status: 'error',
      message,
      error: message,
      ...(version ? { version } : {}),
    };
  }
  return rcloneProbeCache;
}

function clearRcloneProbeCache(): void {
  rcloneProbeCache = null;
}

function commandErrorMessage(err: unknown): string {
  if (err && typeof err === 'object') {
    const stderr = (err as { stderr?: unknown }).stderr;
    if (stderr instanceof Buffer) {
      const text = stderr.toString('utf8').trim();
      if (text) return text;
    }
    if (typeof stderr === 'string' && stderr.trim()) return stderr.trim();
  }
  return err instanceof Error ? err.message : 'Command failed.';
}

function joinRemotePath(base: string, fileName: string): string {
  return base.endsWith('/') ? `${base}${fileName}` : `${base}/${fileName}`;
}

function destinationCopyTarget(destination: BackupDestinationConfig, sourcePath: string): string {
  const fileName = path.basename(sourcePath);
  return destination.type === 'local-path'
    ? path.join(destination.localPath, fileName)
    : joinRemotePath(destination.remotePath, fileName);
}

function copyArtifactToDestination(destination: BackupDestinationConfig, sourcePath: string): void {
  const fileName = path.basename(sourcePath);
  if (destination.type === 'local-path') {
    fs.mkdirSync(destination.localPath, { recursive: true });
    fs.accessSync(destination.localPath, fs.constants.W_OK);
    fs.copyFileSync(sourcePath, path.join(destination.localPath, fileName));
    return;
  }
  const rclone = rcloneAvailability();
  if (!rclone.available) {
    throw new Error(rclone.error ?? 'rclone is not available in PATH.');
  }
  execFileSync('rclone', ['copyto', sourcePath, joinRemotePath(destination.remotePath, fileName)], {
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 60_000,
  });
}

function testBackupDestination(destination: BackupDestinationConfig): {
  ok: boolean;
  message: string;
  detail?: string;
} {
  if (destination.type === 'local-path') {
    try {
      fs.mkdirSync(destination.localPath, { recursive: true });
      fs.accessSync(destination.localPath, fs.constants.W_OK);
      return { ok: true, message: 'Local destination is writable.' };
    } catch (err) {
      return {
        ok: false,
        message: 'Local destination is not writable.',
        detail: err instanceof Error ? err.message : 'Write test failed.',
      };
    }
  }
  const rclone = rcloneAvailability();
  if (!rclone.available) {
    return {
      ok: false,
      message: 'rclone is not available in PATH.',
      detail: rclone.error,
    };
  }
  try {
    execFileSync('rclone', ['lsf', destination.remotePath, '--max-depth', '1'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30_000,
    });
    return { ok: true, message: 'Remote destination is reachable via rclone.' };
  } catch (err) {
    return {
      ok: false,
      message: 'Could not reach remote destination via rclone.',
      detail: commandErrorMessage(err),
    };
  }
}

function isSubPath(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function canonicalPath(input: string): string {
  const absolute = path.resolve(input);
  try {
    return fs.realpathSync(absolute);
  } catch {
    return absolute;
  }
}

function restoreValidationRoots(): string[] {
  const destinationRoots = backupConfig().destinations
    .filter((destination): destination is Extract<BackupDestinationConfig, { type: 'local-path' }> => (
      destination.type === 'local-path' && destination.localPath.trim().length > 0
    ))
    .map((destination) => canonicalPath(destination.localPath));

  return Array.from(new Set([
    canonicalPath(backupsDir),
    canonicalPath(exportsDir),
    ...destinationRoots,
  ]));
}

function resolveReadableFile(filePath: string): { path?: string; error?: string } {
  try {
    const resolved = fs.realpathSync(path.resolve(filePath));
    const stat = fs.statSync(resolved);
    if (!stat.isFile()) return { error: 'Path is not a file.' };
    return { path: resolved };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Path is not accessible.',
    };
  }
}

function pathAllowedForRestoreValidation(filePath: string, roots: string[]): boolean {
  return roots.some((root) => isSubPath(root, filePath));
}

function chooseRestoreValidationPath(input: {
  kindLabel: string;
  requestedPath: string;
  fallbackPath: string;
  allowedRoots: string[];
}): { path: string; error?: string; badRequest?: string } {
  const { kindLabel, requestedPath, fallbackPath, allowedRoots } = input;
  const candidatePath = requestedPath || fallbackPath || '';
  if (!candidatePath) {
    return { path: '', error: `No ${kindLabel} file available to validate.` };
  }

  const resolved = resolveReadableFile(candidatePath);
  if (!resolved.path) {
    if (requestedPath) {
      return {
        path: '',
        badRequest: `Invalid ${kindLabel} path. ${resolved.error ?? 'Path is not accessible.'}`,
      };
    }
    return {
      path: '',
      error: `Latest ${kindLabel} file is unavailable. ${resolved.error ?? 'Path is not accessible.'}`,
    };
  }

  if (!pathAllowedForRestoreValidation(resolved.path, allowedRoots)) {
    const allowedSummary = allowedRoots.join(', ');
    if (requestedPath) {
      return {
        path: '',
        badRequest: `${kindLabel} path is not allowed. Use a file inside Seedbank backup/export directories or configured local backup destinations. Allowed roots: ${allowedSummary}`,
      };
    }
    return {
      path: '',
      error: `Latest ${kindLabel} file is outside allowed restore roots. Allowed roots: ${allowedSummary}`,
    };
  }

  return { path: resolved.path };
}

function validateDatabaseBackupFile(backupPath: string): {
  path: string;
  ok: boolean;
  sizeBytes: number | null;
  ideaCount?: number;
  versionCount?: number;
  error?: string;
} {
  try {
    const stat = fs.statSync(backupPath);
    if (!stat.isFile()) {
      return { path: backupPath, ok: false, sizeBytes: null, error: 'Path is not a file.' };
    }
    const probe = new BetterSqlite3(backupPath, { readonly: true, fileMustExist: true });
    try {
      const tables = probe.prepare(`
        SELECT name FROM sqlite_master
        WHERE type='table' AND name IN ('ideas','versions','settings')
      `).all() as Array<{ name: string }>;
      const tableNames = new Set(tables.map((row) => row.name));
      const requiredTables = ['ideas', 'versions', 'settings'];
      const missingTables = requiredTables.filter((name) => !tableNames.has(name));
      if (missingTables.length > 0) {
        const sampleTables = (probe.prepare(`
          SELECT name FROM sqlite_master
          WHERE type='table'
          ORDER BY name
          LIMIT 8
        `).all() as Array<{ name: string }>).map((row) => row.name);
        return {
          path: backupPath,
          ok: false,
          sizeBytes: stat.size,
          error: [
            `Backup database is missing required tables: ${missingTables.join(', ')}.`,
            sampleTables.length > 0 ? `Found tables: ${sampleTables.join(', ')}.` : 'No tables found.',
            'Run "Run backup now" to create a fresh snapshot, then retry validation.',
          ].join(' '),
        };
      }
      const ideaCount = (probe.prepare('SELECT COUNT(*) AS count FROM ideas').get() as { count: number }).count;
      const versionCount = (probe.prepare('SELECT COUNT(*) AS count FROM versions').get() as { count: number }).count;
      return { path: backupPath, ok: true, sizeBytes: stat.size, ideaCount, versionCount };
    } finally {
      probe.close();
    }
  } catch (err) {
    return {
      path: backupPath,
      ok: false,
      sizeBytes: null,
      error: err instanceof Error ? err.message : 'Could not inspect backup file.',
    };
  }
}

function validateJsonExportFile(exportPath: string): {
  path: string;
  ok: boolean;
  sizeBytes: number | null;
  ideaCount?: number;
  versionCount?: number;
  error?: string;
} {
  try {
    const stat = fs.statSync(exportPath);
    if (!stat.isFile()) {
      return { path: exportPath, ok: false, sizeBytes: null, error: 'Path is not a file.' };
    }
    if (stat.size > MAX_RESTORE_JSON_BYTES) {
      return {
        path: exportPath,
        ok: false,
        sizeBytes: stat.size,
        error: `JSON export is too large to validate in-app (${stat.size} bytes > ${MAX_RESTORE_JSON_BYTES} bytes).`,
      };
    }
    const raw = fs.readFileSync(exportPath, 'utf8');
    const parsed = JSON.parse(raw) as { ideas?: unknown; versions?: unknown };
    if (!Array.isArray(parsed.ideas) || !Array.isArray(parsed.versions)) {
      return {
        path: exportPath,
        ok: false,
        sizeBytes: stat.size,
        error: 'Export is not a valid Seedbank archive (ideas/versions arrays missing).',
      };
    }
    return {
      path: exportPath,
      ok: true,
      sizeBytes: stat.size,
      ideaCount: parsed.ideas.length,
      versionCount: parsed.versions.length,
    };
  } catch (err) {
    return {
      path: exportPath,
      ok: false,
      sizeBytes: null,
      error: err instanceof Error ? err.message : 'Could not inspect export file.',
    };
  }
}

function backupConfig(): BackupConfig {
  const stored = repository.getSetting<Partial<BackupConfig>>(SETTINGS_KEYS.backupConfig) ?? {};
  return mergeBackupConfig(DEFAULT_BACKUP_CONFIG, stored);
}

function backupIntervalMs(frequency: BackupFrequency): number | null {
  if (frequency === 'daily') return 24 * 60 * 60 * 1000;
  if (frequency === 'weekly') return 7 * 24 * 60 * 60 * 1000;
  return null;
}

function runBackup(reason: string): BackupRunRecord {
  const now = new Date();
  const config = backupConfig();
  const artifacts: BackupArtifactResult[] = [];
  const destinations: BackupDestinationResult[] = [];

  const backupPath = createDatabaseBackup(now, config.retentionCount);
  artifacts.push({
    type: 'database',
    attempted: true,
    ok: Boolean(backupPath),
    path: backupPath,
    ...(backupPath ? {} : { error: 'Database is empty; no snapshot was created.' }),
  });

  const exportPath = config.exportJson
    ? writeArchiveExport(JSON.stringify(repository.exportArchive(true), null, 2), now)
    : null;
  artifacts.push({
    type: 'json-export',
    attempted: config.exportJson,
    ok: config.exportJson ? Boolean(exportPath) : false,
    path: exportPath,
    ...(config.exportJson
      ? (exportPath ? {} : { error: 'JSON export did not produce a file.' })
      : { error: 'Disabled in backup settings.' }),
  });

  const transferable = artifacts.filter((artifact) => artifact.ok && artifact.path) as Array<BackupArtifactResult & { path: string }>;
  for (const destination of config.destinations.filter((item) => item.enabled)) {
    const copiedPaths: string[] = [];
    const destinationErrors: string[] = [];
    const eligibleArtifacts = transferable.filter((artifact) => (
      (artifact.type === 'database' && destination.includeDatabase)
      || (artifact.type === 'json-export' && destination.includeJsonExport)
    ));
    if (eligibleArtifacts.length === 0) {
      destinations.push({
        destinationId: destination.id,
        label: destination.label,
        type: destination.type,
        attempted: false,
        ok: true,
        copiedPaths: [],
      });
      continue;
    }

    for (const artifact of eligibleArtifacts) {
      try {
        copyArtifactToDestination(destination, artifact.path);
        copiedPaths.push(destinationCopyTarget(destination, artifact.path));
      } catch (err) {
        const reasonText = commandErrorMessage(err);
        destinationErrors.push(`${artifact.type}: ${reasonText}`);
      }
    }

    destinations.push({
      destinationId: destination.id,
      label: destination.label,
      type: destination.type,
      attempted: true,
      ok: destinationErrors.length === 0,
      copiedPaths,
      ...(destinationErrors.length > 0 ? { error: destinationErrors.join(' | ') } : {}),
    });
  }

  const record: BackupRunRecord = {
    timestamp: now.toISOString(),
    backupPath,
    exportPath,
    reason,
    artifacts,
    destinations,
  };
  repository.setSetting('backup.lastRun', record);
  return record;
}

function backupStatus(): BackupStatus {
  const rclone = rcloneAvailability();
  return {
    config: backupConfig(),
    lastRun: repository.getSetting<BackupRunRecord>('backup.lastRun') ?? null,
    latestDatabaseBackup: latestFileInfo(backupsDir, /^seedbank-.*\.db$/),
    latestJsonExport: latestFileInfo(exportsDir, /^seedbank-archive-.*\.json$/),
    rclone,
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
  return {
    ui: { theme: uiThemeConfig() },
    categories: categoryConfig(),
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

  const storedCategories = repository.getSetting<Partial<CategorySettings>>(SETTINGS_KEYS.categoryConfig);
  const normalizedCategories = categoryConfig(storedCategories);
  if (storedCategories === undefined || JSON.stringify(storedCategories) !== JSON.stringify(normalizedCategories)) {
    repository.setSetting(SETTINGS_KEYS.categoryConfig, normalizedCategories);
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

const AI_SUGGESTION_FIELDS: readonly AiSuggestionField[] = ['pitch', 'risks', 'techStack', 'hook', 'whyItMightWork'];
const AI_FEATURE_IDS: readonly AiFeatureId[] = ['thinking-partner', 'field-suggestions', 'health-check', 'discover-insights', 'default'];

function parseAiSuggestionField(value: unknown): AiSuggestionField | undefined {
  return typeof value === 'string' && AI_SUGGESTION_FIELDS.includes(value as AiSuggestionField)
    ? value as AiSuggestionField
    : undefined;
}

function parseAiFeatureId(value: unknown): AiFeatureId | undefined {
  return typeof value === 'string' && AI_FEATURE_IDS.includes(value as AiFeatureId)
    ? value as AiFeatureId
    : undefined;
}

function optionalString(value: unknown, fieldName: string): { ok: true; value?: string } | { ok: false; error: string } {
  if (value === undefined || value === null) return { ok: true };
  if (typeof value !== 'string') return { ok: false, error: `${fieldName} must be a string.` };
  return { ok: true, value };
}

function requiredString(value: unknown, fieldName: string): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof value !== 'string') return { ok: false, error: `${fieldName} must be a string.` };
  const trimmed = value.trim();
  return trimmed ? { ok: true, value: trimmed } : { ok: false, error: `${fieldName} is required.` };
}

function parseFieldAssistHistory(value: unknown): { ok: true; value: AiFieldAssistMessage[] } | { ok: false; error: string } {
  if (value === undefined || value === null) return { ok: true, value: [] };
  if (!Array.isArray(value)) return { ok: false, error: 'history must be an array.' };
  const messages: AiFieldAssistMessage[] = [];
  for (const [index, item] of value.entries()) {
    if (!item || typeof item !== 'object') return { ok: false, error: `history[${index}] must be an object.` };
    const message = item as { role?: unknown; content?: unknown };
    if (message.role !== 'user' && message.role !== 'assistant') {
      return { ok: false, error: `history[${index}].role must be "user" or "assistant".` };
    }
    if (typeof message.content !== 'string') {
      return { ok: false, error: `history[${index}].content must be a string.` };
    }
    messages.push({ role: message.role, content: message.content });
  }
  return { ok: true, value: messages };
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
    const next = mergeBackupConfig(current, body?.config);
    repository.setSetting(SETTINGS_KEYS.backupConfig, next);
    clearRcloneProbeCache();
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

app.get('/api/ai/providers', requireScope('read:ideas'), asyncRoute((_req, res) => {
  res.json({ providers: aiService.getProviderDescriptors() });
}));

app.get('/api/ai/usage', requireScope('read:ideas'), asyncRoute((_req, res) => {
  res.json(aiService.getUsageSummary());
}));

app.get('/api/ai/usage/detail', requireScope('read:ideas'), asyncRoute((_req, res) => {
  res.json(aiService.getUsageDetail());
}));

app.post('/api/ai/config', requireScope('write:ideas'), asyncRoute((req, res) => {
  res.json(aiService.configure(req.body ?? {}));
}));

app.post('/api/ai/preflight', requireScope('read:ideas'), asyncRoute((req, res) => {
  const body = (req.body ?? {}) as Partial<AiPreflightRequest>;
  const feature = parseAiFeatureId(body.feature);
  if (!feature) {
    res.status(400).json({ error: 'feature must be a known AI feature id.' });
    return;
  }
  res.json(aiService.preflight(feature));
}));

app.post('/api/ai/test', requireScope('write:ideas'), asyncRoute(async (req, res) => {
  res.json(await aiService.testProvider((req.body ?? {}) as AiConfigPatch));
}));

app.post('/api/ai/models', requireScope('write:ideas'), asyncRoute(async (req, res) => {
  res.json(await aiService.listModels((req.body ?? {}) as AiConfigPatch));
}));

// ── Claude account auth endpoints ─────────────────────────────────────────────

app.get('/api/ai/claude-account/status', requireScope('read:ideas'), asyncRoute(async (_req, res) => {
  const { loadTokens } = await import('./ai/claude-account/auth.js');
  const { setCachedClaudeAccountAuth } = await import('./ai/service.js');
  const tokens = await loadTokens();
  const authenticated = tokens !== null && tokens.expiresAt > Date.now();
  setCachedClaudeAccountAuth(authenticated);
  res.json({
    authenticated,
    expiresAt: tokens?.expiresAt ?? null,
    obtainedAt: tokens?.obtainedAt ?? null,
  });
}));

app.post('/api/ai/claude-account/login', requireScope('write:ideas'), asyncRoute(async (_req, res) => {
  const { startBootstrap } = await import('./ai/claude-account/oauth.js');
  const result = await startBootstrap();
  res.json(result);
}));

app.post('/api/ai/claude-account/login/complete', requireScope('write:ideas'), asyncRoute(async (req, res) => {
  const body = req.body as { url?: string };
  if (!body.url || typeof body.url !== 'string') {
    res.status(400).json({ error: 'url is required (paste the callback redirect URL).' });
    return;
  }
  const { completeBootstrap } = await import('./ai/claude-account/oauth.js');
  const { setCachedClaudeAccountAuth } = await import('./ai/service.js');
  await completeBootstrap(body.url);
  setCachedClaudeAccountAuth(true);
  res.json({ ok: true });
}));

app.post('/api/ai/claude-account/logout', requireScope('write:ideas'), asyncRoute(async (_req, res) => {
  const { clearTokens } = await import('./ai/claude-account/auth.js');
  const { setCachedClaudeAccountAuth } = await import('./ai/service.js');
  await clearTokens();
  setCachedClaudeAccountAuth(false);
  res.json({ ok: true });
}));

app.get('/api/ai/conversations/:ideaId', requireScope('read:ideas'), asyncRoute((req, res) => {
  res.json({ messages: aiService.getConversation(routeParam(req, 'ideaId')) });
}));

app.post('/api/ai/suggest', requireScope('ai:suggest'), asyncRoute(async (req, res) => {
  const body = req.body as {
    ideaId?: unknown;
    field?: unknown;
    currentValue?: unknown;
    prompt?: unknown;
    omitCurrentValue?: unknown;
    aiConfirmationToken?: unknown;
    mode?: unknown;
    context?: unknown;
  };
  const prompt = optionalString(body.prompt, 'prompt');
  if (!prompt.ok) {
    res.status(400).json({ error: prompt.error });
    return;
  }
  const aiConfirmationToken = optionalString(body.aiConfirmationToken, 'aiConfirmationToken');
  if (!aiConfirmationToken.ok) {
    res.status(400).json({ error: aiConfirmationToken.error });
    return;
  }

  if (body.ideaId !== undefined || body.field !== undefined) {
    const ideaId = requiredString(body.ideaId, 'ideaId');
    if (!ideaId.ok) {
      res.status(400).json({ error: ideaId.error });
      return;
    }
    const field = parseAiSuggestionField(body.field);
    if (!field) {
      res.status(400).json({ error: 'field must be one of pitch, risks, techStack, hook, or whyItMightWork.' });
      return;
    }
    const currentValue = optionalString(body.currentValue, 'currentValue');
    if (!currentValue.ok) {
      res.status(400).json({ error: currentValue.error });
      return;
    }
    if (body.omitCurrentValue !== undefined && typeof body.omitCurrentValue !== 'boolean') {
      res.status(400).json({ error: 'omitCurrentValue must be a boolean.' });
      return;
    }
    const suggestionRequest: AiFieldSuggestionRequest = {
      ideaId: ideaId.value,
      field,
      currentValue: currentValue.value ?? '',
      ...(prompt.value?.trim() ? { prompt: prompt.value.trim() } : {}),
      ...(body.omitCurrentValue === true ? { omitCurrentValue: true } : {}),
    };
    const suggestion = await aiService.suggestField(
      suggestionRequest.ideaId,
      suggestionRequest.field,
      suggestionRequest.currentValue,
      clientKey(req),
      suggestionRequest.prompt,
      suggestionRequest.omitCurrentValue,
      aiConfirmationToken.value,
    );
    res.json(suggestion);
    return;
  }

  const mode = typeof body.mode === 'string' ? body.mode : 'suggest';
  try {
    res.json({
      mode,
      text: await aiService.assistMode(mode, body.context ?? {}, prompt.value, clientKey(req), aiConfirmationToken.value),
    });
  } catch (error) {
    if (typeof (error as { statusCode?: unknown })?.statusCode === 'number') throw error;
    res.json({
      mode,
      text: fallbackAiSuggestion(mode, body.context ?? {}),
    });
  }
}));

app.post('/api/ai/field-chat', requireScope('ai:suggest'), async (req, res) => {
  const body = req.body as Partial<AiFieldAssistChatRequest>;
  const field = parseAiSuggestionField(body.field);
  const ideaId = requiredString(body.ideaId, 'ideaId');
  const userMessage = requiredString(body.message, 'message');
  const currentValue = optionalString(body.currentValue, 'currentValue');
  const aiConfirmationToken = optionalString((body as { aiConfirmationToken?: unknown }).aiConfirmationToken, 'aiConfirmationToken');
  const history = parseFieldAssistHistory(body.history);
  if (!ideaId.ok) {
    res.status(400).json({ error: ideaId.error });
    return;
  }
  if (!field) {
    res.status(400).json({ error: 'field must be one of pitch, risks, techStack, hook, or whyItMightWork.' });
    return;
  }
  if (!userMessage.ok) {
    res.status(400).json({ error: userMessage.error });
    return;
  }
  if (!currentValue.ok) {
    res.status(400).json({ error: currentValue.error });
    return;
  }
  if (!aiConfirmationToken.ok) {
    res.status(400).json({ error: aiConfirmationToken.error });
    return;
  }
  if (!history.ok) {
    res.status(400).json({ error: history.error });
    return;
  }

  try {
    aiService.assertFeatureAllowed('field-suggestions', clientKey(req), aiConfirmationToken.value);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'AI field assistance blocked.';
    const statusCode = typeof (err as { statusCode?: unknown })?.statusCode === 'number'
      ? (err as { statusCode: number }).statusCode
      : 500;
    res.status(statusCode).json({ error: message });
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });

  try {
    const assistantMessage = await aiService.streamFieldAssist(
      {
        ideaId: ideaId.value,
        field,
        currentValue: currentValue.value,
        message: userMessage.value,
        history: history.value,
      },
      clientKey(req),
      (delta) => {
        res.write(`event: delta\ndata: ${JSON.stringify({ delta })}\n\n`);
      },
      aiConfirmationToken.value,
    );
    res.write(`event: message\ndata: ${JSON.stringify({ message: assistantMessage })}\n\n`);
    res.write('event: done\ndata: {}\n\n');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'AI field assistance failed.';
    res.write(`event: error\ndata: ${JSON.stringify({ error: message })}\n\n`);
  } finally {
    res.end();
  }
});

app.post('/api/ai/chat', requireScope('ai:suggest'), async (req, res) => {
  const body = req.body as { ideaId?: string; message?: string; aiConfirmationToken?: unknown };
  if (!body.ideaId || !body.message?.trim()) {
    res.status(400).json({ error: 'ideaId and message are required.' });
    return;
  }
  const aiConfirmationToken = optionalString(body.aiConfirmationToken, 'aiConfirmationToken');
  if (!aiConfirmationToken.ok) {
    res.status(400).json({ error: aiConfirmationToken.error });
    return;
  }

  try {
    aiService.assertFeatureAllowed('thinking-partner', clientKey(req), aiConfirmationToken.value);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'AI chat blocked.';
    const statusCode = typeof (err as { statusCode?: unknown })?.statusCode === 'number'
      ? (err as { statusCode: number }).statusCode
      : 500;
    res.status(statusCode).json({ error: message });
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
      aiConfirmationToken.value,
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
  const next = mergeBackupConfig(backupConfig(), body);
  repository.setSetting(SETTINGS_KEYS.backupConfig, next);
  clearRcloneProbeCache();
  res.json(backupStatus());
}));

app.post('/api/backups/run', requireScope('write:ideas'), asyncRoute((_req, res) => {
  res.json({
    run: runBackup('manual'),
    status: backupStatus(),
  });
}));

app.post('/api/backups/destinations/test', requireScope('write:ideas'), asyncRoute((req, res) => {
  const body = (req.body ?? {}) as { id?: unknown; destination?: unknown };
  const id = typeof body.id === 'string' ? body.id.trim() : '';
  const configured = id
    ? backupConfig().destinations.find((destination) => destination.id === id) ?? null
    : null;
  const inlineDestination = normalizeBackupDestination(body.destination, 0);
  const destination = configured ?? inlineDestination;
  if (!destination) {
    res.status(400).json({ error: 'Provide either a configured destination id or a valid destination object.' });
    return;
  }
  const result = testBackupDestination(destination);
  res.json({
    destinationId: destination.id,
    label: destination.label,
    type: destination.type,
    ...result,
  });
}));

app.post('/api/backups/test-restore', requireScope('write:ideas'), asyncRoute((req, res) => {
  const body = (req.body ?? {}) as { backupPath?: unknown; exportPath?: unknown };
  const status = backupStatus();
  const allowedRoots = restoreValidationRoots();
  const requestedBackupPath = typeof body.backupPath === 'string' ? body.backupPath.trim() : '';
  const requestedExportPath = typeof body.exportPath === 'string' ? body.exportPath.trim() : '';
  const databaseChoice = chooseRestoreValidationPath({
    kindLabel: 'backup database',
    requestedPath: requestedBackupPath,
    fallbackPath: status.latestDatabaseBackup?.path ?? '',
    allowedRoots,
  });
  const exportChoice = chooseRestoreValidationPath({
    kindLabel: 'JSON export',
    requestedPath: requestedExportPath,
    fallbackPath: status.latestJsonExport?.path ?? '',
    allowedRoots,
  });

  const requestErrors = [databaseChoice.badRequest, exportChoice.badRequest].filter(Boolean);
  if (requestErrors.length > 0) {
    res.status(400).json({ error: requestErrors.join(' ') });
    return;
  }

  const database = databaseChoice.path
    ? validateDatabaseBackupFile(databaseChoice.path)
    : {
        path: '',
        ok: false,
        sizeBytes: null,
        error: databaseChoice.error ?? 'No backup database file available to validate.',
      };
  const jsonExport = exportChoice.path
    ? validateJsonExportFile(exportChoice.path)
    : {
        path: '',
        ok: false,
        sizeBytes: null,
        error: exportChoice.error ?? 'No JSON export file available to validate.',
      };

  res.json({
    testedAt: new Date().toISOString(),
    ok: database.ok || jsonExport.ok,
    database,
    jsonExport,
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
  const message = err instanceof Error ? err.message : 'Unexpected server error';
  const statusCode = typeof (err as { statusCode?: unknown })?.statusCode === 'number'
    ? (err as { statusCode: number }).statusCode
    : 500;
  if (statusCode >= 500) console.error(err);
  res.status(statusCode).json({ error: message });
});

migrateLegacySettings();
fs.mkdirSync(path.join(dataDir, 'scratch'), { recursive: true });
fs.mkdirSync(path.join(dataDir, 'agent-runs'), { recursive: true });

app.listen(PORT, () => {
  runScheduledBackupIfDue();
  setInterval(runScheduledBackupIfDue, 5 * 60 * 1000).unref();
  // Warm the Claude account auth cache at startup (non-blocking).
  void import('./ai/claude-account/auth.js').then(async ({ loadTokens }) => {
    const tokens = await loadTokens();
    const { setCachedClaudeAccountAuth } = await import('./ai/service.js');
    setCachedClaudeAccountAuth(tokens !== null && tokens.expiresAt > Date.now());
  }).catch(() => { /* auth file missing or unreadable — stays false */ });
  console.log(`Seedbank server listening on http://localhost:${PORT}`);
});
