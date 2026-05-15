import { useMemo, useState } from 'react';
import { ExternalLink, GitBranch, Loader2, X } from 'lucide-react';
import type { Idea } from '@/lib/types';
import { publishIdeaToGitHub, type GitHubPublishResponse } from '@/api/client';

interface GitHubPublishModalProps {
  idea: Idea;
  onClose: () => void;
  onPublished: (result: GitHubPublishResponse) => void;
}

function defaultRepoName(input: string): string {
  const normalized = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'seedbank-project';
}

export default function GitHubPublishModal({ idea, onClose, onPublished }: GitHubPublishModalProps) {
  const [repoName, setRepoName] = useState(() => defaultRepoName(idea.title));
  const [owner, setOwner] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'private'>('private');
  const [pushInitial, setPushInitial] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GitHubPublishResponse | null>(null);

  const canSubmit = useMemo(
    () => Boolean(repoName.trim()) && Boolean(idea.graduatedTo) && !loading,
    [repoName, idea.graduatedTo, loading],
  );

  const submit = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    try {
      const response = await publishIdeaToGitHub(idea.id, {
        repoName: repoName.trim(),
        owner: owner.trim() || undefined,
        visibility,
        pushInitial,
      });
      setResult(response);
      onPublished(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/30 backdrop-blur-sm animate-fade-in" data-help="github-publish-modal">
      <div className="bg-paper w-full max-w-xl rounded-card shadow-modal border border-ink-100 p-5 md:p-6 animate-scale-in">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-lg font-serif font-semibold text-ink-900 flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-ink-700" /> Publish to GitHub
            </h2>
            <p className="text-sm text-ink-400 mt-1">
              Create a repository from this local graduated project. Publishing is explicit and optional.
            </p>
          </div>
          <button
            onClick={onClose}
            title="Close"
            className="p-1.5 text-ink-300 hover:text-ink-600 rounded-card hover:bg-ink-50 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="text-[11px] font-mono uppercase text-ink-400 tracking-wider">Repository Name</span>
            <input
              value={repoName}
              onChange={(e) => setRepoName(e.target.value)}
              placeholder="my-project"
              className="mt-1 w-full px-3 py-2 text-sm bg-paper-warm border border-ink-100 rounded-card outline-none focus:ring-2 focus:ring-sage-400"
            />
          </label>

          <label className="block">
            <span className="text-[11px] font-mono uppercase text-ink-400 tracking-wider">Owner (optional)</span>
            <input
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              placeholder="Defaults to your authenticated account"
              className="mt-1 w-full px-3 py-2 text-sm bg-paper-warm border border-ink-100 rounded-card outline-none focus:ring-2 focus:ring-sage-400"
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setVisibility('private')}
              className={`px-3 py-2 text-sm rounded-card border transition-colors ${
                visibility === 'private'
                  ? 'border-sage-300 bg-sage-50 text-sage-800'
                  : 'border-ink-100 bg-paper text-ink-600 hover:bg-ink-50'
              }`}
            >
              Private
            </button>
            <button
              type="button"
              onClick={() => setVisibility('public')}
              className={`px-3 py-2 text-sm rounded-card border transition-colors ${
                visibility === 'public'
                  ? 'border-sage-300 bg-sage-50 text-sage-800'
                  : 'border-ink-100 bg-paper text-ink-600 hover:bg-ink-50'
              }`}
            >
              Public
            </button>
          </div>

          <label className="flex items-start gap-2 p-2.5 rounded-card border border-ink-100 bg-paper-warm">
            <input
              type="checkbox"
              checked={pushInitial}
              onChange={(e) => setPushInitial(e.target.checked)}
              className="mt-0.5"
            />
            <span className="text-xs text-ink-600">
              Push initial files now (`git init`, first commit, `origin`, push to `main`).
            </span>
          </label>

          {!idea.graduatedTo && (
            <div className="px-3 py-2 rounded-card border border-amber-200 bg-amber-50 text-xs text-amber-800">
              This idea does not have a local project path yet. Graduate it first, then publish.
            </div>
          )}

          {result && (
            <div className="px-3 py-2 rounded-card border border-sage-200 bg-sage-50 text-xs text-sage-800 space-y-1">
              <p>{result.message ?? 'Publish request completed.'}</p>
              <p>
                Repo created: <strong>{result.repoCreated ? 'yes' : 'no'}</strong> · Initial push: <strong>{result.pushed ? 'yes' : 'no'}</strong>
              </p>
              {result.repoUrl && (
                <a href={result.repoUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sage-800 hover:text-sage-900 underline">
                  Open repository <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          )}

          {error && (
            <div className="px-3 py-2 rounded-card border border-red-200 bg-red-50 text-xs text-red-700">
              {error}
            </div>
          )}

          <p className="text-[11px] text-ink-400">
            Seedbank does not store GitHub tokens. Authentication comes from your local `gh` CLI session.
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 mt-5">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 text-sm text-ink-500 hover:bg-ink-50 rounded-card transition-colors"
          >
            Close
          </button>
          <button
            type="button"
            onClick={() => { void submit(); }}
            disabled={!canSubmit}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold bg-sage-600 hover:bg-sage-700 disabled:bg-ink-200 disabled:cursor-not-allowed text-white rounded-card transition-colors"
          >
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Create Repository
          </button>
        </div>
      </div>
      <div className="fixed inset-0 -z-10" onClick={onClose} />
    </div>
  );
}
