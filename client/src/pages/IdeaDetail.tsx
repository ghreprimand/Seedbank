/** Idea detail / editor page — all 14 fields, auto-save, version history, and actions. */
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  Copy,
  Trash2,
  Snowflake,
  Check,
  ChevronDown,
  Download,
  ExternalLink,
  Rocket,
} from 'lucide-react';

import type { Idea, Stage } from '@/lib/types';
import {
  CATEGORIES,
  CATEGORY_LABELS,
  STAGES,
  STAGE_LABELS,
  STAGE_ICONS,
} from '@/lib/types';
import {
  getIdea,
  updateIdea,
  deleteIdea,
  duplicateIdea,
} from '@/api/client';
import { useDebouncedCallback } from '@/hooks/useDebounce';

import StageBadge from '@/components/StageBadge';
import TagInput from '@/components/TagInput';
import ScorePicker from '@/components/ScorePicker';
import LinkEditor from '@/components/LinkEditor';
import RelatedIdeasLinker from '@/components/RelatedIdeasLinker';
import VersionHistory from '@/components/VersionHistory';
import GraduationModal from '@/components/GraduationModal';
import AiChatPanel from '@/components/AiChatPanel';
import IdeaHealthCheck from '@/components/IdeaHealthCheck';
import AiSuggestionButton from '@/components/AiSuggestionButton';
import type { GraduationResponse } from '@/api/client';
import { exportIdeaAsMarkdown, exportIdeaAsJSON } from '@/lib/export';

