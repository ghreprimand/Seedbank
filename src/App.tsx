function App() {
  return (
    <div className="min-h-screen bg-paper text-ink-800 flex items-center justify-center">
      <div className="text-center space-y-6">
        <h1 className="text-4xl font-serif font-semibold tracking-tight text-ink-900">
          Seedbank
        </h1>
        <p className="text-ink-500 text-lg">
          Plant ideas. Watch them grow.
        </p>

        {/* Palette swatch — temporary, proves tokens work */}
        <div className="flex gap-2 justify-center flex-wrap max-w-sm mx-auto">
          {/* Sage */}
          <div className="w-8 h-8 rounded-badge bg-sage-200" title="sage-200" />
          <div className="w-8 h-8 rounded-badge bg-sage-400" title="sage-400" />
          <div className="w-8 h-8 rounded-badge bg-sage-600" title="sage-600" />
          {/* Clay */}
          <div className="w-8 h-8 rounded-badge bg-clay-200" title="clay-200" />
          <div className="w-8 h-8 rounded-badge bg-clay-400" title="clay-400" />
          <div className="w-8 h-8 rounded-badge bg-clay-600" title="clay-600" />
          {/* Amber */}
          <div className="w-8 h-8 rounded-badge bg-amber-200" title="amber-200" />
          <div className="w-8 h-8 rounded-badge bg-amber-400" title="amber-400" />
          {/* Ink */}
          <div className="w-8 h-8 rounded-badge bg-ink-300" title="ink-300" />
          <div className="w-8 h-8 rounded-badge bg-ink-700" title="ink-700" />
          {/* Frost */}
          <div className="w-8 h-8 rounded-badge bg-frost-300" title="frost-300" />
          <div className="w-8 h-8 rounded-badge bg-frost-500" title="frost-500" />
        </div>
      </div>
    </div>
  )
}

export default App
