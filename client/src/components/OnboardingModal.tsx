import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  FolderOpen,
  GitBranch,
  Loader2,
  Settings,
  X,
} from 'lucide-react';
import { configureIntegration } from '@/api/client';
import DirectoryPickerModal from './DirectoryPickerModal';
import { dismissOnboarding } from '@/lib/onboarding';
import { useIntegrationsSettings, useSettingsOffline, useSettingsStore } from '@/stores/settings';

interface OnboardingModalProps {
  onClose: () => void;
  onOpenSettings: (path: string) => void;
}

const DEFAULT_PROJECT_ROOT = '~/Projects/Seedbank-Graduated';

export default function OnboardingModal({ onClose, onOpenSettings }: OnboardingModalProps) {
  const integrations = useIntegrationsSettings();
  const refreshSettings = useSettingsStore((s) => s.refresh);
  const offline = useSettingsOffline();

  const localProject = useMemo(
    () => integrations.find((integration) => integration.id === 'generic-project'),
    [integrations],
  );

  const savedProjectRoot = localProject?.configValues.projectRoot ?? '';
  const [projectRoot, setProjectRoot] = useState(savedProjectRoot);
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [projectRootSavedThisSession, setProjectRootSavedThisSession] = useState(false);
  const [pendingSettingsPath, setPendingSettingsPath] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const projectRootIsSaved = projectRootSavedThisSession || savedProjectRoot.trim().length > 0;
  const hasUnsavedProjectRoot = projectRoot.trim() !== savedProjectRoot.trim();

  const closeForNow = () => {
    if (!offline) dismissOnboarding();
    onClose();
  };

  const finishAndOpenSettings = (path: string) => {
    if (!offline) dismissOnboarding();
    onClose();
    onOpenSettings(path);
  };

  const goToSettings = (path: string) => {
    if (!projectRootIsSaved) {
      setPendingSettingsPath(path);
      setError(null);
      setSaveMessage(null);
      return;
    }
    finishAndOpenSettings(path);
  };

  const saveProjectRoot = async () => {
    setSaving(true);
    setError(null);
    setSaveMessage(null);
    try {
      await configureIntegration('generic-project', { projectRoot: projectRoot.trim() });
      await refreshSettings();
      setProjectRootSavedThisSession(true);
      setPendingSettingsPath(null);
      setSaveMessage(projectRoot.trim() ? 'Project root saved.' : 'Default project root saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save project directory.');
    } finally {
      setSaving(false);
    }
  };

  const continueWithoutProjectRoot = () => {
    if (pendingSettingsPath) finishAndOpenSettings(pendingSettingsPath);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/30 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <div className="bg-paper w-full max-w-xl rounded-card shadow-modal border border-ink-100 animate-scale-in overflow-hidden">
        <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-ink-100">
          <div>
            <p className="text-[11px] font-mono uppercase tracking-widest text-ink-400 mb-1">
              First run
            </p>
            <h2 id="onboarding-title" className="text-xl font-serif font-semibold text-ink-900">
              Set up Seedbank
            </h2>
          </div>
          <button
            type="button"
            onClick={closeForNow}
            className="p-1 text-ink-300 hover:text-ink-500 transition-colors rounded-card hover:bg-ink-50"
            aria-label="Skip onboarding"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 bg-paper-warm space-y-5">
          <section className="space-y-3">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 text-sage-600">
                <FolderOpen className="w-5 h-5" />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-ink-800">Project directory</h3>
                <p className="text-xs text-ink-500 mt-0.5">
                  Choose the parent folder where Seedbank should create project folders when you graduate ideas.
                </p>
              </div>
            </div>

            <div>
              <label
                htmlFor="onboarding-project-root"
                className="text-[11px] font-mono uppercase text-ink-400 tracking-wider"
              >
                Project root
              </label>
              <div className="mt-1 flex gap-2">
                <input
                  id="onboarding-project-root"
                  type="text"
                  value={projectRoot}
                  onChange={(event) => setProjectRoot(event.target.value)}
                  placeholder={DEFAULT_PROJECT_ROOT}
                  disabled={saving || offline}
                  className="min-w-0 flex-1 px-3 py-2 text-sm bg-paper border border-ink-100
                             rounded-card outline-none focus:ring-2 focus:ring-sage-400
                             transition-all placeholder:text-ink-300 disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setSaveMessage(null);
                    setPickerOpen(true);
                  }}
                  disabled={saving || offline}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium
                             bg-paper border border-ink-200 hover:border-ink-300 text-ink-600
                             hover:text-ink-800 rounded-card transition-colors disabled:opacity-50"
                >
                  <FolderOpen className="w-4 h-4" />
                  Browse
                </button>
              </div>
              <p className="mt-1.5 text-[11px] text-ink-400">
                Leave blank to use {DEFAULT_PROJECT_ROOT}.
              </p>
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => { void saveProjectRoot(); }}
                  disabled={saving || offline || (!hasUnsavedProjectRoot && projectRootIsSaved)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium
                             bg-sage-600 hover:bg-sage-700 text-paper rounded-card
                             transition-colors disabled:opacity-50"
                >
                  {saving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  Save
                </button>
                {saveMessage && (
                  <span className="inline-flex items-center gap-1.5 text-xs text-sage-700">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {saveMessage}
                  </span>
                )}
                {!saveMessage && projectRootIsSaved && !hasUnsavedProjectRoot && (
                  <span className="inline-flex items-center gap-1.5 text-xs text-sage-700">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Project root saved
                  </span>
                )}
              </div>
            </div>
          </section>

          <section className="grid sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => goToSettings('/settings/ai-agents')}
              className="text-left p-3 bg-paper border border-ink-100 rounded-card hover:border-sage-300
                         hover:bg-sage-50 transition-all"
            >
              <span className="flex items-center gap-2 text-sm font-medium text-ink-800">
                <Bot className="w-4 h-4 text-sage-600" />
                AI assistance
              </span>
              <span className="block text-xs text-ink-400 mt-1">
                Add provider keys, account logins, local models, and feature routing in Settings.
              </span>
            </button>

            <button
              type="button"
              onClick={() => goToSettings('/settings/integrations')}
              className="text-left p-3 bg-paper border border-ink-100 rounded-card hover:border-sage-300
                         hover:bg-sage-50 transition-all"
            >
              <span className="flex items-center gap-2 text-sm font-medium text-ink-800">
                <GitBranch className="w-4 h-4 text-sage-600" />
                GitHub publishing
              </span>
              <span className="block text-xs text-ink-400 mt-1">
                Link the GitHub CLI from Project Graduation settings when you want repo publishing.
              </span>
            </button>
          </section>

          {pendingSettingsPath && (
            <div className="space-y-3 px-3 py-3 bg-amber-50 border border-amber-200 rounded-card">
              <div className="flex items-start gap-2 text-xs text-amber-800">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-amber-900">Project directory is not saved yet.</p>
                  <p className="mt-0.5">
                    You can continue to Settings now, but Seedbank will use the default project folder until you save one.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => { void saveProjectRoot(); }}
                  disabled={saving || offline}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium
                             bg-sage-600 hover:bg-sage-700 text-paper rounded-card
                             transition-colors disabled:opacity-50"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  Save project root
                </button>
                <button
                  type="button"
                  onClick={continueWithoutProjectRoot}
                  disabled={saving}
                  className="inline-flex items-center px-3 py-2 text-sm font-medium
                             bg-paper border border-amber-200 hover:border-amber-300
                             text-amber-800 rounded-card transition-colors disabled:opacity-50"
                >
                  Continue anyway
                </button>
                <button
                  type="button"
                  onClick={() => setPendingSettingsPath(null)}
                  disabled={saving}
                  className="inline-flex items-center px-3 py-2 text-sm font-medium
                             text-ink-500 hover:text-ink-700 rounded-card hover:bg-paper
                             transition-colors disabled:opacity-50"
                >
                  Stay here
                </button>
              </div>
            </div>
          )}

          {offline && (
            <div className="flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-card text-xs text-amber-800">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              Start the Seedbank server before saving the project directory. Closing this prompt while offline will show it again later.
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-card text-xs text-red-700">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              {error}
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 px-6 py-4 bg-paper border-t border-ink-100">
          <button
            type="button"
            onClick={closeForNow}
            disabled={saving}
            className="inline-flex items-center justify-center px-3 py-2 text-sm font-medium
                       text-ink-500 hover:text-ink-700 rounded-card hover:bg-ink-50 transition-colors
                       disabled:opacity-50"
          >
            {offline ? 'Close for now' : 'Skip for now'}
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => goToSettings('/settings')}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium
                         bg-paper border border-ink-200 hover:border-ink-300 text-ink-600
                         hover:text-ink-800 rounded-card transition-colors disabled:opacity-50"
            >
              <Settings className="w-4 h-4" />
              Open settings
            </button>
            <button
              type="button"
              onClick={closeForNow}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium
                         bg-sage-600 hover:bg-sage-700 text-paper rounded-card
                         transition-colors disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              Done
            </button>
          </div>
        </div>
      </div>
      {pickerOpen && (
        <DirectoryPickerModal
          title="Choose project root"
          initialPath={projectRoot.trim() || savedProjectRoot || undefined}
          onClose={() => setPickerOpen(false)}
          onSelect={(selectedPath) => {
            setProjectRoot(selectedPath);
            setPickerOpen(false);
          }}
        />
      )}
    </div>
  );
}
