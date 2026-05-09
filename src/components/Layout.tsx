import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { Search, ArrowUpDown, Compass, X } from 'lucide-react';
import QuickCapture from './QuickCapture';
import ImportExportModal from './ImportExportModal';
import { useFilterStore } from '@/stores/filters';

export default function Layout() {
  const [isCaptureOpen, setIsCaptureOpen] = useState(false);
  const [isImportExportOpen, setIsImportExportOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const mobileSearchRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const location = useLocation();

  const query = useFilterStore((s) => s.query);
  const setQuery = useFilterStore((s) => s.setQuery);
  const searchRef = useRef<HTMLInputElement>(null);

  // When the user types in search and they're not on the board, navigate there
  const handleSearchChange = (value: string) => {
    setQuery(value);
    if (location.pathname !== '/') {
      navigate('/');
    }
  };

  // Global keyboard shortcut: "/" focuses search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.key === '/' &&
        !e.metaKey &&
        !e.ctrlKey &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div className="min-h-screen bg-paper text-ink-800 font-sans antialiased">
      {/* ── Top bar ──────────────────────────────────────── */}
      <header className="sticky top-0 z-30 bg-paper/85 backdrop-blur-lg border-b border-ink-100 px-4 sm:px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-6">
          {/* Logo */}
          <Link
            to="/"
            className="flex items-center gap-2 text-ink-900 hover:text-sage-700 transition-colors group"
          >
            <span className="text-lg group-hover:scale-110 transition-transform duration-200" aria-hidden>🌱</span>
            <span className="text-xl font-serif font-semibold tracking-tight hidden sm:inline">
              Seedbank
            </span>
          </Link>

          {/* Search Input */}
          <div className="relative hidden md:block">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-300 pointer-events-none">
              <Search className="w-4 h-4" />
            </span>
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder='Search seeds…  press "/" '
              className="pl-9 pr-8 py-1.5 bg-paper-warm/80 border border-ink-100 rounded-pill text-sm
                         focus:outline-none focus:ring-2 focus:ring-sage-400 focus:border-sage-300
                         focus:bg-paper transition-all duration-200 w-64 lg:w-80
                         placeholder:text-ink-300"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-300 hover:text-ink-500 p-0.5 transition-colors"
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Mobile search toggle */}
          <button
            onClick={() => {
              setMobileSearchOpen(!mobileSearchOpen);
              setTimeout(() => mobileSearchRef.current?.focus(), 100);
            }}
            className="p-2 md:hidden text-ink-400 hover:text-ink-600 transition-all duration-200 rounded-card hover:bg-ink-50"
            title="Search"
          >
            <Search className="w-[18px] h-[18px]" />
          </button>

          {/* Nav: Discover */}
          <Link
            to="/discover"
            title="Discover"
            className={`p-2 rounded-card transition-all duration-200 ${
              location.pathname === '/discover'
                ? 'text-sage-600 bg-sage-50 shadow-sm'
                : 'text-ink-400 hover:text-ink-600 hover:bg-ink-50'
            }`}
          >
            <Compass className="w-[18px] h-[18px]" />
          </Link>

          {/* Import/Export */}
          <button
            onClick={() => setIsImportExportOpen(true)}
            title="Import & Export"
            className="p-2 text-ink-400 hover:text-ink-600 transition-all duration-200 rounded-card hover:bg-ink-50"
          >
            <ArrowUpDown className="w-[18px] h-[18px]" />
          </button>

          {/* Divider — desktop only */}
          <div className="hidden sm:block w-px h-6 bg-ink-100 mx-1" />

          {/* Plant a Seed CTA */}
          <button
            onClick={() => setIsCaptureOpen(true)}
            className="bg-clay-500 hover:bg-clay-600 active:bg-clay-700 text-paper
                       px-3.5 py-1.5 rounded-pill text-sm font-medium
                       transition-all duration-200 flex items-center gap-1.5
                       shadow-card hover:shadow-card-hover active:scale-[0.98]"
          >
            <span className="text-base leading-none" aria-hidden>🌱</span>
            <span className="hidden sm:inline">Plant a Seed</span>
          </button>
        </div>
      </header>

      {/* ── Mobile search bar ─────────────────────────────── */}
      {mobileSearchOpen && (
        <div className="md:hidden sticky top-14 z-20 bg-paper/95 backdrop-blur-lg border-b border-ink-100 px-4 py-2 animate-slide-up">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-300 pointer-events-none">
              <Search className="w-4 h-4" />
            </span>
            <input
              ref={mobileSearchRef}
              type="text"
              value={query}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search seeds…"
              className="w-full pl-9 pr-8 py-2 bg-paper-warm border border-ink-100 rounded-pill text-sm
                         focus:outline-none focus:ring-2 focus:ring-sage-400 focus:border-sage-300
                         transition-all placeholder:text-ink-300"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-300 hover:text-ink-500 p-0.5 transition-colors"
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Main content ─────────────────────────────────── */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <Outlet />
      </main>

      {/* ── Quick Capture Modal ──────────────────────────── */}
      {isCaptureOpen && (
        <QuickCapture
          onClose={() => setIsCaptureOpen(false)}
          onSuccess={(id) => {
            setIsCaptureOpen(false);
            navigate(`/idea/${id}`);
          }}
        />
      )}

      {/* ── Import/Export Modal ──────────────────────────── */}
      {isImportExportOpen && (
        <ImportExportModal
          onClose={() => setIsImportExportOpen(false)}
          onImported={() => {
            if (location.pathname !== '/') navigate('/');
          }}
        />
      )}
    </div>
  );
}
