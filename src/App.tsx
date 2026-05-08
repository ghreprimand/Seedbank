import { Routes, Route } from 'react-router-dom';
import Layout from '@/components/Layout';
import Board from '@/pages/Board';
import IdeaDetail from '@/pages/IdeaDetail';
import IdeaNew from '@/pages/IdeaNew';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Board />} />
        <Route path="idea/new" element={<IdeaNew />} />
        <Route path="idea/:id" element={<IdeaDetail />} />
      </Route>
    </Routes>
  );
}

export default App;
