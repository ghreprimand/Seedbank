import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { Search, ArrowUpDown } from 'lucide-react';
import QuickCapture from './QuickCapture';
import ImportExportModal from './ImportExportModal';
import { useFilterStore } from '@/stores/filters';

export default function Layout() {
  const [isCaptureOpen, setIsCaptureOpen] = useState(false);
  const [isImportExportOpen, setIsImportExportOpen] = useState(false);
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
    <div className="min-h-screen bg-paper text-ink-800 font-sans">
      {/* Top Bar */}
      <header className="sticky top-0 z-30 bg-paper/80 backdrop-blur-md border-b border-ink-200 px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link 
            to="/" 
            className="text-2xl font-serif font-semibold tracking-tight text-ink-900 hover:text-sage-700 transition-colors"
          >
            Seedbank
          </Link>

          {/* Search Input */}
          <div className="relative hidden md:block">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400">
              <Search className="w-4 h-4" />
            </span>
            <input 
              ref={searchRef}
              type="text" 
              value={query}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder='Search seeds…  type "/" to focus'
              className="pl-9 pr-4 py-1.5 bg-paper-warm border border-ink-200 rounded-pill text-sm focus:outline-none focus:ring-2 focus:ring-sage-400 transition-all w-72"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-600 p-0.5"
                aria-label="Clear search"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsImportExportOpen(true)}
            title="Import & Export"
            className="p-2 text-ink-400 hover:text-ink-600 transition-colors rounded-badge hover:bg-ink-50"
          >
            <ArrowUpDown className="w-4 h-4" />
          </button>
          <button 
            onClick={() => setIsCaptureOpen(true)}
            className="bg-clay-500 hover:bg-clay-600 text-paper px-4 py-1.5 rounded-pill text-sm font-medium transition-colors flex items-center gap-2 shadow-card"
          >
            <span className="text-lg">🌱</span>
            Plant a Seed
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto p-6">
        <Outlet />
      </main>

      {/* Quick Capture Modal */}
      {isCaptureOpen && (
        <QuickCapture 
          onClose={() => setIsCaptureOpen(false)} 
          onSuccess={(id) => {
            setIsCaptureOpen(false);
            navigate(`/idea/${id}`);
          }}
        />
      )}

      {/* Import/Export Modal */}
      {isImportExportOpen && (
        <ImportExportModal
          onClose={() => setIsImportExportOpen(false)}
          onImported={() => {
            // Navigate to board to show freshly imported ideas
            if (location.pathname !== '/') navigate('/');
          }}
        />
      )}
    </div>
  );
}
