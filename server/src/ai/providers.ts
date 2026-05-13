import type { AiModelListResult, AiProviderErrorCode, AiProviderHealth, AiProviderId } from '../../../shared/types.js';
import { decryptSecret } from './crypto.js';
import { openAICompatiblePreset } from './registry.js';
import type { AiProvider, AiProviderMessage, AiProviderResult, AiStoredConfig, AiUsage } from './types.js';

const REQUEST_TIMEOUT_MS = 8_000;

export class AiProviderError extends Error {
  constructor(
    readonly provider: AiProviderId,
    readonly code: AiProviderErrorCode,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'AiProviderError';
  }
}

function systemPrompt(messages: AiProviderMessage[]): string {
  return messages.filter((message) => message.role === 'system').map((message) => message.content).join('\n\n');
}

function transcript(messages: AiProviderMessage[]): string {
  return messages
    .filter((message) => message.role !== 'system')
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join('\n\n');
}

function usageFrom(raw: unknown): AiUsage {
  const usage = raw as {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_eval_count?: number;
    eval_count?: number;
  } | undefined;
  const inputTokens = usage?.input_tokens ?? usage?.prompt_tokens ?? usage?.prompt_eval_count ?? 0;
  const outputTokens = usage?.output_tokens ?? usage?.completion_tokens ?? usage?.eval_count ?? 0;
  return {
    inputTokens,
    outputTokens,
    totalTokens: usage?.total_tokens ?? inputTokens + outputTokens,
  };
}

function extractOpenAIText(payload: unknown): string {
  const response = payload as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> };
  if (response.output_text) return response.output_text;
  return response.output
    ?.flatMap((item) => item.content ?? [])
    .map((content) => content.text ?? '')
    .join('') ?? '';
}

function extractChatCompletionText(payload: unknown): string {
  const response = payload as { choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }> };
  const content = response.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((part) => part.text ?? '').join('');
  return '';
}

function extractModelIds(payload: unknown): string[] {
  const response = payload as { data?: Array<{ id?: string; name?: string } | string>; models?: Array<{ name?: string } | string> };
  const candidates: Array<{ id?: string; name?: string } | string> = response.data ?? response.models ?? [];
  return candidates
    .map((item) => {
      if (typeof item === 'string') return item;
      return item.id ?? item.name ?? '';
    })
    .filter(Boolean);
}

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function parseErrorBody(response: Response): Promise<string> {
  try {
    const body = await response.json() as { error?: unknown; message?: unknown };
    if (typeof body.error === 'string') return body.error;
    if (typeof body.message === 'string') return body.message;
    if (body.error && typeof body.error === 'object' && 'message' in body.error) {
      const message = (body.error as { message?: unknown }).message;
      if (typeof message === 'string') return message;
    }
  } catch {
    try {
      const text = await response.text();
      if (text.trim()) return text.trim().slice(0, 300);
    } catch {
      // keep the status text fallback
    }
  }
  return response.statusText || 'Provider request failed.';
}

function providerFetchError(provider: AiProviderId, error: unknown): AiProviderError {
  if (error instanceof AiProviderError) return error;
  if (error instanceof TypeError || (error instanceof Error && error.name === 'AbortError')) {
    return new AiProviderError(provider, 'unreachable', `${provider} is unreachable. Check the base URL and whether the service is running.`);
  }
  return new AiProviderError(provider, 'unknown', error instanceof Error ? error.message : String(error));
}

async function assertOk(provider: AiProviderId, response: Response, context: string): Promise<void> {
  if (response.ok) return;
  const detail = await parseErrorBody(response);
  const code: AiProviderErrorCode = response.status === 404 ? 'model_missing' : 'http_error';
  throw new AiProviderError(provider, code, `${context} failed: ${response.status} ${detail}`, response.status);
}

function providerHealth(provider: AiProviderId, model: string, error?: unknown, normalizedBaseUrl?: string): AiProviderHealth {
  if (!error) {
    return { provider, ok: true, code: 'ok', message: 'Connection succeeded.', model, normalizedBaseUrl };
  }
  const normalized = providerFetchError(provider, error);
  return {
    provider,
    ok: false,
    code: normalized.code,
    message: normalized.message,
    status: normalized.status,
    model,
    normalizedBaseUrl,
  };
}

