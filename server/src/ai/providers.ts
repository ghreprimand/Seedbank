import {
  aiProviderLabel,
  type AiModelListResult,
  type AiOllamaDiagnostics,
  type AiOllamaLiveStatus,
  type AiOllamaModelCapabilities,
  type AiOllamaModelResidency,
  type AiProviderErrorCode,
  type AiProviderHealth,
  type AiProviderId,
} from '../../../shared/types.js';
import { decryptSecret } from './crypto.js';
import { openAICompatiblePreset } from './registry.js';
import type { AiProvider, AiProviderMessage, AiProviderResult, AiStoredConfig, AiUsage } from './types.js';

const REQUEST_TIMEOUT_MS = 8_000;
const OLLAMA_KEEP_ALIVE = '5m';
const OLLAMA_SMOKE_PROMPT = 'Reply with exactly: pong';

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

function boundedDetail(value: unknown, max = 240): string {
  if (value === null || value === undefined) return '';
  const text = String(value).replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function providerFetchError(provider: AiProviderId, error: unknown): AiProviderError {
  if (error instanceof AiProviderError) return error;
  if (error instanceof TypeError || (error instanceof Error && error.name === 'AbortError')) {
    return new AiProviderError(provider, 'unreachable', `${aiProviderLabel(provider)} is unreachable. Check the base URL and whether the service is running.`);
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

async function parseJsonLines(
  response: Response,
  onLine: (data: Record<string, unknown>) => void,
  options: { provider?: AiProviderId; context?: string } = {},
): Promise<void> {
  if (!response.body) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const parseLine = (raw: string) => {
    const line = raw.trim();
    if (!line) return;
    try {
      onLine(JSON.parse(line) as Record<string, unknown>);
    } catch (error) {
      if (options.provider) {
        throw new AiProviderError(
          options.provider,
          'parse_error',
          `${options.context ?? 'Response stream'} contained invalid JSON: ${boundedDetail(line, 160)}`,
        );
      }
      throw error;
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      buffer += decoder.decode();
      parseLine(buffer);
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      parseLine(line);
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

  private modelMatches(expected: string, candidate: string): boolean {
    const left = expected.trim().toLowerCase();
    const right = candidate.trim().toLowerCase();
    if (!left || !right) return false;
    if (left === right) return true;
    const leftBase = left.split(':')[0];
    const rightBase = right.split(':')[0];
    return leftBase === rightBase;
  }

  private chatBody(messages: AiProviderMessage[], config: AiStoredConfig, stream: boolean): Record<string, unknown> {
    return {
      model: config.ollamaModel,
      messages: messages.map((message) => ({ role: message.role, content: message.content })),
      stream,
      keep_alive: OLLAMA_KEEP_ALIVE,
      options: {},
      // `think` is intentionally omitted unless we add an explicit user setting.
    };
  }

  private parseContextWindow(parameters: unknown): number | undefined {
    if (typeof parameters !== 'string') return undefined;
    const match = /^\s*num_ctx\s+(\d+)\s*$/m.exec(parameters);
    if (!match) return undefined;
    const parsed = Number.parseInt(match[1], 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }

  private pickCapabilityWarning(capabilities: AiOllamaModelCapabilities): string | undefined {
    if (typeof capabilities.contextWindow === 'number' && capabilities.contextWindow < 2048) {
      return `Selected model context window (${capabilities.contextWindow}) is small and may truncate longer idea context.`;
    }
    if (!capabilities.thinking) {
      return 'Selected model does not advertise thinking capability; Thinking Partner quality may vary for deep reasoning prompts.';
    }
    return undefined;
  }

  private selectedModelResidency(model: string, loaded: Array<{ name: string; expiresAt: string | null }>): AiOllamaModelResidency {
    const hit = loaded.find((item) => this.modelMatches(model, item.name));
    if (!hit) return 'not-loaded';
    return hit.expiresAt ? 'idle' : 'resident';
  }

  private async readOllamaHttpError(
    response: Response,
    context: string,
    model: string,
    normalizedBaseUrl: string,
    endpoint: string,
  ): Promise<AiProviderError> {
    const detail = boundedDetail(await parseErrorBody(response));
    const code: AiProviderErrorCode = response.status === 404 ? 'model_missing' : 'http_error';
    return new AiProviderError(
      this.id,
      code,
      `${context} failed for model "${model}" at ${endpoint} (base: ${normalizedBaseUrl}, HTTP ${response.status}): ${detail || response.statusText}`,
      response.status,
    );
  }

  private wrapOllamaTransportError(
    error: unknown,
    context: string,
    model: string,
    normalizedBaseUrl: string,
    endpoint: string,
  ): AiProviderError {
    if (error instanceof AiProviderError) return error;
    if (error instanceof TypeError || (error instanceof Error && error.name === 'AbortError')) {
      const detail = error instanceof Error ? boundedDetail(error.message) : '';
      return new AiProviderError(
        this.id,
        'unreachable',
        `${context} failed for model "${model}" at ${endpoint} (base: ${normalizedBaseUrl}): service unreachable${detail ? ` (${detail})` : ''}.`,
      );
    }
    return new AiProviderError(
      this.id,
      'unknown',
      `${context} failed for model "${model}" at ${endpoint} (base: ${normalizedBaseUrl}): ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  private async requestChat(
    messages: AiProviderMessage[],
    config: AiStoredConfig,
    stream: boolean,
    context: string,
  ): Promise<Response> {
    const normalizedBaseUrl = this.baseUrl(config);
    const endpoint = `${normalizedBaseUrl}/api/chat`;
    try {
      const response = await fetchWithTimeout(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.chatBody(messages, config, stream)),
      });
      if (!response.ok) {
        throw await this.readOllamaHttpError(response, context, config.ollamaModel, normalizedBaseUrl, endpoint);
      }
      return response;
    } catch (error) {
      throw this.wrapOllamaTransportError(error, context, config.ollamaModel, normalizedBaseUrl, endpoint);
    }
  }

  private async probeModelCapabilities(
    normalizedBaseUrl: string,
    model: string,
  ): Promise<{ capabilities?: AiOllamaModelCapabilities; warning?: string; responseDetail?: string }> {
    const endpoint = `${normalizedBaseUrl}/api/show`;
    try {
      const response = await fetchWithTimeout(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, name: model }),
      });
      if (!response.ok) {
        return {
          warning: 'Could not inspect model capabilities from Ollama.',
          responseDetail: boundedDetail(await parseErrorBody(response)),
        };
      }
      const payload = await response.json() as { capabilities?: unknown; parameters?: unknown };
      const capabilityList = Array.isArray(payload.capabilities)
        ? payload.capabilities.filter((item): item is string => typeof item === 'string')
        : [];
      const capabilities: AiOllamaModelCapabilities = {
        tools: capabilityList.includes('tools'),
        vision: capabilityList.includes('vision'),
        thinking: capabilityList.includes('thinking'),
      };
      const contextWindow = this.parseContextWindow(payload.parameters);
      if (typeof contextWindow === 'number') capabilities.contextWindow = contextWindow;
      return {
        capabilities,
        warning: this.pickCapabilityWarning(capabilities),
      };
    } catch (error) {
      return {
        warning: 'Could not inspect model capabilities from Ollama.',
        responseDetail: boundedDetail(error instanceof Error ? error.message : String(error)),
      };
    }
  }

  private async probeDaemonLive(normalizedBaseUrl: string, model: string): Promise<AiOllamaLiveStatus> {
    const psEndpoint = `${normalizedBaseUrl}/api/ps`;
    const versionEndpoint = `${normalizedBaseUrl}/api/version`;
    try {
      const [psResponse, versionResponse] = await Promise.all([
        fetchWithTimeout(psEndpoint),
        fetchWithTimeout(versionEndpoint).catch(() => null),
      ]);
      if (!psResponse.ok) return { up: false };
      const psPayload = await psResponse.json() as { models?: Array<{ name?: string; expires_at?: string }> };
      const loaded = (psPayload.models ?? [])
        .filter((item): item is { name: string; expires_at?: string } => typeof item?.name === 'string' && item.name.length > 0)
        .map((item) => ({ name: item.name, expiresAt: typeof item.expires_at === 'string' ? item.expires_at : null }));
      let version: string | undefined;
      if (versionResponse && versionResponse.ok) {
        try {
          const versionPayload = await versionResponse.json() as { version?: unknown };
          if (typeof versionPayload.version === 'string' && versionPayload.version.trim()) {
            version = versionPayload.version.trim();
          }
        } catch {
          // Ignore malformed version payloads and keep status best-effort.
        }
      }
      return {
        up: true,
        ...(version ? { version } : {}),
        ...(loaded[0] ? { loadedModel: loaded[0].name } : {}),
        selectedModelResidency: this.selectedModelResidency(model, loaded),
      };
    } catch {
      return { up: false };
    }
  }

  async complete(messages: AiProviderMessage[], config: AiStoredConfig): Promise<AiProviderResult> {
    try {
      const response = await this.requestChat(messages, config, false, 'Ollama request');
      const payload = await response.json() as { message?: { content?: string }; prompt_eval_count?: number; eval_count?: number };
      return {
        text: payload.message?.content ?? '',
        usage: usageFrom(payload),
      };
    } catch (error) {
      if (error instanceof AiProviderError) throw error;
      throw providerFetchError(this.id, error);
    }
  }

  async stream(messages: AiProviderMessage[], config: AiStoredConfig, onDelta: (delta: string) => void): Promise<AiProviderResult> {
    try {
      const response = await this.requestChat(messages, config, true, 'Ollama stream');
      let text = '';
      let usage: AiUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
      await parseJsonLines(response, (payload) => {
        const message = payload.message as { content?: string } | undefined;
        if (message?.content) {
          text += message.content;
          onDelta(message.content);
        }
        if (payload.done) usage = usageFrom(payload);
      }, { provider: this.id, context: 'Ollama stream response' });
      return { text, usage };
    } catch (error) {
      if (error instanceof AiProviderError) throw error;
      throw providerFetchError(this.id, error);
    }
  }

  async health(config: AiStoredConfig): Promise<AiProviderHealth> {
    let normalizedBaseUrl = '';
    try {
      normalizedBaseUrl = this.baseUrl(config);
      const models = await this.listModels(config);
      if (!models.ok) throw new AiProviderError(this.id, models.code ?? 'unknown', models.message ?? 'Ollama model discovery failed.');
      if (models.models.length > 0 && !models.models.some((model) => this.modelMatches(model.id, config.ollamaModel))) {
        throw new AiProviderError(this.id, 'model_missing', `Ollama model "${config.ollamaModel}" is not installed. Pull it in Ollama or choose an installed model.`);
      }

      // Smoke test: verify model can generate from /api/chat, not only list tags.
      const smokeResponse = await this.requestChat(
        [{ role: 'user', content: OLLAMA_SMOKE_PROMPT }],
        config,
        false,
        'Ollama generation smoke test',
      );
      const smokePayload = await smokeResponse.json() as { message?: { content?: string } };
      if (!smokePayload.message?.content?.trim()) {
        throw new AiProviderError(
          this.id,
          'http_error',
          `Ollama generation smoke test returned an empty response for model "${config.ollamaModel}" at ${normalizedBaseUrl}/api/chat.`,
        );
      }

      const [modelMeta, live] = await Promise.all([
        this.probeModelCapabilities(normalizedBaseUrl, config.ollamaModel),
        this.probeDaemonLive(normalizedBaseUrl, config.ollamaModel),
      ]);
      const diagnostics: AiOllamaDiagnostics = {
        endpoint: `${normalizedBaseUrl}/api/chat`,
        ...(modelMeta.responseDetail ? { responseDetail: modelMeta.responseDetail } : {}),
        ...(modelMeta.warning ? { capabilityWarning: modelMeta.warning } : {}),
        ...(modelMeta.capabilities ? { modelCapabilities: modelMeta.capabilities } : {}),
        live,
      };
      return {
        provider: this.id,
        ok: true,
        code: 'ok',
        message: 'Connection and generation smoke test succeeded.',
        model: config.ollamaModel,
        normalizedBaseUrl,
        ollama: diagnostics,
      };
    } catch (error) {
      const normalized = providerFetchError(this.id, error);
      return {
        provider: this.id,
        ok: false,
        code: normalized.code,
        message: normalized.message,
        status: normalized.status,
        model: config.ollamaModel,
        normalizedBaseUrl: normalizedBaseUrl || undefined,
        ollama: {
          endpoint: normalizedBaseUrl ? `${normalizedBaseUrl}/api/chat` : undefined,
        },
      };
    }
  }

  async listModels(config: AiStoredConfig): Promise<AiModelListResult> {
    let normalizedBaseUrl = '';
    try {
      normalizedBaseUrl = this.baseUrl(config);
      const response = await fetchWithTimeout(`${normalizedBaseUrl}/api/tags`);
      if (!response.ok) {
        throw await this.readOllamaHttpError(
          response,
          'Ollama model discovery',
          config.ollamaModel,
          normalizedBaseUrl,
          `${normalizedBaseUrl}/api/tags`,
        );
      }
      const payload = await response.json() as { models?: Array<{ name?: string; model?: string }> };
      const modelIds = (payload.models ?? [])
        .map((model) => model.name ?? model.model ?? '')
        .filter(Boolean);
      const capabilityEntries = await Promise.all(
        modelIds.map(async (id) => ({
          id,
          meta: await this.probeModelCapabilities(normalizedBaseUrl, id),
        })),
      );
      const models = capabilityEntries.map((entry) => ({
        id: entry.id,
        ...(entry.meta.capabilities ? { capabilities: entry.meta.capabilities } : {}),
      }));
      const selectedMeta = capabilityEntries.find((entry) => this.modelMatches(config.ollamaModel, entry.id))?.meta;
      const live = await this.probeDaemonLive(normalizedBaseUrl, config.ollamaModel);
      return {
        provider: this.id,
        ok: true,
        models,
        normalizedBaseUrl,
        ollama: {
          endpoint: `${normalizedBaseUrl}/api/tags`,
          ...(selectedMeta?.responseDetail ? { responseDetail: selectedMeta.responseDetail } : {}),
          ...(selectedMeta?.warning ? { capabilityWarning: selectedMeta.warning } : {}),
          ...(selectedMeta?.capabilities ? { modelCapabilities: selectedMeta.capabilities } : {}),
          live,
        },
      };
    } catch (error) {
      const normalized = error instanceof AiProviderError
        ? error
        : (normalizedBaseUrl
          ? this.wrapOllamaTransportError(
            error,
            'Ollama model discovery',
            config.ollamaModel,
            normalizedBaseUrl,
            `${normalizedBaseUrl}/api/tags`,
          )
          : providerFetchError(this.id, error));
      const endpoint = normalizedBaseUrl ? `${normalizedBaseUrl}/api/tags` : undefined;
      return {
        provider: this.id,
        ok: false,
        models: [],
        code: normalized.code,
        message: normalized.message,
        normalizedBaseUrl: normalizedBaseUrl || undefined,
        ollama: endpoint ? { endpoint } : undefined,
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
        throw new AiProviderError(this.id, 'not_configured', 'Choose a model for this custom endpoint.');
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
      await assertOk(this.id, response, 'Custom endpoint request');
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
        throw new AiProviderError(this.id, 'not_configured', 'Choose a model for this custom endpoint.');
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
      await assertOk(this.id, response, 'Custom endpoint stream');
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
      await assertOk(this.id, response, 'Custom endpoint model discovery');
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
