import { useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import Layout from '@/components/Layout';
import Board from '@/pages/Board';
import IdeaDetail from '@/pages/IdeaDetail';
import IdeaNew from '@/pages/IdeaNew';
import Discover from '@/pages/Discover';
import Compost from '@/pages/Compost';
import Settings from '@/pages/Settings';
import ErrorBoundary from '@/components/ErrorBoundary';
import { useSettingsStore } from '@/stores/settings';

function App() {
  const hydrateSettings = useSettingsStore((s) => s.hydrate);

  // Hydrate settings once on app boot. The store is idempotent — skips if
  // already loaded. This fires before the user reaches any Settings tab so
  // data is ready immediately on navigation.
  useEffect(() => {
    hydrateSettings();
  }, [hydrateSettings]);

  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Board />} />
          <Route path="discover" element={<Discover />} />
          <Route path="compost" element={<Compost />} />
          <Route path="idea/new" element={<IdeaNew />} />
          <Route path="idea/:id" element={<ErrorBoundary><IdeaDetail /></ErrorBoundary>} />
          <Route path="settings" element={<Settings />} />
          <Route path="settings/:tab" element={<Settings />} />
        </Route>
      </Routes>
    </ErrorBoundary>
  );
}

export default App;