function normalizeBaseUrl(raw: string, provider: AiProviderId, defaultUrl: string): string {
  const value = (raw || defaultUrl).trim();
  try {
    const url = new URL(value);
    url.hash = '';
    url.search = '';
    url.pathname = url.pathname.replace(/\/+$/, '') || '';
    return url.toString().replace(/\/$/, '');
  } catch {
    throw new AiProviderError(provider, 'bad_url', `Invalid base URL: ${value}`);
  }
}

export function normalizeOllamaBaseUrl(raw: string): string {
  const normalized = normalizeBaseUrl(raw, 'ollama', 'http://localhost:11434');
  const url = new URL(normalized);
  url.pathname = url.pathname.replace(/\/api\/?$/, '').replace(/\/+$/, '');
  return url.toString().replace(/\/$/, '');
}

function normalizeOpenAICompatibleBaseUrl(raw: string, fallback: string): string {
  return normalizeBaseUrl(raw, 'openai-compatible', fallback);
}

function authHeaders(apiKey?: string): Record<string, string> {
  return apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
}

async function parseSse(response: Response, onEvent: (event: string, data: string) => void): Promise<void> {
  if (!response.body) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split('\n\n');
    buffer = chunks.pop() ?? '';
    for (const chunk of chunks) {
      const event = chunk.split('\n').find((line) => line.startsWith('event:'))?.slice(6).trim() ?? '';
      const data = chunk.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim()).join('\n');
      if (data && data !== '[DONE]') onEvent(event, data);
    }
  }
}

async function parseJsonLines(response: Response, onLine: (data: Record<string, unknown>) => void): Promise<void> {
  if (!response.body) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      onLine(JSON.parse(line) as Record<string, unknown>);
    }
  }
}

export class OpenAIProvider implements AiProvider {
  readonly id = 'openai';

  private apiKey(config: AiStoredConfig): string {
    const apiKey = decryptSecret(config.openaiApiKeyEncrypted);
    if (!apiKey) throw new AiProviderError(this.id, 'not_configured', 'OpenAI API key is not configured.');
    return apiKey;
  }

  async complete(messages: AiProviderMessage[], config: AiStoredConfig): Promise<AiProviderResult> {
    try {
      const response = await fetchWithTimeout('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey(config)}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: config.openaiModel,
          instructions: systemPrompt(messages),
          input: transcript(messages),
          text: { verbosity: 'low' },
        }),
      });
      await assertOk(this.id, response, 'OpenAI request');
      const payload = await response.json() as { usage?: unknown };
      return { text: extractOpenAIText(payload), usage: usageFrom(payload.usage) };
    } catch (error) {
      throw providerFetchError(this.id, error);
    }
  }

  async stream(messages: AiProviderMessage[], config: AiStoredConfig, onDelta: (delta: string) => void): Promise<AiProviderResult> {
    try {
      const response = await fetchWithTimeout('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey(config)}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: config.openaiModel,
          instructions: systemPrompt(messages),
          input: transcript(messages),
          text: { verbosity: 'low' },
          stream: true,
        }),
      });
      await assertOk(this.id, response, 'OpenAI stream');
      let text = '';
      let usage: AiUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
      await parseSse(response, (_event, data) => {
        const payload = JSON.parse(data) as { type?: string; delta?: string; response?: { usage?: unknown } };
        if (payload.type === 'response.output_text.delta' && payload.delta) {
          text += payload.delta;
          onDelta(payload.delta);
        }
        if (payload.type === 'response.completed' && payload.response?.usage) {
          usage = usageFrom(payload.response.usage);
        }
      });
      return { text, usage };
    } catch (error) {
      throw providerFetchError(this.id, error);
    }
  }

  async health(config: AiStoredConfig): Promise<AiProviderHealth> {
    try {
      const models = await this.listModels(config);
      if (!models.ok) throw new AiProviderError(this.id, models.code ?? 'unknown', models.message ?? 'OpenAI model discovery failed.');
      if (models.models.length > 0 && !models.models.some((model) => model.id === config.openaiModel)) {
        throw new AiProviderError(this.id, 'model_missing', `OpenAI model "${config.openaiModel}" was not returned by the Models API.`);
      }
      return providerHealth(this.id, config.openaiModel);
    } catch (error) {
      return providerHealth(this.id, config.openaiModel, error);
    }
  }

  async listModels(config: AiStoredConfig): Promise<AiModelListResult> {
    try {
      const response = await fetchWithTimeout('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${this.apiKey(config)}` },
      });
      await assertOk(this.id, response, 'OpenAI model discovery');
      const models = extractModelIds(await response.json()).map((id) => ({ id }));
      return { provider: this.id, ok: true, models };
    } catch (error) {
      const normalized = providerFetchError(this.id, error);
      return { provider: this.id, ok: false, models: [], code: normalized.code, message: normalized.message };
    }
  }
}

