import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { AiService, setCachedClaudeAccountAuth, setCachedCodexAccountAuth } from '../src/ai/service.js';
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

test('AI method capabilities expose account-login chat methods as auth-required when signed out', { concurrency: false }, () => {
  const { db, service } = aiServiceFixture();
  try {
    setCachedClaudeAccountAuth(false);
    setCachedCodexAccountAuth(false);
    const methods = service.getMethodCapabilities();

    const codexAccount = methods.find((method) => method.id === 'codex-account-app-server');
    assert.equal(codexAccount?.featureRoutable, true);
    assert.equal(codexAccount?.channel, 'chat-model');
    assert.equal(codexAccount?.availability, 'auth-required');
    assert.match(codexAccount?.availabilityReason ?? '', /Sign in with Codex account/i);

    const claudeAccount = methods.find((method) => method.id === 'claude-account-native');
    assert.equal(claudeAccount?.availability, 'auth-required');
    assert.match(claudeAccount?.availabilityReason ?? '', /Sign in with Claude account/i);

    const openrouter = methods.find((method) => method.id === 'openai-compatible:openrouter');
    assert.equal(openrouter?.serviceFamily, 'external-router');
    assert.equal(openrouter?.availability, 'auth-required');

    const lmStudio = methods.find((method) => method.id === 'openai-compatible:lm-studio');
    assert.equal(lmStudio?.serviceFamily, 'local-inference');
    assert.equal(lmStudio?.connectionMethod, 'local-server');
    assert.equal(lmStudio?.availability, 'available');
  } finally {
    db.close();
  }
});

test('AI method capabilities show account/API readiness when configured', { concurrency: false }, () => {
  const { db, service } = aiServiceFixture();
  try {
    setCachedClaudeAccountAuth(true);
    setCachedCodexAccountAuth(true);
    service.configure({
      openaiApiKey: 'test-openai-key',
      anthropicApiKey: 'test-anthropic-key',
      openaiCompatibleApiKey: 'test-router-key',
    });

    const methods = service.getMethodCapabilities();
    assert.equal(methods.find((method) => method.id === 'openai-api-key')?.availability, 'available');
    assert.equal(methods.find((method) => method.id === 'anthropic-api-key')?.availability, 'available');
    assert.equal(methods.find((method) => method.id === 'claude-account-native')?.availability, 'available');
    assert.equal(methods.find((method) => method.id === 'codex-account-app-server')?.availability, 'available');
    assert.equal(methods.find((method) => method.id === 'openai-compatible:openrouter')?.availability, 'available');
  } finally {
    db.close();
  }
});
