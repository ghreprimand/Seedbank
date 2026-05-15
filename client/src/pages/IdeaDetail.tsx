/** Idea detail / editor page — all 14 fields, auto-save, version history, and actions. */
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef, useMemo } from 'react';
import {
  ArrowRight,
  ArrowLeft,
  Copy,
  Trash2,
  Snowflake,
  Check,
  Circle,
  ChevronDown,
  Download,
  Rocket,
  GitBranch,
  FolderOpen,
} from 'lucide-react';

import type { Idea, Stage } from '@/lib/types';
import {
  CATEGORY_LABELS,
  IDEA_FIELD_VISIBILITY_KEYS,
  STAGES,
  STAGE_FIELD_VISIBILITY,
  STAGE_LABELS,
  STAGE_ICONS,
} from '@/lib/types';
import {
  getIdea,
  updateIdea,
  deleteIdea,
  duplicateIdea,
  openIdeaProjectFolder,
} from '@/api/client';
import { useDebouncedCallback } from '@/hooks/useDebounce';

import StageBadge from '@/components/StageBadge';
import TagInput from '@/components/TagInput';
import ScorePicker from '@/components/ScorePicker';
import LinkEditor from '@/components/LinkEditor';
import RelatedIdeasLinker from '@/components/RelatedIdeasLinker';
import VersionHistory from '@/components/VersionHistory';
import GraduationModal from '@/components/GraduationModal';
import GitHubPublishModal from '@/components/GitHubPublishModal';
import AiChatPanel from '@/components/AiChatPanel';
import ProjectGenerationSection from '@/components/ProjectGenerationSection';
import LandscapeAnalysis from '@/components/LandscapeAnalysis';
import IdeaHealthCheck from '@/components/IdeaHealthCheck';
import AiSuggestionButton from '@/components/AiSuggestionButton';
import StageTimeline from '@/components/StageTimeline';
import ImageGallery from '@/components/ImageGallery';
import type { GraduationResponse } from '@/api/client';
import type { GitHubPublishResponse } from '@/api/client';
import type { AiProjectGenerateResult } from '@/lib/types';
import { exportIdeaAsMarkdown, exportIdeaAsJSON } from '@/lib/export';
import { assessReadiness, type StageReadinessAssessment } from '@/lib/stageReadiness';
import { useCategoriesSettings } from '@/stores/settings';
import { HelpButton } from '@/help/HelpPopover';

/** Auto-save debounce delay in ms */
const SAVE_DELAY = 800;

const PROGRESSIVE_UNLOCK_NEXT_STAGE: Partial<Record<Stage, Stage>> = {
  seed: 'sprout',
  sprout: 'pitch',
  pitch: 'prototype',
  prototype: 'plot',
};

function displayLabelForField(field: string, stage: Stage): string {
  if (field === 'fullNotes') return stage === 'seed' ? 'The Spark' : 'Raw Notes';
  if (field === 'hook') return 'Concept';
  if (field === 'whyItMightWork') return 'The Case';
  if (field === 'pitch') return 'Elevator Pitch';
  if (field === 'risks') return 'Risks & Blockers';
  if (field === 'techStack') return 'Build Notes';
  if (field === 'aesthetic') return 'Aesthetic & Style';
  if (field === 'retrospective') return 'Retrospective';
  if (field === 'jamScore') return 'Feasibility';
  if (field === 'links') return 'Links';
  if (field === 'relatedIdeaIds') return 'Related Ideas';
  if (field === 'images') return 'Images';
  if (field === 'landscapeAnalysis') return 'Landscape Analysis';
  return field;
}

