import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { v4 as uuid } from 'uuid';
import type { Idea } from '../../../shared/types.js';
import { dataDir } from '../db.js';
import { ideaToMarkdown } from '../markdown.js';
import type { SeedbankRepository } from '../repository.js';
import { resolveCliPath, runArgs, validateCli } from './link.js';
import { AgentRunStore } from './store.js';
import type {
  AgentLinkPublic,
  AgentProvider,
  AgentRunApplyInput,
  AgentRunApplyResult,
  AgentRunCreateInput,
  AgentRunCreateResult,
  AgentRunDetail,
  AgentRunState,
  AgentRunStreamEvent,
} from './types.js';

const TRANSCRIPT_CAP_BYTES = 256 * 1024;
const DEFAULT_RUNTIME_CAP_MINUTES = 5;
const MAX_RUNTIME_CAP_MINUTES = 30;
const DEFAULT_DAILY_RUN_BUDGET = 20;
const TRUNCATION_MARKER = '\n...[truncated at 256KB]\n';

const scratchRoot = path.resolve(path.join(dataDir, 'scratch'));
const runsRoot = path.resolve(path.join(dataDir, 'agent-runs'));
const attachmentsRoot = path.resolve(path.join(dataDir, 'attachments'));

interface AgentStoredConfig {
  claudeLinked: boolean;
  codexLinked: boolean;
  claudeCliPath?: string;
  codexCliPath?: string;
  claudeVersion?: string;
  codexVersion?: string;
  claudeLinkedAt?: string;
  codexLinkedAt?: string;
  runtimeCapMinutes?: number;
  dailyRunBudget?: number;
}

interface ActiveRun {
  id: string;
  ideaId: string | null;
  projectPath: string | null;
  provider: AgentProvider;
  workspacePath: string;
  process: ChildProcess;
  transcriptStream: fs.WriteStream;
  transcriptBytes: number;
  truncated: boolean;
  stopTimer: NodeJS.Timeout | null;
  stopping: boolean;
  finalized: boolean;
}

type StreamListener = (event: AgentRunStreamEvent) => void;

function nowIso(): string {
  return new Date().toISOString();
}

