import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'

// Self-hosted fonts (no external requests).
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/lora/400.css'
import '@fontsource/lora/500.css'
import '@fontsource/lora/600.css'
import '@fontsource/lora/700.css'
import '@fontsource/lora/400-italic.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'

import './index.css'
import App from './App.tsx'

// ── Pre-paint theme bootstrap (no FOUC) ──────────────────────────────────────
// Runs synchronously before createRoot so the correct data-theme is on <html>
// before the first paint. Reads from localStorage; server source-of-truth
// (GET /api/settings) overrides later once the settings store hydrates (F3).
;(function applyBootTheme() {
  const VALID = ['paper', 'parchment', 'meadow', 'dusk', 'loam', 'moss', 'hearth', 'rainwash', 'peat', 'canopy']
  try {
    const raw = localStorage.getItem('seedbank.ui.theme')
    if (!raw) return
    const prefs = JSON.parse(raw) as { name?: string; matchSystem?: boolean }
    let name = prefs.name ?? 'paper'
    if (prefs.matchSystem) {
      name = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'loam' : 'paper'
    }
    if (VALID.includes(name)) document.documentElement.dataset.theme = name
  } catch { /* ignore — defaults to paper via :root selector in themes.css */ }

  // Also subscribe for subsequent system changes when matchSystem is active.
  try {
    const raw = localStorage.getItem('seedbank.ui.theme')
    if (!raw) return
    const prefs = JSON.parse(raw) as { matchSystem?: boolean }
    if (!prefs.matchSystem) return
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      document.documentElement.dataset.theme = e.matches ? 'loam' : 'paper'
    })
  } catch { /* ignore */ }
})()
// ─────────────────────────────────────────────────────────────────────────────

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
