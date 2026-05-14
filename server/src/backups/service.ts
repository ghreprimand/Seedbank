import BetterSqlite3 from 'better-sqlite3';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  backupsDir,
  createDatabaseBackup,
  exportsDir,
  latestFileInfo,
  writeArchiveExport,
} from '../db.js';
import type { SeedbankRepository } from '../repository.js';
import type {
  BackupArtifactResult,
  BackupConfig,
  BackupDestinationConfig,
  BackupDestinationResult,
  BackupFrequency,
  BackupRunRecord,
  BackupStatus,
} from '../../../shared/types.js';

const DEFAULT_BACKUP_CONFIG: BackupConfig = {
  frequency: 'daily',
  exportJson: true,
  retentionCount: 10,
  destinations: [],
};

const MAX_BACKUP_RETENTION = 500;
const MIN_BACKUP_RETENTION = 1;
const MAX_RESTORE_JSON_BYTES = 25 * 1024 * 1024;
const RCLONE_PROBE_TIMEOUT_MS = 10_000;
const RCLONE_PROBE_MAX_BUFFER = 64 * 1024;
const REDACTED_DATA_DIR_LABEL = '<seedbank-data-dir>';
const REDACTED_BACKUPS_DIR = `${REDACTED_DATA_DIR_LABEL}/backups`;
const REDACTED_EXPORTS_DIR = `${REDACTED_DATA_DIR_LABEL}/exports`;

type RcloneReadinessStatus = BackupStatus['rclone'];

interface BackupValidationResult {
  path: string;
  ok: boolean;
  sizeBytes: number | null;
  ideaCount?: number;
  versionCount?: number;
  error?: string;
}

export interface TestBackupDestinationResponse {
  destinationId: string;
  label: string;
  type: BackupDestinationConfig['type'];
  ok: boolean;
  message: string;
  detail?: string;
}

export interface TestRestoreResponse {
  testedAt: string;
  ok: boolean;
  database: BackupValidationResult;
  jsonExport: BackupValidationResult;
}

export class BackupRequestError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'BackupRequestError';
    this.statusCode = statusCode;
  }
}

export class BackupService {
  private rcloneProbeCache: RcloneReadinessStatus | null = null;

  constructor(
    private readonly repository: SeedbankRepository,
    private readonly backupConfigKey: string,
  ) {}

  getConfig(): BackupConfig {
    const stored = this.repository.getSetting<Partial<BackupConfig>>(this.backupConfigKey) ?? {};
    return this.mergeConfig(DEFAULT_BACKUP_CONFIG, stored);
  }

  configure(requested: Partial<BackupConfig> | undefined): BackupConfig {
    const next = this.mergeConfig(this.getConfig(), requested);
    this.repository.setSetting(this.backupConfigKey, next);
    this.clearRcloneProbeCache();
    return next;
  }

  run(reason: string): BackupRunRecord {
    const now = new Date();
    const config = this.getConfig();
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
      ? writeArchiveExport(JSON.stringify(this.repository.exportArchive(true), null, 2), now)
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
          this.copyArtifactToDestination(destination, artifact.path);
          copiedPaths.push(this.destinationCopyTarget(destination, artifact.path));
        } catch (err) {
          const reasonText = this.safeDestinationCopyError(destination, err);
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
    this.repository.setSetting('backup.lastRun', record);
    return record;
  }

  runScheduledIfDue(): void {
    const config = this.getConfig();
    const interval = this.backupIntervalMs(config.frequency);
    if (!interval) return;

    const lastRun = this.repository.getSetting<BackupRunRecord>('backup.lastRun');
    const lastRunTime = lastRun ? new Date(lastRun.timestamp).getTime() : 0;
    if (!lastRunTime || Date.now() - lastRunTime >= interval) {
      this.run('scheduled');
    }
  }

