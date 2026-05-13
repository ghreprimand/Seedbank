import type Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';
import type {
  AiAuditEvent,
  AiChatMessage,
  AiProviderDescriptor,
  AiProviderFamily,
  AiUsageBucket,
} from '../../../shared/types.js';
import type { AiUsage } from './types.js';

export interface AiExecutionMetadata {
  providerFamily?: AiProviderFamily;
  transport?: AiProviderDescriptor['transport'];
  requestedModel?: string;
  resolvedModelId?: string;
  contentLeavesDevice?: boolean;
}

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
  provider: string | null;
  model: string | null;
  created_at: string;
}

interface UsageRow {
  key: string;
  feature?: string;
  provider?: string;
  model?: string;
  provider_family?: AiProviderFamily;
  transport?: AiProviderDescriptor['transport'];
  requested_model?: string;
  resolved_model_id?: string;
  content_leaves_device?: number | null;
  count: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  last_used_at: string | null;
}

interface AuditRow {
  id: string;
  type: 'guardrail_denied' | 'provider_error';
  feature: string;
  provider: string;
  model: string;
  metadata_json?: string;
  message: string;
  created_at: string;
}

function sanitizeAuditMessage(input: string): string {
  return input
    .replace(/\b(sk|ak|pk|rk|org|proj)-[A-Za-z0-9_-]{12,}\b/g, '$1-[redacted]')
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/-]+=*/gi, '$1 [redacted]')
    .replace(/(api[_-]?key|access[_-]?token|secret|password)\s*[:=]\s*["']?[^"'\s,}]+/gi, '$1=[redacted]')
    .replace(/\s+/g, ' ')
    .slice(0, 400);
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
      provider: row.provider ?? undefined,
      model: row.model ?? undefined,
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
      provider,
      model,
    };
  }

  recordUsage(provider: string, model: string, route: string, usage: AiUsage, metadata: AiExecutionMetadata = {}): void {
    this.db.prepare(`
      INSERT INTO ai_usage (
        id, provider, model, route, input_tokens, output_tokens, total_tokens,
        provider_family, transport, requested_model, resolved_model_id, content_leaves_device,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      uuid(),
      provider,
      model,
      route,
      usage.inputTokens,
      usage.outputTokens,
      usage.totalTokens,
      metadata.providerFamily ?? null,
      metadata.transport ?? null,
      metadata.requestedModel ?? model,
      metadata.resolvedModelId ?? model,
      typeof metadata.contentLeavesDevice === 'boolean' ? (metadata.contentLeavesDevice ? 1 : 0) : null,
      new Date().toISOString(),
    );
  }

  tokensSince(
    sinceIso: string,
    filters: { provider?: string; model?: string; routePrefix?: string } = {},
  ): number {
    const clauses = ['created_at >= ?'];
    const params: unknown[] = [sinceIso];
    if (filters.provider) {
      clauses.push('provider = ?');
      params.push(filters.provider);
    }
    if (filters.model) {
      clauses.push('model = ?');
      params.push(filters.model);
    }
    if (filters.routePrefix) {
      clauses.push('(route = ? OR route LIKE ?)');
      params.push(filters.routePrefix, `${filters.routePrefix}:%`);
    }
    const row = this.db.prepare(`
      SELECT COALESCE(SUM(total_tokens), 0) AS total
      FROM ai_usage
      WHERE ${clauses.join(' AND ')}
    `).get(...params) as { total: number };
    return row.total;
  }

  usageBuckets(
    sinceIso: string,
    groupBy: 'feature' | 'provider' | 'model',
    limit = 50,
  ): AiUsageBucket[] {
    const expression = groupBy === 'feature'
      ? "CASE WHEN instr(route, ':') > 0 THEN substr(route, 1, instr(route, ':') - 1) ELSE route END"
      : groupBy;
    return (this.db.prepare(`
      SELECT
        ${expression} AS key,
        CASE WHEN COUNT(provider_family) = COUNT(*) AND COUNT(DISTINCT provider_family) = 1 THEN MIN(provider_family) ELSE NULL END AS provider_family,
        CASE WHEN COUNT(transport) = COUNT(*) AND COUNT(DISTINCT transport) = 1 THEN MIN(transport) ELSE NULL END AS transport,
        CASE WHEN COUNT(requested_model) = COUNT(*) AND COUNT(DISTINCT requested_model) = 1 THEN MIN(requested_model) ELSE NULL END AS requested_model,
        CASE WHEN COUNT(resolved_model_id) = COUNT(*) AND COUNT(DISTINCT resolved_model_id) = 1 THEN MIN(resolved_model_id) ELSE NULL END AS resolved_model_id,
        CASE WHEN COUNT(content_leaves_device) = COUNT(*) AND COUNT(DISTINCT content_leaves_device) = 1 THEN MAX(content_leaves_device) ELSE NULL END AS content_leaves_device,
        COUNT(*) AS count,
        COALESCE(SUM(input_tokens), 0) AS input_tokens,
        COALESCE(SUM(output_tokens), 0) AS output_tokens,
        COALESCE(SUM(total_tokens), 0) AS total_tokens,
        MAX(created_at) AS last_used_at
      FROM ai_usage
      WHERE created_at >= ?
      GROUP BY key
      ORDER BY total_tokens DESC, last_used_at DESC
      LIMIT ?
    `).all(sinceIso, limit) as UsageRow[]).map((row) => ({
      key: row.key,
      ...(groupBy === 'feature' ? { feature: row.key } : {}),
      ...(groupBy === 'provider' ? { provider: row.key } : {}),
      ...(groupBy === 'model' ? { model: row.key } : {}),
      ...(row.provider_family ? { providerFamily: row.provider_family } : {}),
      ...(row.transport ? { transport: row.transport } : {}),
      ...(row.requested_model ? { requestedModel: row.requested_model } : {}),
      ...(row.resolved_model_id ? { resolvedModelId: row.resolved_model_id } : {}),
      ...(row.content_leaves_device !== null && row.content_leaves_device !== undefined
        ? { contentLeavesDevice: Boolean(row.content_leaves_device) }
        : {}),
      count: row.count,
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      totalTokens: row.total_tokens,
      lastUsedAt: row.last_used_at,
    }));
  }

  routeUsageBuckets(sinceIso: string, limit = 50): AiUsageBucket[] {
    return (this.db.prepare(`
      SELECT
        route AS key,
        CASE WHEN instr(route, ':') > 0 THEN substr(route, 1, instr(route, ':') - 1) ELSE route END AS feature,
        provider,
        model,
        CASE WHEN COUNT(provider_family) = COUNT(*) AND COUNT(DISTINCT provider_family) = 1 THEN MIN(provider_family) ELSE NULL END AS provider_family,
        CASE WHEN COUNT(transport) = COUNT(*) AND COUNT(DISTINCT transport) = 1 THEN MIN(transport) ELSE NULL END AS transport,
        CASE WHEN COUNT(requested_model) = COUNT(*) AND COUNT(DISTINCT requested_model) = 1 THEN MIN(requested_model) ELSE NULL END AS requested_model,
        CASE WHEN COUNT(resolved_model_id) = COUNT(*) AND COUNT(DISTINCT resolved_model_id) = 1 THEN MIN(resolved_model_id) ELSE NULL END AS resolved_model_id,
        CASE WHEN COUNT(content_leaves_device) = COUNT(*) AND COUNT(DISTINCT content_leaves_device) = 1 THEN MAX(content_leaves_device) ELSE NULL END AS content_leaves_device,
        COUNT(*) AS count,
        COALESCE(SUM(input_tokens), 0) AS input_tokens,
        COALESCE(SUM(output_tokens), 0) AS output_tokens,
        COALESCE(SUM(total_tokens), 0) AS total_tokens,
        MAX(created_at) AS last_used_at
      FROM ai_usage
      WHERE created_at >= ?
      GROUP BY route, provider, model
      ORDER BY total_tokens DESC, last_used_at DESC
      LIMIT ?
    `).all(sinceIso, limit) as UsageRow[]).map((row) => ({
      key: row.key,
      feature: row.feature,
      provider: row.provider,
      model: row.model,
      ...(row.provider_family ? { providerFamily: row.provider_family } : {}),
      ...(row.transport ? { transport: row.transport } : {}),
      ...(row.requested_model ? { requestedModel: row.requested_model } : {}),
      ...(row.resolved_model_id ? { resolvedModelId: row.resolved_model_id } : {}),
      ...(row.content_leaves_device !== null && row.content_leaves_device !== undefined
        ? { contentLeavesDevice: Boolean(row.content_leaves_device) }
        : {}),
      count: row.count,
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      totalTokens: row.total_tokens,
      lastUsedAt: row.last_used_at,
    }));
  }

  private pruneAuditEvents(): void {
    this.db.prepare(`
      DELETE FROM ai_audit_events
      WHERE id NOT IN (
        SELECT id FROM ai_audit_events
        ORDER BY created_at DESC
        LIMIT 1000
      )
    `).run();
  }

  recordAuditEvent(
    type: 'guardrail_denied' | 'provider_error',
    feature: string,
    provider: string,
    model: string,
    message: string,
    metadata: AiExecutionMetadata | Record<string, unknown> = {},
  ): void {
    const safeMessage = sanitizeAuditMessage(message);
    this.db.prepare(`
      INSERT INTO ai_audit_events (id, type, feature, provider, model, message, metadata_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      uuid(),
      type,
      feature,
      provider,
      model,
      safeMessage,
      JSON.stringify(metadata),
      new Date().toISOString(),
    );
    this.pruneAuditEvents();
  }

  recentAuditEvents(limit = 20): AiAuditEvent[] {
    return (this.db.prepare(`
      SELECT id, type, feature, provider, model, message, metadata_json, created_at
      FROM ai_audit_events
      ORDER BY created_at DESC
      LIMIT ?
    `).all(limit) as AuditRow[]).map((row) => {
      const metadata = parseMetadata(row.metadata_json);
      return {
        id: row.id,
        type: row.type,
        feature: row.feature,
        provider: row.provider,
        model: row.model,
        ...metadata,
        message: sanitizeAuditMessage(row.message),
        createdAt: row.created_at,
      };
    });
  }
}

function parseMetadata(value: string | undefined): AiExecutionMetadata {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as AiExecutionMetadata;
    return {
      ...(typeof parsed.providerFamily === 'string' ? { providerFamily: parsed.providerFamily } : {}),
      ...(typeof parsed.transport === 'string' ? { transport: parsed.transport } : {}),
      ...(typeof parsed.requestedModel === 'string' ? { requestedModel: parsed.requestedModel } : {}),
      ...(typeof parsed.resolvedModelId === 'string' ? { resolvedModelId: parsed.resolvedModelId } : {}),
      ...(typeof parsed.contentLeavesDevice === 'boolean' ? { contentLeavesDevice: parsed.contentLeavesDevice } : {}),
    };
  } catch {
    return {};
  }
}
