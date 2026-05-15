import { useEffect, useMemo, useState } from 'react';
import type { DragEvent } from 'react';
import { updateIdea } from '@/api/client';
import StageCard from '@/components/StageCard';
import type { Idea, Stage } from '@/lib/types';
import { STAGES, STAGE_ICONS, STAGE_LABELS } from '@/lib/types';

interface StagesViewProps {
  ideas: Idea[];
  onIdeasChanged: () => void;
}

const COLLAPSIBLE_STAGES: Stage[] = ['shelved', 'cold-storage', 'shipped'];

export default function StagesView({ ideas, onIdeasChanged }: StagesViewProps) {
  const [draggingIdeaId, setDraggingIdeaId] = useState<string | null>(null);
  const [dropStage, setDropStage] = useState<Stage | null>(null);
  const [touchMode, setTouchMode] = useState(false);
  const [movingIdeaId, setMovingIdeaId] = useState<string | null>(null);
  const [openMoveMenuIdeaId, setOpenMoveMenuIdeaId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<Stage, boolean>>({
    seed: false,
    sprout: false,
    pitch: false,
    prototype: false,
    plot: false,
    shelved: true,
    'cold-storage': true,
    shipped: true,
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(pointer: coarse)');
    const sync = () => setTouchMode(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  const ideasByStage = useMemo(() => {
    const grouped: Record<Stage, Idea[]> = {
      seed: [],
      sprout: [],
      pitch: [],
      prototype: [],
      plot: [],
      shelved: [],
      'cold-storage': [],
      shipped: [],
    };
    for (const idea of ideas) grouped[idea.stage].push(idea);
    return grouped;
  }, [ideas]);

  const moveIdeaToStage = async (ideaId: string, nextStage: Stage) => {
    const current = ideas.find((idea) => idea.id === ideaId);
    if (!current || current.stage === nextStage) return;
    setMovingIdeaId(ideaId);
    try {
      await updateIdea(ideaId, { stage: nextStage });
      onIdeasChanged();
    } catch (error) {
      console.error('Failed to move idea stage in Stages view:', error);
    } finally {
      setMovingIdeaId(null);
      setOpenMoveMenuIdeaId(null);
      setDropStage(null);
      setDraggingIdeaId(null);
    }
  };

  const handleDrop = async (targetStage: Stage, event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    const raw = event.dataTransfer.getData('application/seedbank-stages');
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as { ideaId?: string; stage?: Stage };
      if (!parsed.ideaId || !parsed.stage) return;
      await moveIdeaToStage(parsed.ideaId, targetStage);
    } catch {
      // Ignore malformed drag payloads.
    }
  };

  return (
    <div className="space-y-3" data-help="stages-view">
      {touchMode && (
        <p className="text-[11px] font-mono text-ink-400">Touch mode enabled: tap a card to move it between stages.</p>
      )}

      {STAGES.map((stage) => {
        const stageIdeas = ideasByStage[stage];
        const isCollapsed = collapsed[stage];
        const isCollapsible = COLLAPSIBLE_STAGES.includes(stage);
        const isDropTarget = dropStage === stage;

        return (
          <section
            key={stage}
            className={`rounded-card border bg-paper-warm/40 px-3 py-2 transition-colors ${
              isDropTarget ? 'border-sage-400 bg-sage-50/50' : 'border-ink-100'
            }`}
            onDragOver={touchMode ? undefined : (event) => {
              event.preventDefault();
              setDropStage(stage);
            }}
            onDragLeave={touchMode ? undefined : () => {
              setDropStage((current) => (current === stage ? null : current));
            }}
            onDrop={touchMode ? undefined : (event) => {
              void handleDrop(stage, event);
            }}
          >
            <header className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-ink-800 truncate">
                  <span className="mr-1" aria-hidden>{STAGE_ICONS[stage]}</span>
                  {STAGE_LABELS[stage]}
                </h3>
                <p className="text-[11px] text-ink-400 font-mono">
                  {stageIdeas.length} idea{stageIdeas.length !== 1 ? 's' : ''}
                </p>
              </div>
              {isCollapsible && (
                <button
                  type="button"
                  className="px-2 py-1 text-[10px] font-mono text-ink-500 rounded-badge border border-ink-100 hover:border-sage-300 hover:bg-sage-50 transition-colors"
                  onClick={() => setCollapsed((current) => ({ ...current, [stage]: !current[stage] }))}
                >
                  {isCollapsed ? 'Expand' : 'Collapse'}
                </button>
              )}
            </header>

            {!isCollapsed && stageIdeas.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {stageIdeas.map((idea) => (
                  <StageCard
                    key={idea.id}
                    idea={idea}
                    touchMode={touchMode}
                    moveMenuOpen={openMoveMenuIdeaId === idea.id}
                    onToggleMoveMenu={() => setOpenMoveMenuIdeaId((current) => (current === idea.id ? null : idea.id))}
                    onMoveStage={(nextStage) => {
                      void moveIdeaToStage(idea.id, nextStage);
                    }}
                    onDragStart={(ideaId, currentStage, event) => {
                      event.dataTransfer.setData('application/seedbank-stages', JSON.stringify({ ideaId, stage: currentStage }));
                      event.dataTransfer.effectAllowed = 'move';
                      setDraggingIdeaId(ideaId);
                    }}
                    onDragEnd={() => {
                      setDropStage(null);
                      setDraggingIdeaId(null);
                    }}
                    disabled={movingIdeaId === idea.id || (draggingIdeaId !== null && draggingIdeaId !== idea.id)}
                  />
                ))}
              </div>
            )}

            {!isCollapsed && stageIdeas.length === 0 && (
              <div className="mt-2 text-xs text-ink-300">No ideas in this stage.</div>
            )}

            {isCollapsed && (
              <div className="mt-1 text-xs text-ink-300">
                {stageIdeas.length === 0 ? 'No ideas in this stage.' : `${stageIdeas.length} idea${stageIdeas.length !== 1 ? 's' : ''} hidden.`}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
