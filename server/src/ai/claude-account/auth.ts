/**
 * Claude account OAuth token store.
 *
 * Tokens live in `~/.seedbank/claude-auth.json`, NOT in the SQLite
 * config/settings so they are never exported, backed up, or sent to the
 * browser. File is mode 0600, parent dir created as needed.
 *
 * Shape mirrors the sibling Archon implementation but uses the Seedbank
 * data dir.
 */

import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { dataDir } from '../../db.js';

export interface ClaudeAccountTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;       // epoch ms
  tokenType: string;
  scope: string;
  obtainedAt: number;      // epoch ms
}

interface AuthFileShape {
  claude?: {
    account?: ClaudeAccountTokens;
  };
}

const AUTH_PATH = join(dataDir, 'claude-auth.json');

async function readRaw(): Promise<AuthFileShape> {
  try {
    const buf = await fs.readFile(AUTH_PATH, 'utf8');
    const parsed = JSON.parse(buf) as AuthFileShape;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw err;
  }
}

async function writeRaw(data: AuthFileShape): Promise<void> {
  await fs.mkdir(dataDir, { recursive: true });
  const tmp = `${AUTH_PATH}.tmp-${process.pid}-${Date.now()}`;
  const body = JSON.stringify(data, null, 2);
  await fs.writeFile(tmp, body, { encoding: 'utf8', mode: 0o600 });
  await fs.rename(tmp, AUTH_PATH);
  try { await fs.chmod(AUTH_PATH, 0o600); } catch { /* best-effort */ }
}

export async function loadTokens(): Promise<ClaudeAccountTokens | null> {
  const data = await readRaw();
  return data.claude?.account ?? null;
}

export async function saveTokens(next: ClaudeAccountTokens): Promise<void> {
  const data = await readRaw();
  const merged: AuthFileShape = {
    ...data,
    claude: { ...(data.claude ?? {}), account: next },
  };
  await writeRaw(merged);
}

export async function clearTokens(): Promise<void> {
  const data = await readRaw();
  if (data.claude?.account) {
    delete data.claude.account;
    if (Object.keys(data.claude).length === 0) delete data.claude;
  }
  await writeRaw(data);
}
