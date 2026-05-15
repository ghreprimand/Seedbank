import { useMemo, useState } from 'react';
import { Activity, CheckCircle2, RefreshCw, AlertCircle } from 'lucide-react';
import type { Idea, Stage } from '@/lib/types';
import { STAGE_LABELS } from '@/lib/types';
import { aiSuggest } from '@/api/client';
import { assessReadiness } from '@/lib/stageReadiness';

interface FieldAssessment {
  label: string;
  value: string;
  status: 'strong' | 'needs-attention';
  note: string;
}

function assessIdea(idea: Idea): FieldAssessment[] {
  return [
    {
      label: 'Elevator Pitch',
      value: idea.pitch,
      status: idea.pitch.trim().length >= 40 ? 'strong' : 'needs-attention',
      note: idea.pitch.trim() ? 'Present, but it may need sharper stakes.' : 'Missing a one-line explanation.',
    },
    {
      label: 'Concept',
      value: idea.hook,
      status: idea.hook.trim().length >= 30 ? 'strong' : 'needs-attention',
      note: idea.hook.trim() ? 'There is a clear concept to build around.' : 'Needs a plain-language explanation of what this is.',
    },
    {
      label: 'The Case',
      value: idea.whyItMightWork,
      status: idea.whyItMightWork.trim().length >= 40 ? 'strong' : 'needs-attention',
      note: idea.whyItMightWork.trim() ? 'Has supporting reasoning.' : 'Needs the case for why this is worth building.',
    },
    {
      label: 'Risks',
      value: idea.risks,
      status: idea.risks.trim().length >= 20 ? 'strong' : 'needs-attention',
      note: idea.risks.trim() ? 'Risks are visible enough to discuss.' : 'Missing failure modes or blockers.',
    },
    {
      label: 'Build Notes',
      value: idea.techStack,
      status: idea.techStack.trim().length >= 15 ? 'strong' : 'needs-attention',
      note: idea.techStack.trim() ? 'Implementation direction exists.' : 'Needs likely tools or constraints.',
    },
    {
      label: 'Tags (optional)',
      value: idea.tags.join(', '),
      status: 'strong',
      note: idea.tags.length
        ? 'Useful for discovery, but never required for stage progress.'
        : 'Optional. Add tags only if they help you find or group this later.',
    },
  ];
}

function fallbackSummary(idea: Idea, fields: FieldAssessment[]): string {
  const strong = fields.filter((field) => field.status === 'strong').map((field) => field.label);
  const weak = fields.filter((field) => field.status === 'needs-attention').map((field) => field.label);
  if (weak.length === 0) {
    return `${idea.title || 'This idea'} is well-rounded. The next useful move is to test the smallest version rather than add more description.`;
  }
  return `${idea.title || 'This idea'} has strength in ${strong.join(', ') || 'its core spark'}, but needs attention in ${weak.join(', ')}. Start with the weakest field that would make the idea easier to judge.`;
}

export default function IdeaHealthCheck({ idea, onPromote }: { idea: Idea; onPromote?: (nextStage: Stage) => void }) {
  const fields = useMemo(() => assessIdea(idea), [idea]);
  const readiness = useMemo(() => assessReadiness(idea), [idea]);
  const [summary, setSummary] = useState('');
  const [loading, setLoading] = useState(false);

  const runHealthCheck = async () => {
    setLoading(true);
    try {
      const result = await aiSuggest('health-check', {
        idea,
        fields,
        readiness,
        instruction: 'Return a stage-aware assessment: prioritize what matters for the current stage and next-stage readiness.',
      });
      setSummary(result.text);
    } catch {
      setSummary(fallbackSummary(idea, fields));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-paper border border-ink-100 rounded-card p-4 shadow-card">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-amber-50 border border-amber-100 flex items-center justify-center">
            <Activity className="w-4 h-4 text-amber-600" />
          </div>
          <div>
            <h2 className="text-sm font-serif font-semibold text-ink-900">Idea Health Check</h2>
            <p className="text-xs text-ink-400">Field-by-field readiness review.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={runHealthCheck}
          disabled={loading}
          className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-amber-500 hover:bg-amber-600 text-paper rounded-badge transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Check
        </button>
      </div>

      {readiness.nextStage !== idea.stage && (
        readiness.ready ? (
          <div className="mb-4 px-3 py-2.5 bg-sage-50 border border-sage-200 rounded-card flex items-center justify-between gap-3">
            <p className="text-xs text-sage-800">
              Ready for <strong>{STAGE_LABELS[readiness.nextStage]}</strong>.
            </p>
            {onPromote && (
              <button
                type="button"
                onClick={() => onPromote(readiness.nextStage)}
                className="px-2.5 py-1 text-[11px] font-medium bg-sage-600 hover:bg-sage-700 text-white rounded-badge transition-colors"
              >
                Promote
              </button>
            )}
          </div>
        ) : (
          <div className="mb-4 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-card">
            <p className="text-xs text-amber-900 mb-1.5">
              Suggested checks before <strong>{STAGE_LABELS[readiness.nextStage]}</strong>.
            </p>
            <ul className="space-y-1">
              {readiness.missing.map((item) => (
                <li key={item} className="text-xs text-amber-800">• {item}</li>
              ))}
            </ul>
            {onPromote && (
              <button
                type="button"
                onClick={() => onPromote(readiness.nextStage)}
                className="mt-2 px-2.5 py-1 text-[11px] font-medium bg-paper hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-badge transition-colors"
              >
                Move anyway
              </button>
            )}
          </div>
        )
      )}

      {summary && (
        <div className="mb-4 px-3 py-2.5 bg-amber-50 border border-amber-100 rounded-card text-sm text-amber-900 leading-relaxed">
          {summary}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {fields.map((field) => (
          <div
            key={field.label}
            className="px-3 py-2.5 bg-paper-warm border border-ink-100 rounded-card"
          >
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-xs font-medium text-ink-700">{field.label}</span>
              {field.status === 'strong' ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-mono text-sage-700">
                  <CheckCircle2 className="w-3 h-3" />
                  strong
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] font-mono text-amber-700">
                  <AlertCircle className="w-3 h-3" />
                  needs attention
                </span>
              )}
            </div>
            <p className="text-xs text-ink-400 leading-relaxed">{field.note}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
