import { useParams, Link } from 'react-router-dom';

export default function IdeaDetail() {
  const { id } = useParams();
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/" className="text-ink-400 hover:text-ink-600 text-sm flex items-center gap-1">
          ← Back to Garden
        </Link>
      </div>
      <div className="p-8 bg-paper-warm border border-ink-200 rounded-card text-center">
        <h1 className="text-2xl font-serif font-semibold text-ink-900 mb-2">
          Editing Idea: {id}
        </h1>
        <p className="text-ink-500">Detail editor coming in Phase 5...</p>
      </div>
    </div>
  );
}
