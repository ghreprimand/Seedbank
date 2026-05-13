import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { AiStore } from '../src/ai/store.js';

function aiStoreFixture(): { db: Database.Database; store: AiStore } {
  const db = new Database(':memory:');
  for (const migration of [
    '001_initial_schema.sql',
    '002_ai_assistance.sql',
    '005_ai_guardrail_audit.sql',
    '006_ai_execution_metadata.sql',
  ]) {
    db.exec(fs.readFileSync(path.resolve('migrations', migration), 'utf8'));
  }
  return { db, store: new AiStore(db) };
}

test('AI usage records execution metadata without changing configured-model budget keys', () => {
  const { db, store } = aiStoreFixture();
  try {
    store.recordUsage(
      'codex-account',
      'codex-recommended',
      'thinking-partner',
      { inputTokens: 2, outputTokens: 3, totalTokens: 5 },
      {
        providerFamily: 'account',
        transport: 'codex-account-app-server',
        requestedModel: 'codex-recommended',
        resolvedModelId: 'gpt-5.2-codex',
        contentLeavesDevice: true,
      },
    );

    assert.equal(store.tokensSince('1970-01-01T00:00:00.000Z', { model: 'codex-recommended' }), 5);
    assert.equal(store.tokensSince('1970-01-01T00:00:00.000Z', { model: 'gpt-5.2-codex' }), 0);

    const [bucket] = store.routeUsageBuckets('1970-01-01T00:00:00.000Z');
    assert.equal(bucket?.provider, 'codex-account');
    assert.equal(bucket?.model, 'codex-recommended');
    assert.equal(bucket?.providerFamily, 'account');
    assert.equal(bucket?.transport, 'codex-account-app-server');
    assert.equal(bucket?.requestedModel, 'codex-recommended');
    assert.equal(bucket?.resolvedModelId, 'gpt-5.2-codex');
    assert.equal(bucket?.contentLeavesDevice, true);
  } finally {
    db.close();
  }
});

test('AI audit events expose sanitized execution metadata', () => {
  const { db, store } = aiStoreFixture();
  try {
    store.recordAuditEvent(
      'guardrail_denied',
      'field-suggestions',
      'ollama',
      'llama3.2',
      'Denied by guardrail',
      {
        providerFamily: 'local',
        transport: 'ollama-chat',
        requestedModel: 'llama3.2',
        resolvedModelId: 'llama3.2',
        contentLeavesDevice: false,
        ignored: 'not-public-metadata',
      },
    );

    const [event] = store.recentAuditEvents(1);
    assert.equal(event?.providerFamily, 'local');
    assert.equal(event?.transport, 'ollama-chat');
    assert.equal(event?.requestedModel, 'llama3.2');
    assert.equal(event?.resolvedModelId, 'llama3.2');
    assert.equal(event?.contentLeavesDevice, false);
    assert.equal('ignored' in (event ?? {}), false);
  } finally {
    db.close();
  }
});
