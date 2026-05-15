import { useEffect, useState } from 'react';
import { Loader2, SearchCheck, Sparkles } from 'lucide-react';
import type { Idea, LandscapeReport } from '@/lib/types';
import { analyzeLandscape, getLatestLandscapeReport, preflightAiRequest } from '@/api/client';

interface LandscapeAnalysisProps {
  idea: Idea;
}

export default function LandscapeAnalysis({ idea }: LandscapeAnalysisProps) {
  const [report, setReport] = useState<LandscapeReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [bootLoading, setBootLoading] = useState(true);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [routeLabel, setRouteLabel] = useState('');

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setBootLoading(true);
      setError(null);
      try {
        const result = await getLatestLandscapeReport(idea.id);
        if (!cancelled) {
          setReport(result.report);
          if (result.report) setRouteLabel(`${result.report.provider} / ${result.report.model}`);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setBootLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [idea.id]);

  const runAnalysis = async () => {
    setLoading(true);
    setError(null);
    setWarnings([]);

    try {
      const preflight = await preflightAiRequest({ feature: 'landscape-analysis' });
      setWarnings(preflight.warnings);
      setRouteLabel(`${preflight.provider} / ${preflight.resolvedModelId ?? preflight.model}`);
      if (!preflight.allowed) {
        setError(preflight.blockers.join(' '));
        return;
      }

      const result = await analyzeLandscape({
        ideaId: idea.id,
        ...(preflight.confirmationToken ? { aiConfirmationToken: preflight.confirmationToken } : {}),
      });
      setReport(result.report);
      setRouteLabel(`${result.report.provider} / ${result.report.model}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const hasReport = Boolean(report);
  const buttonLabel = loading ? 'Analyzing...' : hasReport ? 'Re-analyze' : 'Analyze Landscape';
  const buttonClass = hasReport
    ? 'border border-sky-300 text-sky-700 bg-paper hover:bg-sky-50'
    : 'bg-sky-600 hover:bg-sky-700 text-paper';

  return (
    <div className="bg-paper border border-ink-100 rounded-card p-4 shadow-card" data-help="landscape-analysis">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-sky-50 border border-sky-100 flex items-center justify-center">
            <SearchCheck className="w-4 h-4 text-sky-600" />
          </div>
          <div>
            <h2 className="text-sm font-serif font-semibold text-ink-900">Landscape Analysis</h2>
            <p className="text-xs text-ink-400">AI viability and positioning scan.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={runAnalysis}
          disabled={loading || bootLoading}
          className={`flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-badge transition-colors disabled:opacity-50 ${buttonClass}`}
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          {buttonLabel}
        </button>
      </div>

      {report && (
        <p className="mb-2 text-[11px] text-ink-500">
          Analyzed {relativeTime(report.createdAt)} via {report.provider} / {report.model}
        </p>
      )}

      {!report && routeLabel && (
        <p className="mb-2 text-[11px] font-mono text-ink-400">Route: {routeLabel}</p>
      )}

      {warnings.length > 0 && (
        <div className="mb-3 px-3 py-2 rounded-card border border-amber-200 bg-amber-50 text-xs text-amber-900 space-y-1">
          {warnings.map((warning) => <p key={warning}>{warning}</p>)}
        </div>
      )}

      {error && (
        <div className="mb-3 px-3 py-2 rounded-card border border-red-200 bg-red-50 text-xs text-red-800">
          {error}
        </div>
      )}

      {bootLoading && !report ? (
        <div className="text-xs text-ink-500">Loading saved analysis...</div>
      ) : report ? (
        <div className="space-y-3">
          <Section label="Existing Alternatives" body={report.sections.existingAlternatives} />
          <Section label="Gaps & Pain Points" body={report.sections.gapsAndPainPoints} />
          <Section label="Demand Signals" body={report.sections.demandSignals} />
          <Section label="Positioning Angle" body={report.sections.positioningAngle} />
          <Section label="Overall Viability" body={report.sections.overallViability} />
        </div>
      ) : (
        <div className="text-xs text-ink-500">Run an analysis to save and view your first landscape report.</div>
      )}

      <p className="mt-3 text-[11px] text-ink-400 leading-relaxed">
        This analysis reflects the AI&apos;s available knowledge. Results are strongest with providers that support web search (Claude, Codex, some Ollama configurations with web tools). Treat this as a starting point for your own research, not a definitive market report.
      </p>
    </div>
  );
}

function Section({ label, body }: { label: string; body: string }) {
  return (
    <div className="px-3 py-2.5 bg-paper-warm border border-ink-100 rounded-card">
      <p className="text-[11px] font-mono uppercase tracking-wider text-ink-500 mb-1">{label}</p>
      <p className="text-xs text-ink-700 whitespace-pre-wrap leading-relaxed">{body || 'No details returned for this section.'}</p>
    </div>
  );
}

function relativeTime(date: Date): string {
  const diff = Date.now() - date.getTime();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;
  const month = 30 * day;
  const year = 365 * day;

  if (diff < minute) return 'just now';
  if (diff < hour) return `${Math.floor(diff / minute)}m ago`;
  if (diff < day) return `${Math.floor(diff / hour)}h ago`;
  if (diff < week) return `${Math.floor(diff / day)}d ago`;
  if (diff < month) return `${Math.floor(diff / week)}w ago`;
  if (diff < year) return `${Math.floor(diff / month)}mo ago`;
  return `${Math.floor(diff / year)}y ago`;
}
