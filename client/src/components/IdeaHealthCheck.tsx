import { useMemo, useState } from 'react';
import { Activity, CheckCircle2, RefreshCw, AlertCircle } from 'lucide-react';
import type { Idea } from '@/lib/types';
import { aiSuggest } from '@/api/client';

interface FieldAssessment {
  label: string;
  value: string;
  status: 'strong' | 'needs-attention';
  note: string;
}

function assessIdea(idea: Idea): FieldAssessment[] {
  return [
    {
      label: 'Pitch',
      value: idea.pitch,
      status: idea.pitch.trim().length >= 40 ? 'strong' : 'needs-attention',
      note: idea.pitch.trim() ? 'Present, but it may need sharper stakes.' : 'Missing a one-line explanation.',
    },
    {
      label: 'Hook',
      value: idea.hook,
      status: idea.hook.trim().length >= 30 ? 'strong' : 'needs-attention',
      note: idea.hook.trim() ? 'There is a demo angle to test.' : 'Needs a concrete 30-second demo concept.',
    },
    {
      label: 'Why It Might Work',
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
      label: 'Tech Stack',
      value: idea.techStack,
      status: idea.techStack.trim().length >= 15 ? 'strong' : 'needs-attention',
      note: idea.techStack.trim() ? 'Implementation direction exists.' : 'Needs likely tools or constraints.',
    },
    {
      label: 'Tags',
      value: idea.tags.join(', '),
      status: idea.tags.length >= 2 ? 'strong' : 'needs-attention',
      note: idea.tags.length ? 'Partly categorized for discovery.' : 'Needs tags to connect with related ideas.',
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

export default function IdeaHealthCheck({ idea }: { idea: Idea }) {
  const fields = useMemo(() => assessIdea(idea), [idea]);
  const [summary, setSummary] = useState('');
  const [loading, setLoading] = useState(false);

  const runHealthCheck = async () => {
    setLoading(true);
    try {
      const result = await aiSuggest('health-check', {
        idea,
        fields,
        instruction: 'Return a holistic assessment of strong fields and fields needing attention.',
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
