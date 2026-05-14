import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';
import type { PublicToken } from '../../shared/types.js';

interface TokenRow {
  id: string;
  name: string;
  hash: string;
  scopes: string;
  created_at: string;
  last_used_at: string | null;
}

export type TokenScope = 'read:ideas' | 'write:ideas' | 'ai:suggest' | 'mcp:read';

export const TOKEN_SCOPES: readonly TokenScope[] = [
  'read:ideas',
  'write:ideas',
  'ai:suggest',
  'mcp:read',
];

export interface TokenRecord extends PublicToken {
  hash: string;
}

export interface TokenCreateResult {
  token: string;
  record: PublicToken;
}

function parseScopes(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((scope): scope is string => typeof scope === 'string');
  } catch {
    return [];
  }
}

function rowToRecord(row: TokenRow): TokenRecord {
  return {
    id: row.id,
    name: row.name,
    hash: row.hash,
    scopes: parseScopes(row.scopes),
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
  };
}

export function hashApiToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function createApiTokenString(): string {
  // randomBytes(24) in base64url yields 32 chars, prefixed to match sbk_<32 chars>.
  return `sbk_${crypto.randomBytes(24).toString('base64url')}`;
}

export class ApiTokenStore {
  constructor(private readonly db: Database.Database) {}

  list(): PublicToken[] {
    const rows = this.db.prepare('SELECT * FROM api_tokens ORDER BY created_at DESC').all() as TokenRow[];
    return rows.map((row) => {
      const { hash: _hash, ...publicToken } = rowToRecord(row);
      return publicToken;
    });
  }

  create(name: string, scopes: TokenScope[]): TokenCreateResult {
    const token = createApiTokenString();
    const createdAt = new Date().toISOString();
    const id = uuid();
    const hash = hashApiToken(token);
    this.db.prepare(`
      INSERT INTO api_tokens (id, name, hash, scopes, created_at, last_used_at)
      VALUES (?, ?, ?, ?, ?, NULL)
    `).run(id, name, hash, JSON.stringify(scopes), createdAt);

    return {
      token,
      record: {
        id,
        name,
        scopes,
        createdAt,
        lastUsedAt: null,
      },
    };
  }

  revoke(id: string): boolean {
    const result = this.db.prepare('DELETE FROM api_tokens WHERE id = ?').run(id);
    return result.changes > 0;
  }

  getByHash(hash: string): TokenRecord | undefined {
    const row = this.db.prepare('SELECT * FROM api_tokens WHERE hash = ?').get(hash) as TokenRow | undefined;
    return row ? rowToRecord(row) : undefined;
  }

  touchLastUsed(id: string): void {
    this.db.prepare('UPDATE api_tokens SET last_used_at = ? WHERE id = ?')
      .run(new Date().toISOString(), id);
  }
}
