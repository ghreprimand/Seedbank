import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, Check, ExternalLink, FolderPlus, GitBranch, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import type { AiProjectGenerateResult, Idea } from '@/lib/types';
import {
  generateProjectFiles,
  getGitHubPublishStatus,
  getIdeaGitHubRepoStatus,
  getIntegrations,
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
  const [routeLabel, setRouteLabel] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AiProjectGenerateResult | null>(null);
  const [projectRootConfigured, setProjectRootConfigured] = useState<boolean | null>(null);
  const [projectRootValue, setProjectRootValue] = useState('');
  const [githubAuthenticated, setGithubAuthenticated] = useState<boolean | null>(null);
  const [githubAvailable, setGithubAvailable] = useState<boolean | null>(null);
  const [githubLogin, setGithubLogin] = useState('');
  const [repoStatusRecord, setRepoStatusRecord] = useState<{ ideaId: string; projectPath: string; status: GitHubRepoStatus } | null>(null);
  const [repoActionLoading, setRepoActionLoading] = useState(false);
  const [repoMessage, setRepoMessage] = useState<string | null>(null);

  const projectPath = result?.idea.graduatedTo ?? idea.graduatedTo;
  const hasProjectPath = Boolean(projectPath);
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

  const generate = async () => {
    setLoading(true);
    setWarnings([]);
    setError(null);
    try {
      const preflight = await preflightAiRequest({ feature: 'project-drafting' });
      setWarnings(preflight.warnings);
      setRouteLabel(`${preflight.provider} / ${preflight.resolvedModelId ?? preflight.model}`);
      if (!preflight.allowed) {
        setError(preflight.blockers.join(' '));
        return;
      }

      const response = await generateProjectFiles({
        ideaId: idea.id,
        prompt: prompt.trim() || DEFAULT_PROMPT,
        ...(preflight.confirmationToken ? { aiConfirmationToken: preflight.confirmationToken } : {}),
      });
      setResult(response);
      setRepoMessage(null);
      setRepoStatusRecord(null);
      setRouteLabel(`${response.provider} / ${response.model}`);
      onGenerated(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
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
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRepoActionLoading(false);
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
            {hasProjectPath ? 'Generate files' : 'Create project files'}
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

      {projectPath && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-ink-500">
          <span className="font-mono text-ink-600 truncate max-w-full">{projectPath}</span>
          <a
            href={`file://${projectPath}`}
            className="inline-flex items-center gap-1 text-sage-700 hover:text-sage-900 underline"
          >
            Open folder <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="px-3 py-2 rounded-card border border-amber-200 bg-amber-50 text-xs text-amber-900 space-y-1">
          {warnings.map((warning) => <p key={warning}>{warning}</p>)}
        </div>
      )}

      {result && (
        <div className="px-3 py-2 rounded-card border border-sage-100 bg-sage-50 text-xs text-sage-800 space-y-2">
          <p className="flex items-center gap-1.5">
            <Check className="w-3.5 h-3.5" />
            {result.createdProject ? 'Created project folder and wrote files.' : 'Wrote files to the existing project folder.'}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {result.filesWritten.map((file) => (
              <span key={file} className="px-2 py-0.5 rounded-badge bg-paper border border-sage-100 font-mono text-[10px]">
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
