import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { JsonRpcClient, type JsonRpcNotification } from './jsonRpc.js';
import type { AiProviderMessage, AiProviderResult, AiUsage } from '../types.js';

const CLIENT_NAME = 'seedbank';
const CLIENT_VERSION = '1.0.0';
const REQUEST_TIMEOUT_MS = 20_000;
const TURN_TIMEOUT_MS = 120_000;
const FALLBACK_CODEX_MODEL = 'gpt-5.3-codex';

export interface CodexAccountStatus {
  authenticated: boolean;
  available?: boolean;
  unavailableReason?: string;
  accountEmail?: string;
  planType?: string;
  requiresOpenaiAuth?: boolean;
  userAgent?: string;
}

export interface CodexAccountLoginResult {
  ok: boolean;
  loginUrl?: string;
  userCode?: string;
  loginId?: string;
  message: string;
}

export interface CodexCatalogModel {
  id: string;
  displayName: string;
  description?: string;
  hidden?: boolean;
  isDefault?: boolean;
  defaultReasoningEffort?: string;
}

export interface CodexCatalogSnapshot {
  fetchedAt: number;
  fresh: boolean;
  models: CodexCatalogModel[];
}

interface InitializeResponse {
  userAgent?: string;
}

interface AccountResponse {
  account: null | { type: string; email?: string; planType?: string };
  requiresOpenaiAuth?: boolean;
}

type LoginResponse =
  | { type: 'chatgpt'; loginId: string; authUrl: string }
  | { type: 'chatgptDeviceCode'; loginId: string; verificationUrl: string; userCode: string }
  | { type: 'apiKey' }
  | { type: 'chatgptAuthTokens' };

interface ModelListResponse {
  data: Array<{
    id: string;
    displayName?: string;
    description?: string;
    hidden?: boolean;
    isDefault?: boolean;
    defaultReasoningEffort?: string;
  }>;
  nextCursor: string | null;
}

interface ThreadStartResponse {
  thread: { id: string };
  model?: string;
}

interface TurnStartResponse {
  turn: { id: string };
}

