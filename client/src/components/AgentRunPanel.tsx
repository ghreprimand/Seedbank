/**
 * AgentRunPanel — drawer for "Develop with agent" / "Continue with agent".
 *
 * A5 / A6 safety rail:
 *   - SSE transcript streamed in real time
 *   - Proposed files shown as a checklist; user reviews each before applying
 *   - Stop button available for the full duration of the run
 *   - Applied changes go to idea attachments, not canonical fields
 *   - No auto-write
 */
import { useEffect, useRef, useState } from 'react';
import {
  Bot,
  Check,
  FileCode,
  Loader2,
  Square,
  X,
} from 'lucide-react';
import type { AgentProvider, AgentRunStatus, Idea } from '@/lib/types';
import {
  startAgentRun,
  stopAgentRun,
  streamAgentRun,
  applyAgentRun,
  getAgentRun,
} from '@/api/client';
import { useAgentsSettings } from '@/stores/settings';

// ── types ─────────────────────────────────────────────────────────────────────

interface AgentRunPanelProps {
  idea: Idea;
  /** If provided, the agent is handed this directory (Continue with agent) */
  projectPath?: string;
  onClose: () => void;
}

// ── file preview sub-component ────────────────────────────────────────────────

function FilePreview({ path, selected, onToggle }: {
  path: string;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <div className={`rounded-card border text-xs transition-colors ${selected ? 'border-sage-300 bg-sage-50' : 'border-ink-100 bg-paper'}`}>
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={onToggle}
          className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
            selected ? 'bg-sage-600 border-sage-600' : 'border-ink-300 bg-paper hover:border-sage-400'
          }`}
        >
          {selected && <Check className="w-2.5 h-2.5 text-white" />}
        </button>
        <FileCode className="w-3.5 h-3.5 text-ink-400 shrink-0" />
        <span className="flex-1 font-mono text-ink-700 truncate">{path}</span>
      </div>
    </div>
  );
}

// ── main panel ────────────────────────────────────────────────────────────────

export default function AgentRunPanel({ idea, projectPath, onClose }: AgentRunPanelProps) {
  const agents = useAgentsSettings();

  const availableProviders: AgentProvider[] = [
    ...(agents.claudeLinked ? ['claude' as const] : []),
    ...(agents.codexLinked ? ['codex' as const] : []),
  ];

  const [provider, setProvider] = useState<AgentProvider>(availableProviders[0] ?? 'claude');
  const [prompt, setPrompt] = useState('');
  const [runId, setRunId] = useState<string | null>(null);
  const [status, setStatus] = useState<AgentRunStatus | null>(null);
  const [transcript, setTranscript] = useState<string[]>([]);
  const [proposedFiles, setProposedFiles] = useState<string[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);

  const transcriptRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Auto-scroll transcript
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [transcript]);

  const isRunning = status === 'running' || status === 'pending';

  const startRun = async () => {
    if (!prompt.trim()) return;
    setError(null);
    setTranscript([]);
    setProposedFiles([]);
    setSelectedFiles(new Set());
    setApplied(false);

    let run;
    try {
      run = await startAgentRun({
        ideaId: idea.id,
        provider,
        prompt: prompt.trim(),
        ...(projectPath ? { projectPath } : {}),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('404') || msg.includes('not found')) {
        setError('Agent runner is not yet available on the server. Check back after the Phase 2 server update.');
      } else {
        setError(msg);
      }
      return;
    }

    setRunId(run.id);
    setStatus(run.status);

    // Stream events
    abortRef.current = new AbortController();
    try {
      await streamAgentRun(
        run.id,
        (event) => {
          if (event.type === 'delta') {
            // Append each delta chunk; split on newlines so transcript renders line-by-line
            setTranscript((t) => {
              const lines = event.delta.split('\n');
              if (t.length === 0) return lines.filter(Boolean);
              // Append to last partial line, then add any new lines
              const last = (t[t.length - 1] ?? '') + (lines[0] ?? '');
              return [...t.slice(0, -1), last, ...lines.slice(1)].filter(
                (l, i, arr) => l !== '' || i === arr.length - 1,
              );
            });
          } else if (event.type === 'state') {
            // Map server state → client status
            const stateMap: Record<string, AgentRunStatus> = {
              running: 'running', completed: 'done', failed: 'error', stopped: 'stopped',
            };
            setStatus(stateMap[event.state] ?? 'error');
          } else if (event.type === 'done') {
            const stateMap: Record<string, AgentRunStatus> = {
              running: 'done', completed: 'done', failed: 'error', stopped: 'stopped',
            };
            setStatus(stateMap[event.state] ?? 'done');
            // Fetch full run detail to get proposed files list
            void getAgentRun(run.id).then((detail) => {
              setProposedFiles(detail.proposedFiles);
              setSelectedFiles(new Set(detail.proposedFiles));
            }).catch(() => { /* ignore — proposed files just won't show */ });
          } else if (event.type === 'error') {
            setError(event.error);
            setStatus('error');
          }
        },
        abortRef.current.signal,
      );
    } catch (err) {
      if ((err as { name?: string }).name !== 'AbortError') {
        setError(err instanceof Error ? err.message : String(err));
      }
    }
  };

  const handleStop = async () => {
    if (!runId) return;
    setStopping(true);
    abortRef.current?.abort();
    try {
      await stopAgentRun(runId);
      // Server returns { ok: true } — update status conservatively; the stream
      // will deliver a 'state:stopped' or 'done' event if it hasn't already.
      setStatus('stopped');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setStopping(false);
    }
  };

  const handleApply = async () => {
    if (!runId || selectedFiles.size === 0) return;
    setApplying(true);
    setError(null);
    try {
      await applyAgentRun(runId, [...selectedFiles]);
      setApplied(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setApplying(false);
    }
  };

  const toggleFile = (path: string) => {
    setSelectedFiles((s) => {
      const next = new Set(s);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const providerLabel = provider === 'claude' ? 'Claude Code' : 'Codex CLI';
  const contextLabel = projectPath
    ? `Continued from graduated project at ${projectPath}`
    : `Idea: ${idea.title || 'Untitled'}`;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-ink-900/30 backdrop-blur-sm animate-fade-in" data-help="agent-run-modal">
      <div className="bg-paper w-full max-w-2xl rounded-card shadow-modal border border-ink-100 flex flex-col max-h-[90vh] animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-ink-100">
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4 text-sage-600" />
            <span className="text-sm font-semibold text-ink-800">
              {projectPath ? 'Continue with agent' : 'Develop with agent'}
            </span>
            {isRunning && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-badge bg-sage-50 border border-sage-200 text-[10px] font-mono text-sage-700 uppercase">
                <Loader2 className="w-2.5 h-2.5 animate-spin" /> running
              </span>
            )}
            {status === 'done' && (
              <span className="px-2 py-0.5 rounded-badge bg-sage-50 border border-sage-200 text-[10px] font-mono text-sage-700 uppercase">
                done
              </span>
            )}
            {status === 'stopped' && (
              <span className="px-2 py-0.5 rounded-badge bg-amber-50 border border-amber-200 text-[10px] font-mono text-amber-700 uppercase">
                stopped
              </span>
            )}
            {status === 'error' && (
              <span className="px-2 py-0.5 rounded-badge bg-red-50 border border-red-200 text-[10px] font-mono text-red-600 uppercase">
                error
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-ink-400 hover:text-ink-700 hover:bg-ink-50 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Context note */}
          <p className="text-xs text-ink-400 font-mono truncate">{contextLabel}</p>

          {/* Provider + prompt — only editable before run starts */}
          {!runId && (
            <div className="space-y-3">
              {availableProviders.length > 1 && (
                <label className="block text-xs text-ink-500">
                  Agent
                  <select
                    value={provider}
                    onChange={(e) => setProvider(e.target.value as AgentProvider)}
                    className="mt-1 w-full px-2 py-1.5 bg-paper-warm border border-ink-100 rounded-card text-sm text-ink-800"
                  >
                    {availableProviders.map((p) => (
                      <option key={p} value={p}>{p === 'claude' ? 'Claude Code' : 'Codex CLI'}</option>
                    ))}
                  </select>
                </label>
              )}
              <label
                className="block text-xs text-ink-500"
                data-help="agent-run-prompt"
              >
                Initial prompt
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={4}
                  placeholder={`Ask ${providerLabel} to develop this idea — e.g. "Write a SPEC.md and a prototype outline based on the idea fields."`}
                  className="mt-1 w-full px-3 py-2 text-sm bg-paper-warm border border-ink-100 rounded-card outline-none focus:ring-2 focus:ring-sage-400 resize-y text-ink-800 placeholder:text-ink-300"
                />
              </label>
            </div>
          )}

          {/* Transcript */}
          {transcript.length > 0 && (
            <div data-help="agent-run-transcript">
              <p className="text-[10px] font-mono uppercase tracking-wider text-ink-400 mb-1">Transcript</p>
              <div
                ref={transcriptRef}
                className="bg-paper-warm border border-ink-100 rounded-card p-3 font-mono text-[11px] text-ink-700 max-h-48 overflow-y-auto space-y-0.5"
              >
                {transcript.map((line, i) => (
                  <div key={i} className="leading-relaxed whitespace-pre-wrap break-all">{line}</div>
                ))}
                {isRunning && (
                  <div className="flex items-center gap-1 text-ink-400">
                    <Loader2 className="w-2.5 h-2.5 animate-spin" />
                    <span>running…</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Proposed files checklist */}
          {proposedFiles.length > 0 && (
            <div className="space-y-2" data-help="agent-run-proposed-files">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-mono uppercase tracking-wider text-ink-400">
                  Proposed files ({proposedFiles.length})
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedFiles(new Set(proposedFiles))}
                    className="text-[10px] text-sage-700 hover:underline"
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedFiles(new Set())}
                    className="text-[10px] text-ink-500 hover:underline"
                  >
                    Deselect all
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                {proposedFiles.map((filePath) => (
                  <FilePreview
                    key={filePath}
                    path={filePath}
                    selected={selectedFiles.has(filePath)}
                    onToggle={() => toggleFile(filePath)}
                  />
                ))}
              </div>
              <p className="text-[11px] text-ink-400">
                Selected files will be saved as attachments on this idea. No canonical fields are overwritten automatically.
              </p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-start justify-between gap-2 px-3 py-2 bg-red-50 border border-red-100 rounded-card text-xs text-red-700">
              <span>{error}</span>
              <button type="button" onClick={() => setError(null)}><X className="w-3 h-3" /></button>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-ink-100">
          {/* Left: Stop (only while running) */}
          <div>
            {isRunning && (
              <button
                type="button"
                onClick={handleStop}
                disabled={stopping}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-red-200 text-red-600
                           hover:bg-red-50 rounded-card transition-colors disabled:opacity-50"
              >
                {stopping ? <Loader2 className="w-3 h-3 animate-spin" /> : <Square className="w-3 h-3" />}
                Stop
              </button>
            )}
          </div>

          {/* Right: Start / Apply */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 text-xs text-ink-500 hover:bg-ink-50 rounded-card transition-colors"
            >
              {applied ? 'Done' : 'Cancel'}
            </button>

            {!runId && (
              <button
                type="button"
                onClick={() => void startRun()}
                disabled={!prompt.trim() || availableProviders.length === 0}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold
                           bg-sage-600 hover:bg-sage-700 disabled:bg-ink-300 text-white rounded-card transition-colors"
              >
                <Bot className="w-3.5 h-3.5" />
                Start {providerLabel}
              </button>
            )}

            {runId && !isRunning && proposedFiles.length > 0 && !applied && (
              <button
                type="button"
                onClick={() => void handleApply()}
                disabled={applying || selectedFiles.size === 0}
                data-help="agent-run-apply"
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold
                           bg-sage-600 hover:bg-sage-700 disabled:bg-ink-300 text-white rounded-card transition-colors"
              >
                {applying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Apply {selectedFiles.size} file{selectedFiles.size !== 1 ? 's' : ''}
              </button>
            )}

            {applied && (
              <span className="flex items-center gap-1 text-xs text-sage-700 font-medium">
                <Check className="w-3.5 h-3.5" /> Applied
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="fixed inset-0 -z-10" onClick={onClose} />
    </div>
  );
}