function StageProgressPanel({
  idea,
  readiness,
  onMove,
}: {
  idea: Idea;
  readiness: StageReadinessAssessment;
  onMove: (stage: Stage) => void;
}) {
  if (readiness.nextStage === idea.stage) return null;

  const checklist = [
    ...readiness.met.map((label) => ({ label, complete: true })),
    ...readiness.missing.map((label) => ({ label, complete: false })),
  ];
  const nextStageLabel = STAGE_LABELS[readiness.nextStage];

  return (
    <div
      className={`rounded-card border px-3 py-3 ${
        readiness.ready
          ? 'border-sage-200 bg-sage-50'
          : 'border-amber-200 bg-amber-50'
      }`}
      data-help="promotion-nudge"
    >
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`w-7 h-7 rounded-full border flex items-center justify-center ${
                readiness.ready
                  ? 'bg-sage-100 border-sage-200 text-sage-700'
                  : 'bg-paper border-amber-200 text-amber-700'
              }`}
            >
              <Rocket className="w-3.5 h-3.5" />
            </span>
            <div>
              <h2 className="text-sm font-serif font-semibold text-ink-900">Stage Progress</h2>
              <p className="text-xs text-ink-500">
                {readiness.ready
                  ? `Ready to move from ${STAGE_LABELS[idea.stage]} to ${nextStageLabel}.`
                  : `Working toward ${nextStageLabel}. Complete the checklist to advance automatically, or move manually anytime.`}
              </p>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {checklist.map((item) => (
              <div
                key={item.label}
                className={`flex items-center gap-1.5 text-xs ${
                  item.complete ? 'text-sage-800' : 'text-amber-900'
                }`}
              >
                {item.complete ? (
                  <Check className="w-3.5 h-3.5 shrink-0" />
                ) : (
                  <Circle className="w-3.5 h-3.5 shrink-0" />
                )}
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={() => onMove(readiness.nextStage)}
          className={`inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-badge transition-colors whitespace-nowrap ${
            readiness.ready
              ? 'bg-sage-600 hover:bg-sage-700 text-white'
              : 'bg-paper hover:bg-amber-100 text-amber-900 border border-amber-200'
          }`}
        >
          {readiness.ready ? 'Move to' : 'Move anyway to'} {nextStageLabel}
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

function maybeAutoAdvanceStage(previous: Idea, next: Idea): Idea {
  if (previous.stage !== next.stage) return next;

  const before = assessReadiness(previous);
  const after = assessReadiness(next);
  if (before.nextStage === previous.stage || after.nextStage === next.stage) return next;
  if (before.ready || !after.ready) return next;

  return { ...next, stage: after.nextStage };
}

export default function IdeaDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [idea, setIdea] = useState<Idea | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [stageOpen, setStageOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [graduationOpen, setGraduationOpen] = useState(false);
  const [graduationMessage, setGraduationMessage] = useState<string | null>(null);
  const [openingProjectFolder, setOpeningProjectFolder] = useState(false);
  const [gitHubPublishOpen, setGitHubPublishOpen] = useState(false);
  const [gitHubPublishMessage, setGitHubPublishMessage] = useState<string | null>(null);

  const categorySettings = useCategoriesSettings();
  const activeCategories = categorySettings.items
    .filter((c) => !c.archived)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const [reloadKey, setReloadKey] = useState(0);
  const [showAllFieldsByIdea, setShowAllFieldsByIdea] = useState<Record<string, boolean>>({});
  const [teaserExpandedFor, setTeaserExpandedFor] = useState<string | null>(null);

  // Loading is derived from "have I finished fetching the requested id?"
  // — avoids a synchronous setLoading(true) inside the effect.
  const loading = !!id && loadedId !== id;
  const readiness = useMemo(() => (idea ? assessReadiness(idea) : null), [idea]);
  const showAllFields = id ? (showAllFieldsByIdea[id] ?? false) : false;
  const visibleFieldKeys = idea
    ? (showAllFields
      ? new Set(Object.values(STAGE_FIELD_VISIBILITY).flat())
      : new Set(STAGE_FIELD_VISIBILITY[idea.stage]))
    : new Set<string>();
  const canSee = (field: string) => showAllFields || visibleFieldKeys.has(field);
  const stageFieldKeys = idea ? new Set(STAGE_FIELD_VISIBILITY[idea.stage]) : new Set<string>();
  const hiddenFieldsForStage = idea
    ? IDEA_FIELD_VISIBILITY_KEYS.filter((field) => !stageFieldKeys.has(field))
    : [];
  const hiddenFields = showAllFields ? [] : hiddenFieldsForStage;
  const nextStageForUnlock = idea ? PROGRESSIVE_UNLOCK_NEXT_STAGE[idea.stage] : undefined;
  const teaserContextKey = `${id ?? ''}:${idea?.stage ?? ''}`;
  const teaserExpanded = teaserExpandedFor === teaserContextKey;

  // ── Load idea ────────────────────────────────────────────

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getIdea(id).then((loaded) => {
      if (cancelled) return;
      if (loaded) {
        setIdea(loaded);
        setNotFound(false);
      } else {
        setIdea(null);
        setNotFound(true);
      }
      setLoadedId(id);
    });
    return () => {
      cancelled = true;
    };
  }, [id, reloadKey]);

  // ── Auto-save ────────────────────────────────────────────

  const { debounced: scheduleSave, flush: flushSave, cancel: cancelSave } =
    useDebouncedCallback(async (current: Idea) => {
      setSaveStatus('saving');
      try {
        await updateIdea(current.id, current);
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 1500);
      } catch (err) {
        console.error('Auto-save failed:', err);
        setSaveStatus('idle');
      }
    }, SAVE_DELAY);

  const update = <K extends keyof Idea>(field: K, value: Idea[K]) => {
    setIdea((prev) => {
      if (!prev) return prev;
      const changed = { ...prev, [field]: value };
      const next = maybeAutoAdvanceStage(prev, changed);
      scheduleSave(next);
      return next;
    });
  };

  const saveNow = async (changes: Partial<Idea>) => {
    if (!idea) return;
    cancelSave();
    const next = 'stage' in changes
      ? { ...idea, ...changes }
      : maybeAutoAdvanceStage(idea, { ...idea, ...changes });
    setIdea(next);
    setSaveStatus('saving');
    try {
      const updated = await updateIdea(idea.id, next);
      if (updated) setIdea(updated);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 1500);
    } catch (err) {
      console.error('Save failed:', err);
      setSaveStatus('idle');
    }
  };

  const syncImages = (images: string[]) => {
    setIdea((prev) => (prev ? { ...prev, images } : prev));
  };

  // ── Actions ──────────────────────────────────────────────

  const handleDuplicate = async () => {
    if (!idea) return;
    flushSave();
    const copy = await duplicateIdea(idea.id);
    if (copy) navigate(`/idea/${copy.id}`);
  };

  const handleDelete = async () => {
    if (!idea) return;
    cancelSave();
    await deleteIdea(idea.id);
    navigate('/', { replace: true });
  };

  const handleShelve = () => {
    const target: Stage = idea?.stage === 'cold-storage' ? 'shelved' : 'cold-storage';
    saveNow({ stage: target });
  };

  const handleVersionRestored = () => {
    setReloadKey((k) => k + 1);
  };

  const handleGraduated = (response: GraduationResponse) => {
    setIdea(response.idea);
    setGraduationMessage(response.result.message);
    setGraduationOpen(false);
  };

  const openProjectFolder = async () => {
    if (!idea || openingProjectFolder) return;
    setOpeningProjectFolder(true);
    setGraduationMessage(null);
    try {
      const response = await openIdeaProjectFolder(idea.id);
      setGraduationMessage(response.message);
    } catch (err) {
      setGraduationMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setOpeningProjectFolder(false);
    }
  };

  const handleGitHubPublished = (result: GitHubPublishResponse) => {
    if (result.idea) setIdea(result.idea);
    setGitHubPublishMessage(result.message ?? (result.repoUrl ? `Repository created: ${result.repoUrl}` : 'GitHub publish completed.'));
    setGitHubPublishOpen(false);
  };

  const handleProjectGenerated = (result: AiProjectGenerateResult) => {
    setIdea(result.idea);
    setGraduationMessage(
      `${result.createdProject ? 'Created project folder' : 'Updated project folder'} at ${result.targetPath}. Wrote ${result.filesWritten.length} file${result.filesWritten.length === 1 ? '' : 's'}.`,
    );
  };

  const canShowGraduation = (current: Idea) =>
    STAGES.indexOf(current.stage) >= STAGES.indexOf('pitch') && current.stage !== 'shelved' && current.stage !== 'cold-storage';

  // ── Render guards ────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 animate-fade-in">
        <div className="flex flex-col items-center gap-3">
          <span className="text-2xl animate-pulse">📋</span>
          <span className="text-ink-400 text-sm font-mono italic">Loading…</span>
        </div>
      </div>
    );
  }

  if (notFound || !idea) {
    return (
      <div className="space-y-6 animate-fade-in">
        <Link to="/" className="text-ink-400 hover:text-ink-600 text-sm flex items-center gap-1 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Garden
        </Link>
        <div className="p-10 bg-paper-warm border border-ink-100 rounded-card text-center">
          <span className="text-3xl mb-3 block">🕳️</span>
          <h1 className="text-xl font-serif font-semibold text-ink-700 mb-2">Seed not found</h1>
          <p className="text-sm text-ink-400">This idea may have been deleted or moved.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto pb-16 animate-fade-in" data-help="idea-detail-page">
      {/* ── Top bar ──────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4">
        <Link to="/" className="text-ink-400 hover:text-ink-600 text-sm flex items-center gap-1 transition-colors group">
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" /> Garden
        </Link>

        <div className="flex items-center gap-1.5" data-help="idea-actions">
          {/* Save status */}
          <span className="text-[11px] font-mono text-ink-300 mr-1">
            {saveStatus === 'saving' && 'Saving…'}
            {saveStatus === 'saved' && (
              <span className="flex items-center gap-0.5 text-sage-500">
                <Check className="w-3 h-3" /> Saved
              </span>
            )}
          </span>

          {/* Export dropdown */}
          <div className="relative">
            <button
              onClick={() => setExportOpen(!exportOpen)}
              title="Export idea"
              className="p-1.5 text-ink-300 hover:text-sage-600 transition-all rounded-card hover:bg-sage-50"
            >
              <Download className="w-4 h-4" />
            </button>
            {exportOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setExportOpen(false)} />
                <div className="absolute right-0 top-full mt-1 z-30 bg-paper border border-ink-100 rounded-card shadow-modal p-1 min-w-[160px] animate-scale-in">
                  <button
                    onClick={() => { exportIdeaAsMarkdown(idea); setExportOpen(false); }}
                    className="w-full text-left px-3 py-1.5 text-xs text-ink-600 hover:bg-ink-50 rounded-badge transition-colors"
                  >
                    Export as Markdown
                  </button>
                  <button
                    onClick={() => { exportIdeaAsJSON(idea); setExportOpen(false); }}
                    className="w-full text-left px-3 py-1.5 text-xs text-ink-600 hover:bg-ink-50 rounded-badge transition-colors"
                  >
                    Export as JSON
                  </button>
                </div>
              </>
            )}
          </div>
          {canShowGraduation(idea) && (
            <button
              onClick={() => setGraduationOpen(true)}
              title="Graduate idea"
              className="p-1.5 text-ink-300 hover:text-sage-600 transition-all rounded-card hover:bg-sage-50"
            >
              <Rocket className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => {
              if (idea.graduatedTo) setGitHubPublishOpen(true);
            }}
            disabled={!idea.graduatedTo}
            title={idea.graduatedTo ? 'Publish to GitHub' : 'Graduate this idea first to create a local project path'}
            className="p-1.5 text-ink-300 hover:text-ink-700 transition-all rounded-card hover:bg-ink-50 disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <GitBranch className="w-4 h-4" />
          </button>
          <button
            onClick={handleShelve}
            title={idea.stage === 'cold-storage' ? 'Move back to dormant' : 'Move to cold storage'}
            className="p-1.5 text-ink-300 hover:text-frost-600 transition-all rounded-card hover:bg-frost-50"
          >
            <Snowflake className="w-4 h-4" />
          </button>
          <button
            onClick={handleDuplicate}
            title="Duplicate idea"
            className="p-1.5 text-ink-300 hover:text-sage-600 transition-all rounded-card hover:bg-sage-50"
          >
            <Copy className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            title="Delete idea"
            className="p-1.5 text-ink-300 hover:text-red-500 transition-all rounded-card hover:bg-red-50"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Header: Title + Stage/Category selectors ─────── */}
      <div className="space-y-3" data-help="idea-header">
        <input
          type="text"
          value={idea.title}
          onChange={(e) => update('title', e.target.value)}
          placeholder="Idea title…"
          className="w-full text-2xl md:text-3xl font-serif font-semibold text-ink-900 bg-transparent
                     border-none outline-none placeholder:text-ink-200 focus:ring-0 tracking-tight"
        />

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Stage picker */}
          <div className="relative flex items-center gap-1">
            <button
              onClick={() => { setStageOpen(!stageOpen); setCategoryOpen(false); }}
              className="flex items-center gap-1 group"
            >
              <StageBadge stage={idea.stage} showIcon />
              <ChevronDown className="w-3 h-3 text-ink-300 group-hover:text-ink-500 transition-colors" />
            </button>
            {stageOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setStageOpen(false)} />
                <div className="absolute left-0 top-full mt-1 z-30 bg-paper border border-ink-100 rounded-card shadow-modal p-1 min-w-[170px] animate-scale-in">
                  {STAGES.map((s) => (
                    <button
                      key={s}
                      onClick={() => { saveNow({ stage: s }); setStageOpen(false); }}
                      className={`w-full text-left px-3 py-2 text-xs rounded-badge transition-colors flex items-center gap-2 ${
                        idea.stage === s
                          ? 'bg-sage-100 text-sage-800 font-semibold'
                          : 'text-ink-600 hover:bg-ink-50'
                      }`}
                    >
                      <span className="text-sm">{STAGE_ICONS[s]}</span>
                      {STAGE_LABELS[s]}
                    </button>
                  ))}
                </div>
              </>
            )}
            <HelpButton
              helpId="stage"
              title="Lifecycle Stages"
              summary="Every idea moves through gardening-themed stages from Seed to Market. Change stage at any time — it affects filtering, graduation eligibility, and discovery tools."
              manualSection="stages"
            />
          </div>

          {/* Category picker */}
          <div className="relative">
            <button
              onClick={() => { setCategoryOpen(!categoryOpen); setStageOpen(false); }}
              className="flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium font-mono
                         text-ink-400 bg-paper-warm border border-ink-100 rounded-badge
                         hover:border-ink-200 transition-colors"
            >
              {(() => {
                const cat = categorySettings.items.find((c) => c.id === idea.category);
                const label = cat?.label ?? CATEGORY_LABELS[idea.category] ?? idea.category;
                return cat?.icon ? `${cat.icon} ${label}` : label;
              })()}
              <ChevronDown className="w-3 h-3 text-ink-300" />
            </button>
            {categoryOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setCategoryOpen(false)} />
                <div className="absolute left-0 top-full mt-1 z-30 bg-paper border border-ink-100 rounded-card shadow-modal p-1 min-w-[160px] animate-scale-in">
                  {activeCategories.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => { saveNow({ category: c.id }); setCategoryOpen(false); }}
                      className={`w-full text-left px-3 py-2 text-xs rounded-badge transition-colors ${
                        idea.category === c.id
                          ? 'bg-sage-100 text-sage-800 font-semibold'
                          : 'text-ink-600 hover:bg-ink-50'
                      }`}
                    >
                      {c.icon ? `${c.icon} ${c.label}` : c.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {idea.graduatedTo && (
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => { void openProjectFolder(); }}
                disabled={openingProjectFolder}
                className="flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium font-mono
                           text-sage-700 bg-sage-50 border border-sage-200 rounded-badge
                           hover:border-sage-300 disabled:opacity-50 transition-colors"
                title="Open graduated project folder"
              >
                {openingProjectFolder ? <FolderOpen className="w-3 h-3" /> : <Rocket className="w-3 h-3" />}
                Graduated
                <FolderOpen className="w-3 h-3" />
              </button>
            </div>
          )}
          {!idea.graduatedTo && (
            <span className="text-[11px] text-ink-400 font-mono" data-help="github-publish-button">
              Publish to GitHub unlocks after graduation creates a local project folder.
            </span>
          )}
        </div>
      </div>

      {readiness && (
        <StageProgressPanel
          idea={idea}
          readiness={readiness}
          onMove={(nextStage) => saveNow({ stage: nextStage })}
        />
      )}

      <StageTimeline ideaId={idea.id} />

      {graduationMessage && (
        <div className="px-3 py-2 bg-sage-50 border border-sage-100 rounded-card text-xs text-sage-800">
          {graduationMessage}
        </div>
      )}
      {gitHubPublishMessage && (
        <div className="px-3 py-2 bg-sage-50 border border-sage-100 rounded-card text-xs text-sage-800">
          {gitHubPublishMessage}
        </div>
      )}

      {/* ── Editor sections ──────────────────────────────── */}
      <div className="space-y-6" data-help="idea-core-fields">
        {canSee('fullNotes') && (
          <Section
            label={idea.stage === 'seed' ? 'The Spark' : 'Raw Notes'}
            hint={idea.stage === 'seed'
              ? 'Your initial brain dump, unfiltered'
              : 'Your original thoughts plus anything new'}
            action={<AiSuggestionButton idea={idea} field="fullNotes" currentValue={idea.fullNotes} onApply={(value) => saveNow({ fullNotes: value })} />}
          >
            <AutoGrowTextarea
              value={idea.fullNotes}
              onChange={(v) => update('fullNotes', v)}
              placeholder={idea.stage === 'seed'
                ? 'Brain dump your idea - rough thoughts, a scenario, whatever comes to mind...'
                : 'Keep extending the spark with details, constraints, and examples...'}
              minRows={4}
            />
          </Section>
        )}

        {canSee('hook') && (
          <Section
            label="Concept"
            hint="What is this thing? Describe it like you're explaining to a friend"
            action={<AiSuggestionButton idea={idea} field="hook" currentValue={idea.hook} onApply={(value) => saveNow({ hook: value })} />}
          >
            <AutoGrowTextarea
              value={idea.hook}
              onChange={(v) => update('hook', v)}
              placeholder="Describe the concept in plain language..."
              minRows={2}
            />
          </Section>
        )}

        {canSee('whyItMightWork') && (
          <Section
            label="The Case"
            hint="Why is this worth building? What need does it meet?"
            action={<AiSuggestionButton idea={idea} field="whyItMightWork" currentValue={idea.whyItMightWork} onApply={(value) => saveNow({ whyItMightWork: value })} />}
          >
            <AutoGrowTextarea
              value={idea.whyItMightWork}
              onChange={(v) => update('whyItMightWork', v)}
              placeholder="What makes this interesting, useful, or timely?"
              minRows={2}
            />
          </Section>
        )}

        {canSee('pitch') && (
          <Section
            label="Elevator Pitch"
            hint="Distill the concept into one sentence"
            action={<AiSuggestionButton idea={idea} field="pitch" currentValue={idea.pitch} onApply={(value) => saveNow({ pitch: value })} />}
          >
            <input
              type="text"
              value={idea.pitch}
              onChange={(e) => update('pitch', e.target.value)}
              placeholder="One sentence that captures the concept..."
              className="w-full px-3 py-2.5 text-sm bg-paper-warm border border-ink-100 rounded-card
                         outline-none focus:ring-2 focus:ring-sage-400 focus:border-sage-300
                         transition-all text-ink-800 placeholder:text-ink-300"
            />
          </Section>
        )}

        {canSee('risks') && (
          <Section
            label="Risks & Blockers"
            hint="What could go wrong or get in the way?"
            action={<AiSuggestionButton idea={idea} field="risks" currentValue={idea.risks} onApply={(value) => saveNow({ risks: value })} />}
          >
            <AutoGrowTextarea
              value={idea.risks}
              onChange={(v) => update('risks', v)}
              placeholder="Technical debt, scope creep, motivation decay…"
              minRows={2}
            />
          </Section>
        )}

        {canSee('techStack') && (
          <Section
            label="Build Notes"
            hint="Tech stack, architecture ideas, scope boundaries, first steps"
            action={<AiSuggestionButton idea={idea} field="techStack" currentValue={idea.techStack} onApply={(value) => saveNow({ techStack: value })} />}
          >
            <AutoGrowTextarea
              value={idea.techStack}
              onChange={(v) => update('techStack', v)}
              placeholder="Stack choices, architecture, scope constraints, first build steps..."
              minRows={2}
            />
          </Section>
        )}

        {canSee('aesthetic') && (
          <div data-help="aesthetic-style">
            <Section
              label="Aesthetic & Style"
              hint="Visual direction, references, and creative tone"
              action={<AiSuggestionButton idea={idea} field="aesthetic" currentValue={idea.aesthetic} onApply={(value) => saveNow({ aesthetic: value })} />}
            >
              <AutoGrowTextarea
                value={idea.aesthetic}
                onChange={(v) => update('aesthetic', v)}
                placeholder="Color direction, typography, visual references, tone words, and style constraints..."
                minRows={2}
              />
            </Section>
          </div>
        )}

        {(canSee('tags') || canSee('moodLabels')) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4" data-help="idea-tags-and-scores">
            {canSee('tags') && (
              <TagInput
                label="Tags"
                tags={idea.tags}
                onChange={(tags) => update('tags', tags)}
                placeholder="Add tag… (Enter or comma)"
              />
            )}
            {canSee('moodLabels') && (
              <TagInput
                label="Mood Labels"
                tags={idea.moodLabels}
                onChange={(labels) => update('moodLabels', labels)}
                placeholder="e.g. cozy, chaotic, meditative"
              />
            )}
          </div>
        )}

        {(canSee('excitementScore') || canSee('jamScore')) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4" data-help="idea-tags-and-scores">
            {canSee('excitementScore') && (
              <ScorePicker
                label="Personal Excitement"
                value={idea.excitementScore}
                onChange={(v) => update('excitementScore', v)}
                helpSummary="How excited are you about this idea? 1 = vague interest, 5 = can't stop thinking about it. Used for sorting and health checks."
                helpManualSection="idea-editing"
              />
            )}
            {canSee('jamScore') && (
              <ScorePicker
                label="Feasibility"
                value={idea.jamScore}
                onChange={(v) => update('jamScore', v)}
                helpSummary="How feasible is this to build? 1 = major unknowns, 5 = very doable with current skills and time."
                helpManualSection="idea-editing"
              />
            )}
          </div>
        )}

        {canSee('images') && (
          <ImageGallery
            ideaId={idea.id}
            images={idea.images}
            onChange={syncImages}
          />
        )}

        {canSee('links') && (
          <div data-help="idea-links-related">
            <LinkEditor
              links={idea.links}
              onChange={(links) => update('links', links)}
            />
          </div>
        )}

        {canSee('relatedIdeaIds') && (
          <div data-help="idea-links-related">
            <RelatedIdeasLinker
              ideaId={idea.id}
              relatedIds={idea.relatedIdeaIds}
              onChange={(ids) => update('relatedIdeaIds', ids)}
            />
          </div>
        )}

        {!showAllFields && hiddenFields.length > 0 && nextStageForUnlock && (
          <div
            className="rounded-card border border-sage-100 bg-sage-50/50 px-3 py-2.5"
            data-help="progressive-disclosure-teaser"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-sage-800">
                Unlock more fields by advancing to{' '}
                <button
                  type="button"
                  onClick={() => saveNow({ stage: nextStageForUnlock })}
                  className="font-medium text-sage-900 hover:text-sage-950 underline underline-offset-2 cursor-pointer"
                >
                  {STAGE_LABELS[nextStageForUnlock]}
                </button>.
              </p>
              <button
                type="button"
                onClick={() => setTeaserExpandedFor((value) => (value === teaserContextKey ? null : teaserContextKey))}
                className="text-[11px] font-mono text-sage-700 hover:text-sage-900"
              >
                {teaserExpanded ? 'Hide details' : 'Show details'}
              </button>
            </div>
            {teaserExpanded && (
              <div className="mt-2 space-y-2">
                <p className="text-[11px] text-sage-700">
                  Hidden now: {hiddenFields.map((field) => displayLabelForField(field, idea.stage)).join(', ')}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    if (!id) return;
                    setShowAllFieldsByIdea((prev) => ({ ...prev, [id]: true }));
                    setTeaserExpandedFor(null);
                  }}
                  className="text-[11px] font-medium text-sage-800 hover:text-sage-950 underline underline-offset-2"
                >
                  Show all fields anyway
                </button>
              </div>
            )}
          </div>
        )}

        {showAllFields && hiddenFieldsForStage.length > 0 && (
          <div className="rounded-card border border-sage-100 bg-sage-50/50 px-3 py-2.5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-sage-700">
                Showing all fields. Some are beyond the current <strong>{STAGE_LABELS[idea.stage]}</strong> stage.
              </p>
              <button
                type="button"
                onClick={() => {
                  if (!id) return;
                  setShowAllFieldsByIdea((prev) => ({ ...prev, [id]: false }));
                }}
                className="text-[11px] font-mono text-sage-700 hover:text-sage-900 whitespace-nowrap"
              >
                Show stage fields only
              </button>
            </div>
          </div>
        )}
      </div>

      {canSee('retrospective') && (
        <div className="pt-5 border-t border-ink-100" data-help="retrospective">
          <Section
            label="Retrospective"
            hint="What happened, what worked, and what to carry into the next idea"
            action={<AiSuggestionButton idea={idea} field="retrospective" currentValue={idea.retrospective} onApply={(value) => saveNow({ retrospective: value })} />}
          >
            <AutoGrowTextarea
              value={idea.retrospective}
              onChange={(v) => update('retrospective', v)}
              placeholder="Capture outcomes, surprises, tradeoffs, and lessons learned..."
              minRows={3}
            />
          </Section>
        </div>
      )}

      {canSee('landscapeAnalysis') && (
        <div className="pt-5 border-t border-ink-100">
          <LandscapeAnalysis idea={idea} />
        </div>
      )}

      {/* ── Thinking Partner ─────────────────────────────── */}
      <div className="pt-5 border-t border-ink-100" data-help="health-check">
        <div className="flex items-center gap-1.5 mb-2">
          <span className="text-xs font-mono uppercase tracking-wider text-ink-400">Health Check</span>
          <HelpButton
            helpId="health-check"
            title="Idea Health Check"
            summary="Combines field quality feedback with stage-aware readiness criteria so you can see exactly what is missing before promotion."
            manualSection="health-check"
            alwaysShow
          />
        </div>
        <IdeaHealthCheck idea={idea} onPromote={(nextStage) => saveNow({ stage: nextStage })} />
      </div>

      <ProjectGenerationSection
        idea={idea}
        onGenerated={handleProjectGenerated}
        onIdeaUpdated={setIdea}
        onPublishClick={() => setGitHubPublishOpen(true)}
      />

      <div className="pt-5 border-t border-ink-100 space-y-3" data-help="idea-thinking-partner">
        <AiChatPanel idea={idea} onApply={saveNow} />
      </div>

      {/* ── Version History ──────────────────────────────── */}
      <div className="pt-5 border-t border-ink-100" data-help="idea-version-history">
        <VersionHistory ideaId={idea.id} onRestored={handleVersionRestored} />
      </div>

      {/* ── Delete confirmation modal ────────────────────── */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/30 backdrop-blur-sm animate-fade-in" data-help="idea-delete-modal">
          <div className="bg-paper w-full max-w-sm rounded-card shadow-modal border border-ink-100 p-6 animate-scale-in">
            <h2 className="text-lg font-serif font-semibold text-ink-900 mb-2">
              Remove this seed?
            </h2>
            <p className="text-sm text-ink-500 mb-5 leading-relaxed">
              This will move <strong>"{idea.title || 'Untitled'}"</strong> to Compost.
              You can restore it for 30 days before it is purged.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-ink-500 hover:bg-ink-50
                           rounded-card transition-colors"
              >
                Keep it
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 px-4 py-2.5 text-sm font-medium bg-red-600 hover:bg-red-700
                           active:bg-red-800 text-white rounded-card transition-all active:scale-[0.98]"
              >
                Move to Compost
              </button>
            </div>
          </div>
          <div className="fixed inset-0 -z-10" onClick={() => setShowDeleteConfirm(false)} />
        </div>
      )}

      {graduationOpen && (
        <GraduationModal
          idea={idea}
          onClose={() => setGraduationOpen(false)}
          onGraduated={handleGraduated}
        />
      )}

      {gitHubPublishOpen && (
        <GitHubPublishModal
          idea={idea}
          onClose={() => setGitHubPublishOpen(false)}
          onPublished={handleGitHubPublished}
        />
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────

function Section({
  label,
  hint,
  action,
  children,
}: {
  label: string;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-0.5">
        <label className="block text-[11px] font-medium text-ink-400 uppercase tracking-wider font-mono">
          {label}
        </label>
      </div>
      {hint && <p className="text-[11px] text-ink-300 mb-2">{hint}</p>}
      {children}
      {action && (
        <div className="mt-2 flex justify-end">
          {action}
        </div>
      )}
    </div>
  );
}

function AutoGrowTextarea({
  value,
  onChange,
  placeholder,
  minRows = 3,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  minRows?: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(el.scrollHeight, minRows * 24)}px`;
  }, [value, minRows]);

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={minRows}
      className="w-full px-3 py-2.5 text-sm bg-paper-warm border border-ink-100 rounded-card
                 outline-none focus:ring-2 focus:ring-sage-400 focus:border-sage-300
                 transition-all text-ink-800 placeholder:text-ink-300
                 resize-none leading-relaxed"
    />
  );
}
