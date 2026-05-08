/**
 * Discover page — Phase 7 discovery & delight features.
 *
 * Contains four sections:
 *   1. Daily Seed — resurface one random idea with a prompt
 *   2. Cross-Pollinate — two random ideas side-by-side with hybrid prompt
 *   3. Draw from Storage — pull a random shelved/cold-storage idea
 *   4. Idea Weather — stats panel showing archive patterns
 */

import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Sprout,
  Shuffle,
  Archive,
  CloudSun,
  RefreshCw,
  ArrowRight,
  Lightbulb,
} from 'lucide-react';

import type { Idea, Stage } from '@/lib/types';
import { STAGE_ICONS, CATEGORY_LABELS } from '@/lib/types';
import { getAllIdeas, getStageStats, getIdeaCount } from '@/db/ideas';
import StageBadge from '@/components/StageBadge';
import CategoryBadge from '@/components/CategoryBadge';

// ── Prompts ─────────────────────────────────────────────────────────

const DAILY_PROMPTS = [
  'Add one reason this might work.',
  'What would the 30-second demo look like?',
  'Who would use this? Describe one person.',
  'What\'s the smallest version you could build today?',
  'Write a one-line pitch for this.',
  'What technology would make this surprisingly easy?',
  'What would make you excited to work on this right now?',
  'Name one risk — and one way around it.',
  'If this existed already, what would you search for to find it?',
  'What would the "shipped" version feel like to use?',
];

const HYBRID_PROMPTS = [
  'What if these two ideas merged into one?',
  'Could the tech from one solve a problem in the other?',
  'Imagine a project that lives halfway between these two.',
  'What would you call a mashup of these?',
  'Pick the best feature of each — what do you get?',
  'Is there a user who would want both of these?',
];

const STORAGE_PROMPTS = [
  'Does this still spark something?',
  'Has anything changed that makes this more viable now?',
  'Could this idea be simpler than you originally imagined?',
  'Is there a smaller version hiding inside this?',
  'Would this make a good jam project?',
];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickRandomN<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return [...arr];
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

// ── Sub-components ──────────────────────────────────────────────────

