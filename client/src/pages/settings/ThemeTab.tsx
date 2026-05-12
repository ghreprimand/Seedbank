/**
 * Settings → Theme: ten swatched theme cards + "Match system" toggle.
 *
 * Selecting a theme:
 *   1. Sets document.documentElement.dataset.theme immediately (live, no reload).
 *   2. Persists { name, matchSystem } to localStorage via themeUtils.
 *
 * Match system: auto-pairs Paper ↔ Loam via prefers-color-scheme.
 * Keyboard: arrow keys (←→↑↓) move focus, Enter applies selection.
 */
import { useEffect, useRef, useState } from 'react';
import { Monitor } from 'lucide-react';
import {
  type ThemeName,
  type ThemePrefs,
  resolveThemeName,
  applyTheme,
  currentAppliedTheme,
} from '@/theme/themeUtils';
import { useUiSettings, useSettingsStore } from '@/stores/settings';

interface ThemeMeta {
  id: ThemeName;
  label: string;
  description: string;
  dark: boolean;
  preview: {
    paper: string;
    paperWarm: string;
    ink800: string;
    ink400: string;
    sage500: string;
    sage50: string;
    clay500: string;
    amber100: string;
    amber800: string;
  };
}

const THEMES: ThemeMeta[] = [
  {
    id: 'paper',
    label: 'Paper',
    description: 'Default — off-white paper, sage, clay, warm amber.',
    dark: false,
    preview: {
      paper:     '#faf8f4',
      paperWarm: '#f4efe5',
      ink800:    '#2a2725',
      ink400:    '#857f78',
      sage500:   '#567d4a',
      sage50:    '#f2f5f0',
      clay500:   '#c06a33',
      amber100:  '#fef3c7',
      amber800:  '#92400e',
    },
  },
  {
    id: 'chalk',
    label: 'Chalk',
    description: 'Cool mineral/blue-gray paper. Crisp slate-tinted ink.',
    dark: false,
    preview: {
      paper:     '#f3f5f8',
      paperWarm: '#e8ecf2',
      ink800:    '#242f3e',
      ink400:    '#7a88a0',
      sage500:   '#46764e',
      sage50:    '#edf2ee',
      clay500:   '#c06a33',
      amber100:  '#fef3c7',
      amber800:  '#92400e',
    },
  },
  {
    id: 'meadow',
    label: 'Meadow',
    description: 'Light, green-tinted. Sage prominent surface accent.',
    dark: false,
    preview: {
      paper:     '#f0f6ee',
      paperWarm: '#e4f0e0',
      ink800:    '#242e24',
      ink400:    '#7a8d78',
      sage500:   '#4a8040',
      sage50:    '#e8f2e5',
      clay500:   '#c06a33',
      amber100:  '#fef3c7',
      amber800:  '#92400e',
    },
  },
  {
    id: 'dusk',
    label: 'Dusk',
    description: 'Warm taupe, evening field journal. Neither dark nor light.',
    dark: false,
    preview: {
      paper:     '#ece4d8',
      paperWarm: '#e0d4c0',
      ink800:    '#261e14',
      ink400:    '#7e7058',
      sage500:   '#3e7034',
      sage50:    '#edf2e8',
      clay500:   '#b05f26',
      amber100:  '#fef2cc',
      amber800:  '#72480a',
    },
  },
  {
    id: 'woad',
    label: 'Woad',
    description: 'Full dark. Deep botanical blue-indigo, warm terracotta accents.',
    dark: true,
    preview: {
      paper:     '#0f1620',
      paperWarm: '#162030',
      ink800:    '#dce8f4',
      ink400:    '#7a96b0',
      sage500:   '#5088b8',
      sage50:    '#0e1826',
      clay500:   '#b47850',
      amber100:  '#281c10',
      amber800:  '#d8bc8c',
    },
  },
  {
    id: 'moss',
    label: 'Moss',
    description: 'Full dark, green-dominant. Copper accents.',
    dark: true,
    preview: {
      paper:     '#131c17',
      paperWarm: '#1a2620',
      ink800:    '#deeee6',
      ink400:    '#7ea090',
      sage500:   '#7ab462',
      sage50:    '#182614',
      clay500:   '#c07e58',
      amber100:  '#30280e',
      amber800:  '#ecce98',
    },
  },
  {
    id: 'hearth',
    label: 'Hearth',
    description: 'Mid-depth warm clay/adobe. Golden ochre accents.',
    dark: true,
    preview: {
      paper:     '#5c4838',
      paperWarm: '#503e2c',
      ink800:    '#f4ece0',
      ink400:    '#b89e86',
      sage500:   '#c09870',
      sage50:    '#301e0e',
      clay500:   '#c88460',
      amber100:  '#382210',
      amber800:  '#eccc9c',
    },
  },
  {
    id: 'rainwash',
    label: 'Rainwash',
    description: 'Mid-depth cool sage/stone. After-rain palette.',
    dark: true,
    preview: {
      paper:     '#485a52',
      paperWarm: '#3e5048',
      ink800:    '#e8f2ec',
      ink400:    '#a0b4ac',
      sage500:   '#7eb4a8',
      sage50:    '#243630',
      clay500:   '#c49080',
      amber100:  '#342e16',
      amber800:  '#e0da98',
    },
  },
  {
    id: 'peat',
    label: 'Peat',
    description: 'Full dark. Black-soil umber, muted lichen action.',
    dark: true,
    preview: {
      paper:     '#1a1510',
      paperWarm: '#221c14',
      ink800:    '#f0e8de',
      ink400:    '#a8967e',
      sage500:   '#90a064',
      sage50:    '#1c2014',
      clay500:   '#c88a62',
      amber100:  '#302610',
      amber800:  '#e8cc98',
    },
  },
  {
    id: 'canopy',
    label: 'Canopy',
    description: 'Full dark. Forest understory, bark/copper accents.',
    dark: true,
    preview: {
      paper:     '#111610',
      paperWarm: '#181e14',
      ink800:    '#e0eadc',
      ink400:    '#8a9e80',
      sage500:   '#72a058',
      sage50:    '#142010',
      clay500:   '#b07850',
      amber100:  '#2c2610',
      amber800:  '#dcc898',
    },
  },
];