  status(options?: {
    includeSensitivePaths?: boolean;
    includeSensitiveDestinationPaths?: boolean;
  }): BackupStatus {
    const includeSensitivePaths = options?.includeSensitivePaths ?? false;
    const includeSensitiveDestinationPaths = options?.includeSensitiveDestinationPaths ?? false;
    const rclone = this.rcloneAvailability();
    const rawConfig = this.getConfig();
    const rawLastRun = this.repository.getSetting<BackupRunRecord>('backup.lastRun') ?? null;
    const rawLatestDatabaseBackup = latestFileInfo(backupsDir, /^seedbank-.*\.db$/);
    const rawLatestJsonExport = latestFileInfo(exportsDir, /^seedbank-archive-.*\.json$/);
    return {
      config: includeSensitiveDestinationPaths ? rawConfig : this.redactedBackupConfig(rawConfig),
      lastRun: includeSensitivePaths || !rawLastRun ? rawLastRun : this.redactedBackupRunRecord(rawLastRun),
      latestDatabaseBackup: !rawLatestDatabaseBackup
        ? null
        : (includeSensitivePaths
          ? rawLatestDatabaseBackup
          : { ...rawLatestDatabaseBackup, path: this.redactedPath(rawLatestDatabaseBackup.path) }),
      latestJsonExport: !rawLatestJsonExport
        ? null
        : (includeSensitivePaths
          ? rawLatestJsonExport
          : { ...rawLatestJsonExport, path: this.redactedPath(rawLatestJsonExport.path) }),
      rclone,
      paths: {
        backupsDir: includeSensitivePaths ? backupsDir : REDACTED_BACKUPS_DIR,
        exportsDir: includeSensitivePaths ? exportsDir : REDACTED_EXPORTS_DIR,
      },
    };
  }

  redactedBackupRunRecord(record: BackupRunRecord): BackupRunRecord {
    return {
      ...record,
      backupPath: record.backupPath ? this.redactedPath(record.backupPath) : null,
      exportPath: record.exportPath ? this.redactedPath(record.exportPath) : null,
      artifacts: record.artifacts?.map((artifact) => ({
        ...artifact,
        path: artifact.path ? this.redactedPath(artifact.path) : null,
      })),
      destinations: record.destinations?.map((destination) => ({
        ...destination,
        copiedPaths: destination.copiedPaths.map((target) => this.redactedCopyTarget(target)),
      })),
    };
  }

