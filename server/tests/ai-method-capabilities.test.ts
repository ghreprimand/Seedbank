import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { AiService, setCachedClaudeAccountAuth, setCachedCodexAccountAuth } from '../src/ai/service.js';
import { SeedbankRepository } from '../src/repository.js';
import { AiStore } from '../src/ai/store.js';

const CODEX_ENABLE_ENV = 'SEEDBANK_ENABLE_CODEX_ACCOUNT';
const CLAUDE_ENABLE_ENV = 'SEEDBANK_ENABLE_CLAUDE_ACCOUNT';

function withAccountEnvs(codex: string | undefined, claude: string | undefined, run: () => void): void {
  const prevCodex = process.env[CODEX_ENABLE_ENV];
  const prevClaude = process.env[CLAUDE_ENABLE_ENV];
  if (codex === undefined) delete process.env[CODEX_ENABLE_ENV];
  else process.env[CODEX_ENABLE_ENV] = codex;
  if (claude === undefined) delete process.env[CLAUDE_ENABLE_ENV];
  else process.env[CLAUDE_ENABLE_ENV] = claude;
  try {
    run();
  } finally {
    if (prevCodex === undefined) delete process.env[CODEX_ENABLE_ENV];
    else process.env[CODEX_ENABLE_ENV] = prevCodex;
    if (prevClaude === undefined) delete process.env[CLAUDE_ENABLE_ENV];
    else process.env[CLAUDE_ENABLE_ENV] = prevClaude;
  }
}

/** Back-compat helper: only controls Codex gate; Claude gate stays as-is. */
function withCodexEnv(value: string | undefined, run: () => void): void {
  const prevCodex = process.env[CODEX_ENABLE_ENV];
  if (value === undefined) delete process.env[CODEX_ENABLE_ENV];
  else process.env[CODEX_ENABLE_ENV] = value;
  try {
    run();
  } finally {
    if (prevCodex === undefined) delete process.env[CODEX_ENABLE_ENV];
    else process.env[CODEX_ENABLE_ENV] = prevCodex;
  }
}

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

test('AI method capabilities expose routable chat methods and account env gates', { concurrency: false }, () => {
  // Both account gates disabled (default RC state).
  withAccountEnvs(undefined, undefined, () => {
    const { db, service } = aiServiceFixture();
    try {
      setCachedClaudeAccountAuth(false);
      setCachedCodexAccountAuth(false);
      const methods = service.getMethodCapabilities();

      const codexAccount = methods.find((method) => method.id === 'codex-account-app-server');
      assert.equal(codexAccount?.featureRoutable, true);
      assert.equal(codexAccount?.channel, 'chat-model');
      // Gate off → auth-required (not hard-disabled) so the pill stays clickable in the UI.
      assert.equal(codexAccount?.availability, 'auth-required');
      assert.match(codexAccount?.availabilityReason ?? '', /SEEDBANK_ENABLE_CODEX_ACCOUNT=1/);

      // Claude account: gate off reports auth-required so the method pill is always selectable.
      const claudeAccount = methods.find((method) => method.id === 'claude-account-native');
      assert.equal(claudeAccount?.availability, 'auth-required');
      assert.match(claudeAccount?.availabilityReason ?? '', /SEEDBANK_ENABLE_CLAUDE_ACCOUNT=1/);

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

test('AI method capabilities show auth-required for account methods when gate is enabled but not signed in', { concurrency: false }, () => {
  withAccountEnvs('1', '1', () => {
    const { db, service } = aiServiceFixture();
    try {
      setCachedClaudeAccountAuth(false);
      setCachedCodexAccountAuth(false);
      const methods = service.getMethodCapabilities();

      const claudeAccount = methods.find((method) => method.id === 'claude-account-native');
      assert.equal(claudeAccount?.availability, 'auth-required');

      const codexAccount = methods.find((method) => method.id === 'codex-account-app-server');
      assert.equal(codexAccount?.availability, 'auth-required');
    } finally {
      db.close();
    }
  });
});

test('AI method capabilities show account/API readiness when configured', { concurrency: false }, () => {
  // Both account gates explicitly enabled; caches set to authenticated.
  withAccountEnvs('1', '1', () => {
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