// ── Sub-component: ThemeCard ──────────────────────────────────────────────────
interface ThemeCardProps {
  theme: ThemeMeta;
  selected: boolean;
  onClick: () => void;
  innerRef: React.Ref<HTMLButtonElement>;
  onKeyDown: (e: React.KeyboardEvent) => void;
  tabIndex: number;
}

function ThemeCard({ theme, selected, onClick, innerRef, onKeyDown, tabIndex }: ThemeCardProps) {
  const p = theme.preview;
  return (
    <button
      ref={innerRef}
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      onKeyDown={onKeyDown}
      tabIndex={tabIndex}
      className={`text-left rounded-card border-2 overflow-hidden transition-all duration-200
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-sage-400 ${
        selected
          ? 'border-sage-500 shadow-card-hover'
          : 'border-ink-100 hover:border-ink-300 shadow-card'
      }`}
    >
      {/* Mini preview */}
      <div style={{ background: p.paper }}>
        {/* Header strip */}
        <div
          className="flex items-center justify-between px-2 py-1.5 border-b"
          style={{ background: p.paper, borderColor: p.paperWarm }}
        >
          <div className="flex items-center gap-1">
            <span style={{ color: p.sage500, fontSize: 10 }}>🌱</span>
            <span style={{ color: p.ink800, fontSize: 9, fontWeight: 600 }}>Seedbank</span>
          </div>
          <div
            className="rounded-full px-1.5 py-0.5 text-[8px] font-semibold"
            style={{ background: p.sage50, color: p.sage500 }}
          >
            API
          </div>
        </div>

        {/* Card sample */}
        <div className="p-2 space-y-1.5">
          <div className="rounded-badge p-1.5" style={{ background: p.paperWarm }}>
            <div style={{ color: p.ink800, fontSize: 9, fontWeight: 600, marginBottom: 2 }}>
              My project idea
            </div>
            <div style={{ color: p.ink400, fontSize: 8 }}>
              A quick note about something…
            </div>
            <div className="flex items-center gap-1 mt-1.5">
              <span
                className="rounded-badge px-1 py-0.5"
                style={{ background: p.sage50, color: p.sage500, fontSize: 7, fontWeight: 700 }}
              >
                SEED
              </span>
              <span
                className="rounded-badge px-1 py-0.5"
                style={{ background: p.amber100, color: p.amber800, fontSize: 7, fontWeight: 700 }}
              >
                PITCH
              </span>
            </div>
          </div>
          <div className="flex justify-end">
            <span
              className="rounded-pill px-1.5 py-0.5 text-[8px] font-semibold"
              style={{ background: p.clay500, color: p.paper }}
            >
              Plant a Seed
            </span>
          </div>
        </div>
      </div>

      {/* Card label */}
      <div className="px-3 py-2 border-t" style={{ background: p.paperWarm, borderColor: p.paper }}>
        <div style={{ color: p.ink800, fontSize: 11, fontWeight: 600 }}>{theme.label}</div>
        <div style={{ color: p.ink400, fontSize: 10, marginTop: 1 }}>{theme.description}</div>
      </div>
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ThemeTab() {
  // Local optimistic state — kept in sync with the store's ui.theme.
  // Apply immediately for snappiness; patch store (→ server + localStorage) in background.
  const uiTheme = useUiSettings().theme;
  const patchStore = useSettingsStore((s) => s.patch);

  // localPrefs is null until the user interacts. When null, display falls back to
  // uiTheme from the store — this way the card automatically reflects server state
  // when the store hydrates (fixes direct /settings/theme loads showing stale card).
  const [localPrefs, setLocalPrefs] = useState<ThemePrefs | null>(null);
  const prefs: ThemePrefs = localPrefs ?? {
    name: uiTheme?.name ?? currentAppliedTheme(),
    matchSystem: uiTheme?.matchSystem ?? false,
  };

  const cardRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // Keep a matchMedia listener active while "match system" is on.
  useEffect(() => {
    if (!prefs.matchSystem) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      applyTheme(mq.matches ? 'peat' : 'paper');
    };
    mq.addEventListener('change', handleChange);
    return () => mq.removeEventListener('change', handleChange);
  }, [prefs.matchSystem]);

  const selectTheme = (name: ThemeName) => {
    const next: ThemePrefs = { name, matchSystem: false };
    setLocalPrefs(next);
    // Apply immediately (optimistic).
    applyTheme(name);
    // Persist to server + localStorage (fire-and-forget; offline fallback is handled in store).
    patchStore('ui', { theme: { name, matchSystem: false } }).catch(() => {
      // Store already falls back to localStorage-only on failure; no extra handling needed.
    });
  };

  const toggleMatchSystem = () => {
    const next: ThemePrefs = { ...prefs, matchSystem: !prefs.matchSystem };
    setLocalPrefs(next);
    const resolved = next.matchSystem ? resolveThemeName(next) : prefs.name;
    applyTheme(resolved);
    patchStore('ui', { theme: { name: resolved, matchSystem: next.matchSystem } }).catch(() => {});
  };

  // Keyboard nav — roving tabindex
  const handleKeyDown = (e: React.KeyboardEvent, idx: number) => {
    const cols = window.innerWidth >= 1024 ? 3 : 2;
    let targetIdx: number;
    if (e.key === 'ArrowRight')      targetIdx = (idx + 1) % THEMES.length;
    else if (e.key === 'ArrowLeft')  targetIdx = (idx - 1 + THEMES.length) % THEMES.length;
    else if (e.key === 'ArrowDown')  targetIdx = Math.min(idx + cols, THEMES.length - 1);
    else if (e.key === 'ArrowUp')    targetIdx = Math.max(idx - cols, 0);
    else if (e.key === 'Enter')      { selectTheme(THEMES[idx].id); return; }
    else return;
    e.preventDefault();
    cardRefs.current[targetIdx]?.focus();
  };

  const activeIdx = THEMES.findIndex((t) => t.id === prefs.name);

  return (
    <div className="space-y-6">
      {/* Match system toggle */}
      <section className="flex items-start gap-4 p-4 bg-paper-warm border border-ink-100 rounded-card max-w-xl">
        <Monitor className="w-4 h-4 text-ink-400 mt-0.5 shrink-0" />
        <div className="flex-1">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium text-ink-800">Match system</div>
              <div className="text-xs text-ink-400 mt-0.5">
                Auto-select Paper (light) or Peat (dark) based on your OS preference. Pick any theme manually to override.
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={prefs.matchSystem}
              onClick={toggleMatchSystem}
              className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-pill
                         transition-colors focus-visible:outline-none focus-visible:ring-2
                         focus-visible:ring-sage-400 ${
                prefs.matchSystem ? 'bg-sage-500' : 'bg-ink-200'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 rounded-full bg-paper shadow-sm transition-transform ${
                  prefs.matchSystem ? 'translate-x-[18px]' : 'translate-x-[2px]'
                }`}
              />
            </button>
          </div>
        </div>
      </section>

      {/* Theme grid */}
      <section role="radiogroup" aria-label="Theme">
        <h3 className="text-sm font-mono uppercase tracking-wider text-ink-400 mb-3">
          Choose a theme
        </h3>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {THEMES.map((theme, idx) => (
            <ThemeCard
              key={theme.id}
              theme={theme}
              selected={!prefs.matchSystem && prefs.name === theme.id}
              onClick={() => selectTheme(theme.id)}
              innerRef={(el) => { cardRefs.current[idx] = el; }}
              onKeyDown={(e) => handleKeyDown(e, idx)}
              tabIndex={
                prefs.matchSystem
                  ? idx === 0 ? 0 : -1
                  : idx === activeIdx ? 0 : -1
              }
            />
          ))}
        </div>
        {prefs.matchSystem && (
          <p className="mt-3 text-xs text-ink-400 font-mono">
            System theme active — manual selection is paused.
          </p>
        )}
      </section>
    </div>
  );
}
