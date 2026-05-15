import test from 'node:test';
import assert from 'node:assert/strict';
import { OpenAICompatibleProvider } from '../src/ai/providers.js';
import type { AiStoredConfig } from '../src/ai/types.js';

function baseConfig(): AiStoredConfig {
  return {
    provider: 'openai-compatible',
    defaultProviderInstanceId: 'local-openai-compatible',
    providerInstances: {
      'claude-api': {} as AiStoredConfig['providerInstances']['claude-api'],
      'claude-account': {} as AiStoredConfig['providerInstances']['claude-account'],
      'openai-api': {} as AiStoredConfig['providerInstances']['openai-api'],
      'codex-account': {} as AiStoredConfig['providerInstances']['codex-account'],
      'ollama': {} as AiStoredConfig['providerInstances']['ollama'],
      'local-openai-compatible': {} as AiStoredConfig['providerInstances']['local-openai-compatible'],
      'cloud-openai-compatible': {} as AiStoredConfig['providerInstances']['cloud-openai-compatible'],
    },
    openaiModel: 'gpt-4.1-mini',
    anthropicModel: 'claude-sonnet-4-6',
    claudeAccountModel: 'claude-sonnet-latest',
    codexAccountModel: 'codex-recommended',
    ollamaModel: 'llama3.2',
    ollamaBaseUrl: 'http://localhost:11434',
    localOpenaiCompatiblePreset: 'lm-studio',
    localOpenaiCompatibleModel: 'local-model',
    localOpenaiCompatibleBaseUrl: 'http://localhost:1234/v1',
    cloudOpenaiCompatiblePreset: 'openrouter',
    cloudOpenaiCompatibleModel: 'openai/gpt-4o-mini',
    cloudOpenaiCompatibleBaseUrl: 'https://openrouter.ai/api/v1',
    openaiCompatiblePreset: 'custom',
    openaiCompatibleModel: 'local-model',
    openaiCompatibleBaseUrl: 'http://localhost:1234',
    dailyTokenBudget: 200000,
    featureRoutes: {
      'thinking-partner': { provider: 'default', providerInstanceId: 'local-openai-compatible' },
      'field-suggestions': { provider: 'default', providerInstanceId: 'local-openai-compatible' },
      'health-check': { provider: 'default', providerInstanceId: 'local-openai-compatible' },
      'discover-insights': { provider: 'default', providerInstanceId: 'local-openai-compatible' },
      'default': { provider: 'default', providerInstanceId: 'local-openai-compatible' },
    },
    guardrails: {
      featureEnabled: {},
      providerEnabled: {},
      providerInstanceEnabled: {},
      allowedModels: [],
      featureDailyTokenBudgets: {},
      providerDailyTokenBudgets: {},
      providerFamilyDailyTokenBudgets: {},
      providerInstanceDailyTokenBudgets: {},
      modelDailyTokenBudgets: {},
      warnOnRemoteProvider: true,
      requireConfirmationForRemoteProvider: false,
    },
    claudeAccountAuthenticated: false,
    codexAccountAuthenticated: false,
  };
}

test('local OpenAI-compatible instance appends /v1 for model discovery when missing', async () => {
  const provider = new OpenAICompatibleProvider();
  const config: AiStoredConfig = {
    ...baseConfig(),
    defaultProviderInstanceId: 'local-openai-compatible',
    openaiCompatiblePreset: 'custom',
    openaiCompatibleBaseUrl: 'http://localhost:8080',
  };

  const originalFetch = globalThis.fetch;
  let requestUrl = '';
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    requestUrl = String(input);
    return new Response(JSON.stringify({ data: [{ id: 'mistral-local' }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const result = await provider.listModels(config);
    assert.equal(result.ok, true);
    assert.equal(requestUrl, 'http://localhost:8080/v1/models');
    assert.equal(result.normalizedBaseUrl, 'http://localhost:8080/v1');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('local OpenAI-compatible presets append /v1 to custom path prefixes', async () => {
  const provider = new OpenAICompatibleProvider();
  const config: AiStoredConfig = {
    ...baseConfig(),
    defaultProviderInstanceId: 'cloud-openai-compatible',
    openaiCompatiblePreset: 'vllm',
    openaiCompatibleBaseUrl: 'http://localhost:8000/openai',
  };

  const originalFetch = globalThis.fetch;
  let requestUrl = '';
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    requestUrl = String(input);
    return new Response(JSON.stringify({ data: [{ id: 'qwen3' }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const result = await provider.listModels(config);
    assert.equal(result.ok, true);
    assert.equal(requestUrl, 'http://localhost:8000/openai/v1/models');
    assert.equal(result.normalizedBaseUrl, 'http://localhost:8000/openai/v1');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('cloud OpenAI-compatible instance keeps non-/v1 base paths unchanged', async () => {
  const provider = new OpenAICompatibleProvider();
  const config: AiStoredConfig = {
    ...baseConfig(),
    defaultProviderInstanceId: 'cloud-openai-compatible',
    openaiCompatiblePreset: 'custom',
    openaiCompatibleBaseUrl: 'https://router.example/openai',
  };

  const originalFetch = globalThis.fetch;
  let requestUrl = '';
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    requestUrl = String(input);
    return new Response(JSON.stringify({ data: [{ id: 'router-model' }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const result = await provider.listModels(config);
    assert.equal(result.ok, true);
    assert.equal(requestUrl, 'https://router.example/openai/models');
    assert.equal(result.normalizedBaseUrl, 'https://router.example/openai');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
