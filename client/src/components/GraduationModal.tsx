import { useEffect, useMemo, useState } from 'react';
import { FolderOpen, FolderPlus, Network, Rocket, Settings, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { GraduationReadiness, Idea, IntegrationSummary } from '@/lib/types';
import {
  getIntegrations,
  graduateIdea,
  openIdeaProjectFolder,
  type GraduationResponse,
  type IntegrationWithReadiness,
} from '@/api/client';

interface GraduationModalProps {
  idea: Idea;
  onClose: () => void;
  onGraduated: (response: GraduationResponse) => void;
}

const ICONS = {
  Network,
  FolderPlus,
};

function readinessFor(idea: Idea): GraduationReadiness {
  const checks: Array<[string, boolean]> = [
    ['title', Boolean(idea.title.trim())],
    ['pitch', Boolean(idea.pitch.trim())],
    ['notes', Boolean(idea.fullNotes.trim())],
    ['hook', Boolean(idea.hook.trim())],
    ['risks', Boolean(idea.risks.trim())],
    ['tech stack', Boolean(idea.techStack.trim())],
    ['tags', idea.tags.length > 0],
  ];
  const missing = checks.filter(([, present]) => !present).map(([label]) => label);
  const score = Math.round(((checks.length - missing.length) / checks.length) * 100);
  return {
    ready: missing.length <= 2 && Boolean(idea.title.trim()) && Boolean(idea.pitch.trim()),
    missing,
    score,
  };
}

function iconFor(integration: IntegrationSummary) {
  const Icon = ICONS[integration.icon as keyof typeof ICONS] ?? FolderPlus;
  return <Icon className="w-4 h-4" />;
}


export default function GraduationModal({ idea, onClose, onGraduated }: GraduationModalProps) {
  const localReadiness = useMemo(() => readinessFor(idea), [idea]);
  const [integrations, setIntegrations] = useState<IntegrationWithReadiness[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [openingProject, setOpeningProject] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getIntegrations(idea.id)
      .then((items) => {
        if (cancelled) return;
        setIntegrations(items);
        setSelectedId(items[0]?.id ?? '');
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [idea.id]);

  const selected = integrations.find((integration) => integration.id === selectedId);
  const readiness = selected?.readiness ?? localReadiness;
  const canSubmit = Boolean(selected) && (selected?.configured ?? false) && readiness.ready && !working;

  const handleGraduate = async () => {
    if (!selected || !selected.configured) return;
    setWorking(true);
    setError(null);
    try {
      const response = await graduateIdea(selected.id, idea.id);
      onGraduated(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setWorking(false);
    }
  };

  const openCurrentProject = async () => {
    if (!idea.graduatedTo || openingProject) return;
    setOpeningProject(true);
    setError(null);
    try {
      await openIdeaProjectFolder(idea.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setOpeningProject(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/30 backdrop-blur-sm animate-fade-in" data-help="graduation-modal">
      <div className="bg-paper w-full max-w-2xl rounded-card shadow-modal border border-ink-100 p-5 md:p-6 animate-scale-in max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <h2 className="text-lg font-serif font-semibold text-ink-900 flex items-center gap-2">
              <Rocket className="w-4 h-4 text-sage-600" /> Graduate idea
            </h2>
            <p className="text-sm text-ink-400 mt-1">
              Create a project scaffold and link this idea to it.
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

        <div className="mb-5">
          <div className="flex items-center justify-between text-xs font-mono text-ink-400 mb-2">
            <span>Readiness</span>
            <span>{readiness.score}%</span>
          </div>
          <div className="h-2 bg-paper-dim rounded-pill overflow-hidden border border-ink-100">
            <div
              className="h-full bg-sage-500 transition-all"
              style={{ width: `${readiness.score}%` }}
            />
          </div>
          {readiness.missing.length > 0 && (
            <p className="text-xs text-ink-400 mt-2">
              Missing: {readiness.missing.join(', ')}
            </p>
          )}
        </div>

        {loading ? (
          <p className="text-sm text-ink-400 font-mono italic py-8 text-center">Loading integrations…</p>
        ) : (
          <div className="space-y-3 mb-5">
            {integrations.map((integration) => (
              <button
                key={integration.id}
                onClick={() => setSelectedId(integration.id)}
                className={`w-full text-left p-3 rounded-card border transition-all ${
                  selectedId === integration.id
                    ? 'border-sage-300 bg-sage-50'
                    : 'border-ink-100 bg-paper-warm hover:border-ink-200'
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 text-sage-600">{iconFor(integration)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-ink-800">{integration.name}</span>
                      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-badge ${
                        integration.configured ? 'bg-sage-100 text-sage-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {integration.configured ? 'configured' : 'needs path'}
                      </span>
                    </span>
                    <span className="block text-xs text-ink-400 mt-0.5">{integration.description}</span>
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}

        {selected && !selected.configured && (
          <div className="mb-5 px-3 py-3 bg-amber-50 border border-amber-200 rounded-card text-sm">
            <p className="text-amber-800 font-medium mb-1">Integration not configured</p>
            <p className="text-xs text-amber-700 mb-2">
              Set a project root path before graduating an idea.
            </p>
            <Link
              to="/settings/integrations"
              onClick={onClose}
              className="inline-flex items-center gap-1.5 text-xs text-amber-800 font-medium
                         underline underline-offset-2 hover:text-amber-900 transition-colors"
            >
              <Settings className="w-3.5 h-3.5" />
              Configure in Settings → Project Graduation
            </Link>
          </div>
        )}

        {error && (
          <div className="mb-4 px-3 py-2 bg-red-50 border border-red-100 rounded-card text-xs text-red-700">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          {idea.graduatedTo ? (
            <button
              type="button"
              onClick={() => { void openCurrentProject(); }}
              disabled={openingProject}
              className="text-xs text-sage-700 hover:text-sage-900 flex items-center gap-1"
            >
              <FolderOpen className="w-3 h-3" /> {openingProject ? 'Opening...' : 'Current project'}
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-2 text-sm text-ink-500 hover:bg-ink-50 rounded-card transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleGraduate}
              disabled={!canSubmit}
              className="px-3 py-2 text-sm font-semibold bg-sage-600 hover:bg-sage-700 disabled:bg-ink-200 disabled:cursor-not-allowed text-white rounded-card transition-colors"
            >
              {working ? 'Graduating…' : 'Graduate'}
            </button>
          </div>
        </div>
      </div>
      <div className="fixed inset-0 -z-10" onClick={onClose} />
    </div>
  );
}
