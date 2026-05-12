/** Settings → About: app name, version, links. */

const APP_VERSION = '2.1.0';

export default function AboutTab() {
  return (
    <div className="space-y-6 max-w-lg">
      <div className="flex items-center gap-3">
        <span className="text-4xl">🌱</span>
        <div>
          <h3 className="text-lg font-serif font-semibold text-ink-900">Seedbank</h3>
          <p className="text-xs font-mono text-ink-400">v{APP_VERSION}</p>
        </div>
      </div>

      <p className="text-sm text-ink-500 leading-relaxed">
        A local-first idea garden for capturing, growing, and rediscovering project seeds.
        Earthy, calm, and built for thinking — not for dashboards.
      </p>

      <div className="space-y-2 text-sm">
        <a
          href="https://github.com/ghreprimand/Seedbank"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-sage-700 hover:text-sage-900 transition-colors"
        >
          <span className="font-mono text-[11px] uppercase tracking-wider text-ink-400">Source</span>
          <span className="text-ink-300">·</span>
          github.com/ghreprimand/Seedbank
        </a>
      </div>

      <p className="text-xs font-mono text-ink-300 pt-4 border-t border-ink-100">
        Built with care. Your data stays local.
      </p>
    </div>
  );
}
