import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { AiService } from '../src/ai/service.js';
import { SeedbankRepository } from '../src/repository.js';
import { AiStore } from '../src/ai/store.js';

function aiFixture(): { db: Database.Database; repository: SeedbankRepository; store: AiStore; service: AiService } {
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
  return { db, repository, store, service: new AiService(repository, store) };
}

test('save-time validation rejects explicit provider-instance routes missing required auth/config', () => {
  const { db, service } = aiFixture();
  try {
    assert.throws(
      () => service.configure({
        featureRoutes: {
          'thinking-partner': {
            provider: 'openai',
            providerInstanceId: 'openai-api',
          },
        },
      }),
      (error: unknown) => {
        const err = error as { message?: string; statusCode?: number };
        return err.statusCode === 400 && /API key is not configured/i.test(err.message ?? '');
      },
    );
  } finally {
    db.close();
  }
});

test('save-time validation preserves coarse-provider compatibility during migration', () => {
  const { db, service } = aiFixture();
  try {
    const config = service.configure({
      featureRoutes: {
        'thinking-partner': {
          provider: 'openai',
        },
      },
    });
    assert.equal(config.featureRoutes['thinking-partner']?.provider, 'openai');
    assert.equal(config.featureRoutes['thinking-partner']?.providerInstanceId, 'openai-api');
  } finally {
    db.close();
  }
});

test('preflight marks stale provider-instance routes as blocked with route diagnostics', () => {
  const { db, repository, service } = aiFixture();
  try {
    repository.setSetting('ai.config', {
      defaultProviderInstanceId: 'openai-api',
      featureRoutes: {
        'thinking-partner': { provider: 'default' },
      },
    });

    const result = service.preflight('thinking-partner');
    assert.equal(result.allowed, false);
    assert.ok(result.blockers.some((blocker) => /API key is not configured/i.test(blocker)));
  } finally {
    db.close();
  }
});

test('run-time validation fails fast for stale provider-instance routes', () => {
  const { db, repository, service } = aiFixture();
  try {
    repository.setSetting('ai.config', {
      defaultProviderInstanceId: 'openai-api',
      featureRoutes: {
        'thinking-partner': { provider: 'default' },
      },
    });

    assert.throws(
      () => service.assertFeatureAllowed('thinking-partner', 'test-key'),
      (error: unknown) => {
        const err = error as { message?: string; statusCode?: number };
        return err.statusCode === 400 && /API key is not configured/i.test(err.message ?? '');
      },
    );
  } finally {
    db.close();
  }
});

test('provider-instance guardrails can block local OpenAI-compatible without disabling all OpenAI-compatible routes', () => {
  const { db, service } = aiFixture();
  try {
    service.configure({
      defaultProviderInstanceId: 'local-openai-compatible',
      localOpenaiCompatibleModel: 'local-model',
      featureRoutes: {
        'thinking-partner': {
          provider: 'openai-compatible',
          providerInstanceId: 'local-openai-compatible',
          model: 'local-model',
        },
      },
      guardrails: {
        providerEnabled: { 'openai-compatible': true },
        providerInstanceEnabled: { 'local-openai-compatible': false },
      },
    });

    const result = service.preflight('thinking-partner');
    assert.equal(result.allowed, false);
    assert.ok(result.blockers.some((blocker) => /Local OpenAI-compatible is disabled/i.test(blocker)));
  } finally {
    db.close();
  }
});

test('provider-instance daily budgets use provider instance usage keys', () => {
  const { db, store, service } = aiFixture();
  try {
    service.configure({
      defaultProviderInstanceId: 'local-openai-compatible',
      localOpenaiCompatibleModel: 'local-model',
      featureRoutes: {
        'thinking-partner': {
          provider: 'openai-compatible',
          providerInstanceId: 'local-openai-compatible',
          model: 'local-model',
        },
      },
      guardrails: {
        providerInstanceDailyTokenBudgets: { 'local-openai-compatible': 5 },
      },
    });
    store.recordUsage(
      'openai-compatible',
      'local-model',
      'thinking-partner',
      { inputTokens: 2, outputTokens: 3, totalTokens: 5 },
      { providerInstanceId: 'local-openai-compatible' },
    );

    const result = service.preflight('thinking-partner');
    assert.equal(result.allowed, false);
    assert.ok(result.blockers.some((blocker) => /provider-instance budget local-openai-compatible reached/i.test(blocker)));
  } finally {
    db.close();
  }
});

test('provider-family daily budgets use provider-family usage keys', () => {
  const { db, store, service } = aiFixture();
  try {
    service.configure({
      defaultProviderInstanceId: 'local-openai-compatible',
      localOpenaiCompatibleModel: 'local-model',
      featureRoutes: {
        'thinking-partner': {
          provider: 'openai-compatible',
          providerInstanceId: 'local-openai-compatible',
          model: 'local-model',
        },
      },
      guardrails: {
        providerFamilyDailyTokenBudgets: { 'custom-endpoint': 5 },
      },
    });
    store.recordUsage(
      'openai-compatible',
      'local-model',
      'thinking-partner',
      { inputTokens: 2, outputTokens: 3, totalTokens: 5 },
      { providerFamily: 'custom-endpoint' },
    );

    const result = service.preflight('thinking-partner');
    assert.equal(result.allowed, false);
    assert.ok(result.blockers.some((blocker) => /provider-family budget custom-endpoint reached/i.test(blocker)));
  } finally {
    db.close();
  }
});
