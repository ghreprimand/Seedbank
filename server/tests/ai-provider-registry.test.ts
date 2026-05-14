import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { AiService } from '../src/ai/service.js';
import { SeedbankRepository } from '../src/repository.js';
import { AiStore } from '../src/ai/store.js';

function aiFixture(): { db: Database.Database; service: AiService } {
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

test('provider instance registry exposes required-field contracts', () => {
  const { db, service } = aiFixture();
  try {
    const registry = service.getProviderInstanceRegistry();
    assert.deepEqual(Object.keys(registry).sort(), [
      'claude-account',
      'claude-api',
      'cloud-openai-compatible',
      'codex-account',
      'local-openai-compatible',
      'ollama',
      'openai-api',
    ]);
    assert.deepEqual(registry['claude-account'].requiredFields, ['accountLogin', 'runtime', 'model']);
    assert.deepEqual(registry['cloud-openai-compatible'].requiredFields, ['preset', 'baseUrl', 'apiKey', 'model']);
  } finally {
    db.close();
  }
});

test('provider instance diagnostics include missing-key and runtime-unavailable states', () => {
  const prevCodex = process.env.SEEDBANK_ENABLE_CODEX_ACCOUNT;
  const prevClaude = process.env.SEEDBANK_ENABLE_CLAUDE_ACCOUNT;
  delete process.env.SEEDBANK_ENABLE_CODEX_ACCOUNT;
  delete process.env.SEEDBANK_ENABLE_CLAUDE_ACCOUNT;

  const { db, service } = aiFixture();
  try {
    const diagnostics = service.getProviderInstanceDiagnostics();
    assert.ok(diagnostics.some((diag) => diag.instanceId === 'openai-api' && diag.code === 'missing_key'));
    assert.ok(diagnostics.some((diag) => diag.instanceId === 'cloud-openai-compatible' && diag.code === 'missing_key'));
    assert.ok(diagnostics.some((diag) => diag.instanceId === 'claude-account' && diag.code === 'runtime_unavailable'));
    assert.ok(diagnostics.some((diag) => diag.instanceId === 'codex-account' && diag.code === 'runtime_unavailable'));
  } finally {
    db.close();
    if (prevCodex === undefined) delete process.env.SEEDBANK_ENABLE_CODEX_ACCOUNT;
    else process.env.SEEDBANK_ENABLE_CODEX_ACCOUNT = prevCodex;
    if (prevClaude === undefined) delete process.env.SEEDBANK_ENABLE_CLAUDE_ACCOUNT;
    else process.env.SEEDBANK_ENABLE_CLAUDE_ACCOUNT = prevClaude;
  }
});

test('provider test response includes provider instance id and mapped diagnostics', async () => {
  const { db, service } = aiFixture();
  try {
    const result = await service.testProvider({
      defaultProviderInstanceId: 'local-openai-compatible',
      localOpenaiCompatiblePreset: 'custom',
      localOpenaiCompatibleBaseUrl: 'not-a-valid-url',
      localOpenaiCompatibleModel: 'local-test-model',
    });
    assert.equal(result.providerInstanceId, 'local-openai-compatible');
    assert.ok(result.diagnostics?.some((diag) => diag.code === 'invalid_url'));
  } finally {
    db.close();
  }
});
