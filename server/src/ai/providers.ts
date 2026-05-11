import { decryptSecret } from './crypto.js';
import type { AiProvider, AiProviderMessage, AiProviderResult, AiStoredConfig, AiUsage } from './types.js';

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

  async complete(messages: AiProviderMessage[], config: AiStoredConfig): Promise<AiProviderResult> {
    const apiKey = decryptSecret(config.openaiApiKeyEncrypted);
    if (!apiKey) throw new Error('OpenAI API key is not configured.');
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.openaiModel,
        instructions: systemPrompt(messages),
        input: transcript(messages),
        text: { verbosity: 'low' },
      }),
    });
    if (!response.ok) throw new Error(`OpenAI request failed: ${response.status} ${response.statusText}`);
    const payload = await response.json() as { usage?: unknown };
    return { text: extractOpenAIText(payload), usage: usageFrom(payload.usage) };
  }

  async stream(messages: AiProviderMessage[], config: AiStoredConfig, onDelta: (delta: string) => void): Promise<AiProviderResult> {
    const apiKey = decryptSecret(config.openaiApiKeyEncrypted);
    if (!apiKey) throw new Error('OpenAI API key is not configured.');
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
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
    if (!response.ok) throw new Error(`OpenAI stream failed: ${response.status} ${response.statusText}`);
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
  }
}

export class AnthropicProvider implements AiProvider {
  readonly id = 'anthropic';

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
    const apiKey = decryptSecret(config.anthropicApiKeyEncrypted);
    if (!apiKey) throw new Error('Anthropic API key is not configured.');
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(this.body(messages, config)),
    });
    if (!response.ok) throw new Error(`Anthropic request failed: ${response.status} ${response.statusText}`);
    const payload = await response.json() as { content?: Array<{ text?: string }>; usage?: { input_tokens?: number; output_tokens?: number } };
    const inputTokens = payload.usage?.input_tokens ?? 0;
    const outputTokens = payload.usage?.output_tokens ?? 0;
    return {
      text: payload.content?.map((content) => content.text ?? '').join('') ?? '',
      usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
    };
  }

  async stream(messages: AiProviderMessage[], config: AiStoredConfig, onDelta: (delta: string) => void): Promise<AiProviderResult> {
    const apiKey = decryptSecret(config.anthropicApiKeyEncrypted);
    if (!apiKey) throw new Error('Anthropic API key is not configured.');
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(this.body(messages, config, true)),
    });
    if (!response.ok) throw new Error(`Anthropic stream failed: ${response.status} ${response.statusText}`);
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
  }
}

export class OllamaProvider implements AiProvider {
  readonly id = 'ollama';

  private url(config: AiStoredConfig): string {
    return `${config.ollamaBaseUrl.replace(/\/$/, '')}/api/chat`;
  }

  async complete(messages: AiProviderMessage[], config: AiStoredConfig): Promise<AiProviderResult> {
    const response = await fetch(this.url(config), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.ollamaModel,
        messages,
        stream: false,
      }),
    });
    if (!response.ok) throw new Error(`Ollama request failed: ${response.status} ${response.statusText}`);
    const payload = await response.json() as { message?: { content?: string }; prompt_eval_count?: number; eval_count?: number };
    return {
      text: payload.message?.content ?? '',
      usage: usageFrom(payload),
    };
  }

  async stream(messages: AiProviderMessage[], config: AiStoredConfig, onDelta: (delta: string) => void): Promise<AiProviderResult> {
    const response = await fetch(this.url(config), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.ollamaModel,
        messages,
        stream: true,
      }),
    });
    if (!response.ok) throw new Error(`Ollama stream failed: ${response.status} ${response.statusText}`);
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
  }
}
