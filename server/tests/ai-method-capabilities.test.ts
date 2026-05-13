import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { AiService, setCachedClaudeAccountAuth, setCachedCodexAccountAuth } from '../src/ai/service.js';
import { SeedbankRepository } from '../src/repository.js';
import { AiStore } from '../src/ai/store.js';

const CODEX_ENABLE_ENV = 'SEEDBANK_ENABLE_CODEX_ACCOUNT';

function withCodexEnv(value: string | undefined, run: () => void): void {
  const previous = process.env[CODEX_ENABLE_ENV];
  if (value === undefined) delete process.env[CODEX_ENABLE_ENV];
  else process.env[CODEX_ENABLE_ENV] = value;
  try {
    run();
  } finally {
    if (previous === undefined) delete process.env[CODEX_ENABLE_ENV];
    else process.env[CODEX_ENABLE_ENV] = previous;
  }
}

function aiServiceFixture(): { db: Database.Database; service: AiService } {
  const db = new Database(':memory:');
  for (const migration of [
    '001_initial_schema.sql',
    '002_ai_assistance.sql',
    '005_ai_guardrail_audit.sql',
    '006_ai_execution_metadata.sql',
  ]) {
    db.exec(fs.readFileSync(path.resolve('migrations', migration), 'utf8'));
  }
  const repository = new SeedbankRepository(db);
  const store = new AiStore(db);
  return { db, service: new AiService(repository, store) };
}

test('AI method capabilities expose routable chat methods and codex env gate', { concurrency: false }, () => {
  withCodexEnv(undefined, () => {
    const { db, service } = aiServiceFixture();
    try {
      setCachedClaudeAccountAuth(false);
      setCachedCodexAccountAuth(false);
      const methods = service.getMethodCapabilities();

      const codexAccount = methods.find((method) => method.id === 'codex-account-app-server');
      assert.equal(codexAccount?.featureRoutable, true);
      assert.equal(codexAccount?.channel, 'chat-model');
      assert.equal(codexAccount?.availability, 'unavailable');
      assert.match(codexAccount?.availabilityReason ?? '', /SEEDBANK_ENABLE_CODEX_ACCOUNT=1/);

      const claudeAccount = methods.find((method) => method.id === 'claude-account-native');
      assert.equal(claudeAccount?.availability, 'auth-required');

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
});

test('AI method capabilities show account/API readiness when configured', { concurrency: false }, () => {
  withCodexEnv('1', () => {
    const { db, service } = aiServiceFixture();
    try {
      setCachedClaudeAccountAuth(true);
      setCachedCodexAccountAuth(true);
      service.configure({
        openaiApiKey: 'sk-test-openai',
        anthropicApiKey: 'sk-ant-test',
        openaiCompatibleApiKey: 'sk-router',
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
});