/** Auto-save debounce delay in ms */
const SAVE_DELAY = 800;

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

  const [reloadKey, setReloadKey] = useState(0);

  // Loading is derived from "have I finished fetching the requested id?"
  // — avoids a synchronous setLoading(true) inside the effect.
  const loading = !!id && loadedId !== id;

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
      const next = { ...prev, [field]: value };
      scheduleSave(next);
      return next;
    });
  };

  const saveNow = async (changes: Partial<Idea>) => {
    if (!idea) return;
    cancelSave();
    setIdea((prev) => (prev ? { ...prev, ...changes } : prev));
    setSaveStatus('saving');
    try {
      const updated = await updateIdea(idea.id, changes);
      if (updated) setIdea(updated);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 1500);
    } catch (err) {
      console.error('Save failed:', err);
      setSaveStatus('idle');
    }
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
    <div className="space-y-6 max-w-3xl mx-auto pb-16 animate-fade-in">
      {/* ── Top bar ──────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4">
        <Link to="/" className="text-ink-400 hover:text-ink-600 text-sm flex items-center gap-1 transition-colors group">
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" /> Garden
        </Link>

        <div className="flex items-center gap-1.5">
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
            onClick={handleShelve}
            title={idea.stage === 'cold-storage' ? 'Move back to shelved' : 'Move to cold storage'}
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
      <div className="space-y-3">
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
          <div className="relative">
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
          </div>

          {/* Category picker */}
          <div className="relative">
            <button
              onClick={() => { setCategoryOpen(!categoryOpen); setStageOpen(false); }}
              className="flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium font-mono
                         text-ink-400 bg-paper-warm border border-ink-100 rounded-badge
                         hover:border-ink-200 transition-colors"
            >
              {CATEGORY_LABELS[idea.category]}
              <ChevronDown className="w-3 h-3 text-ink-300" />
            </button>
            {categoryOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setCategoryOpen(false)} />
                <div className="absolute left-0 top-full mt-1 z-30 bg-paper border border-ink-100 rounded-card shadow-modal p-1 min-w-[160px] animate-scale-in">
                  {CATEGORIES.map((c) => (
                    <button
                      key={c}
                      onClick={() => { saveNow({ category: c }); setCategoryOpen(false); }}
                      className={`w-full text-left px-3 py-2 text-xs rounded-badge transition-colors ${
                        idea.category === c
                          ? 'bg-sage-100 text-sage-800 font-semibold'
                          : 'text-ink-600 hover:bg-ink-50'
                      }`}
                    >
                      {CATEGORY_LABELS[c]}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {idea.graduatedTo && (
            <a
              href={`file://${idea.graduatedTo}`}
              className="flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium font-mono
                         text-sage-700 bg-sage-50 border border-sage-200 rounded-badge
                         hover:border-sage-300 transition-colors"
            >
              <Rocket className="w-3 h-3" />
              Graduated
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>

      {graduationMessage && (
        <div className="px-3 py-2 bg-sage-50 border border-sage-100 rounded-card text-xs text-sage-800">
          {graduationMessage}
        </div>
      )}

      {/* ── Editor sections ──────────────────────────────── */}
      <div className="space-y-6">
        <Section
          label="Pitch"
          hint="One-line hook — what is this?"
          action={<AiSuggestionButton idea={idea} field="pitch" currentValue={idea.pitch} onApply={(value) => saveNow({ pitch: value })} />}
        >
          <input
            type="text"
            value={idea.pitch}
            onChange={(e) => update('pitch', e.target.value)}
            placeholder="One sentence that captures the idea…"
            className="w-full px-3 py-2.5 text-sm bg-paper-warm border border-ink-100 rounded-card
                       outline-none focus:ring-2 focus:ring-sage-400 focus:border-sage-300
                       transition-all text-ink-800 placeholder:text-ink-300"
          />
        </Section>

        <Section label="Full Notes" hint="Detailed description, raw thoughts, anything goes">
          <AutoGrowTextarea
            value={idea.fullNotes}
            onChange={(v) => update('fullNotes', v)}
            placeholder="Pour out your thoughts…"
            minRows={4}
          />
        </Section>

        <Section
          label="Hook / 30-Second Demo"
          hint="How would you show this off in 30 seconds?"
          action={<AiSuggestionButton idea={idea} field="hook" currentValue={idea.hook} onApply={(value) => saveNow({ hook: value })} />}
        >
          <AutoGrowTextarea
            value={idea.hook}
            onChange={(v) => update('hook', v)}
            placeholder="The elevator pitch demo…"
            minRows={2}
          />
        </Section>

        <Section
          label="Why It Might Work"
          hint="Arguments in favour"
          action={<AiSuggestionButton idea={idea} field="whyItMightWork" currentValue={idea.whyItMightWork} onApply={(value) => saveNow({ whyItMightWork: value })} />}
        >
          <AutoGrowTextarea
            value={idea.whyItMightWork}
            onChange={(v) => update('whyItMightWork', v)}
            placeholder="What makes this interesting, useful, or timely?"
            minRows={2}
          />
        </Section>

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

        <Section
          label="Tech Stack Notes"
          hint="Languages, frameworks, tools you'd reach for"
          action={<AiSuggestionButton idea={idea} field="techStack" currentValue={idea.techStack} onApply={(value) => saveNow({ techStack: value })} />}
        >
          <AutoGrowTextarea
            value={idea.techStack}
            onChange={(v) => update('techStack', v)}
            placeholder="React, Rust, SQLite, p5.js…"
            minRows={2}
          />
        </Section>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TagInput
            label="Tags"
            tags={idea.tags}
            onChange={(tags) => update('tags', tags)}
            placeholder="Add tag… (Enter or comma)"
          />
          <TagInput
            label="Mood Labels"
            tags={idea.moodLabels}
            onChange={(labels) => update('moodLabels', labels)}
            placeholder="e.g. cozy, chaotic, meditative"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ScorePicker
            label="Personal Excitement"
            value={idea.excitementScore}
            onChange={(v) => update('excitementScore', v)}
          />
          <ScorePicker
            label="Jam Suitability"
            value={idea.jamScore}
            onChange={(v) => update('jamScore', v)}
          />
        </div>

        <LinkEditor
          links={idea.links}
          onChange={(links) => update('links', links)}
        />

        <RelatedIdeasLinker
          ideaId={idea.id}
          relatedIds={idea.relatedIdeaIds}
          onChange={(ids) => update('relatedIdeaIds', ids)}
        />
      </div>

      {/* ── Thinking Partner ─────────────────────────────── */}
      <div className="pt-5 border-t border-ink-100">
        <IdeaHealthCheck idea={idea} />
      </div>

      <div className="pt-5 border-t border-ink-100">
        <AiChatPanel idea={idea} onApply={saveNow} />
      </div>

      {/* ── Version History ──────────────────────────────── */}
      <div className="pt-5 border-t border-ink-100">
        <VersionHistory ideaId={idea.id} onRestored={handleVersionRestored} />
      </div>

      {/* ── Delete confirmation modal ────────────────────── */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/30 backdrop-blur-sm animate-fade-in">
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
      <div className="flex items-center justify-between gap-3 mb-0.5">
        <label className="block text-[11px] font-medium text-ink-400 uppercase tracking-wider font-mono">
          {label}
        </label>
        {action}
      </div>
      {hint && <p className="text-[11px] text-ink-300 mb-2">{hint}</p>}
      {children}
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