export class AnthropicProvider implements AiProvider {
  readonly id = 'anthropic';

  private apiKey(config: AiStoredConfig): string {
    const apiKey = decryptSecret(config.anthropicApiKeyEncrypted);
    if (!apiKey) throw new AiProviderError(this.id, 'not_configured', 'Anthropic API key is not configured.');
    return apiKey;
  }

  private body(messages: AiProviderMessage[], config: AiStoredConfig, stream = false) {
    return {
      model: config.anthropicModel,
      max_tokens: 800,
      system: systemPrompt(messages),
      messages: messages.filter((message) => message.role !== 'system').map((message) => ({
        role: message.role,
        content: message.content,
      })),
      stream,
    };
  }

  async complete(messages: AiProviderMessage[], config: AiStoredConfig): Promise<AiProviderResult> {
    try {
      const response = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey(config),
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(this.body(messages, config)),
      });
      await assertOk(this.id, response, 'Anthropic request');
      const payload = await response.json() as { content?: Array<{ text?: string }>; usage?: { input_tokens?: number; output_tokens?: number } };
      const inputTokens = payload.usage?.input_tokens ?? 0;
      const outputTokens = payload.usage?.output_tokens ?? 0;
      return {
        text: payload.content?.map((content) => content.text ?? '').join('') ?? '',
        usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
      };
    } catch (error) {
      throw providerFetchError(this.id, error);
    }
  }

  async stream(messages: AiProviderMessage[], config: AiStoredConfig, onDelta: (delta: string) => void): Promise<AiProviderResult> {
    try {
      const response = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey(config),
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(this.body(messages, config, true)),
      });
      await assertOk(this.id, response, 'Anthropic stream');
      let text = '';
      let usage: AiUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
      await parseSse(response, (_event, data) => {
        const payload = JSON.parse(data) as {
          type?: string;
          delta?: { text?: string };
          message?: { usage?: { input_tokens?: number; output_tokens?: number } };
          usage?: { output_tokens?: number };
        };
        if (payload.type === 'content_block_delta' && payload.delta?.text) {
          text += payload.delta.text;
          onDelta(payload.delta.text);
        }
        if (payload.message?.usage) {
          const inputTokens = payload.message.usage.input_tokens ?? 0;
          const outputTokens = payload.message.usage.output_tokens ?? 0;
          usage = { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens };
        }
        if (payload.usage?.output_tokens) {
          usage = { ...usage, outputTokens: payload.usage.output_tokens, totalTokens: usage.inputTokens + payload.usage.output_tokens };
        }
      });
      return { text, usage };
    } catch (error) {
      throw providerFetchError(this.id, error);
    }
  }

  async health(config: AiStoredConfig): Promise<AiProviderHealth> {
    try {
      const models = await this.listModels(config);
      if (!models.ok) throw new AiProviderError(this.id, models.code ?? 'unknown', models.message ?? 'Anthropic model discovery failed.');
      if (models.models.length > 0 && !models.models.some((model) => model.id === config.anthropicModel)) {
        throw new AiProviderError(this.id, 'model_missing', `Anthropic model "${config.anthropicModel}" was not returned by the Models API.`);
      }
      return providerHealth(this.id, config.anthropicModel);
    } catch (error) {
      return providerHealth(this.id, config.anthropicModel, error);
    }
  }

  async listModels(config: AiStoredConfig): Promise<AiModelListResult> {
    try {
      const response = await fetchWithTimeout('https://api.anthropic.com/v1/models', {
        headers: {
          'x-api-key': this.apiKey(config),
          'anthropic-version': '2023-06-01',
        },
      });
      await assertOk(this.id, response, 'Anthropic model discovery');
      const models = extractModelIds(await response.json()).map((id) => ({ id }));
      return { provider: this.id, ok: true, models };
    } catch (error) {
      const normalized = providerFetchError(this.id, error);
      return { provider: this.id, ok: false, models: [], code: normalized.code, message: normalized.message };
    }
  }
}

