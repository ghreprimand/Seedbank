/**
 * Settings page — responsive tabbed shell.
 *
 * Routes: /settings  →  /settings/general (default redirect)
 *         /settings/:tab
 *         /settings/unknown → redirects to /settings/general (FU3)
 *
 * Desktop (md+): left-rail nav sidebar + content pane side by side.
 * Mobile: horizontal scrollable pill strip above content.
 *
 * Each tab body is a separate component under ./settings/.
 */
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import {
  Settings as SettingsIcon,
  Bot,
  Palette,
  Server,
  Archive,
  Plug,
  Info,
} from 'lucide-react';
import GeneralTab from './settings/GeneralTab';
import AiAgentsTab from './settings/AiAgentsTab';
import ThemeTab from './settings/ThemeTab';
import ApiServerTab from './settings/ApiServerTab';
import BackupsTab from './settings/BackupsTab';
import IntegrationsTab from './settings/IntegrationsTab';
import AboutTab from './settings/AboutTab';
import OfflineBanner from './settings/OfflineBanner';

interface TabDef {
  id: string;
  label: string;
  kicker: string;
  icon: React.ElementType;
  component: React.ComponentType;
}

const TABS: TabDef[] = [
  {
    id: 'general',
    label: 'General',
    kicker: 'Data, import / export, keyboard shortcuts',
    icon: SettingsIcon,
    component: GeneralTab,
  },
  {
    id: 'ai-agents',
    label: 'AI & Agents',
    kicker: 'Provider connections, agent linking, token budget',
    icon: Bot,
    component: AiAgentsTab,
  },
  {
    id: 'theme',
    label: 'Theme',
    kicker: 'Color palette, appearance, system preference',
    icon: Palette,
    component: ThemeTab,
  },
  {
    id: 'api',
    label: 'API & Server',
    kicker: 'Server info, personal access tokens, webhooks',
    icon: Server,
    component: ApiServerTab,
  },
  {
    id: 'backups',
    label: 'Backups',
    kicker: 'Schedule, paths, manual backup',
    icon: Archive,
    component: BackupsTab,
  },
  {
    id: 'integrations',
    label: 'Integrations',
    kicker: 'Archon, generic project root, graduation paths',
    icon: Plug,
    component: IntegrationsTab,
  },
  {
    id: 'about',
    label: 'About',
    kicker: 'Version, source, acknowledgements',
    icon: Info,
    component: AboutTab,
  },
];

const TAB_IDS = new Set(TABS.map((t) => t.id));

export default function Settings() {
  const { tab } = useParams<{ tab: string }>();
  const navigate = useNavigate();

  // Redirect when no tab segment is present
  if (!tab) return <Navigate to="/settings/general" replace />;
  // FU3 — redirect unknown tab names rather than silently showing General
  if (!TAB_IDS.has(tab)) return <Navigate to="/settings/general" replace />;

  const active = TABS.find((t) => t.id === tab)!;
  const ActiveComponent = active.component;

  return (
    <div className="animate-fade-in">
      {/* Page heading */}
      <div className="mb-6">
        <h1 className="text-2xl font-serif font-semibold text-ink-900">Settings</h1>
        <p className="text-[11px] font-mono uppercase tracking-widest text-ink-400 mt-1">
          Seedbank preferences and configuration
        </p>
      </div>

      {/* Offline hint shown at page level */}
      <OfflineBanner />

      {/* ── Responsive layout: stacked on mobile, side-by-side on md+ ── */}
      <div className="flex flex-col md:flex-row md:gap-8 md:items-start">

        {/* ── Mobile: horizontal scrollable pill strip ──────────────── */}
        <nav
          aria-label="Settings sections"
          className="
            md:hidden flex items-center gap-1 overflow-x-auto pb-2 mb-5
            scrollbar-none -mx-4 px-4
          "
        >
          {TABS.map((t) => {
            const Icon = t.icon;
            const isActive = t.id === active.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => navigate(`/settings/${t.id}`)}
                className={`
                  whitespace-nowrap inline-flex items-center gap-1.5 px-3 py-1.5
                  rounded-pill text-xs font-medium transition-all border shrink-0
                  ${isActive
                    ? 'bg-sage-50 text-sage-700 border-sage-300 shadow-sm'
                    : 'text-ink-500 border-ink-100 hover:bg-ink-50 hover:border-ink-200 bg-paper'
                  }
                `}
              >
                <Icon className="w-3 h-3 shrink-0" />
                {t.label}
              </button>
            );
          })}
        </nav>

        {/* ── Desktop: left-rail sidebar ────────────────────────────── */}
        <nav
          aria-label="Settings sections"
          className="hidden md:block shrink-0 w-44 space-y-0.5"
        >
          {TABS.map((t) => {
            const Icon = t.icon;
            const isActive = t.id === active.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => navigate(`/settings/${t.id}`)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-card text-left
                            transition-all duration-150 text-sm ${
                  isActive
                    ? 'bg-sage-50 text-sage-700 border-l-2 border-sage-500 font-medium'
                    : 'text-ink-500 hover:text-ink-700 hover:bg-ink-50 border-l-2 border-transparent'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </nav>

        {/* ── Content pane ──────────────────────────────────────────── */}
        <div className="flex-1 min-w-0">
          <div className="mb-5 pb-4 border-b border-ink-100">
            <h2 className="text-xl font-serif font-semibold text-ink-900">{active.label}</h2>
            <p className="text-[11px] font-mono uppercase tracking-widest text-ink-400 mt-0.5">
              {active.kicker}
            </p>
          </div>
          <ActiveComponent />
        </div>
      </div>
    </div>
  );
}
