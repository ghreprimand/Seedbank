import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { AiService } from '../src/ai/service.js';
import { SeedbankRepository } from '../src/repository.js';
import { AiStore } from '../src/ai/store.js';

function aiServiceFixture(): { db: Database.Database; service: AiService } {
  const db = new Database(':memory:');
  for (const migration of [
    '001_initial_schema.sql',
    '002_ai_assistance.sql',
    '005_ai_guardrail_audit.sql',
    '006_ai_execution_metadata.sql',
    '007_ai_provider_instance_usage.sql',
  ]) {
    db.exec(fs.readFileSync(path.resolve('migrations', migration), 'utf8'));
  }
  const repository = new SeedbankRepository(db);
  const store = new AiStore(db);
  return { db, service: new AiService(repository, store) };
}

test('AI preflight omits unresolved codex alias from resolved model metadata', () => {
  const { db, service } = aiServiceFixture();
  try {
    service.configure({
      provider: 'codex-account',
      codexAccountModel: 'codex-recommended',
      featureRoutes: {
        'thinking-partner': { provider: 'codex-account' },
      },
    });

    const result = service.preflight('thinking-partner');

    assert.equal(result.provider, 'codex-account');
    assert.equal(result.requestedModel, 'codex-recommended');
    assert.equal('resolvedModelId' in result, false);
  } finally {
    db.close();
  }
});

test('AI preflight omits unresolved claude latest alias from resolved model metadata', () => {
  const { db, service } = aiServiceFixture();
  try {
    service.configure({
      provider: 'claude-account',
      claudeAccountModel: 'claude-sonnet-latest',
      featureRoutes: {
        'thinking-partner': { provider: 'claude-account' },
      },
    });

    const result = service.preflight('thinking-partner');

    assert.equal(result.provider, 'claude-account');
    assert.equal(result.requestedModel, 'claude-sonnet-latest');
    assert.equal('resolvedModelId' in result, false);
  } finally {
    db.close();
  }
});

test('AI preflight keeps resolved model metadata for non-alias model ids', () => {
  const { db, service } = aiServiceFixture();
  try {
    service.configure({
      provider: 'codex-account',
      codexAccountModel: 'gpt-5.2-codex',
      featureRoutes: {
        'thinking-partner': { provider: 'codex-account' },
      },
    });

    const result = service.preflight('thinking-partner');

    assert.equal(result.provider, 'codex-account');
    assert.equal(result.requestedModel, 'gpt-5.2-codex');
    assert.equal(result.resolvedModelId, 'gpt-5.2-codex');
  } finally {
    db.close();
  }
});