  normalizeDestination(input: unknown, index: number): BackupDestinationConfig | null {
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

  testDestination(input: { id?: unknown; destination?: unknown }): TestBackupDestinationResponse {
    const id = typeof input.id === 'string' ? input.id.trim() : '';
    const configured = id
      ? this.getConfig().destinations.find((destination) => destination.id === id) ?? null
      : null;
    const inlineDestination = this.normalizeDestination(input.destination, 0);
    const destination = configured ?? inlineDestination;
    if (!destination) {
      throw new BackupRequestError('Provide either a configured destination id or a valid destination object.');
    }
    const result = this.testBackupDestination(destination);
    return {
      destinationId: destination.id,
      label: destination.label,
      type: destination.type,
      ...result,
    };
  }

  testRestore(input: { backupPath?: unknown; exportPath?: unknown }): TestRestoreResponse {
    const status = this.status({ includeSensitivePaths: true, includeSensitiveDestinationPaths: true });
    const allowedRoots = this.restoreValidationRoots();
    const requestedBackupPath = typeof input.backupPath === 'string' ? input.backupPath.trim() : '';
    const requestedExportPath = typeof input.exportPath === 'string' ? input.exportPath.trim() : '';
    const databaseChoice = this.chooseRestoreValidationPath({
      kindLabel: 'backup database',
      requestedPath: requestedBackupPath,
      fallbackPath: status.latestDatabaseBackup?.path ?? '',
      allowedRoots,
    });
    const exportChoice = this.chooseRestoreValidationPath({
      kindLabel: 'JSON export',
      requestedPath: requestedExportPath,
      fallbackPath: status.latestJsonExport?.path ?? '',
      allowedRoots,
    });

    const requestErrors = [databaseChoice.badRequest, exportChoice.badRequest].filter(Boolean);
    if (requestErrors.length > 0) {
      throw new BackupRequestError(requestErrors.join(' '));
    }

    const database = databaseChoice.path
      ? this.validateDatabaseBackupFile(databaseChoice.path)
      : {
          path: '',
          ok: false,
          sizeBytes: null,
          error: databaseChoice.error ?? 'No backup database file available to validate.',
        };
    const jsonExport = exportChoice.path
      ? this.validateJsonExportFile(exportChoice.path)
      : {
          path: '',
          ok: false,
          sizeBytes: null,
          error: exportChoice.error ?? 'No JSON export file available to validate.',
        };

    return {
      testedAt: new Date().toISOString(),
      ok: database.ok || jsonExport.ok,
      database: {
        ...database,
        path: database.path ? this.redactedPath(database.path) : '',
      },
      jsonExport: {
        ...jsonExport,
        path: jsonExport.path ? this.redactedPath(jsonExport.path) : '',
      },
    };
  }

  private normalizeFrequency(input: unknown, fallback: BackupFrequency): BackupFrequency {
    return input === 'off' || input === 'daily' || input === 'weekly' ? input : fallback;
  }

  private normalizeRetention(input: unknown, fallback: number): number {
    if (typeof input !== 'number' || Number.isNaN(input)) return fallback;
    return Math.min(MAX_BACKUP_RETENTION, Math.max(MIN_BACKUP_RETENTION, Math.floor(input)));
  }

  private normalizeDestinations(input: unknown, fallback: BackupDestinationConfig[]): BackupDestinationConfig[] {
    if (!Array.isArray(input)) return fallback;
    const normalized = input
      .map((value, index) => this.normalizeDestination(value, index))
      .filter((value): value is BackupDestinationConfig => Boolean(value));
    return normalized;
  }

  private mergeConfig(current: BackupConfig, requested: Partial<BackupConfig> | undefined): BackupConfig {
    const patch = requested ?? {};
    return {
      frequency: this.normalizeFrequency(patch.frequency, current.frequency),
      exportJson: typeof patch.exportJson === 'boolean' ? patch.exportJson : current.exportJson,
      retentionCount: this.normalizeRetention(patch.retentionCount, current.retentionCount),
      destinations: this.normalizeDestinations(patch.destinations, current.destinations),
    };
  }

  private backupIntervalMs(frequency: BackupFrequency): number | null {
    if (frequency === 'daily') return 24 * 60 * 60 * 1000;
    if (frequency === 'weekly') return 7 * 24 * 60 * 60 * 1000;
    return null;
  }

  private firstNonEmptyLine(output: string): string | undefined {
    return output.split('\n').find((line) => line.trim().length > 0)?.trim();
  }

  private isExecTimeout(err: unknown): boolean {
    if (!err || typeof err !== 'object') return false;
    const row = err as { code?: unknown; killed?: unknown; signal?: unknown; message?: unknown };
    if (row.code === 'ETIMEDOUT') return true;
    if (row.killed === true && row.signal === 'SIGTERM') return true;
    return typeof row.message === 'string' && row.message.toLowerCase().includes('timed out');
  }

  private safeRcloneProbeError(err: unknown, fallback: string): string {
    if ((err instanceof Error && err.name === 'AbortError') || this.isExecTimeout(err)) {
      return 'Timed out while checking rclone.';
    }
    return fallback;
  }

  private isCommandNotFound(err: unknown): boolean {
    return Boolean(err && typeof err === 'object' && 'code' in err && (err as { code?: unknown }).code === 'ENOENT');
  }

  private errorCode(err: unknown): string | undefined {
    return err && typeof err === 'object' && 'code' in err && typeof (err as { code?: unknown }).code === 'string'
      ? (err as { code: string }).code
      : undefined;
  }

  private rawCommandErrorText(err: unknown): string {
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

  private safeFileAccessError(err: unknown): string {
    const code = this.errorCode(err);
    if (code === 'ENOENT') return 'File does not exist.';
    if (code === 'EACCES' || code === 'EPERM') return 'Permission denied reading file.';
    return 'Path is not accessible.';
  }

  private safeLocalDestinationError(err: unknown): string {
    const code = this.errorCode(err);
    if (code === 'EACCES' || code === 'EPERM') return 'Permission denied writing to destination folder.';
    if (code === 'ENOENT') return 'Destination folder does not exist or is not reachable.';
    return 'Could not write to destination folder. Check path and permissions.';
  }

  private safeRcloneCommandError(err: unknown): string {
    if (this.isExecTimeout(err)) return 'Timed out while contacting the rclone destination.';
    if (this.isCommandNotFound(err)) return 'rclone is not installed or not on PATH.';

    const detail = this.rawCommandErrorText(err).toLowerCase();
    if (
      detail.includes('didn\'t find section in config file')
      || detail.includes('did not find section in config file')
      || detail.includes('not found in config')
    ) {
      return 'Rclone remote name was not found. Check the configured remote name.';
    }
    if (
      detail.includes('authentication')
      || detail.includes('unauthorized')
      || detail.includes('forbidden')
      || detail.includes('access denied')
      || detail.includes('permission denied')
      || detail.includes('invalid credentials')
      || detail.includes('token')
    ) {
      return 'Rclone authentication or permissions failed. Check remote credentials and access.';
    }
    if (
      detail.includes('no such file or directory')
      || detail.includes('directory not found')
      || detail.includes('object not found')
      || detail.includes('path not found')
      || detail.includes('does not exist')
    ) {
      return 'Rclone remote path was not found. Check the remote path and retry.';
    }
    if (
      detail.includes('dial tcp')
      || detail.includes('connection refused')
      || detail.includes('network is unreachable')
      || detail.includes('tls handshake timeout')
      || detail.includes('i/o timeout')
    ) {
      return 'Could not reach the rclone destination. Check network connectivity and remote availability.';
    }
    return 'Rclone command failed. Verify remote path and configuration.';
  }

  private safeDestinationCopyError(destination: BackupDestinationConfig, err: unknown): string {
    return destination.type === 'local-path' ? this.safeLocalDestinationError(err) : this.safeRcloneCommandError(err);
  }

  private rcloneAvailability(): RcloneReadinessStatus {
    if (this.rcloneProbeCache) return this.rcloneProbeCache;
    let version: string | undefined;
    try {
      const output = execFileSync('rclone', ['version'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        encoding: 'utf8',
        timeout: RCLONE_PROBE_TIMEOUT_MS,
        maxBuffer: RCLONE_PROBE_MAX_BUFFER,
      });
      version = this.firstNonEmptyLine(output);
    } catch (err) {
      const notInstalled = this.isCommandNotFound(err);
      const message = notInstalled
        ? 'rclone is not installed or not on PATH.'
        : this.safeRcloneProbeError(err, 'Could not run rclone.');
      this.rcloneProbeCache = {
        available: false,
        installed: false,
        configured: false,
        remoteCount: 0,
        status: notInstalled ? 'not-installed' : 'error',
        message,
        error: message,
      };
      return this.rcloneProbeCache;
    }

    try {
      const output = execFileSync('rclone', ['listremotes'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        encoding: 'utf8',
        timeout: RCLONE_PROBE_TIMEOUT_MS,
        maxBuffer: RCLONE_PROBE_MAX_BUFFER,
      });
      const remoteCount = output.split('\n').map((line) => line.trim()).filter(Boolean).length;
      this.rcloneProbeCache = {
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
      const message = this.safeRcloneProbeError(err, 'Could not check configured rclone remotes.');
      this.rcloneProbeCache = {
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
    return this.rcloneProbeCache;
  }

  private clearRcloneProbeCache(): void {
    this.rcloneProbeCache = null;
  }

  private joinRemotePath(base: string, fileName: string): string {
    return base.endsWith('/') ? `${base}${fileName}` : `${base}/${fileName}`;
  }

  private destinationCopyTarget(destination: BackupDestinationConfig, sourcePath: string): string {
    const fileName = path.basename(sourcePath);
    return destination.type === 'local-path'
      ? path.join(destination.localPath, fileName)
      : this.joinRemotePath(destination.remotePath, fileName);
  }

  private copyArtifactToDestination(destination: BackupDestinationConfig, sourcePath: string): void {
    const fileName = path.basename(sourcePath);
    if (destination.type === 'local-path') {
      fs.mkdirSync(destination.localPath, { recursive: true });
      fs.accessSync(destination.localPath, fs.constants.W_OK);
      fs.copyFileSync(sourcePath, path.join(destination.localPath, fileName));
      return;
    }
    const rclone = this.rcloneAvailability();
    if (!rclone.available) {
      throw new Error(rclone.error ?? 'rclone is not available in PATH.');
    }
    execFileSync('rclone', ['copyto', sourcePath, this.joinRemotePath(destination.remotePath, fileName)], {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 60_000,
    });
  }

  private testBackupDestination(destination: BackupDestinationConfig): {
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
          detail: this.safeLocalDestinationError(err),
        };
      }
    }
    const rclone = this.rcloneAvailability();
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
        detail: this.safeRcloneCommandError(err),
      };
    }
  }

