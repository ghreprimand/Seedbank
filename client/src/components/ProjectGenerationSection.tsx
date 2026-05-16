import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, Check, FolderOpen, FolderPlus, GitBranch, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import type { AiProjectGenerateResult, Idea } from '@/lib/types';
import {
  generateProjectFiles,
  getGitHubPublishStatus,
  getIdeaGitHubRepoStatus,
  getIdeaProjectFolderStatus,
  getIntegrations,
  openIdeaProjectFolder,
  preflightAiRequest,
  updateIdeaGitHubRepo,
  type GitHubRepoStatus,
} from '@/api/client';
import { HelpButton } from '@/help/HelpPopover';

interface ProjectGenerationSectionProps {
  idea: Idea;
  onGenerated: (result: AiProjectGenerateResult) => void;
  onIdeaUpdated?: (idea: Idea) => void;
  onPublishClick: () => void;
}

const DEFAULT_PROMPT = [
  'Generate repository-ready starter documentation for this idea.',
  'Return README.md, SPEC.md, IMPLEMENTATION_NOTES.md, and TODO.md.',
  'Keep the README useful for a GitHub repository: what it is, why it exists, setup assumptions, and first milestone.',
  'Keep the other files practical and scoped to the smallest useful version.',
].join(' ');

export default function ProjectGenerationSection({
  idea,
  onGenerated,
  onIdeaUpdated,
  onPublishClick,
}: ProjectGenerationSectionProps) {
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [loading, setLoading] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [routeLabel, setRouteLabel] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Source-attribution state for the file-source banner. Three shapes:
  //   { kind: 'ai-failed', reason } — AI was configured, preflight passed, server fell back to templates.
  //   { kind: 'no-ai', reason }      — AI is not configured / preflight failed; templates are the only option.
  //   null                            — AI succeeded, no fallback used.
  const [fallbackSource, setFallbackSource] = useState<
    | { kind: 'ai-failed'; reason: string }
    | { kind: 'no-ai'; reason: string }
    | null
  >(null);
  const [result, setResult] = useState<AiProjectGenerateResult | null>(null);
  const [projectRootConfigured, setProjectRootConfigured] = useState<boolean | null>(null);
  const [projectRootValue, setProjectRootValue] = useState('');
  const [githubAuthenticated, setGithubAuthenticated] = useState<boolean | null>(null);
  const [githubAvailable, setGithubAvailable] = useState<boolean | null>(null);
  const [githubLogin, setGithubLogin] = useState('');
  const [repoStatusRecord, setRepoStatusRecord] = useState<{ ideaId: string; projectPath: string; status: GitHubRepoStatus } | null>(null);
  const [repoActionLoading, setRepoActionLoading] = useState(false);
  const [folderOpenLoading, setFolderOpenLoading] = useState(false);
  const [repoMessage, setRepoMessage] = useState<string | null>(null);
  const [projectFolderExists, setProjectFolderExists] = useState<true | false | null>(null);

  const projectPath = result?.idea.graduatedTo ?? idea.graduatedTo;
  const hasProjectPath = Boolean(projectPath) && projectFolderExists !== false;
  const canPublishToGitHub = hasProjectPath && githubAvailable === true && githubAuthenticated === true;
  const repoStatus = repoStatusRecord?.ideaId === idea.id && repoStatusRecord.projectPath === projectPath ? repoStatusRecord.status : null;
  const repoStatusLoading = canPublishToGitHub && repoStatus === null;
  const githubRepoExists = canPublishToGitHub && repoStatus?.exists === true && Boolean(repoStatus.repoUrl);

  useEffect(() => {
    let cancelled = false;
    getIntegrations(idea.id)
      .then((items) => {
        if (cancelled) return;
        const localProject = items.find((item) => item.id === 'generic-project');
        const root = localProject?.configValues?.projectRoot?.trim() ?? '';
        setProjectRootValue(root);
        setProjectRootConfigured(Boolean(root));
      })
      .catch(() => {
        if (!cancelled) setProjectRootConfigured(null);
      });
    return () => {
      cancelled = true;
    };
  }, [idea.id]);

  useEffect(() => {
    let cancelled = false;
    getGitHubPublishStatus()
      .then((status) => {
        if (cancelled) return;
        setGithubAvailable(status.available);
        setGithubAuthenticated(status.authenticated);
        setGithubLogin(status.login ?? '');
      })
      .catch(() => {
        if (cancelled) return;
        setGithubAvailable(false);
        setGithubAuthenticated(false);
        setGithubLogin('');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!projectPath || githubAvailable !== true || githubAuthenticated !== true) {
      return () => {
        cancelled = true;
      };
    }

    const currentProjectPath = projectPath;
    getIdeaGitHubRepoStatus(idea.id)
      .then((status) => {
        if (cancelled) return;
        setRepoStatusRecord({ ideaId: idea.id, projectPath: currentProjectPath, status });
      })
      .catch((err) => {
        if (cancelled) return;
        setRepoStatusRecord({
          ideaId: idea.id,
          projectPath: currentProjectPath,
          status: {
            available: true,
            authenticated: true,
            projectPath: currentProjectPath,
            repoKnown: false,
            exists: false,
            source: 'none',
            message: err instanceof Error ? err.message : String(err),
          },
        });
      });
    return () => {
      cancelled = true;
    };
  }, [githubAuthenticated, githubAvailable, hasProjectPath, idea.id, idea.links, projectPath]);

  useEffect(() => {
    let cancelled = false;
    if (!idea.graduatedTo?.trim()) {
      setProjectFolderExists(null);
      return () => {
        cancelled = true;
      };
    }

    getIdeaProjectFolderStatus(idea.id)
      .then((status) => {
        if (cancelled) return;
        setProjectFolderExists(status.exists && status.isDirectory);
      })
      .catch(() => {
        // Keep the previous truth value on uncertainty. Only an authoritative
        // status response can mark the project folder missing.
      });
    return () => {
      cancelled = true;
    };
  }, [idea.id, idea.graduatedTo]);

  useEffect(() => {
    if (!loading) return undefined;
    setElapsedSeconds(0);
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [loading]);

  const generate = async () => {
    setLoading(true);
    setElapsedSeconds(0);
    setWarnings([]);
    setError(null);
    setFallbackSource(null);
    try {
      let confirmationToken: string | undefined;
      // aiPreflightOk distinguishes "AI was supposed to work but the server fell
      // back" from "AI is not configured at all". The first is alert-worthy; the
      // second is informational.
      let aiPreflightOk = false;
      try {
        const preflight = await preflightAiRequest({ feature: 'project-drafting' });
        setWarnings([...preflight.warnings, ...preflight.blockers]);
        setRouteLabel(`${preflight.provider} / ${preflight.resolvedModelId ?? preflight.model}`);
        confirmationToken = preflight.confirmationToken;
        aiPreflightOk = preflight.blockers.length === 0;
      } catch {
        setWarnings(['AI preflight was unavailable. Seedbank will still try generation and fall back to idea-field templates if needed.']);
      }

      const response = await generateProjectFiles({
        ideaId: idea.id,
        prompt: prompt.trim() || DEFAULT_PROMPT,
        ...(confirmationToken ? { aiConfirmationToken: confirmationToken } : {}),
      });
      setResult(response);
      setRepoMessage(null);
      setRepoStatusRecord(null);
      setProjectFolderExists(true);
      if (response.source === 'template') {
        const reason = response.fallbackReason?.trim() || 'AI was unavailable.';
        setRouteLabel('Template fallback');
        setFallbackSource(
          aiPreflightOk
            ? { kind: 'ai-failed', reason }
            : { kind: 'no-ai', reason },
        );
      } else {
        setRouteLabel(`${response.provider ?? 'AI'} / ${response.model ?? 'generated files'}`);
      }
      onGenerated(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const confirmMissingProjectFolder = async (message: string) => {
    const normalized = message.toLowerCase();
    if (!normalized.includes('seedbank api 404:') || !normalized.includes('does not exist')) return;
    try {
      const status = await getIdeaProjectFolderStatus(idea.id);
      if (!status.exists) setProjectFolderExists(false);
      else if (status.isDirectory) setProjectFolderExists(true);
    } catch {
      // Failed confirmation is uncertainty, not proof of a missing folder.
    }
  };

  const updateGitHubRepo = async () => {
    setRepoActionLoading(true);
    setRepoMessage(null);
    setError(null);
    try {
      const response = await updateIdeaGitHubRepo(idea.id);
      setRepoMessage(response.message);
      if (response.idea) onIdeaUpdated?.(response.idea);
      const status = await getIdeaGitHubRepoStatus(idea.id);
      if (projectPath) setRepoStatusRecord({ ideaId: idea.id, projectPath, status });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      void confirmMissingProjectFolder(message);
    } finally {
      setRepoActionLoading(false);
    }
  };

  const openFolder = async () => {
    if (!projectPath || folderOpenLoading) return;
    setFolderOpenLoading(true);
    setRepoMessage(null);
    setError(null);
    try {
      const response = await openIdeaProjectFolder(idea.id);
      setRepoMessage(response.message);
      setProjectFolderExists(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      void confirmMissingProjectFolder(message);
    } finally {
      setFolderOpenLoading(false);
    }
  };

  return (
    <section className="pt-5 border-t border-ink-100 space-y-3" data-help="project-generation">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-mono uppercase tracking-wider text-ink-400">
              Project generation
            </span>
            <HelpButton
              helpId="project-generation"
              title="Project Generation"
              summary="Creates a local project folder, generates repo-ready starter files, and then lets you publish the folder to GitHub."
              manualSection="project-drafting"
              alwaysShow
            />
          </div>
          <p className="mt-1 text-xs text-ink-500 leading-relaxed max-w-2xl">
            Generate a local project folder with README, spec, implementation notes, and a TODO list. GitHub publishing uses the generated folder.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => { void generate(); }}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-sage-600 hover:bg-sage-700 disabled:bg-ink-300 text-white rounded-card transition-colors"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FolderPlus className="w-3.5 h-3.5" />}
            {loading ? `Generating... ${elapsedSeconds}s` : projectPath ? 'Generate files' : 'Create project files'}
          </button>
          {githubRepoExists ? (
            <button
              type="button"
              onClick={() => { void updateGitHubRepo(); }}
              disabled={repoActionLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-ink-200 text-ink-700 hover:border-sage-300 hover:text-sage-800 hover:bg-sage-50 disabled:opacity-40 disabled:hover:bg-transparent rounded-card transition-colors"
              title="Commit local project changes and push to GitHub"
            >
              {repoActionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Update GitHub repo
            </button>
          ) : (
            <button
              type="button"
              onClick={onPublishClick}
              disabled={!canPublishToGitHub || repoStatusLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-ink-200 text-ink-700 hover:border-sage-300 hover:text-sage-800 hover:bg-sage-50 disabled:opacity-40 disabled:hover:bg-transparent rounded-card transition-colors"
              title={
                !hasProjectPath
                  ? 'Generate project files first'
                  : canPublishToGitHub
                    ? 'Create GitHub repo and push files'
                    : 'Connect GitHub in Settings first'
              }
            >
              {repoStatusLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <GitBranch className="w-3.5 h-3.5" />}
              Create GitHub repo
            </button>
          )}
        </div>
      </div>

      <div className={`px-3 py-2 rounded-card border text-xs ${
        loading
          ? 'border-sage-200 bg-sage-50 text-sage-800'
          : 'border-ink-100 bg-paper-warm text-ink-500'
      }`}>
        {loading
          ? `Generation is running (${elapsedSeconds}s elapsed). Long model calls can take 30s-2min; the page will update when complete.`
          : 'Generation can take 30s-2min depending on the model; the page will update when complete.'}
      </div>

      <label className="block text-xs text-ink-500">
        File generation brief
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          rows={5}
          className="mt-1 w-full px-3 py-2 text-sm bg-paper-warm border border-ink-100 rounded-card outline-none focus:ring-2 focus:ring-sage-400 resize-y text-ink-800 placeholder:text-ink-300"
        />
      </label>

      {routeLabel && (
        <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-badge bg-ink-50 border border-ink-100 text-[10px] font-mono text-ink-500">
          <Sparkles className="w-3 h-3" />
          {routeLabel}
        </div>
      )}

      {projectRootConfigured === false && !projectPath && (
        <div className="px-3 py-2 rounded-card border border-amber-200 bg-amber-50 text-xs text-amber-900">
          No project folder is set in Settings yet. Seedbank will use the default
          {' '}<span className="font-mono">~/Projects/Seedbank-Graduated</span>, or you can{' '}
          <Link to="/settings/integrations" className="font-semibold underline hover:text-amber-950">
            choose a project folder
          </Link>
          {' '}first.
        </div>
      )}

      {projectRootConfigured === true && projectRootValue && !projectPath && (
        <div className="px-3 py-2 rounded-card border border-ink-100 bg-paper-warm text-xs text-ink-600">
          New project folders will be created under <span className="font-mono text-ink-700">{projectRootValue}</span>.
        </div>
      )}

      {projectFolderExists === false && idea.graduatedTo?.trim() && (
        <div className="px-3 py-2 rounded-card border border-amber-200 bg-amber-50 text-xs text-amber-900">
          Project folder at <span className="font-mono">{idea.graduatedTo}</span> is missing. Click Generate files to recreate it, or update the idea&apos;s project path in another tool.
        </div>
      )}

      {hasProjectPath && githubAuthenticated === false && (
        <div className="px-3 py-2 rounded-card border border-amber-200 bg-amber-50 text-xs text-amber-900">
          GitHub is not linked yet. Connect the local <span className="font-mono">gh</span> CLI session in{' '}
          <Link to="/settings/integrations" className="font-semibold underline hover:text-amber-950">
            Settings → Project Graduation
          </Link>
          {' '}before creating a repo.
        </div>
      )}

      {hasProjectPath && githubAvailable === true && githubAuthenticated === true && githubLogin && (
        <div className="px-3 py-2 rounded-card border border-ink-100 bg-paper-warm text-xs text-ink-600">
          GitHub publishing is ready for <span className="font-mono text-ink-700">{githubLogin}</span>.
          {repoStatusLoading && <span> Checking repository status...</span>}
          {!repoStatusLoading && repoStatus?.exists && repoStatus.repoUrl && (
            <span>
              {' '}Repository confirmed:{' '}
              <a href={repoStatus.repoUrl} target="_blank" rel="noreferrer" className="font-semibold underline hover:text-sage-900">
                {repoStatus.owner && repoStatus.name ? `${repoStatus.owner}/${repoStatus.name}` : repoStatus.repoUrl}
              </a>
              .
            </span>
          )}
          {!repoStatusLoading && repoStatus && !repoStatus.exists && repoStatus.repoKnown && (
            <span> {repoStatus.message}</span>
          )}
        </div>
      )}

      {repoMessage && (
        <div className="px-3 py-2 rounded-card border border-sage-100 bg-sage-50 text-xs text-sage-800">
          {repoMessage}
        </div>
      )}

      {hasProjectPath && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-ink-500">
          <span className="font-mono text-ink-600 truncate max-w-full">{projectPath}</span>
          <button
            type="button"
            onClick={() => { void openFolder(); }}
            disabled={folderOpenLoading}
            className="inline-flex items-center gap-1 text-sage-700 hover:text-sage-900 underline disabled:opacity-50"
          >
            {folderOpenLoading ? 'Opening...' : 'Open folder'} <FolderOpen className="w-3 h-3" />
          </button>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="px-3 py-2 rounded-card border border-amber-200 bg-amber-50 text-xs text-amber-900 space-y-1">
          {warnings.map((warning) => <p key={warning}>{warning}</p>)}
        </div>
      )}

      {fallbackSource?.kind === 'ai-failed' && (
        <div className="px-3 py-2 rounded-card border border-red-200 bg-red-50 text-xs text-red-800 space-y-2">
          <p className="flex items-start gap-1.5 font-semibold">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            AI did not generate these files.
          </p>
          <p>
            Seedbank fell back to a template built from your idea fields because AI generation failed. Template files are usually lower quality than AI output; you probably want to retry.
          </p>
          <p className="font-mono text-[11px] text-red-700 break-words">
            Reason: {fallbackSource.reason}
          </p>
          <button
            type="button"
            onClick={() => { void generate(); }}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold border border-red-300 text-red-800 hover:bg-red-100 disabled:opacity-50 rounded-card transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            Retry with AI
          </button>
        </div>
      )}

      {fallbackSource?.kind === 'no-ai' && (
        <div className="px-3 py-2 rounded-card border border-amber-200 bg-amber-50 text-xs text-amber-900 space-y-1">
          <p className="flex items-start gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>
              AI is not configured — files were generated from your idea fields. Edit them before publishing, or{' '}
              <Link to="/settings/ai-agents" className="font-semibold underline hover:text-amber-950">configure an AI provider</Link>
              {' '}and retry for a richer draft.
            </span>
          </p>
        </div>
      )}

      {result && (
        <div className={`px-3 py-2 rounded-card border text-xs space-y-2 ${
          result.source === 'template'
            ? 'border-ink-100 bg-paper-warm text-ink-700'
            : 'border-sage-100 bg-sage-50 text-sage-800'
        }`}>
          <p className="flex items-center gap-1.5">
            {result.source === 'template'
              ? <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
              : <Check className="w-3.5 h-3.5" />}
            <span>
              {result.createdProject ? 'Created project folder and wrote files' : 'Wrote files to the existing project folder'}
              {result.source === 'template'
                ? ' from idea-field templates.'
                : ` using ${result.provider ?? 'AI'}${result.model ? ` (${result.model})` : ''}.`}
            </span>
          </p>
          <div className="flex flex-wrap gap-1.5">
            {result.filesWritten.map((file) => (
              <span key={file} className={`px-2 py-0.5 rounded-badge bg-paper font-mono text-[10px] border ${
                result.source === 'template' ? 'border-ink-100' : 'border-sage-100'
              }`}>
                {file}
              </span>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-card border border-red-100 bg-red-50 text-xs text-red-700">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </section>
  );
}
