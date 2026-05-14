import { useState } from 'react';
import {
  Check,
  Download,
  FileText,
  Loader2,
  Sparkles,
  X,
} from 'lucide-react';
import type { AiProjectDraftFile, Idea } from '@/lib/types';
import { applyProjectDraftFiles, draftProjectFiles, preflightAiRequest } from '@/api/client';

interface ProjectDraftPanelProps {
  idea: Idea;
  onClose: () => void;
}

function downloadFile(file: AiProjectDraftFile) {
  const blob = new Blob([file.content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.path.split('/').pop() || file.path;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ProjectDraftPanel({ idea, onClose }: ProjectDraftPanelProps) {
  const [prompt, setPrompt] = useState('Write a SPEC.md, IMPLEMENTATION_NOTES.md, and TODO.md for the smallest useful version of this idea.');
  const [summary, setSummary] = useState('');
  const [files, setFiles] = useState<AiProjectDraftFile[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openPath, setOpenPath] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [applyMessage, setApplyMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [routeLabel, setRouteLabel] = useState('');

  const generate = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setError(null);
    setWarnings([]);
    try {
      const preflight = await preflightAiRequest({ feature: 'project-drafting' });
      setWarnings(preflight.warnings);
      setRouteLabel(`${preflight.provider} / ${preflight.resolvedModelId ?? preflight.model}`);
      if (!preflight.allowed) {
        setError(preflight.blockers.join(' '));
        return;
      }
      const result = await draftProjectFiles({
        ideaId: idea.id,
        prompt: prompt.trim(),
        ...(preflight.confirmationToken ? { aiConfirmationToken: preflight.confirmationToken } : {}),
      });
      setSummary(result.summary);
      setApplyMessage(null);
      setFiles(result.files);
      setSelected(new Set(result.files.map((file) => file.path)));
      setOpenPath(result.files[0]?.path ?? null);
      setRouteLabel(`${result.provider} / ${result.model}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const toggle = (path: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const selectedFiles = files.filter((file) => selected.has(file.path));
  const openFile = files.find((file) => file.path === openPath) ?? files[0];

  const applyToProject = async () => {
    if (!idea.graduatedTo || selectedFiles.length === 0) return;
    setApplying(true);
    setError(null);
    setApplyMessage(null);
    try {
      const result = await applyProjectDraftFiles({ ideaId: idea.id, files: selectedFiles });
      setApplyMessage(`Saved ${result.filesWritten.length} file${result.filesWritten.length === 1 ? '' : 's'} to ${result.targetPath}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-ink-900/30 backdrop-blur-sm animate-fade-in" data-help="project-draft-modal">
      <div className="bg-paper w-full max-w-3xl rounded-card shadow-modal border border-ink-100 flex flex-col max-h-[90vh] animate-scale-in">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-ink-100">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-sage-600" />
            <span className="text-sm font-semibold text-ink-800">Draft project files</span>
            {routeLabel && (
              <span className="px-2 py-0.5 rounded-badge bg-ink-50 border border-ink-100 text-[10px] font-mono text-ink-500">
                {routeLabel}
              </span>
            )}
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded text-ink-400 hover:text-ink-700 hover:bg-ink-50 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <p className="text-xs text-ink-400 font-mono truncate">Idea: {idea.title || 'Untitled'}</p>

          {files.length === 0 && (
            <label className="block text-xs text-ink-500">
              Prompt
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={4}
                className="mt-1 w-full px-3 py-2 text-sm bg-paper-warm border border-ink-100 rounded-card outline-none focus:ring-2 focus:ring-sage-400 resize-y text-ink-800 placeholder:text-ink-300"
              />
            </label>
          )}

          {warnings.length > 0 && (
            <div className="px-3 py-2 rounded-card border border-amber-200 bg-amber-50 text-xs text-amber-900 space-y-1">
              {warnings.map((warning) => <p key={warning}>{warning}</p>)}
            </div>
          )}

          {summary && (
            <div className="px-3 py-2 rounded-card border border-sage-100 bg-sage-50 text-xs text-sage-800">
              {summary}
            </div>
          )}

          {applyMessage && (
            <div className="px-3 py-2 rounded-card border border-sage-100 bg-sage-50 text-xs text-sage-800">
              {applyMessage}
            </div>
          )}

          {files.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-3 min-h-[320px]">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-mono uppercase tracking-wider text-ink-400">Files</p>
                  <button type="button" onClick={() => setSelected(new Set(files.map((file) => file.path)))} className="text-[10px] text-sage-700 hover:underline">
                    Select all
                  </button>
                </div>
                {files.map((file) => (
                  <button
                    key={file.path}
                    type="button"
                    onClick={() => setOpenPath(file.path)}
                    className={`w-full text-left rounded-card border px-3 py-2 transition-colors ${
                      openFile?.path === file.path ? 'border-sage-300 bg-sage-50' : 'border-ink-100 bg-paper hover:bg-ink-50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        role="checkbox"
                        aria-checked={selected.has(file.path)}
                        onClick={(event) => {
                          event.stopPropagation();
                          toggle(file.path);
                        }}
                        className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                          selected.has(file.path) ? 'bg-sage-600 border-sage-600' : 'border-ink-300 bg-paper'
                        }`}
                      >
                        {selected.has(file.path) && <Check className="w-2.5 h-2.5 text-white" />}
                      </span>
                      <FileText className="w-3.5 h-3.5 text-ink-400 shrink-0" />
                      <span className="font-mono text-[11px] text-ink-700 truncate">{file.path}</span>
                    </div>
                    {file.description && <p className="mt-1 text-[11px] text-ink-400 line-clamp-2">{file.description}</p>}
                  </button>
                ))}
              </div>

              <div className="rounded-card border border-ink-100 bg-paper-warm min-h-0 overflow-hidden flex flex-col">
                <div className="px-3 py-2 border-b border-ink-100 flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px] text-ink-600 truncate">{openFile?.path ?? 'No file selected'}</span>
                  {openFile && (
                    <button type="button" onClick={() => downloadFile(openFile)} className="p-1 rounded text-ink-400 hover:text-sage-700 hover:bg-sage-50 transition-colors" title="Download this file">
                      <Download className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <pre className="flex-1 overflow-auto p-3 text-[11px] leading-relaxed text-ink-700 whitespace-pre-wrap">{openFile?.content ?? ''}</pre>
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-start justify-between gap-2 px-3 py-2 bg-red-50 border border-red-100 rounded-card text-xs text-red-700">
              <span>{error}</span>
              <button type="button" onClick={() => setError(null)}><X className="w-3 h-3" /></button>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-ink-100">
          <p className="text-[11px] text-ink-400">
            {selectedFiles.length > 0 ? `${selectedFiles.length} selected` : 'No files selected'}
          </p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="px-3 py-2 text-xs text-ink-500 hover:bg-ink-50 rounded-card transition-colors">
              Close
            </button>
            {files.length === 0 ? (
              <button
                type="button"
                onClick={() => void generate()}
                disabled={loading || !prompt.trim()}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-sage-600 hover:bg-sage-700 disabled:bg-ink-300 text-white rounded-card transition-colors"
              >
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                Generate
              </button>
            ) : (
              <>
                {idea.graduatedTo && (
                  <button
                    type="button"
                    onClick={() => void applyToProject()}
                    disabled={applying || selectedFiles.length === 0}
                    className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold border border-sage-300 text-sage-800 hover:bg-sage-50 disabled:border-ink-200 disabled:text-ink-300 rounded-card transition-colors"
                  >
                    {applying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    Save to project
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => selectedFiles.forEach(downloadFile)}
                  disabled={selectedFiles.length === 0}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-sage-600 hover:bg-sage-700 disabled:bg-ink-300 text-white rounded-card transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download selected
                </button>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="fixed inset-0 -z-10" onClick={onClose} />
    </div>
  );
}