  private isSubPath(root: string, target: string): boolean {
    const relative = path.relative(root, target);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
  }

  private canonicalPath(input: string): string {
    const absolute = path.resolve(input);
    try {
      return fs.realpathSync(absolute);
    } catch {
      return absolute;
    }
  }

  private restoreValidationRoots(): string[] {
    const destinationRoots = this.getConfig().destinations
      .filter((destination): destination is Extract<BackupDestinationConfig, { type: 'local-path' }> => (
        destination.type === 'local-path' && destination.localPath.trim().length > 0
      ))
      .map((destination) => this.canonicalPath(destination.localPath));

    return Array.from(new Set([
      this.canonicalPath(backupsDir),
      this.canonicalPath(exportsDir),
      ...destinationRoots,
    ]));
  }

  private resolveReadableFile(filePath: string): { path?: string; error?: string } {
    try {
      const resolved = fs.realpathSync(path.resolve(filePath));
      const stat = fs.statSync(resolved);
      if (!stat.isFile()) return { error: 'Path is not a file.' };
      return { path: resolved };
    } catch (err) {
      return {
        error: this.safeFileAccessError(err),
      };
    }
  }

  private pathAllowedForRestoreValidation(filePath: string, roots: string[]): boolean {
    return roots.some((root) => this.isSubPath(root, filePath));
  }

