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
import { localOpenAICompatiblePreset, openAICompatiblePreset } from './registry.js';
import type { AiProvider, AiProviderCompleteOptions, AiProviderMessage, AiProviderResult, AiStoredConfig, AiUsage } from './types.js';

const REQUEST_TIMEOUT_MS = 8_000;
const OLLAMA_REQUEST_TIMEOUT_MS = 120_000;
const CLAUDE_ACCOUNT_REQUEST_TIMEOUT_MS = 120_000;
const OLLAMA_KEEP_ALIVE = '5m';
const OLLAMA_SMOKE_PROMPT = 'Reply with exactly: pong';
const CLAUDE_ACCOUNT_BETA_HEADER = 'claude-code-20250219,oauth-2025-04-20';
const CLAUDE_CONTEXT_MANAGEMENT_BETA = 'context-management-2025-06-27';
const CLAUDE_COMPACT_BETA = 'compact-2026-01-12';
const CLAUDE_ACCOUNT_USER_AGENT = 'claude-cli/2.1.75';
const CLAUDE_ACCOUNT_RETRY_BACKOFF_MS = [15_000, 30_000];
const CLAUDE_INTERLEAVED_THINKING_BETA = 'interleaved-thinking-2025-05-14';
const CLAUDE_CODE_FORCED_SYSTEM_BLOCK = "You are Claude Code, Anthropic's official CLI for Claude.";
const CLAUDE_ADAPTIVE_MAX_TOKENS_BY_EFFORT: Record<'low' | 'medium' | 'high', number> = {
  low: 8_192,
  medium: 16_384,
  high: 32_000,
};

export class AiProviderError extends Error {
  readonly statusCode?: number;

  constructor(
    readonly provider: AiProviderId,
    readonly code: AiProviderErrorCode,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'AiProviderError';
    this.statusCode = status ? providerStatusCode(status) : undefined;
  }
}

function providerStatusCode(status: number): number {
  if (status === 404) return 400;
  if (status === 429) return 429;
  if (status >= 400 && status < 500) return status;
  if (status >= 500) return 502;
  return 500;
}

function systemPrompt(messages: AiProviderMessage[]): string {
  return messages.filter((message) => message.role === 'system').map((message) => message.content).join('\n\n');
}

