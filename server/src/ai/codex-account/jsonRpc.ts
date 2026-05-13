import { EventEmitter } from 'node:events';
import type { Readable, Writable } from 'node:stream';

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

interface PendingRequest {
  method: string;
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
}

export interface JsonRpcNotification {
  method: string;
  params: unknown;
}

export class JsonRpcRequestError extends Error {
  readonly rpcError: JsonRpcError;

  constructor(rpcError: JsonRpcError, method: string) {
    super(`Codex app-server ${method} failed: ${rpcError.message}`);
    this.name = 'JsonRpcRequestError';
    this.rpcError = rpcError;
  }
}

export class JsonRpcClient extends EventEmitter {
  private nextId = 1;
  private readonly pending = new Map<number, PendingRequest>();
  private buffer = '';
  private closed = false;

  constructor(
    private readonly stdin: Writable,
    stdout: Readable,
  ) {
    super();
    stdout.on('data', (chunk: Buffer) => this.onData(chunk));
    stdout.on('end', () => this.close('stdout ended'));
    stdout.on('error', (err: Error) => this.close(`stdout error: ${err.message}`));
    stdin.on('error', (err: Error) => this.close(`stdin error: ${err.message}`));
  }

  request<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (this.closed) return Promise.reject(new Error('Codex app-server JSON-RPC transport is closed.'));
    const id = this.nextId++;
    const payload = JSON.stringify({ id, method, params });
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { method, resolve: (value) => resolve(value as T), reject });
      try {
        this.stdin.write(`${payload}\n`);
      } catch (err) {
        this.pending.delete(id);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  close(reason = 'closed'): void {
    if (this.closed) return;
    this.closed = true;
    const err = new Error(`Codex app-server JSON-RPC transport closed: ${reason}`);
    for (const [id, pending] of this.pending) {
      pending.reject(err);
      this.pending.delete(id);
    }
    this.emit('close', reason);
  }

  private onData(chunk: Buffer): void {
    this.buffer += chunk.toString('utf8');
    let newline = this.buffer.indexOf('\n');
    while (newline !== -1) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (line) this.handleLine(line);
      newline = this.buffer.indexOf('\n');
    }
  }

  private handleLine(line: string): void {
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(line) as Record<string, unknown>;
    } catch (err) {
      this.emit('protocol_error', `Non-JSON app-server line: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }

    if (typeof message.id === 'number') {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) {
        const error = message.error as Partial<JsonRpcError>;
        pending.reject(new JsonRpcRequestError({
          code: typeof error.code === 'number' ? error.code : -32000,
          message: typeof error.message === 'string' ? error.message : 'Unknown app-server error.',
          data: error.data,
        }, pending.method));
        return;
      }
      pending.resolve(message.result);
      return;
    }

    if (typeof message.method === 'string') {
      this.emit('notification', { method: message.method, params: message.params } as JsonRpcNotification);
    }
  }
}