  private chooseRestoreValidationPath(input: {
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

    const resolved = this.resolveReadableFile(candidatePath);
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

    if (!this.pathAllowedForRestoreValidation(resolved.path, allowedRoots)) {
      if (requestedPath) {
        return {
          path: '',
          badRequest: `${kindLabel} path is not allowed. Use a file inside Seedbank backup/export directories or configured local backup destinations.`,
        };
      }
      return {
        path: '',
        error: `Latest ${kindLabel} file is outside allowed restore roots.`,
      };
    }

    return { path: resolved.path };
  }

  private validateDatabaseBackupFile(backupPath: string): BackupValidationResult {
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

  private validateJsonExportFile(exportPath: string): BackupValidationResult {
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

  private redactedPath(pathValue: string): string {
    const resolved = path.resolve(pathValue);
    const normalizedBackupsRoot = path.resolve(backupsDir);
    const normalizedExportsRoot = path.resolve(exportsDir);

    if (this.isSubPath(normalizedBackupsRoot, resolved)) {
      const relative = path.relative(normalizedBackupsRoot, resolved).split(path.sep).filter(Boolean).join('/');
      return relative ? `${REDACTED_BACKUPS_DIR}/${relative}` : REDACTED_BACKUPS_DIR;
    }
    if (this.isSubPath(normalizedExportsRoot, resolved)) {
      const relative = path.relative(normalizedExportsRoot, resolved).split(path.sep).filter(Boolean).join('/');
      return relative ? `${REDACTED_EXPORTS_DIR}/${relative}` : REDACTED_EXPORTS_DIR;
    }
    return path.basename(resolved) || 'file';
  }

  private redactedCopyTarget(pathValue: string): string {
    const normalized = pathValue.replace(/\\/g, '/');
    const isWindowsAbsolute = /^[a-zA-Z]:\//.test(normalized);
    const isRemotePath = normalized.includes(':') && !normalized.startsWith('/') && !isWindowsAbsolute;
    if (!isRemotePath) return this.redactedPath(pathValue);

    const afterColon = normalized.slice(normalized.indexOf(':') + 1);
    const fileName = afterColon.split('/').filter(Boolean).at(-1);
    return fileName ? `remote:.../${fileName}` : 'remote destination';
  }

  private redactedBackupConfig(config: BackupConfig): BackupConfig {
    return {
      ...config,
      destinations: config.destinations.map((destination) => (
        destination.type === 'local-path'
          ? { ...destination, localPath: '<configured-local-path>' }
          : destination
      )),
    };
  }
}