export class OllamaProvider implements AiProvider {
  readonly id = 'ollama';

  private baseUrl(config: AiStoredConfig): string {
    return normalizeOllamaBaseUrl(config.ollamaBaseUrl);
  }

  private chatUrl(config: AiStoredConfig): string {
    return `${this.baseUrl(config)}/api/chat`;
  }

  async complete(messages: AiProviderMessage[], config: AiStoredConfig): Promise<AiProviderResult> {
    try {
      const response = await fetchWithTimeout(this.chatUrl(config), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: config.ollamaModel,
          messages,
          stream: false,
        }),
      });
      await assertOk(this.id, response, 'Ollama request');
      const payload = await response.json() as { message?: { content?: string }; prompt_eval_count?: number; eval_count?: number };
      return {
        text: payload.message?.content ?? '',
        usage: usageFrom(payload),
      };
    } catch (error) {
      throw providerFetchError(this.id, error);
    }
  }

  async stream(messages: AiProviderMessage[], config: AiStoredConfig, onDelta: (delta: string) => void): Promise<AiProviderResult> {
    try {
      const response = await fetchWithTimeout(this.chatUrl(config), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: config.ollamaModel,
          messages,
          stream: true,
        }),
      });
      await assertOk(this.id, response, 'Ollama stream');
      let text = '';
      let usage: AiUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
      await parseJsonLines(response, (payload) => {
        const message = payload.message as { content?: string } | undefined;
        if (message?.content) {
          text += message.content;
          onDelta(message.content);
        }
        if (payload.done) usage = usageFrom(payload);
      });
      return { text, usage };
    } catch (error) {
      throw providerFetchError(this.id, error);
    }
  }

  async health(config: AiStoredConfig): Promise<AiProviderHealth> {
    let normalizedBaseUrl: string | undefined;
    try {
      normalizedBaseUrl = this.baseUrl(config);
      const models = await this.listModels(config);
      if (!models.ok) throw new AiProviderError(this.id, models.code ?? 'unknown', models.message ?? 'Ollama model discovery failed.');
      if (models.models.length > 0 && !models.models.some((model) => model.id === config.ollamaModel)) {
        throw new AiProviderError(this.id, 'model_missing', `Ollama model "${config.ollamaModel}" is not installed. Pull it in Ollama or choose an installed model.`);
      }
      return providerHealth(this.id, config.ollamaModel, undefined, normalizedBaseUrl);
    } catch (error) {
      return providerHealth(this.id, config.ollamaModel, error, normalizedBaseUrl);
    }
  }

  async listModels(config: AiStoredConfig): Promise<AiModelListResult> {
    let normalizedBaseUrl: string | undefined;
    try {
      normalizedBaseUrl = this.baseUrl(config);
      const response = await fetchWithTimeout(`${normalizedBaseUrl}/api/tags`);
      await assertOk(this.id, response, 'Ollama model discovery');
      const payload = await response.json() as { models?: Array<{ name?: string; model?: string }> };
      const models = (payload.models ?? [])
        .map((model) => model.name ?? model.model ?? '')
        .filter(Boolean)
        .map((id) => ({ id }));
      return { provider: this.id, ok: true, models, normalizedBaseUrl };
    } catch (error) {
      const normalized = providerFetchError(this.id, error);
      return {
        provider: this.id,
        ok: false,
        models: [],
        code: normalized.code,
        message: normalized.message,
        normalizedBaseUrl,
      };
    }
  }
}

export class OpenAICompatibleProvider implements AiProvider {
  readonly id = 'openai-compatible';

  private endpoint(config: AiStoredConfig): { baseUrl: string; apiKey?: string } {
    const preset = openAICompatiblePreset(config.openaiCompatiblePreset);
    const baseUrl = normalizeOpenAICompatibleBaseUrl(config.openaiCompatibleBaseUrl, preset.baseUrl ?? OPENAI_COMPATIBLE_FALLBACK_URL);
    const apiKey = decryptSecret(config.openaiCompatibleApiKeyEncrypted);
    if (preset.requiresApiKey && !apiKey) {
      throw new AiProviderError(this.id, 'not_configured', `${preset.label} API key is not configured.`);
    }
    return { baseUrl, apiKey };
  }