function claudeSystemBlocks(messages: AiProviderMessage[]): Array<{ type: 'text'; text: string }> {
  const blocks = [{ type: 'text' as const, text: CLAUDE_CODE_FORCED_SYSTEM_BLOCK }];
  const prompt = systemPrompt(messages).trim();
  if (prompt) blocks.push({ type: 'text' as const, text: prompt });
  return blocks;
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

async function fetchWithTimeout(url: string, init?: RequestInit, timeoutMs = REQUEST_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryAfterMs(response: Response): number | undefined {
  const raw = response.headers.get('retry-after');
  if (!raw) return undefined;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const dateMs = Date.parse(raw);
  if (Number.isFinite(dateMs)) return Math.max(0, dateMs - Date.now());
  return undefined;
}

function isClaudeAccountRetryable(response: Response): boolean {
  return response.status === 429 || response.status === 529 || response.status === 500;
}

async function fetchClaudeAccountWithRetry(url: string, init: RequestInit): Promise<Response> {
  for (let attempt = 0; ; attempt += 1) {
    const response = await fetchWithTimeout(url, init, CLAUDE_ACCOUNT_REQUEST_TIMEOUT_MS);
    if (!isClaudeAccountRetryable(response) || attempt >= CLAUDE_ACCOUNT_RETRY_BACKOFF_MS.length) {
      return response;
    }
    await response.arrayBuffer().catch(() => undefined);
    const serverDelay = retryAfterMs(response);
    const delayMs = serverDelay !== undefined
      ? Math.min(Math.max(serverDelay, 0), 60_000)
      : CLAUDE_ACCOUNT_RETRY_BACKOFF_MS[attempt];
    console.warn(`[claude-account] ${response.status} from Anthropic; retrying in ${Math.round(delayMs / 1000)}s (${attempt + 1}/${CLAUDE_ACCOUNT_RETRY_BACKOFF_MS.length})`);
    await sleep(delayMs);
  }
}

function supportsClaudeAdaptiveThinking(model: string): boolean {
  return model.includes('opus-4-6')
    || model.includes('opus-4.6')
    || model.includes('opus-4-7')
    || model.includes('opus-4.7')
    || model.includes('sonnet-4-6')
    || model.includes('sonnet-4.6');
}

async function parseErrorBody(response: Response): Promise<string> {
  // Read as text first — response.json() consumes the body stream and its
  // parse failure leaves body.bodyUsed === true, making a subsequent text()
  // call fail. Reading text first, then JSON.parse-ing, avoids that race.
  try {
    const text = await response.text();
    const trimmed = text.trim();
    if (!trimmed) return response.statusText || 'Provider request failed.';
    // HTML error pages (nginx, CloudFlare, etc.) should not be forwarded raw.
    if (trimmed.startsWith('<')) {
      return 'Provider returned an HTML error page — check the base URL and endpoint configuration.';
    }
    // Try structured JSON extraction.
    try {
      const body = JSON.parse(trimmed) as { error?: unknown; message?: unknown };
      if (typeof body.error === 'string') return body.error;
      if (typeof body.message === 'string') return body.message;
      if (body.error && typeof body.error === 'object' && 'message' in body.error) {
        const message = (body.error as { message?: unknown }).message;
        if (typeof message === 'string') return message;
      }
    } catch {
      // Not JSON — fall through to bounded raw text.
    }
    return boundedDetail(trimmed);
  } catch {
    return response.statusText || 'Provider request failed.';
  }
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
  if (response.status === 429) {
    const providerLabel = aiProviderLabel(provider);
    const providerDetail = detail && detail !== 'Error' ? ` Provider detail: ${detail}` : '';
    throw new AiProviderError(
      provider,
      code,
      `${context} failed: ${providerLabel} rate or usage limit was reached. Wait and retry, lower effort/model for this feature, or route it to another provider.${providerDetail}`,
      response.status,
    );
  }
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

function normalizeOpenAICompatibleV1BaseUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  const pathname = url.pathname.replace(/\/+$/, '');
  if (!/\/v1$/i.test(pathname)) {
    url.pathname = pathname ? `${pathname}/v1` : '/v1';
  } else {
    url.pathname = pathname;
  }
  return url.toString().replace(/\/$/, '');
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

  private supportsReasoningEffort(model: string): boolean {
    const normalized = model.trim().toLowerCase();
    return normalized.startsWith('gpt-5')
      || /^o[1-9](?:[-_.]|$)/.test(normalized);
  }

  private supportsTextVerbosity(model: string): boolean {
    const normalized = model.trim().toLowerCase();
    return normalized.startsWith('gpt-5');
  }

  private selectedEffort(config: AiStoredConfig): 'minimal' | 'low' | 'medium' | 'high' | undefined {
    const candidate = (config as AiStoredConfig & {
      openaiReasoningEffort?: unknown;
      reasoningEffort?: unknown;
      effort?: unknown;
    }).openaiReasoningEffort
      ?? (config as AiStoredConfig & { reasoningEffort?: unknown }).reasoningEffort
      ?? (config as AiStoredConfig & { effort?: unknown }).effort;
    if (typeof candidate !== 'string') return undefined;
    const normalized = candidate.trim().toLowerCase();
    if (normalized === 'minimal' || normalized === 'low' || normalized === 'medium' || normalized === 'high') {
      return normalized;
    }
    return undefined;
  }

  private selectedVerbosity(config: AiStoredConfig): 'low' | 'medium' | 'high' | undefined {
    const candidate = (config as AiStoredConfig & {
      openaiTextVerbosity?: unknown;
      textVerbosity?: unknown;
      verbosity?: unknown;
    }).openaiTextVerbosity
      ?? (config as AiStoredConfig & { textVerbosity?: unknown }).textVerbosity
      ?? (config as AiStoredConfig & { verbosity?: unknown }).verbosity;
    if (typeof candidate !== 'string') return undefined;
    const normalized = candidate.trim().toLowerCase();
    if (normalized === 'low' || normalized === 'medium' || normalized === 'high') return normalized;
    return undefined;
  }

  private fieldSuggestionFormat(): Record<string, unknown> {
    return {
      type: 'json_schema',
      name: 'field_suggestion_v1',
      strict: true,
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['suggestion', 'rationale'],
        properties: {
          suggestion: { type: 'string' },
          rationale: { type: 'string' },
        },
      },
    };
  }

  private responsesBody(
    messages: AiProviderMessage[],
    config: AiStoredConfig,
    stream = false,
    options: AiProviderCompleteOptions = {},
  ): Record<string, unknown> {
    const model = config.openaiModel;
    const effort = this.supportsReasoningEffort(model) ? this.selectedEffort(config) : undefined;
    const verbosity = this.supportsTextVerbosity(model) ? this.selectedVerbosity(config) : undefined;
    const text: Record<string, unknown> = {
      ...(verbosity ? { verbosity } : {}),
      ...(options.responseFormat?.kind === 'field_suggestion_v1' ? { format: this.fieldSuggestionFormat() } : {}),
    };
    return {
      model,
      instructions: systemPrompt(messages),
      input: transcript(messages),
      ...(effort ? { reasoning: { effort } } : {}),
      ...(Object.keys(text).length ? { text } : {}),
      ...(stream ? { stream: true } : {}),
    };
  }

  private apiKey(config: AiStoredConfig): string {
    const apiKey = decryptSecret(config.openaiApiKeyEncrypted);
    if (!apiKey) throw new AiProviderError(this.id, 'not_configured', 'OpenAI API key is not configured.');
    return apiKey;
  }

  async complete(
    messages: AiProviderMessage[],
    config: AiStoredConfig,
    options: AiProviderCompleteOptions = {},
  ): Promise<AiProviderResult> {
    try {
      const response = await fetchWithTimeout('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey(config)}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(this.responsesBody(messages, config, false, options)),
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
        body: JSON.stringify(this.responsesBody(messages, config, true)),
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

  private selectedEffort(config: AiStoredConfig): 'low' | 'medium' | 'high' | undefined {
    const effort = config.claudeReasoningEffort;
    return effort === 'low' || effort === 'medium' || effort === 'high' ? effort : undefined;
  }

  private body(messages: AiProviderMessage[], config: AiStoredConfig, stream = false) {
    const effort = this.selectedEffort(config);
    return {
      model: config.anthropicModel,
      max_tokens: 800,
      system: systemPrompt(messages),
      messages: messages.filter((message) => message.role !== 'system').map((message) => ({
        role: message.role,
        content: message.content,
      })),
      ...(effort ? { output_config: { effort } } : {}),
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
    timeoutMs: number,
  ): AiProviderError {
    if (error instanceof AiProviderError) return error;
    if (error instanceof Error && error.name === 'AbortError') {
      return new AiProviderError(
        this.id,
        'unreachable',
        `${context} timed out for model "${model}" at ${endpoint} (base: ${normalizedBaseUrl}) after ${Math.floor(timeoutMs / 1000)}s. Try a smaller/faster model or retry.`,
      );
    }
    if (error instanceof TypeError) {
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
    timeoutMs = OLLAMA_REQUEST_TIMEOUT_MS,
  ): Promise<Response> {
    const normalizedBaseUrl = this.baseUrl(config);
    const endpoint = `${normalizedBaseUrl}/api/chat`;
    try {
      const response = await fetchWithTimeout(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.chatBody(messages, config, stream)),
      }, timeoutMs);
      if (!response.ok) {
        throw await this.readOllamaHttpError(response, context, config.ollamaModel, normalizedBaseUrl, endpoint);
      }
      return response;
    } catch (error) {
      throw this.wrapOllamaTransportError(error, context, config.ollamaModel, normalizedBaseUrl, endpoint, timeoutMs);
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
      const normalizeExpiresAt = (value: string | undefined): string | null => {
        if (!value) return null;
        const trimmed = value.trim();
        if (!trimmed) return null;
        // Ollama uses an all-zero timestamp when no unload timer is set.
        if (trimmed === '0001-01-01T00:00:00Z') return null;
        return trimmed;
      };
      const loaded = (psPayload.models ?? [])
        .filter((item): item is { name: string; expires_at?: string } => typeof item?.name === 'string' && item.name.length > 0)
        .map((item) => ({ name: item.name, expiresAt: normalizeExpiresAt(item.expires_at) }));
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
      // Use streamed /api/chat even for non-streaming callers so long local
      // generations don't hit the short "full body" HTTP timeout.
      const response = await this.requestChat(messages, config, true, 'Ollama request');
      let text = '';
      let usage: AiUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
      await parseJsonLines(response, (payload) => {
        const message = payload.message as { content?: string } | undefined;
        if (message?.content) text += message.content;
        if (payload.done) usage = usageFrom(payload);
      }, { provider: this.id, context: 'Ollama request response' });
      return { text, usage };
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
    let modelList: AiModelListResult | undefined;
    try {
      normalizedBaseUrl = this.baseUrl(config);
      modelList = await this.listModels(config);
      if (!modelList.ok) throw new AiProviderError(this.id, modelList.code ?? 'unknown', modelList.message ?? 'Ollama model discovery failed.');
      if (modelList.models.length > 0 && !modelList.models.some((model) => this.modelMatches(model.id, config.ollamaModel))) {
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

      const selectedModel = modelList.models.find((model) => this.modelMatches(config.ollamaModel, model.id));
      const diagnostics: AiOllamaDiagnostics = {
        endpoint: `${normalizedBaseUrl}/api/chat`,
        ...(modelList.ollama?.responseDetail ? { responseDetail: modelList.ollama.responseDetail } : {}),
        ...(modelList.ollama?.capabilityWarning ? { capabilityWarning: modelList.ollama.capabilityWarning } : {}),
        ...(selectedModel?.capabilities ? { modelCapabilities: selectedModel.capabilities } : {}),
        ...(modelList.ollama?.live ? { live: modelList.ollama.live } : {}),
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
          ...(modelList?.ollama?.responseDetail ? { responseDetail: modelList.ollama.responseDetail } : {}),
          ...(modelList?.ollama?.capabilityWarning ? { capabilityWarning: modelList.ollama.capabilityWarning } : {}),
          ...(modelList?.ollama?.modelCapabilities ? { modelCapabilities: modelList.ollama.modelCapabilities } : {}),
          ...(modelList?.ollama?.live ? { live: modelList.ollama.live } : {}),
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
            REQUEST_TIMEOUT_MS,
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

export class ClaudeAccountProvider implements AiProvider {
  readonly id = 'claude-account';

  private configuredModel(config: AiStoredConfig): string {
    return config.claudeAccountModel?.trim() || 'claude-sonnet-4-6';
  }

  private selectedEffort(config: AiStoredConfig): 'low' | 'medium' | 'high' | undefined {
    const effort = config.claudeReasoningEffort;
    return effort === 'low' || effort === 'medium' || effort === 'high' ? effort : undefined;
  }

  private async resolvedModel(config: AiStoredConfig): Promise<string> {
    const { resolveClaudeAccountModel } = await import('./claude-account/catalog.js');
    return await resolveClaudeAccountModel(this.configuredModel(config));
  }

  private claudeAccountHeaders(accessToken: string, betaHeaders: string[] = []): Record<string, string> {
    return {
      Authorization: `Bearer ${accessToken}`,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': [CLAUDE_ACCOUNT_BETA_HEADER, ...betaHeaders].join(','),
      'user-agent': CLAUDE_ACCOUNT_USER_AGENT,
      'x-app': 'cli',
      'Content-Type': 'application/json',
    };
  }

  private async claudeNativeOptions(model: string, config: AiStoredConfig): Promise<{ betaHeaders: string[]; body: Record<string, unknown> }> {
    const body: Record<string, unknown> = {
      cache_control: { type: 'ephemeral' },
    };
    const betaHeaders: string[] = [];
    if (supportsClaudeAdaptiveThinking(model)) betaHeaders.push(CLAUDE_INTERLEAVED_THINKING_BETA);

    let modelMeta: Awaited<ReturnType<typeof import('./claude-account/catalog.js').getCatalog>>['models'][number] | undefined;
    try {
      const { getCatalog } = await import('./claude-account/catalog.js');
      const catalog = await getCatalog();
      modelMeta = catalog.models.find((item) => (
        item.id === model
        || item.friendlyAlias === model
        || item.aliases?.includes(model)
      ));
    } catch {
      return { betaHeaders, body };
    }

    if (config.claudeAccountCompact === false) return { betaHeaders, body };

    const supportsCompact = modelMeta?.supportsCompact === true;
    const supportsContextManagement = modelMeta?.supportsContextManagement === true || supportsCompact;
    if (!supportsContextManagement) return { betaHeaders, body };

    betaHeaders.push(CLAUDE_CONTEXT_MANAGEMENT_BETA);
    if (supportsCompact) betaHeaders.push(CLAUDE_COMPACT_BETA);
    body.context_management = {
      edits: [
        { type: 'clear_thinking_20251015' },
        { type: 'clear_tool_uses_20250919' },
        ...(supportsCompact ? [{ type: 'compact_20260112' }] : []),
      ],
    };
    return { betaHeaders, body };
  }

  private async body(messages: AiProviderMessage[], config: AiStoredConfig, stream = false): Promise<{ betaHeaders: string[]; body: Record<string, unknown> }> {
    const model = await this.resolvedModel(config);
    const options = await this.claudeNativeOptions(model, config);
    const effort = this.selectedEffort(config) ?? (supportsClaudeAdaptiveThinking(model) ? 'high' : undefined);
    const adaptiveThinking = effort && supportsClaudeAdaptiveThinking(model);
    return {
      betaHeaders: options.betaHeaders,
      body: {
        model,
        max_tokens: adaptiveThinking ? CLAUDE_ADAPTIVE_MAX_TOKENS_BY_EFFORT[effort] : 800,
        system: claudeSystemBlocks(messages),
        messages: messages.filter((m) => m.role !== 'system').map((m) => ({
          role: m.role,
          content: m.content,
        })),
        ...(adaptiveThinking ? { thinking: { type: 'adaptive', display: 'summarized' } } : {}),
        ...(effort ? { output_config: { effort } } : {}),
        ...options.body,
        ...(stream ? { stream: true } : {}),
      },
    };
  }

  private async mapClaudeAuthError(error: unknown): Promise<AiProviderError> {
    const { ClaudeAccountNoAuthError, ClaudeAccountRefreshError, ClaudeAccountScopeError } = await import('./claude-account/oauth.js');
    if (error instanceof ClaudeAccountNoAuthError) {
      return new AiProviderError(
        this.id,
        'not_configured',
        'Claude account is not logged in. Open Settings → AI & Agents and click "Log in with Claude" to authenticate.',
      );
    }
    if (error instanceof ClaudeAccountScopeError) {
      return new AiProviderError(
        this.id,
        'not_configured',
        `Claude account login is missing the ${error.missingScopes.join(', ')} scope. Reconnect your Claude account from Settings → AI & Agents.`,
      );
    }
    if (error instanceof ClaudeAccountRefreshError) {
      if (typeof error.status === 'number') {
        return new AiProviderError(
          this.id,
          'http_error',
          `Claude account token refresh failed (${error.status}). Reconnect your Claude account.`,
          error.status,
        );
      }
      return new AiProviderError(
        this.id,
        'unreachable',
        `Claude account token refresh failed. ${boundedDetail(error.message || 'Check your network and retry login.')}`,
      );
    }
    return providerFetchError(this.id, error);
  }

  private async requireTokens(): Promise<string> {
    try {
      const { ensureLiveTokens } = await import('./claude-account/oauth.js');
      const tokens = await ensureLiveTokens();
      return tokens.accessToken;
    } catch (error) {
      throw await this.mapClaudeAuthError(error);
    }
  }

  async complete(messages: AiProviderMessage[], config: AiStoredConfig): Promise<AiProviderResult> {
    const accessToken = await this.requireTokens();
    const { betaHeaders, body } = await this.body(messages, config);
    try {
      const response = await fetchClaudeAccountWithRetry('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: this.claudeAccountHeaders(accessToken, betaHeaders),
        body: JSON.stringify(body),
      });
      await assertOk(this.id, response, 'Claude account request');
      const payload = await response.json() as {
        content?: Array<{ text?: string }>;
        usage?: { input_tokens?: number; output_tokens?: number };
      };
      const inputTokens = payload.usage?.input_tokens ?? 0;
      const outputTokens = payload.usage?.output_tokens ?? 0;
      return {
        text: payload.content?.map((c) => c.text ?? '').join('') ?? '',
        usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
      };
    } catch (error) {
      throw providerFetchError(this.id, error);
    }
  }

  async stream(
    messages: AiProviderMessage[],
    config: AiStoredConfig,
    onDelta: (delta: string) => void,
  ): Promise<AiProviderResult> {
    const accessToken = await this.requireTokens();
    const { betaHeaders, body } = await this.body(messages, config, true);
    try {
      const response = await fetchClaudeAccountWithRetry('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: this.claudeAccountHeaders(accessToken, betaHeaders),
        body: JSON.stringify(body),
      });
      await assertOk(this.id, response, 'Claude account stream');
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
    const requestedModel = this.configuredModel(config);
    try {
      // Health requires live auth — unauthenticated is not_configured, not healthy.
      await this.requireTokens();
      const model = await this.resolvedModel(config);
      const models = await this.listModels(config);
      if (!models.ok) {
        throw new AiProviderError(this.id, models.code ?? 'unknown', models.message ?? 'Claude account model discovery failed.');
      }
      if (models.models.length > 0 && !models.models.some((m) => m.id === model)) {
        throw new AiProviderError(this.id, 'model_missing', `Claude account model "${requestedModel}" resolved to "${model}", but that model was not returned by the model catalog.`);
      }
      return { ...providerHealth(this.id, model), requestedModel, resolvedModelId: model };
    } catch (error) {
      return providerHealth(this.id, requestedModel, error);
    }
  }

  async listModels(_config: AiStoredConfig): Promise<AiModelListResult> {
    try {
      const { ensureLiveTokens } = await import('./claude-account/oauth.js');
      await ensureLiveTokens();
      const { getCatalog } = await import('./claude-account/catalog.js');
      const catalog = await getCatalog();
      return {
        provider: this.id,
        ok: true,
        models: catalog.models.map((m) => ({
          id: m.id,
          ...(m.friendlyAlias ? { name: m.friendlyAlias } : {}),
          displayName: m.friendlyAlias ?? m.displayName,
          capabilities: {
            tools: false,
            vision: m.supportsVision === true,
            thinking: m.supportsThinking === true || Boolean(m.supportedReasoningEfforts?.length),
            ...(typeof m.maxInputTokens === 'number' ? { contextWindow: m.maxInputTokens } : {}),
            ...(m.supportsContextManagement !== undefined ? { contextManagement: m.supportsContextManagement } : {}),
            ...(m.supportsCompact !== undefined ? { compact: m.supportsCompact } : {}),
            ...(m.supportsPromptCaching !== undefined ? { promptCaching: m.supportsPromptCaching } : {}),
          },
        })),
        claudeAccount: { authenticated: true, catalogFresh: catalog.fresh },
      };
    } catch (error) {
      const { ClaudeAccountNoAuthError } = await import('./claude-account/oauth.js');
      if (error instanceof ClaudeAccountNoAuthError) {
        const { getBundledModels } = await import('./claude-account/catalog.js');
        const bundled = getBundledModels();
        return {
          provider: this.id,
          ok: true,
          models: bundled.map((m) => ({
            id: m.id,
            displayName: m.friendlyAlias ?? m.displayName,
          })),
          claudeAccount: { authenticated: false, catalogFresh: false },
        };
      }
      const normalized = await this.mapClaudeAuthError(error);
      return {
        provider: this.id,
        ok: false,
        models: [],
        code: normalized.code,
        message: normalized.message,
      };
    }
  }
}

export class CodexAccountProvider implements AiProvider {
  readonly id = 'codex-account';

  private configuredModel(config: AiStoredConfig): string {
    return config.codexAccountModel?.trim() || 'codex-recommended';
  }

  private configuredEffort(config: AiStoredConfig): 'minimal' | 'low' | 'medium' | 'high' | undefined {
    const effort = config.codexReasoningEffort;
    return effort === 'minimal' || effort === 'low' || effort === 'medium' || effort === 'high'
      ? effort
      : undefined;
  }

  private async runtimeAvailability(): Promise<{ available: boolean; reason?: string }> {
    const { codexAccountRuntimeAvailability } = await import('./codex-account/session.js');
    return codexAccountRuntimeAvailability();
  }

  async complete(messages: AiProviderMessage[], config: AiStoredConfig): Promise<AiProviderResult> {
    try {
      const availability = await this.runtimeAvailability();
      if (!availability.available) {
        throw new AiProviderError(
          this.id,
          'not_configured',
          availability.reason ?? 'Codex account app-server is unavailable.',
        );
      }
      const { codexAccountSession } = await import('./codex-account/session.js');
      const status = await codexAccountSession.status();
      if (!status.authenticated) {
        throw new AiProviderError(
          this.id,
          'not_configured',
          'Codex account is not logged in. Open Settings → AI & Agents and use the Codex account card to log in.',
        );
      }
      return await codexAccountSession.complete(messages, this.configuredModel(config), undefined, this.configuredEffort(config));
    } catch (error) {
      throw providerFetchError(this.id, error);
    }
  }

  async stream(
    messages: AiProviderMessage[],
    config: AiStoredConfig,
    onDelta: (delta: string) => void,
  ): Promise<AiProviderResult> {
    try {
      const availability = await this.runtimeAvailability();
      if (!availability.available) {
        throw new AiProviderError(
          this.id,
          'not_configured',
          availability.reason ?? 'Codex account app-server is unavailable.',
        );
      }
      const { codexAccountSession } = await import('./codex-account/session.js');
      const status = await codexAccountSession.status();
      if (!status.authenticated) {
        throw new AiProviderError(
          this.id,
          'not_configured',
          'Codex account is not logged in. Open Settings → AI & Agents and use the Codex account card to log in.',
        );
      }
      return await codexAccountSession.complete(messages, this.configuredModel(config), onDelta, this.configuredEffort(config));
    } catch (error) {
      throw providerFetchError(this.id, error);
    }
  }

  async health(config: AiStoredConfig): Promise<AiProviderHealth> {
    const model = this.configuredModel(config);
    try {
      const availability = await this.runtimeAvailability();
      if (!availability.available) {
        throw new AiProviderError(
          this.id,
          'not_configured',
          availability.reason ?? 'Codex account app-server is unavailable.',
        );
      }
      const { codexAccountSession } = await import('./codex-account/session.js');
      const status = await codexAccountSession.status();
      if (!status.authenticated) {
        throw new AiProviderError(
          this.id,
          'not_configured',
          'Codex account is not logged in. Log in with Codex before testing this provider.',
        );
      }
      const resolvedModel = await codexAccountSession.resolveModel(model);
      return providerHealth(this.id, resolvedModel);
    } catch (error) {
      return providerHealth(this.id, model, error);
    }
  }

  async listModels(_config: AiStoredConfig): Promise<AiModelListResult> {
    try {
      const availability = await this.runtimeAvailability();
      if (!availability.available) {
        return {
          provider: this.id,
          ok: false,
          models: [],
          code: 'not_configured',
          message: availability.reason ?? 'Codex account app-server is unavailable.',
          codexAccount: {
            authenticated: false,
            catalogFresh: false,
            available: false,
            ...(availability.reason ? { unavailableReason: availability.reason } : {}),
          },
        };
      }
      const { codexAccountSession } = await import('./codex-account/session.js');
      const [status, catalog] = await Promise.all([
        codexAccountSession.status().catch(() => ({
          authenticated: false,
          available: true,
          unavailableReason: undefined,
          accountEmail: undefined,
          planType: undefined,
        })),
        codexAccountSession.listModels(),
      ]);
      const visible = catalog.models.filter((model) => !model.hidden);
      const defaultModel = visible.find((model) => model.isDefault) ?? visible[0];
      const fastModel = visible.find((model) => /mini|fast/i.test(`${model.id} ${model.displayName}`));
      const toCapabilities = (model: (typeof visible)[number] | undefined) => model
        ? {
            tools: false,
            vision: model.supportsImage === true,
            thinking: Boolean(model.defaultReasoningEffort || model.supportedReasoningEfforts?.length),
            ...(typeof model.contextWindow === 'number' ? { contextWindow: model.contextWindow } : {}),
          }
        : undefined;
      const models = [
        ...(defaultModel ? [{
          id: 'codex-recommended',
          displayName: `Recommended (${defaultModel.displayName} · ${defaultModel.id})`,
          capabilities: toCapabilities(defaultModel),
        }] : []),
        ...(fastModel && fastModel.id !== defaultModel?.id ? [{
          id: 'codex-fast',
          displayName: `Fast (${fastModel.displayName} · ${fastModel.id})`,
          capabilities: toCapabilities(fastModel),
        }] : []),
        ...visible.map((model) => ({
          id: model.id,
          name: model.displayName,
          displayName: model.displayName,
          ...(toCapabilities(model) ? { capabilities: toCapabilities(model) } : {}),
        })),
      ];
      return {
        provider: this.id,
        ok: true,
        models,
        codexAccount: {
          authenticated: status.authenticated,
          available: status.available,
          catalogFresh: catalog.fresh,
          ...(status.accountEmail ? { accountEmail: status.accountEmail } : {}),
          ...(status.planType ? { planType: status.planType } : {}),
          ...(status.unavailableReason ? { unavailableReason: status.unavailableReason } : {}),
        },
      };
    } catch (error) {
      const normalized = providerFetchError(this.id, error);
      return {
        provider: this.id,
        ok: false,
        models: [],
        code: normalized.code,
        message: normalized.message,
        codexAccount: { authenticated: false, catalogFresh: false },
      };
    }
  }
}

export class OpenAICompatibleProvider implements AiProvider {
  readonly id = 'openai-compatible';

  private endpoint(config: AiStoredConfig): { baseUrl: string; apiKey?: string } {
    const preset = openAICompatiblePreset(config.openaiCompatiblePreset);
    const normalizedBaseUrl = normalizeOpenAICompatibleBaseUrl(
      config.openaiCompatibleBaseUrl,
      preset.baseUrl ?? OPENAI_COMPATIBLE_FALLBACK_URL,
    );
    const enforceV1BasePath = config.defaultProviderInstanceId === 'local-openai-compatible'
      || localOpenAICompatiblePreset(config.openaiCompatiblePreset);
    const baseUrl = enforceV1BasePath
      ? normalizeOpenAICompatibleV1BaseUrl(normalizedBaseUrl)
      : normalizedBaseUrl;
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
