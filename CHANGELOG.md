# Changelog

## 1.0.0 — Initial Release

Seedbank v1.0 — a local-first project idea manager built with React, TypeScript, and IndexedDB.

### Features

- **Capture** — quick "Plant a Seed" flow (title + notes) with `N` keyboard shortcut
- **14-field editor** — title, pitch, notes, hook, why-it-might-work, risks, tech stack, tags, mood labels, excitement score, jam suitability, related ideas, links, images
- **Board view** — responsive card grid with search, multi-select filters (category, stage, tag), and sort
- **Gardening lifecycle** — ideas progress through 8 stages: Seed → Sprout → Pitch → Prototype → Plot → Shelved → Cold Storage → Shipped
- **Auto-save** — debounced 800ms writes to IndexedDB; stage/category changes save immediately
- **Version history** — automatic snapshots on meaningful edits, read-only viewer, restore with undo safety
- **Discovery** — Daily Seed (random idea + prompt), Cross-Pollinate (two ideas side-by-side), Draw from Storage (resurface archived ideas), Idea Weather (stats & patterns)
- **Import/Export** — single idea or full archive to JSON/Markdown; import from JSON (merge/replace) or Markdown; seed data for first-time use
- **Keyboard shortcuts** — `N` new idea, `/` focus search, `Esc` close modals
- **Error boundaries** — graceful fallback UI on render errors
- **Local-first** — zero network calls after the app loads; all data in IndexedDB; fonts self-hosted via `@fontsource` (no font CDN)
- **Responsive** — desktop, tablet, and mobile layouts with mobile search toggle

### Design

- Custom colour palette: paper, sage, ink, clay, amber, frost
- Typography: Lora (serif headings), Inter (body), JetBrains Mono (metadata)
- Tactile card styling with paper texture, pressed-label tags, lift-on-hover
- Smooth animations: fade-in, slide-up, scale-in, staggered card entrance

### Tech Stack

- Vite 8 + React 19 + TypeScript 6
- Tailwind CSS v4 with `@theme` design tokens
- Dexie (IndexedDB) for local persistence
- Zustand for shared filter/search state
- Lucide React for icons
- React Router v7 for client-side routing