  async complete(messages: AiProviderMessage[], config: AiStoredConfig): Promise<AiProviderResult> {
    try {
      const endpoint = this.endpoint(config);
      if (!config.openaiCompatibleModel.trim()) {
        throw new AiProviderError(this.id, 'not_configured', 'Choose a model for this OpenAI-compatible endpoint.');
      }
      const response = await fetchWithTimeout(`${endpoint.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          ...authHeaders(endpoint.apiKey),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: config.openaiCompatibleModel,
          messages,
          stream: false,
        }),
      });
      await assertOk(this.id, response, 'OpenAI-compatible request');
      const payload = await response.json() as { usage?: unknown };
      return { text: extractChatCompletionText(payload), usage: usageFrom(payload.usage) };
    } catch (error) {
      throw providerFetchError(this.id, error);
    }
  }

  async stream(messages: AiProviderMessage[], config: AiStoredConfig, onDelta: (delta: string) => void): Promise<AiProviderResult> {
    try {
      const endpoint = this.endpoint(config);
      if (!config.openaiCompatibleModel.trim()) {
        throw new AiProviderError(this.id, 'not_configured', 'Choose a model for this OpenAI-compatible endpoint.');
      }
      const response = await fetchWithTimeout(`${endpoint.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          ...authHeaders(endpoint.apiKey),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: config.openaiCompatibleModel,
          messages,
          stream: true,
        }),
      });
      await assertOk(this.id, response, 'OpenAI-compatible stream');
      let text = '';
      let usage: AiUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
      await parseSse(response, (_event, data) => {
        const payload = JSON.parse(data) as {
          choices?: Array<{ delta?: { content?: string } }>;
          usage?: unknown;
        };
        const delta = payload.choices?.[0]?.delta?.content;
        if (delta) {
          text += delta;
          onDelta(delta);
        }
        if (payload.usage) usage = usageFrom(payload.usage);
      });
      return { text, usage };
    } catch (error) {
      throw providerFetchError(this.id, error);
    }
  }

  async health(config: AiStoredConfig): Promise<AiProviderHealth> {
    let normalizedBaseUrl: string | undefined;
    try {
      const endpoint = this.endpoint(config);
      normalizedBaseUrl = endpoint.baseUrl;
      const models = await this.listModels(config);
      if (!models.ok) throw new AiProviderError(this.id, models.code ?? 'unknown', models.message ?? 'Model discovery failed.');
      const targetModel = config.openaiCompatibleModel.trim();
      if (targetModel && models.models.length > 0 && !models.models.some((model) => model.id === targetModel)) {
        throw new AiProviderError(this.id, 'model_missing', `Model "${config.openaiCompatibleModel}" was not returned by this endpoint.`);
      }
      return providerHealth(this.id, config.openaiCompatibleModel, undefined, normalizedBaseUrl);
    } catch (error) {
      return providerHealth(this.id, config.openaiCompatibleModel, error, normalizedBaseUrl);
    }
  }

  async listModels(config: AiStoredConfig): Promise<AiModelListResult> {
    let normalizedBaseUrl: string | undefined;
    try {
      const endpoint = this.endpoint(config);
      normalizedBaseUrl = endpoint.baseUrl;
      const response = await fetchWithTimeout(`${endpoint.baseUrl}/models`, {
        headers: authHeaders(endpoint.apiKey),
      });
      await assertOk(this.id, response, 'OpenAI-compatible model discovery');
      const models = extractModelIds(await response.json()).map((id) => ({ id }));
      return { provider: this.id, ok: true, models, normalizedBaseUrl };
    } catch (error) {
      const normalized = providerFetchError(this.id, error);
      return {
        provider: this.id,
        ok: false,
        models: [],
        code: normalized.code,
        message: normalized.message,
        normalizedBaseUrl,
      };
    }
  }
}

const OPENAI_COMPATIBLE_FALLBACK_URL = 'http://localhost:1234/v1';