interface TokenUsageBreakdown {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

interface ThreadTokenUsageNotification {
  turnId: string;
  tokenUsage?: {
    last?: TokenUsageBreakdown;
    total?: TokenUsageBreakdown;
  };
}

interface TurnCompletedNotification {
  turn: {
    id: string;
    status: string;
    error?: { message?: string } | null;
  };
}

interface TextDeltaNotification {
  delta?: string;
}

interface ActiveTurn {
  turnId: string | null;
  text: string;
  usage: AiUsage;
  resolve: (result: AiProviderResult) => void;
  reject: (err: Error) => void;
}

export interface CodexAccountRuntimeAvailability {
  available: boolean;
  reason?: string;
}

export function codexAccountEnabledByEnv(): boolean {
  const raw = process.env.SEEDBANK_ENABLE_CODEX_ACCOUNT?.trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

export function codexAccountRuntimeAvailability(): CodexAccountRuntimeAvailability {
  if (!codexAccountEnabledByEnv()) {
    return {
      available: false,
      reason: 'Codex account is unavailable in this release candidate build. Set SEEDBANK_ENABLE_CODEX_ACCOUNT=1 to enable the experimental app-server path.',
    };
  }
  return { available: true };
}

class CodexAppServerSession extends EventEmitter {
  private proc: ChildProcess | null = null;
  private rpc: JsonRpcClient | null = null;
  private userAgent: string | undefined;
  private stderr = '';
  private catalogCache: CodexCatalogSnapshot | null = null;
  private activeTurn: ActiveTurn | null = null;
  private starting: Promise<void> | null = null;

  async status(): Promise<CodexAccountStatus> {
    const availability = codexAccountRuntimeAvailability();
    if (!availability.available) {
      return {
        authenticated: false,
        available: false,
        ...(availability.reason ? { unavailableReason: availability.reason } : {}),
        requiresOpenaiAuth: false,
      };
    }
    await this.ensureStarted();
    const response = await this.request<AccountResponse>('account/read', { refreshToken: true }, REQUEST_TIMEOUT_MS);
    const account = response.account;
    return {
      authenticated: Boolean(account),
      available: true,
      ...(account?.email ? { accountEmail: account.email } : {}),
      ...(account?.planType ? { planType: account.planType } : {}),
      requiresOpenaiAuth: response.requiresOpenaiAuth,
      ...(this.userAgent ? { userAgent: this.userAgent } : {}),
    };
  }

  async startLogin(): Promise<CodexAccountLoginResult> {
    const availability = codexAccountRuntimeAvailability();
    if (!availability.available) {
      return {
        ok: false,
        message: availability.reason ?? 'Codex account is unavailable in this release candidate build.',
      };
    }
    await this.ensureStarted();
    const response = await this.request<LoginResponse>('account/login/start', { type: 'chatgpt', codexStreamlinedLogin: true }, REQUEST_TIMEOUT_MS);
    if (response.type === 'chatgpt') {
      return {
        ok: true,
        loginUrl: response.authUrl,
        loginId: response.loginId,
        message: 'Open the Codex login URL, finish the browser flow, then refresh status in Seedbank.',
      };
    }
    if (response.type === 'chatgptDeviceCode') {
      return {
        ok: true,
        loginUrl: response.verificationUrl,
        userCode: response.userCode,
        loginId: response.loginId,
        message: 'Open the verification URL and enter the Codex device code.',
      };
    }
    return {
      ok: true,
      message: 'Codex account login is already managed by the Codex CLI.',
    };
  }

  async logout(): Promise<void> {
    const availability = codexAccountRuntimeAvailability();
    if (!availability.available) return;
    await this.ensureStarted();
    await this.request('account/logout', undefined, REQUEST_TIMEOUT_MS);
    this.catalogCache = null;
  }

  async listModels(force = false): Promise<CodexCatalogSnapshot> {
    const availability = codexAccountRuntimeAvailability();
    if (!availability.available) throw new Error(availability.reason ?? 'Codex account is unavailable in this release candidate build.');
    if (!force && this.catalogCache && Date.now() - this.catalogCache.fetchedAt < 60 * 60 * 1000) {
      return this.catalogCache;
    }
    await this.ensureStarted();
    const all: CodexCatalogModel[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 20; page += 1) {
      const response: ModelListResponse = await this.request<ModelListResponse>('model/list', {
        cursor,
        limit: null,
        includeHidden: true,
      }, REQUEST_TIMEOUT_MS);
      all.push(...response.data.map((model: ModelListResponse['data'][number]) => ({
        id: model.id,
        displayName: model.displayName ?? model.id,
        ...(model.description ? { description: model.description } : {}),
        hidden: model.hidden,
        isDefault: model.isDefault,
        ...(model.defaultReasoningEffort ? { defaultReasoningEffort: model.defaultReasoningEffort } : {}),
      })));
      if (!response.nextCursor) break;
      cursor = response.nextCursor;
    }
    this.catalogCache = { fetchedAt: Date.now(), fresh: true, models: all };
    return this.catalogCache;
  }

  async resolveModel(model: string): Promise<string> {
    const availability = codexAccountRuntimeAvailability();
    if (!availability.available) return model.trim() || 'codex-recommended';
    const requested = model.trim() || 'codex-recommended';
    const catalog = await this.listModels().catch(() => null);
    if (requested !== 'codex-recommended' && requested !== 'codex-fast') return requested;
    const visible = catalog?.models.filter((item) => !item.hidden) ?? [];
    if (requested === 'codex-fast') {
      return visible.find((item) => /mini|fast/i.test(`${item.id} ${item.displayName}`))?.id
        ?? visible.find((item) => item.isDefault)?.id
        ?? FALLBACK_CODEX_MODEL;
    }
    return visible.find((item) => item.isDefault)?.id
      ?? visible.find((item) => /codex/i.test(item.id))?.id
      ?? visible[0]?.id
      ?? FALLBACK_CODEX_MODEL;
  }

  async complete(messages: AiProviderMessage[], model: string, onDelta?: (delta: string) => void): Promise<AiProviderResult> {
    const availability = codexAccountRuntimeAvailability();
    if (!availability.available) throw new Error(availability.reason ?? 'Codex account is unavailable in this release candidate build.');
    await this.ensureStarted();
    if (this.activeTurn) throw new Error('Codex account app-server already has a request in flight.');
    const resolvedModel = await this.resolveModel(model);
    const thread = await this.request<ThreadStartResponse>('thread/start', {
      model: resolvedModel,
      modelProvider: null,
      serviceTier: null,
      cwd: process.cwd(),
      approvalPolicy: 'never',
      approvalsReviewer: null,
      sandbox: 'read-only',
      permissions: null,
      config: null,
      serviceName: null,
      baseInstructions: systemPrompt(messages),
      developerInstructions: 'Reply as Seedbank AI assistance. Do not edit files or run shell commands unless explicitly asked by Seedbank.',
      personality: null,
      ephemeral: true,
      sessionStartSource: null,
      environments: [],
      dynamicTools: null,
      mockExperimentalField: null,
      experimentalRawEvents: false,
    }, REQUEST_TIMEOUT_MS);

    const input = userPrompt(messages);
    const turn = await this.request<TurnStartResponse>('turn/start', {
      threadId: thread.thread.id,
      input: [{ type: 'text', text: input, text_elements: [] }],
      responsesapiClientMetadata: null,
      environments: [],
      cwd: process.cwd(),
      approvalPolicy: 'never',
      approvalsReviewer: null,
      sandboxPolicy: { type: 'readOnly', networkAccess: false },
      permissions: null,
      model: resolvedModel,
      serviceTier: null,
      effort: null,
      summary: null,
      personality: null,
      outputSchema: null,
      collaborationMode: null,
    }, REQUEST_TIMEOUT_MS);

    return await new Promise<AiProviderResult>((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (this.activeTurn?.turnId === turn.turn.id) {
          this.activeTurn = null;
          reject(new Error('Codex account app-server request timed out.'));
        }
      }, TURN_TIMEOUT_MS);

      this.activeTurn = {
        turnId: turn.turn.id,
        text: '',
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        resolve: (result) => {
          clearTimeout(timeout);
          resolve({ ...result, resolvedModelId: resolvedModel });
        },
        reject: (err) => {
          clearTimeout(timeout);
          reject(err);
        },
      };

      if (onDelta) {
        const listener = (delta: string) => {
          if (this.activeTurn?.turnId === turn.turn.id) onDelta(delta);
        };
        this.once(`turn:${turn.turn.id}:done`, () => this.off(`turn:${turn.turn.id}:delta`, listener));
        this.on(`turn:${turn.turn.id}:delta`, listener);
      }
    });
  }

