import { Outlet, Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import QuickCapture from './QuickCapture';

export default function Layout() {
  const [isCaptureOpen, setIsCaptureOpen] = useState(false);
  const navigate = useNavigate();

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
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            </span>
            <input 
              type="text" 
              placeholder="Search seeds..." 
              className="pl-9 pr-4 py-1.5 bg-paper-warm border border-ink-200 rounded-pill text-sm focus:outline-none focus:ring-2 focus:ring-sage-400 transition-all w-64"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
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
    </div>
  );
}
