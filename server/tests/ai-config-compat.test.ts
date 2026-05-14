import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { AiService } from '../src/ai/service.js';
import { SeedbankRepository } from '../src/repository.js';
import { AiStore } from '../src/ai/store.js';

function aiFixture(): { db: Database.Database; repository: SeedbankRepository; service: AiService } {
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
  return { db, repository, service: new AiService(repository, store) };
}

test('AI config falls back to legacy ai:config when ai.config is missing', () => {
  const { db, repository, service } = aiFixture();
  try {
    repository.setSetting('ai:config', {
      provider: 'openai',
      openaiModel: 'gpt-4.1',
      openaiCompatiblePreset: 'groq',
      openaiCompatibleModel: 'llama-3.3-70b-versatile',
      openaiCompatibleBaseUrl: 'https://api.groq.com/openai/v1',
    });

    const config = service.getConfig();
    assert.equal(config.provider, 'openai');
    assert.equal(config.openaiModel, 'gpt-4.1');
    assert.equal(config.openaiCompatiblePreset, 'groq');
    assert.equal(config.openaiCompatibleModel, 'llama-3.3-70b-versatile');
    assert.equal(config.openaiCompatibleBaseUrl, 'https://api.groq.com/openai/v1');
  } finally {
    db.close();
  }
});

test('AI config prefers ai.config over legacy ai:config when both are present', () => {
  const { db, repository, service } = aiFixture();
  try {
    repository.setSetting('ai:config', {
      provider: 'anthropic',
      anthropicModel: 'claude-opus-4-20250514',
    });
    repository.setSetting('ai.config', {
      provider: 'ollama',
      ollamaModel: 'mistral:7b',
      ollamaBaseUrl: 'http://localhost:11434',
    });

    const config = service.getConfig();
    assert.equal(config.provider, 'ollama');
    assert.equal(config.ollamaModel, 'mistral:7b');
    assert.equal(config.anthropicModel, 'claude-sonnet-4-20250514');
  } finally {
    db.close();
  }
});

test('AI config migration resets stale legacy model defaults', () => {
  const { db, repository, service } = aiFixture();
  try {
    repository.setSetting('ai.config', {
      provider: 'openai',
      openaiModel: 'gpt-5.5',
      anthropicModel: 'claude-opus-4-5',
    });

    const config = service.getConfig();
    assert.equal(config.openaiModel, 'gpt-4.1-mini');
    assert.equal(config.anthropicModel, 'claude-sonnet-4-20250514');
  } finally {
    db.close();
  }
});

test('Cloud OpenAI-compatible key is cleared when preset identity changes', () => {
  const { db, service } = aiFixture();
  try {
    service.configure({
      defaultProviderInstanceId: 'cloud-openai-compatible',
      cloudOpenaiCompatiblePreset: 'openrouter',
      cloudOpenaiCompatibleApiKey: 'sk-openrouter',
    });
    assert.equal(service.getPublicConfig().hasCloudOpenAICompatibleKey, true);

    service.configure({ cloudOpenaiCompatiblePreset: 'groq' });
    assert.equal(service.getPublicConfig().cloudOpenaiCompatiblePreset, 'groq');
    assert.equal(service.getPublicConfig().hasCloudOpenAICompatibleKey, false);
  } finally {
    db.close();
  }
});

test('Cloud OpenAI-compatible key is retained for normalized equivalent base URLs', () => {
  const { db, service } = aiFixture();
  try {
    service.configure({
      defaultProviderInstanceId: 'cloud-openai-compatible',
      cloudOpenaiCompatiblePreset: 'custom',
      cloudOpenaiCompatibleBaseUrl: 'https://EXAMPLE.com/v1/',
      cloudOpenaiCompatibleApiKey: 'sk-custom',
    });
    assert.equal(service.getPublicConfig().hasCloudOpenAICompatibleKey, true);

    service.configure({ cloudOpenaiCompatibleBaseUrl: 'https://example.com/v1' });
    assert.equal(service.getPublicConfig().hasCloudOpenAICompatibleKey, true);
  } finally {
    db.close();
  }
});

test('Cloud OpenAI-compatible key is cleared when base URL identity changes', () => {
  const { db, service } = aiFixture();
  try {
    service.configure({
      defaultProviderInstanceId: 'cloud-openai-compatible',
      cloudOpenaiCompatiblePreset: 'custom',
      cloudOpenaiCompatibleBaseUrl: 'https://router.example/v1',
      cloudOpenaiCompatibleApiKey: 'sk-router',
    });
    assert.equal(service.getPublicConfig().hasCloudOpenAICompatibleKey, true);

    service.configure({ cloudOpenaiCompatibleBaseUrl: 'https://router2.example/v1' });
    assert.equal(service.getPublicConfig().hasCloudOpenAICompatibleKey, false);
  } finally {
    db.close();
  }
});

test('Feature route effort and verbosity persist and resolve only for supported OpenAI models', () => {
  const { db, service } = aiFixture();
  try {
    const supported = service.configure({
      openaiApiKey: 'sk-test',
      openaiModel: 'gpt-5.2',
      featureRoutes: {
        'thinking-partner': {
          provider: 'openai',
          providerInstanceId: 'openai-api',
          model: 'gpt-5.2',
          effort: 'high',
          verbosity: 'low',
        },
      },
    });

    assert.equal(supported.featureRoutes['thinking-partner']?.effort, 'high');
    assert.equal(supported.featureRoutes['thinking-partner']?.verbosity, 'low');
    assert.equal(supported.effectiveFeatureRoutes['thinking-partner']?.effort, 'high');
    assert.equal(supported.effectiveFeatureRoutes['thinking-partner']?.verbosity, 'low');

    const unsupported = service.configure({
      featureRoutes: {
        'thinking-partner': {
          provider: 'openai',
          providerInstanceId: 'openai-api',
          model: 'gpt-4.1-mini',
          effort: 'high',
          verbosity: 'low',
        },
      },
    });

    assert.equal(unsupported.featureRoutes['thinking-partner']?.effort, 'high');
    assert.equal(unsupported.featureRoutes['thinking-partner']?.verbosity, 'low');
    assert.equal(unsupported.effectiveFeatureRoutes['thinking-partner']?.effort, undefined);
    assert.equal(unsupported.effectiveFeatureRoutes['thinking-partner']?.verbosity, undefined);
  } finally {
    db.close();
  }
});

test('Claude account compaction defaults on and explicit off persists', () => {
  const { db, repository, service } = aiFixture();
  try {
    repository.setSetting('ai.config', {
      provider: 'claude-account',
      claudeAccountModel: 'claude-sonnet-latest',
    });
    assert.equal(service.getPublicConfig().claudeAccountCompact, true);

    const updated = service.configure({ claudeAccountCompact: false });
    assert.equal(updated.claudeAccountCompact, false);
    assert.equal(service.getConfig().claudeAccountCompact, false);
  } finally {
    db.close();
  }
});