  dispose(): void {
    this.activeTurn?.reject(new Error('Codex account app-server session closed.'));
    this.activeTurn = null;
    this.rpc?.close('session disposed');
    this.rpc = null;
    try { this.proc?.stdin?.end(); } catch { /* already gone */ }
    killCodexProcess(this.proc);
    this.proc = null;
    this.starting = null;
  }

  private async ensureStarted(): Promise<void> {
    if (this.rpc && this.proc && !this.proc.killed) return;
    if (this.starting) return this.starting;
    this.starting = this.start();
    try {
      await this.starting;
    } finally {
      this.starting = null;
    }
  }

  private async start(): Promise<void> {
    this.proc = spawn('codex', ['app-server'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
      cwd: process.cwd(),
      detached: true,
    });
    this.proc.stderr?.on('data', (chunk: Buffer) => {
      this.stderr += chunk.toString('utf8');
      if (this.stderr.length > 32 * 1024) this.stderr = this.stderr.slice(-16 * 1024);
    });
    this.proc.on('exit', () => {
      this.rpc?.close('codex app-server exited');
      this.rpc = null;
      this.proc = null;
      this.activeTurn?.reject(new Error('Codex account app-server exited before completing the request.'));
      this.activeTurn = null;
    });
    this.proc.on('error', (err) => {
      this.rpc?.close(err.message);
      this.rpc = null;
      this.proc = null;
      this.activeTurn?.reject(err);
      this.activeTurn = null;
    });
    if (!this.proc.stdin || !this.proc.stdout) throw new Error('Codex app-server stdio is unavailable.');
    this.rpc = new JsonRpcClient(this.proc.stdin, this.proc.stdout);
    this.rpc.on('notification', (notification: JsonRpcNotification) => this.onNotification(notification));
    const init = await this.request<InitializeResponse>('initialize', {
      clientInfo: { name: CLIENT_NAME, title: 'Seedbank', version: CLIENT_VERSION },
      capabilities: { experimentalApi: true, optOutNotificationMethods: null },
    }, REQUEST_TIMEOUT_MS);
    this.userAgent = init.userAgent;
  }

