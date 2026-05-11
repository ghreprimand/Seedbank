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

function backupExistingDatabase() {
  if (!fs.existsSync(dbPath) || fs.statSync(dbPath).size === 0) return;

  createDatabaseBackup();
}

export function createDatabaseBackup(date = new Date()): string | null {
  ensureDataDirs();
  if (!fs.existsSync(dbPath) || fs.statSync(dbPath).size === 0) return null;

  const backupPath = path.join(backupsDir, `seedbank-${timestampForFilename(date)}.db`);
  fs.copyFileSync(dbPath, backupPath);

  const backups = fs.readdirSync(backupsDir)
    .filter((name) => /^seedbank-.*\.db$/.test(name))
    .sort()
    .reverse();

  for (const oldBackup of backups.slice(10)) {
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
    path.resolve(__dirname, '../migrations'),
    path.resolve(__dirname, '../../migrations'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[0];
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

  const migrations = fs.readdirSync(migrationDir())
    .filter((name) => /^\d+_.*\.sql$/.test(name))
    .sort();

  const applyMigration = db.transaction((filename: string) => {
    const sql = fs.readFileSync(path.join(migrationDir(), filename), 'utf8');
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
  backupExistingDatabase();

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  return db;
}
