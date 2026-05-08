export default function Board() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-serif font-semibold text-ink-900">The Garden</h1>
          <p className="text-ink-500">Overview of your project seeds.</p>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Board cards will go here in Phase 4 */}
        <div className="aspect-video bg-paper-warm border border-dashed border-ink-300 rounded-card flex items-center justify-center text-ink-400 italic">
          Board view coming in Phase 4...
        </div>
      </div>
    </div>
  );
}
