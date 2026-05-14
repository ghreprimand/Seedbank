/**
 * Focused tests for Phase 6 cloud OpenAI-compatible preset behavior.
 *
 * Covers:
 * - Registry metadata completeness for all five cloud presets
 * - Key clearing when the cloud preset/endpoint identity changes
 * - Diagnostic codes emitted for missing key on cloud-openai-compatible
 * - Feature routing to cloud-openai-compatible
 * - testProvider with an invalid URL emits a diagnostic (not raw error text)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { AiService } from '../src/ai/service.js';
import { SeedbankRepository } from '../src/repository.js';
import { AiStore } from '../src/ai/store.js';
import {
  OPENAI_COMPATIBLE_PRESETS,
  cloudOpenAICompatiblePreset,
} from '../src/ai/registry.js';

const CLOUD_PRESET_IDS = ['openrouter', 'groq', 'mistral', 'together', 'fireworks'] as const;

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

// ---------------------------------------------------------------------------
// Registry metadata completeness
// ---------------------------------------------------------------------------

test('all cloud presets have non-empty defaultModel', () => {
  for (const id of CLOUD_PRESET_IDS) {
    const preset = OPENAI_COMPATIBLE_PRESETS[id];
    assert.ok(
      preset.defaultModel && preset.defaultModel.trim().length > 0,
      `cloud preset "${id}" must have a non-empty defaultModel (got: "${preset.defaultModel ?? ''}")`,
    );
  }
});

test('all cloud presets have HTTPS base URLs', () => {
  for (const id of CLOUD_PRESET_IDS) {
    const preset = OPENAI_COMPATIBLE_PRESETS[id];
    assert.ok(
      preset.baseUrl?.startsWith('https://'),
      `cloud preset "${id}" must use HTTPS base URL (got: "${preset.baseUrl ?? ''}")`,
    );
  }
});

test('all cloud presets require an API key and are not local', () => {
  for (const id of CLOUD_PRESET_IDS) {
    const preset = OPENAI_COMPATIBLE_PRESETS[id];
    assert.equal(preset.requiresApiKey, true, `cloud preset "${id}" must require an API key`);
    assert.equal(preset.local, false, `cloud preset "${id}" must not be local`);
    assert.equal(preset.dataResidency, 'cloud', `cloud preset "${id}" must have dataResidency=cloud`);
  }
});

test('cloudOpenAICompatiblePreset correctly identifies cloud preset IDs', () => {
  for (const id of CLOUD_PRESET_IDS) {
    assert.equal(cloudOpenAICompatiblePreset(id), true, `"${id}" should be identified as a cloud preset`);
  }
  for (const id of ['lm-studio', 'vllm', 'llama-cpp', 'localai'] as const) {
    assert.equal(cloudOpenAICompatiblePreset(id), false, `"${id}" should not be identified as a cloud preset`);
  }
});

// ---------------------------------------------------------------------------
// Key clearing on preset/endpoint identity change
// ---------------------------------------------------------------------------

test('cloud key is cleared when preset changes to a different cloud provider', () => {
  const { db, service } = aiFixture();
  try {
    const after1 = service.configure({
      cloudOpenaiCompatiblePreset: 'openrouter',
      cloudOpenaiCompatibleBaseUrl: 'https://openrouter.ai/api/v1',
      cloudOpenaiCompatibleApiKey: 'test-openrouter-key',
    });
    assert.equal(after1.hasCloudOpenAICompatibleKey, true, 'key should be present after setting');

    // Switching preset — cloud identity changes, key must be cleared.
    const after2 = service.configure({
      cloudOpenaiCompatiblePreset: 'groq',
      cloudOpenaiCompatibleBaseUrl: 'https://api.groq.com/openai/v1',
    });
    assert.equal(after2.hasCloudOpenAICompatibleKey, false, 'key should be cleared after preset change');
  } finally {
    db.close();
  }
});

test('cloud key is retained when preset and URL are unchanged', () => {
  const { db, service } = aiFixture();
  try {
    service.configure({
      cloudOpenaiCompatiblePreset: 'openrouter',
      cloudOpenaiCompatibleBaseUrl: 'https://openrouter.ai/api/v1',
      cloudOpenaiCompatibleApiKey: 'test-openrouter-key',
    });
    // Model-only update — same preset + URL, key must persist.
    const after = service.configure({
      cloudOpenaiCompatiblePreset: 'openrouter',
      cloudOpenaiCompatibleBaseUrl: 'https://openrouter.ai/api/v1',
      cloudOpenaiCompatibleModel: 'openai/gpt-4o',
    });
    assert.equal(after.hasCloudOpenAICompatibleKey, true, 'key should be retained when identity is unchanged');
  } finally {
    db.close();
  }
});

test('cloud key is cleared when base URL changes even within the same preset', () => {
  const { db, service } = aiFixture();
  try {
    service.configure({
      cloudOpenaiCompatiblePreset: 'custom',
      cloudOpenaiCompatibleBaseUrl: 'https://custom.example.com/v1',
      cloudOpenaiCompatibleApiKey: 'test-custom-key',
    });
    const after = service.configure({
      cloudOpenaiCompatiblePreset: 'custom',
      cloudOpenaiCompatibleBaseUrl: 'https://other.example.com/v1',
    });
    assert.equal(after.hasCloudOpenAICompatibleKey, false, 'key should be cleared when base URL changes');
  } finally {
    db.close();
  }
});

// ---------------------------------------------------------------------------
// Diagnostic codes
// ---------------------------------------------------------------------------

test('getProviderInstanceDiagnostics emits missing_key for cloud-openai-compatible without key', () => {
  const { db, service } = aiFixture();
  try {
    const diagnostics = service.getProviderInstanceDiagnostics();
    const cloudDiag = diagnostics.find(
      (d) => d.instanceId === 'cloud-openai-compatible' && d.code === 'missing_key',
    );
    assert.ok(cloudDiag, 'should have a missing_key diagnostic for cloud-openai-compatible');
    assert.equal(cloudDiag?.severity, 'error');
  } finally {
    db.close();
  }
});

test('getProviderInstanceDiagnostics clears error diagnostics when cloud key is present', () => {
  const { db, service } = aiFixture();
  try {
    service.configure({
      cloudOpenaiCompatiblePreset: 'openrouter',
      cloudOpenaiCompatibleBaseUrl: 'https://openrouter.ai/api/v1',
      cloudOpenaiCompatibleApiKey: 'test-cloud-key',
    });
    const diagnostics = service.getProviderInstanceDiagnostics();
    const errorDiags = diagnostics.filter(
      (d) => d.instanceId === 'cloud-openai-compatible' && d.severity === 'error',
    );
    assert.equal(
      errorDiags.length,
      0,
      `should have no error diagnostics when key is present, got: ${JSON.stringify(errorDiags)}`,
    );
  } finally {
    db.close();
  }
});

// ---------------------------------------------------------------------------
// Feature routing to cloud-openai-compatible
// ---------------------------------------------------------------------------

test('preflight blocks thinking-partner routed to cloud-openai-compatible when no key is set', () => {
  const { db, repository, service } = aiFixture();
  try {
    repository.setSetting('ai.config', {
      defaultProviderInstanceId: 'cloud-openai-compatible',
      cloudOpenaiCompatiblePreset: 'openrouter',
      cloudOpenaiCompatibleBaseUrl: 'https://openrouter.ai/api/v1',
      cloudOpenaiCompatibleModel: 'openai/gpt-4o-mini',
      featureRoutes: {
        'thinking-partner': { provider: 'default' },
      },
    });
    const result = service.preflight('thinking-partner');
    assert.equal(result.allowed, false);
    assert.ok(
      result.blockers.some((b) => /API key|key is not configured/i.test(b)),
      `expected key-related blocker, got: ${JSON.stringify(result.blockers)}`,
    );
  } finally {
    db.close();
  }
});

test('effectiveFeatureRoutes resolves cloud-openai-compatible as the active provider instance', () => {
  const { db, repository, service } = aiFixture();
  try {
    repository.setSetting('ai.config', {
      defaultProviderInstanceId: 'cloud-openai-compatible',
      cloudOpenaiCompatiblePreset: 'groq',
      cloudOpenaiCompatibleModel: 'llama-3.3-70b-versatile',
      cloudOpenaiCompatibleBaseUrl: 'https://api.groq.com/openai/v1',
    });
    const config = service.getPublicConfig();
    const effective = config.effectiveFeatureRoutes?.['thinking-partner'];
    assert.equal(effective?.providerInstanceId, 'cloud-openai-compatible');
    assert.equal(effective?.provider, 'openai-compatible');
    assert.equal(effective?.model, 'llama-3.3-70b-versatile');
  } finally {
    db.close();
  }
});

// ---------------------------------------------------------------------------
// testProvider with invalid URL emits diagnostic, not raw error text
// ---------------------------------------------------------------------------

test('testProvider with invalid cloud URL emits invalid_url diagnostic', async () => {
  const { db, service } = aiFixture();
  try {
    const result = await service.testProvider({
      defaultProviderInstanceId: 'cloud-openai-compatible',
      cloudOpenaiCompatiblePreset: 'custom',
      cloudOpenaiCompatibleBaseUrl: 'not-a-valid-url',
      cloudOpenaiCompatibleModel: 'test-model',
    });
    assert.equal(result.providerInstanceId, 'cloud-openai-compatible');
    assert.ok(
      result.diagnostics?.some((d) => d.code === 'invalid_url'),
      `expected invalid_url diagnostic, got: ${JSON.stringify(result.diagnostics)}`,
    );
  } finally {
    db.close();
  }
});