function expandHome(input: string): string {
  if (input.startsWith('~/')) return path.join(os.homedir(), input.slice(2));
  return input;
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function insideRoot(candidate: string, root: string): boolean {
  const rel = path.relative(root, candidate);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function readText(pathValue: string): { text: string; truncated: boolean } {
  if (!fs.existsSync(pathValue)) return { text: '', truncated: false };
  const size = fs.statSync(pathValue).size;
  const content = fs.readFileSync(pathValue, 'utf8');
  const truncated = content.includes(TRUNCATION_MARKER) || size > TRANSCRIPT_CAP_BYTES;
  return { text: content, truncated };
}

function ensureAgentConfigShape(input: Partial<AgentStoredConfig> | undefined): AgentStoredConfig {
  return {
    claudeLinked: Boolean(input?.claudeLinked ?? input?.claudeCliPath),
    codexLinked: Boolean(input?.codexLinked ?? input?.codexCliPath),
    claudeCliPath: input?.claudeCliPath,
    codexCliPath: input?.codexCliPath,
    claudeVersion: input?.claudeVersion,
    codexVersion: input?.codexVersion,
    claudeLinkedAt: input?.claudeLinkedAt,
    codexLinkedAt: input?.codexLinkedAt,
    runtimeCapMinutes: input?.runtimeCapMinutes,
    dailyRunBudget: input?.dailyRunBudget,
  };
}

function parseProvider(value: string): AgentProvider {
  if (value === 'claude' || value === 'codex') return value;
  throw new Error(`Unsupported provider: ${value}`);
}

function sanitizeAttachmentPath(inputPath: string): string {
  const normalized = path.normalize(inputPath);
  if (!normalized || normalized === '.' || normalized.startsWith('..') || path.isAbsolute(normalized)) {
    throw new Error(`Invalid path: ${inputPath}`);
  }
  return normalized;
}

export class AgentService {
  private readonly runStore: AgentRunStore;
  private readonly activeRuns = new Map<string, ActiveRun>();
  private readonly streamListeners = new Map<string, Set<StreamListener>>();

  constructor(
    private readonly repository: SeedbankRepository,
    private readonly integrationRootsProvider: () => string[] = () => [],
  ) {
    this.runStore = new AgentRunStore(repository.database());
    ensureDir(scratchRoot);
    ensureDir(runsRoot);
    ensureDir(attachmentsRoot);
  }

  private emit(event: AgentRunStreamEvent): void {
    const listeners = this.streamListeners.get(event.runId);
    if (!listeners || listeners.size === 0) return;
    for (const listener of listeners) listener(event);
  }

  subscribe(runId: string, listener: StreamListener): () => void {
    const listeners = this.streamListeners.get(runId) ?? new Set<StreamListener>();
    listeners.add(listener);
    this.streamListeners.set(runId, listeners);
    return () => {
      const current = this.streamListeners.get(runId);
      if (!current) return;
      current.delete(listener);
      if (current.size === 0) this.streamListeners.delete(runId);
    };
  }

  private config(): AgentStoredConfig {
    const stored = this.repository.getSetting<Partial<AgentStoredConfig>>('agents.config');
    return ensureAgentConfigShape(stored);
  }

  private saveConfig(config: AgentStoredConfig): void {
    this.repository.setSetting('agents.config', config);
  }

  private configuredRoots(): string[] {
    const roots = new Set<string>([scratchRoot]);
    for (const root of this.integrationRootsProvider()) {
      roots.add(path.resolve(expandHome(root)));
    }
    return [...roots];
  }

  private runtimeCapMs(): number {
    const minutes = Math.min(
      MAX_RUNTIME_CAP_MINUTES,
      Math.max(1, Number(this.config().runtimeCapMinutes ?? DEFAULT_RUNTIME_CAP_MINUTES) || DEFAULT_RUNTIME_CAP_MINUTES),
    );
    return minutes * 60 * 1000;
  }

  private runBudgetPerDay(): number {
    return Math.max(1, Number(this.config().dailyRunBudget ?? DEFAULT_DAILY_RUN_BUDGET) || DEFAULT_DAILY_RUN_BUDGET);
  }

  private requireRunBudget(): void {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const used = this.runStore.countSince(since);
    const budget = this.runBudgetPerDay();
    if (used >= budget) throw new Error(`Daily agent run budget reached (${budget}).`);
  }

  private linkPublic(config: AgentStoredConfig): AgentLinkPublic {
    return {
      claudeLinked: Boolean(config.claudeLinked),
      codexLinked: Boolean(config.codexLinked),
      claudeVersion: config.claudeVersion ?? null,
      codexVersion: config.codexVersion ?? null,
    };
  }

  link(providerValue: string, cliPath?: string): AgentLinkPublic {
    const provider = parseProvider(providerValue);
    const validated = validateCli(provider, cliPath);
    const current = this.config();
    const next: AgentStoredConfig = { ...current };
    const linkedAt = nowIso();

    if (provider === 'claude') {
      next.claudeLinked = true;
      next.claudeCliPath = validated.cliPath;
      next.claudeVersion = validated.version;
      next.claudeLinkedAt = linkedAt;
    } else {
      next.codexLinked = true;
      next.codexCliPath = validated.cliPath;
      next.codexVersion = validated.version;
      next.codexLinkedAt = linkedAt;
    }

    this.saveConfig(next);
    return this.linkPublic(next);
  }

  unlink(providerValue: string): AgentLinkPublic {
    const provider = parseProvider(providerValue);
    const next = { ...this.config() };
    if (provider === 'claude') {
      next.claudeLinked = false;
      delete next.claudeCliPath;
      delete next.claudeVersion;
      delete next.claudeLinkedAt;
    } else {
      next.codexLinked = false;
      delete next.codexCliPath;
      delete next.codexVersion;
      delete next.codexLinkedAt;
    }
    this.saveConfig(next);
    return this.linkPublic(next);
  }

  private providerBinary(provider: AgentProvider): string {
    const config = this.config();
    if (provider === 'claude') {
      return resolveCliPath(provider, config.claudeCliPath);
    }
    return resolveCliPath(provider, config.codexCliPath);
  }

  private ensureProviderLinked(provider: AgentProvider): void {
    const config = this.config();
    if (provider === 'claude' && !config.claudeLinked) throw new Error('Claude CLI is not linked.');
    if (provider === 'codex' && !config.codexLinked) throw new Error('Codex CLI is not linked.');
  }

  private scratchWorkspace(ideaId: string, runId: string): string {
    return path.resolve(path.join(scratchRoot, ideaId, runId));
  }

  private seedScratchWorkspace(idea: Idea, runId: string, prompt: string): string {
    const workspace = this.scratchWorkspace(idea.id, runId);
    ensureDir(workspace);
    fs.writeFileSync(path.join(workspace, 'IDEA.md'), `${ideaToMarkdown(idea)}\n## Agent Prompt\n\n${prompt}\n`);

    if (idea.images.length > 0) {
      const attachmentLines = idea.images.map((imagePath) => `- ${imagePath}`);
      fs.writeFileSync(path.join(workspace, 'ATTACHMENTS.md'), `# Existing Attachments\n\n${attachmentLines.join('\n')}\n`);
    }
    return workspace;
  }

  private validateProjectPath(projectPath: string): string {
    const resolved = path.resolve(expandHome(projectPath));
    const roots = this.configuredRoots().filter((root) => root !== scratchRoot);
    if (roots.length === 0) throw new Error('No configured integration project roots are available for continue mode.');
    if (!roots.some((root) => insideRoot(resolved, root))) {
      throw new Error('projectPath must be inside a configured integration project root.');
    }
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
      throw new Error(`projectPath does not exist: ${resolved}`);
    }
    return resolved;
  }

  private appendTranscript(active: ActiveRun, chunk: string): string {
    if (active.truncated) return '';
    const bytes = Buffer.byteLength(chunk);
    if (active.transcriptBytes + bytes <= TRANSCRIPT_CAP_BYTES) {
      active.transcriptStream.write(chunk);
      active.transcriptBytes += bytes;
      return chunk;
    }

    const remaining = Math.max(0, TRANSCRIPT_CAP_BYTES - active.transcriptBytes);
    if (remaining > 0) {
      const partial = Buffer.from(chunk).subarray(0, remaining).toString('utf8');
      active.transcriptStream.write(partial);
      active.transcriptBytes += Buffer.byteLength(partial);
    }
    active.transcriptStream.write(TRUNCATION_MARKER);
    active.truncated = true;
    return '';
  }

  private finalizeRun(id: string, state: AgentRunState, exitCode: number | null): void {
    const active = this.activeRuns.get(id);
    if (!active || active.finalized) return;
    active.finalized = true;
    if (active.stopTimer) clearTimeout(active.stopTimer);

    let proposedFiles: string[] = [];
    if (active.ideaId && !active.projectPath) {
      proposedFiles = this.collectProposedFiles(active.workspacePath);
    }
    this.runStore.setProposedFiles(id, proposedFiles);
    this.runStore.setState(id, state, nowIso(), exitCode);
    active.transcriptStream.end();
    this.emit({
      type: 'state',
      runId: id,
      state,
      timestamp: nowIso(),
    });
    this.emit({
      type: 'done',
      runId: id,
      state,
      timestamp: nowIso(),
    });
    this.activeRuns.delete(id);
  }

  private collectProposedFiles(workspacePath: string): string[] {
    const results: string[] = [];
    const stack: string[] = [workspacePath];

    while (stack.length > 0 && results.length < 1000) {
      const current = stack.pop();
      if (!current) break;
      const entries = fs.readdirSync(current, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(current, entry.name);
        const lstat = fs.lstatSync(fullPath, { throwIfNoEntry: false });
        if (!lstat || lstat.isSymbolicLink()) continue;
        if (lstat.isDirectory()) {
          stack.push(fullPath);
          continue;
        }
        if (!lstat.isFile()) continue;
        const rel = path.relative(workspacePath, fullPath);
        if (!rel || rel === 'IDEA.md' || rel === 'ATTACHMENTS.md') continue;
        results.push(rel);
      }
    }

    return results.sort();
  }

  startRun(input: AgentRunCreateInput): AgentRunCreateResult {
    const provider = parseProvider(input.provider);
    this.ensureProviderLinked(provider);
    this.requireRunBudget();

    const prompt = input.prompt?.trim();
    if (!prompt) throw new Error('prompt is required.');

    const runId = uuid();
    const startedAt = nowIso();
    const transcriptPath = path.resolve(path.join(runsRoot, `${runId}.log`));
    ensureDir(path.dirname(transcriptPath));

    let ideaId: string | null = null;
    let projectPath: string | null = null;
    let workspacePath: string;

    if (input.projectPath?.trim()) {
      projectPath = this.validateProjectPath(input.projectPath.trim());
      workspacePath = projectPath;
      if (input.ideaId) ideaId = input.ideaId;
    } else {
      if (!input.ideaId) throw new Error('ideaId is required for scratch runs.');
      const idea = this.repository.getIdea(input.ideaId, true);
      if (!idea) throw new Error('Idea not found.');
      ideaId = idea.id;
      workspacePath = this.seedScratchWorkspace(idea, runId, prompt);
    }

    this.runStore.create({
      id: runId,
      ideaId,
      projectPath,
      provider,
      startedAt,
      transcriptPath,
    });

    const cli = this.providerBinary(provider);
    const proc = spawn(cli, runArgs(provider, prompt), {
      cwd: workspacePath,
      // Intentionally inherit environment so linked CLIs can resolve local credentials/session.
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const transcriptStream = fs.createWriteStream(transcriptPath, { flags: 'a' });
    const active: ActiveRun = {
      id: runId,
      ideaId,
      projectPath,
      provider,
      workspacePath,
      process: proc,
      transcriptStream,
      transcriptBytes: 0,
      truncated: false,
      stopTimer: null,
      stopping: false,
      finalized: false,
    };
    this.activeRuns.set(runId, active);

    const capTimer = setTimeout(() => {
      try {
        this.stopRun(runId);
      } catch {
        // Run may already be finalized.
      }
    }, this.runtimeCapMs());
    capTimer.unref();

    proc.stdout.on('data', (chunk) => {
      const text = chunk.toString('utf8');
      const delta = this.appendTranscript(active, text);
      if (!delta) return;
      this.emit({
        type: 'delta',
        runId,
        delta,
        timestamp: nowIso(),
      });
    });

    proc.stderr.on('data', (chunk) => {
      const text = `[stderr] ${chunk.toString('utf8')}`;
      const delta = this.appendTranscript(active, text);
      if (!delta) return;
      this.emit({
        type: 'delta',
        runId,
        delta,
        timestamp: nowIso(),
      });
    });

    proc.on('error', (err) => {
      this.appendTranscript(active, `[error] ${err.message}\n`);
      this.emit({
        type: 'error',
        runId,
        error: err.message,
        timestamp: nowIso(),
      });
      this.finalizeRun(runId, 'failed', null);
    });

    proc.on('close', (code) => {
      const state: AgentRunState = active.stopping ? 'stopped' : (code === 0 ? 'completed' : 'failed');
      this.finalizeRun(runId, state, code ?? null);
      clearTimeout(capTimer);
    });

    this.emit({
      type: 'state',
      runId,
      state: 'running',
      timestamp: nowIso(),
    });

    return {
      runId,
      state: 'running',
    };
  }

  getRun(id: string): AgentRunDetail {
    const run = this.runStore.get(id);
    if (!run) throw new Error('Run not found.');
    const transcript = readText(run.transcriptPath);
    const { transcriptPath: _transcriptPath, ...publicRun } = run;
    return {
      ...publicRun,
      transcript: transcript.text,
      truncated: transcript.truncated,
    };
  }

  stopRun(id: string): void {
    const active = this.activeRuns.get(id);
    if (!active) throw new Error('Run is not active.');
    if (active.stopping) return;
    active.stopping = true;
    active.process.kill('SIGTERM');
    active.stopTimer = setTimeout(() => {
      if (!active.process.killed) {
        active.process.kill('SIGKILL');
      }
    }, 5000);
    active.stopTimer.unref();
  }

  applyRunPaths(id: string, input: AgentRunApplyInput): AgentRunApplyResult {
    const run = this.runStore.get(id);
    if (!run) throw new Error('Run not found.');
    if (!run.ideaId || run.projectPath) throw new Error('apply is only available for scratch runs.');
    if (run.state === 'running') throw new Error('Cannot apply files while run is still running.');
    if (!Array.isArray(input.paths) || input.paths.length === 0) throw new Error('paths[] is required.');

    const workspace = this.scratchWorkspace(run.ideaId, run.id);
    const resolvedWorkspace = fs.realpathSync(workspace);
    const appliedPaths: string[] = [];

    const targetDir = path.join(attachmentsRoot, run.ideaId, run.id);
    ensureDir(targetDir);

    for (const rawPath of input.paths) {
      const relPath = sanitizeAttachmentPath(rawPath);
      const source = path.resolve(path.join(workspace, relPath));
      const lstat = fs.lstatSync(source, { throwIfNoEntry: false });
      let resolvedSource = source;
      if (lstat && !lstat.isSymbolicLink()) {
        try {
          resolvedSource = fs.realpathSync(source);
        } catch {
          resolvedSource = source;
        }
      }
      if (
        !insideRoot(source, workspace)
        || !insideRoot(resolvedSource, resolvedWorkspace)
        || !lstat
        || lstat.isSymbolicLink()
        || !lstat.isFile()
      ) {
        throw new Error(`File not found in run workspace: ${rawPath}`);
      }

      const destination = path.resolve(path.join(targetDir, relPath));
      ensureDir(path.dirname(destination));
      fs.copyFileSync(source, destination);
      appliedPaths.push(destination);
    }

    const idea = this.repository.getIdea(run.ideaId, true);
    if (!idea) throw new Error('Idea not found.');

    const nextImages = [...new Set([...idea.images, ...appliedPaths])];
    const updated = this.repository.updateIdea(idea.id, { images: nextImages });
    if (!updated) throw new Error('Failed to update idea attachments.');

    return {
      appliedPaths,
      idea: updated,
    };
  }
}
