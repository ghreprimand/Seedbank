import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const dataDir = process.env.SEEDBANK_DATA_DIR ?? path.join(os.homedir(), '.seedbank');
export const dbPath = process.env.SEEDBANK_DB_PATH ?? path.join(dataDir, 'seedbank.db');
export const backupsDir = path.join(dataDir, 'backups');
export const exportsDir = path.join(dataDir, 'exports');

function timestampForFilename(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-').replace('T', '-').slice(0, 19);
}

function ensureDataDirs() {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(backupsDir, { recursive: true });
  fs.mkdirSync(exportsDir, { recursive: true });
}

export function createDatabaseBackup(date = new Date(), retentionCount = 10): string | null {
  ensureDataDirs();
  if (!fs.existsSync(dbPath) || fs.statSync(dbPath).size === 0) return null;

  // SQLite runs in WAL mode; checkpoint before copying so the snapshot includes
  // schema/data pages that may still be in the WAL sidecar.
  try {
    const checkpointDb = new Database(dbPath, { fileMustExist: true });
    try {
      checkpointDb.pragma('wal_checkpoint(TRUNCATE)');
    } finally {
      checkpointDb.close();
    }
  } catch {
    // Backup should still attempt a copy even if checkpointing is unavailable.
  }

  const backupPath = path.join(backupsDir, `seedbank-${timestampForFilename(date)}.db`);
  fs.copyFileSync(dbPath, backupPath);

  const backups = fs.readdirSync(backupsDir)
    .filter((name) => /^seedbank-.*\.db$/.test(name))
    .sort()
    .reverse();

  const keep = Number.isFinite(retentionCount)
    ? Math.min(500, Math.max(1, Math.floor(retentionCount)))
    : 10;
  for (const oldBackup of backups.slice(keep)) {
    fs.rmSync(path.join(backupsDir, oldBackup), { force: true });
  }

  return backupPath;
}

export function writeArchiveExport(content: string, date = new Date()): string {
  ensureDataDirs();
  const exportPath = path.join(exportsDir, `seedbank-archive-${timestampForFilename(date)}.json`);
  fs.writeFileSync(exportPath, content);
  return exportPath;
}

export function latestFileInfo(dir: string, pattern: RegExp): { path: string; timestamp: string } | null {
  ensureDataDirs();
  const files = fs.readdirSync(dir)
    .filter((name) => pattern.test(name))
    .map((name) => {
      const filePath = path.join(dir, name);
      return { path: filePath, mtime: fs.statSync(filePath).mtime };
    })
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

  const latest = files[0];
  return latest ? { path: latest.path, timestamp: latest.mtime.toISOString() } : null;
}

function migrationDir(): string {
  const candidates = [
    path.resolve(process.cwd(), 'migrations'),
    path.resolve(process.cwd(), 'server/migrations'),
    path.resolve(__dirname, '../migrations'),
    path.resolve(__dirname, '../../migrations'),
    path.resolve(__dirname, '../../../migrations'),
  ];
  const dir = candidates.find((candidate) => fs.existsSync(candidate));
  if (!dir) {
    throw new Error(`Seedbank migrations directory was not found. Checked: ${candidates.join(', ')}`);
  }
  return dir;
}

function runMigrations(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const applied = new Set(
    db.prepare('SELECT filename FROM schema_migrations').all()
      .map((row) => (row as { filename: string }).filename),
  );

  const migrationsPath = migrationDir();
  const migrations = fs.readdirSync(migrationsPath)
    .filter((name) => /^\d+_.*\.sql$/.test(name))
    .sort();

  const applyMigration = db.transaction((filename: string) => {
    const sql = fs.readFileSync(path.join(migrationsPath, filename), 'utf8');
    db.exec(sql);
    db.prepare('INSERT INTO schema_migrations (filename, applied_at) VALUES (?, ?)')
      .run(filename, new Date().toISOString());
  });

  for (const migration of migrations) {
    if (!applied.has(migration)) applyMigration(migration);
  }
}

export function openDatabase(): Database.Database {
  ensureDataDirs();
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  // Keep startup backup behavior, but snapshot the post-migration schema so
  // restore-validation reflects the active Seedbank database structure.
  createDatabaseBackup();
  return db;
}