  private request<T>(method: string, params: unknown, timeoutMs: number): Promise<T> {
    if (!this.rpc) return Promise.reject(new Error('Codex app-server is not running.'));
    return withTimeout(this.rpc.request<T>(method, params), timeoutMs, `${method} timed out.`);
  }

  private onNotification(notification: JsonRpcNotification): void {
    const active = this.activeTurn;
    if (!active) return;
    if (notification.method === 'item/agentMessage/delta') {
      const params = notification.params as TextDeltaNotification;
      if (params.delta) {
        active.text += params.delta;
        this.emit(`turn:${active.turnId}:delta`, params.delta);
      }
      return;
    }
    if (notification.method === 'thread/tokenUsage/updated') {
      const params = notification.params as ThreadTokenUsageNotification;
      if (params.turnId !== active.turnId) return;
      const usage = params.tokenUsage?.last ?? params.tokenUsage?.total;
      active.usage = {
        inputTokens: usage?.inputTokens ?? 0,
        outputTokens: usage?.outputTokens ?? 0,
        totalTokens: usage?.totalTokens ?? (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0),
      };
      return;
    }
    if (notification.method === 'turn/completed') {
      const params = notification.params as TurnCompletedNotification;
      if (params.turn.id !== active.turnId) return;
      this.activeTurn = null;
      this.emit(`turn:${active.turnId}:done`);
      if (params.turn.status === 'failed') {
        active.reject(new Error(params.turn.error?.message ?? 'Codex account app-server turn failed.'));
        return;
      }
      active.resolve({ text: active.text, usage: active.usage });
    }
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeout: NodeJS.Timeout;
  const timer = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timer]).finally(() => clearTimeout(timeout));
}

function systemPrompt(messages: AiProviderMessage[]): string {
  return messages.filter((message) => message.role === 'system').map((message) => message.content).join('\n\n');
}

function userPrompt(messages: AiProviderMessage[]): string {
  return messages
    .filter((message) => message.role !== 'system')
    .map((message) => `${message.role === 'assistant' ? 'Assistant' : 'User'}: ${message.content}`)
    .join('\n\n');
}

function killCodexProcess(proc: ChildProcess | null): void {
  if (!proc?.pid) return;
  try {
    process.kill(-proc.pid, 'SIGTERM');
  } catch {
    // Some launch wrappers do not remain the process-group leader on every
    // platform; also signal the direct child.
  }
  try { proc.kill('SIGTERM'); } catch { /* already gone */ }
  setTimeout(() => {
    try {
      if (proc.pid) process.kill(-proc.pid, 'SIGKILL');
    } catch { /* already gone */ }
    try { proc.kill('SIGKILL'); } catch { /* already gone */ }
  }, 2_000).unref();
}

export const codexAccountSession = new CodexAppServerSession();

process.once('exit', () => {
  codexAccountSession.dispose();
});
