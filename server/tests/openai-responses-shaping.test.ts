import test from 'node:test';
import assert from 'node:assert/strict';
import { OpenAIProvider } from '../src/ai/providers.js';
import type { AiStoredConfig } from '../src/ai/types.js';
import { encryptSecret } from '../src/ai/crypto.js';

function baseConfig(model = 'gpt-5-mini'): AiStoredConfig {
  return {
    provider: 'openai',
    defaultProviderInstanceId: 'openai-api',
    providerInstances: {
      'claude-api': {} as AiStoredConfig['providerInstances']['claude-api'],
      'claude-account': {} as AiStoredConfig['providerInstances']['claude-account'],
      'openai-api': {} as AiStoredConfig['providerInstances']['openai-api'],
      'codex-account': {} as AiStoredConfig['providerInstances']['codex-account'],
      'ollama': {} as AiStoredConfig['providerInstances']['ollama'],
      'local-openai-compatible': {} as AiStoredConfig['providerInstances']['local-openai-compatible'],
      'cloud-openai-compatible': {} as AiStoredConfig['providerInstances']['cloud-openai-compatible'],
    },
    openaiModel: model,
    anthropicModel: 'claude-sonnet-4-20250514',
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
    openaiCompatiblePreset: 'openrouter',
    openaiCompatibleModel: 'openai/gpt-4o-mini',
    openaiCompatibleBaseUrl: 'https://openrouter.ai/api/v1',
    dailyTokenBudget: 200000,
    featureRoutes: {
      'thinking-partner': { provider: 'default', providerInstanceId: 'openai-api' },
      'field-suggestions': { provider: 'default', providerInstanceId: 'openai-api' },
      'health-check': { provider: 'default', providerInstanceId: 'openai-api' },
      'discover-insights': { provider: 'default', providerInstanceId: 'openai-api' },
      'default': { provider: 'default', providerInstanceId: 'openai-api' },
    },
    guardrails: {
      featureEnabled: {},
      providerEnabled: {},
      allowedModels: [],
      featureDailyTokenBudgets: {},
      providerDailyTokenBudgets: {},
      modelDailyTokenBudgets: {},
      warnOnRemoteProvider: true,
      requireConfirmationForRemoteProvider: false,
    },
    claudeAccountAuthenticated: false,
    codexAccountAuthenticated: false,
    openaiApiKeyEncrypted: encryptSecret('sk-test-openai'),
  };
}

test('OpenAI complete sends reasoning.effort and text.verbosity only for supported models', async () => {
  const provider = new OpenAIProvider();
  const config = {
    ...baseConfig('gpt-5-mini'),
    openaiReasoningEffort: 'high',
    openaiTextVerbosity: 'medium',
  } as AiStoredConfig & { openaiReasoningEffort: string; openaiTextVerbosity: string };

  const originalFetch = globalThis.fetch;
  let capturedBody: Record<string, unknown> | null = null;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    capturedBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    return new Response(JSON.stringify({ output_text: 'ok', usage: { input_tokens: 2, output_tokens: 1 } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const result = await provider.complete([{ role: 'user', content: 'hello' }], config);
    assert.equal(result.text, 'ok');
    assert.equal((capturedBody?.reasoning as { effort?: string } | undefined)?.effort, 'high');
    assert.equal((capturedBody?.text as { verbosity?: string } | undefined)?.verbosity, 'medium');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('OpenAI complete omits unsupported effort/verbosity fields for unsupported models', async () => {
  const provider = new OpenAIProvider();
  const config = {
    ...baseConfig('gpt-4.1-mini'),
    openaiReasoningEffort: 'high',
    openaiTextVerbosity: 'medium',
  } as AiStoredConfig & { openaiReasoningEffort: string; openaiTextVerbosity: string };

  const originalFetch = globalThis.fetch;
  let capturedBody: Record<string, unknown> | null = null;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    capturedBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    return new Response(JSON.stringify({ output_text: 'ok', usage: { input_tokens: 1, output_tokens: 1 } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    await provider.complete([{ role: 'user', content: 'hello' }], config);
    assert.equal(Object.prototype.hasOwnProperty.call(capturedBody ?? {}, 'reasoning'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(capturedBody ?? {}, 'text'), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('OpenAI stream request includes stream flag and gated effort/verbosity fields', async () => {
  const provider = new OpenAIProvider();
  const config = {
    ...baseConfig('gpt-5-mini'),
    openaiReasoningEffort: 'low',
    openaiTextVerbosity: 'high',
  } as AiStoredConfig & { openaiReasoningEffort: string; openaiTextVerbosity: string };

  const originalFetch = globalThis.fetch;
  let capturedBody: Record<string, unknown> | null = null;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    capturedBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    const sse = [
      'data: {"type":"response.output_text.delta","delta":"A"}',
      '',
      'data: {"type":"response.completed","response":{"usage":{"input_tokens":1,"output_tokens":2}}}',
      '',
    ].join('\n');
    return new Response(sse, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  }) as typeof fetch;

  try {
    const deltas: string[] = [];
    const result = await provider.stream([{ role: 'user', content: 'hello' }], config, (delta) => deltas.push(delta));
    assert.deepEqual(deltas, ['A']);
    assert.equal(result.text, 'A');
    assert.equal(capturedBody?.stream, true);
    assert.equal((capturedBody?.reasoning as { effort?: string } | undefined)?.effort, 'low');
    assert.equal((capturedBody?.text as { verbosity?: string } | undefined)?.verbosity, 'high');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
