import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, Check, ExternalLink, FolderPlus, GitBranch, Loader2, Sparkles } from 'lucide-react';
import type { AiProjectGenerateResult, Idea } from '@/lib/types';
import { generateProjectFiles, getIntegrations, preflightAiRequest } from '@/api/client';
import { HelpButton } from '@/help/HelpPopover';

interface ProjectGenerationSectionProps {
  idea: Idea;
  onGenerated: (result: AiProjectGenerateResult) => void;
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

  const projectPath = result?.idea.graduatedTo ?? idea.graduatedTo;
  const hasProjectPath = Boolean(projectPath);

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
      setRouteLabel(`${response.provider} / ${response.model}`);
      onGenerated(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
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
          <button
            type="button"
            onClick={onPublishClick}
            disabled={!hasProjectPath}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-ink-200 text-ink-700 hover:border-sage-300 hover:text-sage-800 hover:bg-sage-50 disabled:opacity-40 disabled:hover:bg-transparent rounded-card transition-colors"
            title={hasProjectPath ? 'Create GitHub repo and push files' : 'Generate project files first'}
          >
            <GitBranch className="w-3.5 h-3.5" />
            Create GitHub repo
          </button>
        </div>
      </div>

      <label className="block text-xs text-ink-500">
        File generation brief
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          rows={3}
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
