import type { Idea, WebhooksConfig } from '../../shared/types.js';

interface WebhookEventPayload {
  event: string;
  occurredAt: string;
  payload: unknown;
}

interface WebhookJob {
  id: number;
  event: string;
  payload: unknown;
  url: string;
}

export const WEBHOOK_EVENTS = ['idea.created', 'idea.graduated', 'idea.shipped'] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

function validWebhookUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function isWebhookEvent(value: string): value is WebhookEvent {
  return WEBHOOK_EVENTS.includes(value as WebhookEvent);
}

export function toWebhookEventList(input: unknown): WebhookEvent[] | null {
  if (!Array.isArray(input)) return null;
  const normalized = [...new Set(input
    .filter((event): event is string => typeof event === 'string')
    .map((event) => event.trim())
    .filter(Boolean))];
  if (normalized.some((event) => !isWebhookEvent(event))) return null;
  return normalized as WebhookEvent[];
}

export function normalizeWebhookUrl(value: unknown, fallback: string | null): string | null | 'invalid' {
  if (value === null) return null;
  if (value === undefined) return fallback;
  if (typeof value !== 'string') return 'invalid';
  const trimmed = value.trim();
  if (!trimmed) return null;
  return validWebhookUrl(trimmed) ? trimmed : 'invalid';
}

function toPayload(event: string, payload: unknown): WebhookEventPayload {
  return {
    event,
    occurredAt: new Date().toISOString(),
    payload,
  };
}

export class WebhookEmitter {
  private readonly queue = new Map<number, WebhookJob>();
  private nextId = 1;
  private scheduled = false;
  private draining = false;

  constructor(
    private readonly version: string,
    private readonly config: () => WebhooksConfig,
  ) {}

  emit(event: WebhookEvent, payload: Idea | Record<string, unknown>): void {
    const config = this.config();
    const url = config.url?.trim();
    if (!url) return;
    if (config.events.length > 0 && !config.events.includes(event)) return;

    const id = this.nextId++;
    this.queue.set(id, { id, event, payload, url });
    this.scheduleDrain();
  }

  private scheduleDrain(): void {
    if (this.scheduled) return;
    this.scheduled = true;
    setImmediate(() => {
      this.scheduled = false;
      void this.drain();
    });
  }

  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.queue.size > 0) {
        const first = this.queue.values().next().value as WebhookJob | undefined;
        if (!first) break;
        this.queue.delete(first.id);
        await this.deliver(first);
      }
    } finally {
      this.draining = false;
      if (this.queue.size > 0) this.scheduleDrain();
    }
  }

  private async deliver(job: WebhookJob): Promise<void> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(job.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'user-agent': `seedbank-webhook/${this.version}`,
          'x-seedbank-event': job.event,
        },
        // v1 intentionally omits HMAC signing; add x-seedbank-signature in a future release if needed.
        body: JSON.stringify(toPayload(job.event, job.payload)),
        redirect: 'error',
        signal: controller.signal,
      });
      if (!response.ok) {
        console.error(`[webhook] ${job.event} delivery failed with status ${response.status}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[webhook] ${job.event} delivery error: ${message}`);
    } finally {
      clearTimeout(timeout);
    }
  }
}
