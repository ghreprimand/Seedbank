import type Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';
import type { AiChatMessage } from '../../../shared/types.js';
import type { AiUsage } from './types.js';

interface ConversationRow {
  id: string;
  idea_id: string;
  created_at: string;
  updated_at: string;
}

interface MessageRow {
  id: string;
  idea_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export class AiStore {
  constructor(private readonly db: Database.Database) {}

  ensureConversation(ideaId: string): string {
    const existing = this.db.prepare('SELECT * FROM conversations WHERE idea_id = ?').get(ideaId) as ConversationRow | undefined;
    if (existing) return existing.id;

    const id = uuid();
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO conversations (id, idea_id, created_at, updated_at)
      VALUES (?, ?, ?, ?)
    `).run(id, ideaId, now, now);
    return id;
  }

  getMessages(ideaId: string): AiChatMessage[] {
    return (this.db.prepare(`
      SELECT * FROM conversation_messages
      WHERE idea_id = ?
      ORDER BY created_at ASC
    `).all(ideaId) as MessageRow[]).map((row) => ({
      id: row.id,
      ideaId: row.idea_id,
      role: row.role,
      content: row.content,
      createdAt: new Date(row.created_at),
    }));
  }

  addMessage(ideaId: string, role: 'user' | 'assistant', content: string, provider?: string, model?: string): AiChatMessage {
    const conversationId = this.ensureConversation(ideaId);
    const id = uuid();
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO conversation_messages (id, conversation_id, idea_id, role, content, provider, model, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, conversationId, ideaId, role, content, provider ?? null, model ?? null, now);
    this.db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(now, conversationId);
    return {
      id,
      ideaId,
      role,
      content,
      createdAt: new Date(now),
    };
  }

  recordUsage(provider: string, model: string, route: string, usage: AiUsage): void {
    this.db.prepare(`
      INSERT INTO ai_usage (id, provider, model, route, input_tokens, output_tokens, total_tokens, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      uuid(),
      provider,
      model,
      route,
      usage.inputTokens,
      usage.outputTokens,
      usage.totalTokens,
      new Date().toISOString(),
    );
  }

  tokensSince(sinceIso: string): number {
    const row = this.db.prepare(`
      SELECT COALESCE(SUM(total_tokens), 0) AS total
      FROM ai_usage
      WHERE created_at >= ?
    `).get(sinceIso) as { total: number };
    return row.total;
  }
}