function MiniCard({ idea }: { idea: Idea }) {
  return (
    <Link
      to={`/idea/${idea.id}`}
      className="block bg-paper border border-ink-200 rounded-card p-4 shadow-card
                 hover:shadow-card-hover hover:border-sage-300 transition-all duration-200"
    >
      <div className="flex items-start gap-2 mb-1.5">
        <span className="text-base leading-none mt-0.5 shrink-0" aria-hidden>
          {STAGE_ICONS[idea.stage]}
        </span>
        <h3 className="text-base font-serif font-semibold text-ink-900 leading-snug line-clamp-2">
          {idea.title || 'Untitled Seed'}
        </h3>
      </div>
      {idea.pitch && (
        <p className="text-sm text-ink-500 leading-relaxed line-clamp-2 mb-2 pl-6">
          {idea.pitch}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-1.5 pl-6">
        <StageBadge stage={idea.stage} />
        <CategoryBadge category={idea.category} />
      </div>
    </Link>
  );
}

function SectionHeader({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3 mb-4">
      <div className="w-10 h-10 rounded-full bg-sage-100 flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div>
        <h2 className="text-lg font-serif font-semibold text-ink-900">{title}</h2>
        <p className="text-sm text-ink-400">{description}</p>
      </div>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────

export default function Discover() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);

  // Daily Seed
  const [dailySeed, setDailySeed] = useState<Idea | null>(null);
  const [dailyPrompt, setDailyPrompt] = useState('');

  // Cross-Pollinate
  const [crossPair, setCrossPair] = useState<[Idea, Idea] | null>(null);
  const [hybridPrompt, setHybridPrompt] = useState('');

  // Draw from Storage
  const [storageDraw, setStorageDraw] = useState<Idea | null>(null);
  const [storagePrompt, setStoragePrompt] = useState('');

  // Idea Weather
  const [stageStats, setStageStats] = useState<Record<string, number>>({});
  const [totalCount, setTotalCount] = useState(0);
  const [topTags, setTopTags] = useState<Array<{ tag: string; count: number }>>([]);
  const [topCategories, setTopCategories] = useState<
    Array<{ category: string; count: number }>
  >([]);
  const [avgExcitement, setAvgExcitement] = useState(0);

  // ── Load data ──────────────────────────────────────────

  const loadData = useCallback(async () => {
    try {
      const [all, stats, count] = await Promise.all([
        getAllIdeas(),
        getStageStats(),
        getIdeaCount(),
      ]);
      setIdeas(all);
      setStageStats(stats);
      setTotalCount(count);

      // Compute top tags
      const tagCounts: Record<string, number> = {};
      let excitementSum = 0;
      let excitementCount = 0;
      const catCounts: Record<string, number> = {};

      for (const idea of all) {
        for (const tag of idea.tags) {
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        }
        if (idea.excitementScore > 0) {
          excitementSum += idea.excitementScore;
          excitementCount++;
        }
        catCounts[idea.category] = (catCounts[idea.category] || 0) + 1;
      }

      const sortedTags = Object.entries(tagCounts)
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8);
      setTopTags(sortedTags);

      const sortedCats = Object.entries(catCounts)
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
      setTopCategories(sortedCats);

      setAvgExcitement(excitementCount > 0 ? excitementSum / excitementCount : 0);

      // Initialize features
      if (all.length > 0) {
        rollDailySeed(all);
        rollCrossPollinate(all);
        rollStorageDraw(all);
      }
    } catch (err) {
      console.error('Failed to load ideas:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Feature logic ──────────────────────────────────────

  const rollDailySeed = (pool?: Idea[]) => {
    const source = pool ?? ideas;
    if (source.length === 0) return;
    setDailySeed(pickRandom(source));
    setDailyPrompt(pickRandom(DAILY_PROMPTS));
  };

  const rollCrossPollinate = (pool?: Idea[]) => {
    const source = pool ?? ideas;
    if (source.length < 2) {
      setCrossPair(null);
      return;
    }
    const pair = pickRandomN(source, 2);
    setCrossPair([pair[0], pair[1]]);
    setHybridPrompt(pickRandom(HYBRID_PROMPTS));
  };

  const rollStorageDraw = (pool?: Idea[]) => {
    const source = pool ?? ideas;
    const shelved = source.filter(
      (i) => i.stage === 'shelved' || i.stage === 'cold-storage'
    );
    if (shelved.length === 0) {
      setStorageDraw(null);
      return;
    }
    setStorageDraw(pickRandom(shelved));
    setStoragePrompt(pickRandom(STORAGE_PROMPTS));
  };

  // ── Render ─────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="text-ink-400 text-sm italic">Loading discoveries…</span>
      </div>
    );
  }

  if (ideas.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-serif font-semibold text-ink-900">Discover</h1>
          <p className="text-ink-500 text-sm">Rediscover and recombine your ideas.</p>
        </div>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-full bg-sage-100 flex items-center justify-center mb-5">
            <Lightbulb className="w-8 h-8 text-sage-500" />
          </div>
          <h2 className="text-xl font-serif font-semibold text-ink-800 mb-2">
            Nothing to discover yet
          </h2>
          <p className="text-sm text-ink-400 max-w-md mb-6 leading-relaxed">
            Plant some seeds first — discovery features light up once you have ideas in your garden.
          </p>
          <Link
            to="/"
            className="bg-clay-500 hover:bg-clay-600 text-paper px-5 py-2 rounded-pill text-sm font-medium transition-colors flex items-center gap-2 shadow-card"
          >
            <span className="text-lg">🌱</span>
            Go to the Garden
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-10 max-w-3xl mx-auto">
      {/* Page header */}
      <div>
        <h1 className="text-3xl font-serif font-semibold text-ink-900">Discover</h1>
        <p className="text-ink-500 text-sm">Rediscover, recombine, and reflect on your ideas.</p>
      </div>

      {/* ── Daily Seed ────────────────────────────────────── */}
      <section>
        <SectionHeader
          icon={<Sprout className="w-5 h-5 text-sage-600" />}
          title="Daily Seed"
          description="One idea from your archive, ready for a second look."
        />
        {dailySeed ? (
          <div className="space-y-3">
            <MiniCard idea={dailySeed} />
            <div className="flex items-start gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-card">
              <Lightbulb className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800 italic">{dailyPrompt}</p>
            </div>
            <button
              onClick={() => rollDailySeed()}
              className="flex items-center gap-1.5 text-xs text-ink-400 hover:text-sage-600 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Draw another seed
            </button>
          </div>
        ) : (
          <p className="text-sm text-ink-400 italic">No ideas to draw from.</p>
        )}
      </section>

      {/* ── Cross-Pollinate ───────────────────────────────── */}
      <section>
        <SectionHeader
          icon={<Shuffle className="w-5 h-5 text-sage-600" />}
          title="Cross-Pollinate"
          description="Two random ideas — what hybrid could exist between them?"
        />
        {crossPair ? (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <MiniCard idea={crossPair[0]} />
              <MiniCard idea={crossPair[1]} />
            </div>
            <div className="flex items-start gap-2 px-4 py-3 bg-sage-50 border border-sage-200 rounded-card">
              <Shuffle className="w-4 h-4 text-sage-600 shrink-0 mt-0.5" />
              <p className="text-sm text-sage-800 italic">{hybridPrompt}</p>
            </div>
            <button
              onClick={() => rollCrossPollinate()}
              className="flex items-center gap-1.5 text-xs text-ink-400 hover:text-sage-600 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Shuffle another pair
            </button>
          </div>
        ) : (
          <p className="text-sm text-ink-400 italic">
            You need at least two ideas for cross-pollination.
          </p>
        )}
      </section>

      {/* ── Draw from Storage ─────────────────────────────── */}
      <section>
        <SectionHeader
          icon={<Archive className="w-5 h-5 text-frost-600" />}
          title="Draw from Storage"
          description="Pull a shelved or cold-storage idea back into the light."
        />
        {storageDraw ? (
          <div className="space-y-3">
            <MiniCard idea={storageDraw} />
            <div className="flex items-start gap-2 px-4 py-3 bg-frost-50 border border-frost-200 rounded-card">
              <Archive className="w-4 h-4 text-frost-600 shrink-0 mt-0.5" />
              <p className="text-sm text-frost-800 italic">{storagePrompt}</p>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => rollStorageDraw()}
                className="flex items-center gap-1.5 text-xs text-ink-400 hover:text-frost-600 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Draw another
              </button>
              <Link
                to={`/idea/${storageDraw.id}`}
                className="flex items-center gap-1 text-xs text-frost-600 hover:text-frost-700 transition-colors"
              >
                Open & revisit <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </div>
        ) : (
          <div className="px-4 py-6 bg-paper-warm border border-ink-200 rounded-card text-center">
            <p className="text-sm text-ink-500">
              Nothing in storage — all your ideas are active! 🎉
            </p>
          </div>
        )}
      </section>

      {/* ── Idea Weather ──────────────────────────────────── */}
      <section className="pb-8">
        <SectionHeader
          icon={<CloudSun className="w-5 h-5 text-amber-600" />}
          title="Idea Weather"
          description="Patterns and stats across your garden."
        />

        {/* Overview stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <StatCard
            value={totalCount}
            label={totalCount === 1 ? 'idea' : 'ideas'}
            sublabel="in your garden"
          />
          <StatCard
            value={stageStats['shipped'] || 0}
            label="shipped"
            sublabel="made it out"
          />
          <StatCard
            value={(stageStats['shelved'] || 0) + (stageStats['cold-storage'] || 0)}
            label="archived"
            sublabel="safely stored"
          />
          <StatCard
            value={Number(avgExcitement.toFixed(1))}
            label="avg excitement"
            sublabel="across scored ideas"
          />
        </div>

        {/* Stage breakdown */}
        <div className="mb-6">
          <h3 className="text-xs font-medium text-ink-500 uppercase tracking-wider mb-3">
            By Stage
          </h3>
          <div className="space-y-2">
            {(['seed', 'sprout', 'pitch', 'prototype', 'plot', 'shelved', 'cold-storage', 'shipped'] as Stage[]).map(
              (stage) => {
                const count = stageStats[stage] || 0;
                const pct = totalCount > 0 ? (count / totalCount) * 100 : 0;
                return (
                  <div key={stage} className="flex items-center gap-3">
                    <div className="w-24 shrink-0">
                      <StageBadge stage={stage} />
                    </div>
                    <div className="flex-1 h-5 bg-paper-warm border border-ink-100 rounded-pill overflow-hidden">
                      <div
                        className="h-full bg-sage-300 rounded-pill transition-all duration-500"
                        style={{ width: `${Math.max(pct, count > 0 ? 2 : 0)}%` }}
                      />
                    </div>
                    <span className="text-xs text-ink-500 w-8 text-right tabular-nums">
                      {count}
                    </span>
                  </div>
                );
              }
            )}
          </div>
        </div>

        {/* Top categories */}
        {topCategories.length > 0 && (
          <div className="mb-6">
            <h3 className="text-xs font-medium text-ink-500 uppercase tracking-wider mb-3">
              Most Common Categories
            </h3>
            <div className="flex flex-wrap gap-2">
              {topCategories.map(({ category, count }) => (
                <span
                  key={category}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-paper-warm border border-ink-200 rounded-pill text-xs text-ink-600"
                >
                  {CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS] ?? category}
                  <span className="text-ink-400 font-medium">{count}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Top tags */}
        {topTags.length > 0 && (
          <div>
            <h3 className="text-xs font-medium text-ink-500 uppercase tracking-wider mb-3">
              Top Tags
            </h3>
            <div className="flex flex-wrap gap-2">
              {topTags.map(({ tag, count }) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-sage-50 border border-sage-200 rounded-pill text-xs text-sage-700"
                >
                  {tag}
                  <span className="text-sage-400 font-medium">{count}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

// ── Stat card ───────────────────────────────────────────────────────

function StatCard({
  value,
  label,
  sublabel,
}: {
  value: number;
  label: string;
  sublabel: string;
}) {
  return (
    <div className="bg-paper border border-ink-200 rounded-card p-3 text-center shadow-card">
      <div className="text-2xl font-serif font-semibold text-ink-900 tabular-nums">
        {value}
      </div>
      <div className="text-xs font-medium text-ink-600">{label}</div>
      <div className="text-[10px] text-ink-400">{sublabel}</div>
    </div>
  );
}
