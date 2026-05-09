import { Routes, Route } from 'react-router-dom';
import Layout from '@/components/Layout';
import Board from '@/pages/Board';
import IdeaDetail from '@/pages/IdeaDetail';
import IdeaNew from '@/pages/IdeaNew';
import Discover from '@/pages/Discover';
import ErrorBoundary from '@/components/ErrorBoundary';

function App() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Board />} />
          <Route path="discover" element={<Discover />} />
          <Route path="idea/new" element={<IdeaNew />} />
          <Route path="idea/:id" element={<ErrorBoundary><IdeaDetail /></ErrorBoundary>} />
        </Route>
      </Routes>
    </ErrorBoundary>
  );
}

export default App;
