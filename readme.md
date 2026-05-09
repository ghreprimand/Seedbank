# Seedbank

A local-first project idea manager for games, apps, tools, experiments, and half-formed sparks that shouldn't disappear into old notes.

Seedbank is not a general notes app. It's for people who keep inventing things they might build later and need a better way to preserve, compare, revisit, and grow those ideas over time.

![Status: alpha](https://img.shields.io/badge/status-alpha-sage)

## Features

### Capture & Organize

- **Quick capture** — "Plant a Seed" button (or press `N`) opens a minimal form for fast idea entry
- **14-field editor** — title, pitch, full notes, hook, risks, tech stack, tags, mood labels, scores, links, and related ideas
- **Gardening-themed lifecycle** — ideas progress through stages: Seed → Sprout → Pitch → Prototype → Plot → Shipped (or Shelved → Cold Storage)
- **Categories** — game, app, tool, art project, local AI, mobile, browser, open-source utility
- **Auto-save** — debounced writes to IndexedDB as you type, no save button needed

### Search & Filter

- **Full-text search** — searches across titles, pitches, notes, hooks, risks, tech stack, tags, and mood labels
- **Filter bar** — multi-select filters for category, stage, and tag with active-filter counts
- **Sort options** — recently updated, newest first, most excited, alphabetical
- **Keyboard shortcut** — press `/` to focus search from anywhere

### Version History

- **Automatic versioning** — every meaningful edit creates a timestamped snapshot of the previous state
- **Version browser** — view any past version in a read-only modal
- **Restore** — revert to any previous version (current state is saved as a version first, so nothing is lost)
- **Smart labels** — auto-generated version labels like "Pitch revised", "Stage → prototype", "Notes edited"

### Discovery & Delight

- **Daily Seed** — resurfaces one random idea with a creative prompt like "What's the smallest version you could build today?"
- **Cross-Pollinate** — picks two random ideas side-by-side and asks "What hybrid could exist?"
- **Draw from Storage** — pulls a random shelved or cold-storage idea back into view with a reflective prompt
- **Idea Weather** — stats panel showing total ideas, stage breakdown, top categories, top tags, and average excitement

### Import & Export

- **Export** — single idea or full archive to JSON or Markdown
- **Import** — from Seedbank JSON (merge or replace) or Markdown files
- **Seed data** — example ideas can be loaded on first use to try out the app
- **Portable** — JSON export includes all ideas + version history for full backup/restore

### Polish

- **Keyboard shortcuts** — `N` for new idea, `/` for search, `Esc` to close modals
- **Error boundaries** — graceful fallbacks so a render error doesn't lose your data
- **Responsive** — works on desktop, tablet, and mobile (mobile search toggle, adaptive grid)
- **Tactile design** — paper textures, pressed-label tags, card lift-on-hover, smooth animations

## Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Build | [Vite](https://vite.dev/) | Fast, modern, great DX |
| UI | [React 19](https://react.dev/) + TypeScript | Strict types, solid ecosystem |
| Styling | [Tailwind CSS v4](https://tailwindcss.com/) | Rapid iteration, custom theme tokens |
| State | [Zustand](https://zustand.docs.pmnd.rs/) | Lightweight, no boilerplate |
| Storage | [Dexie](https://dexie.org/) (IndexedDB) | Local-first, indexed queries, versioning-friendly |
| Icons | [Lucide React](https://lucide.dev/) | Clean, consistent, tree-shakeable |
| Routing | [React Router v7](https://reactrouter.com/) | Standard client-side routing |

## Design Philosophy

1. **Open directly into the collection** — no landing page, no onboarding walls
2. **Capture first, structure later** — the quick-add flow should be frictionless
3. **History over overwriting** — versions are first-class; nothing is lost
4. **Rediscovery is the killer feature** — search, filters, and random resurfacing are prominent
5. **Local-first, portable, yours** — IndexedDB + full export means the archive outlives the app

## Setup & Development

```bash
# Clone and install
git clone <repo-url>
cd Seedbank
npm install

# Start the dev server (http://localhost:5173)
npm run dev

# Type-check
npx tsc -b --noEmit

# Production build
npm run build

# Preview production build
npm run preview
```

### Requirements

- Node.js 18+
- npm 9+

## Theme & Color Palette

Seedbank uses a custom warm color palette defined as Tailwind theme tokens in `src/index.css`:

| Token | Purpose | Example |
|-------|---------|---------|
| `paper` | Backgrounds (off-white / cream) | `#faf8f4` |
| `sage` | Growth stages, success, primary actions | `#567d4a` (500) |
| `ink` | Text, borders, neutral UI | `#1a1816` (900) |
| `clay` | Accents, CTAs, warmth | `#c06a33` (500) |
| `amber` | Excitement, energy, warnings | `#f59e0b` (500) |
| `frost` | Cold storage, shelved, muted states | `#4e7191` (500) |

Typography uses three fonts, **self-hosted via `@fontsource`** (no external font requests):
- **Lora** (serif) — headings and titles
- **Inter** (sans) — body text and UI
- **JetBrains Mono** — metadata, timestamps, stats

## Data Formats

### JSON Export

The full archive JSON export has this shape:

```json
{
  "seedbankVersion": 1,
  "exportedAt": "2025-01-15T10:30:00.000Z",
  "ideas": [
    {
      "id": "uuid-v4",
      "title": "My Idea",
      "pitch": "One-line description",
      "category": "app",
      "stage": "seed",
      "tags": ["tag1", "tag2"],
      "moodLabels": ["cozy"],
      "fullNotes": "...",
      "hook": "...",
      "whyItMightWork": "...",
      "risks": "...",
      "techStack": "...",
      "jamScore": 3,
      "excitementScore": 4,
      "relatedIdeaIds": [],
      "links": [{ "url": "https://...", "label": "Reference" }],
      "images": [],
      "createdAt": "2025-01-10T08:00:00.000Z",
      "updatedAt": "2025-01-15T10:30:00.000Z"
    }
  ],
  "versions": [
    {
      "id": "uuid-v4",
      "ideaId": "parent-idea-uuid",
      "versionLabel": "Pitch revised",
      "notes": "",
      "timestamp": "2025-01-12T14:00:00.000Z",
      "snapshot": { "...same fields as idea content..." }
    }
  ]
}
```

A single-idea JSON export is just the idea object directly (no wrapper).

### Markdown Export

Each idea exports as a Markdown document with metadata in a blockquote header:

```markdown
# My Idea

> **Stage:** 🌱 Seed
> **Category:** App
> **Tags:** tag1, tag2
> **Excitement:** ★★★★☆
> **Planted:** 2025-01-10
> **Last tended:** 2025-01-15

## Pitch

One-line description...

## Notes

Full notes...

---
<!-- seedbank-id: uuid-v4 -->
```

The `seedbank-id` comment allows re-importing a Markdown file and matching it to the original idea.

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `N` | Open quick capture (Plant a Seed) |
| `/` | Focus the search input |
| `Esc` | Close modal / blur search |

## Project Structure

```
src/
├── components/      # Reusable UI components
│   ├── Layout.tsx          # App shell (header, nav, modal mounts)
│   ├── IdeaCard.tsx        # Card for the board grid
│   ├── FilterBar.tsx       # Category/stage/tag filters + sort
│   ├── QuickCapture.tsx    # Fast idea entry modal
│   ├── EmptyState.tsx      # First-time and no-results states
│   ├── StageBadge.tsx      # Colored stage indicator
│   ├── CategoryBadge.tsx   # Category label badge
│   ├── TagInput.tsx        # Keyboard-driven tag entry
│   ├── ScorePicker.tsx     # Star picker (1–5)
│   ├── LinkEditor.tsx      # URL + label list editor
│   ├── RelatedIdeasLinker.tsx  # Search & link other ideas
│   ├── VersionHistory.tsx  # Version list + snapshot viewer
│   ├── ImportExportModal.tsx   # Archive import/export UI
│   └── ErrorBoundary.tsx   # Graceful error fallback
├── pages/           # Route-level page components
│   ├── Board.tsx           # Main garden grid (/)
│   ├── IdeaDetail.tsx      # Idea editor (/idea/:id)
│   ├── IdeaNew.tsx         # New idea redirect (/idea/new)
│   └── Discover.tsx        # Discovery features (/discover)
├── db/              # Data access layer
│   ├── index.ts            # Dexie database schema
│   └── ideas.ts            # CRUD, search, versioning functions
├── lib/             # Utilities
│   ├── types.ts            # Core TypeScript types & enums
│   ├── export.ts           # Markdown & JSON export
│   ├── import.ts           # JSON & Markdown import + seed data
│   └── timeago.ts          # Relative time formatter
├── hooks/           # React hooks
│   └── useDebounce.ts      # Debounced callback with flush/cancel
├── stores/          # Zustand stores
│   └── filters.ts          # Search/filter/sort state
├── App.tsx          # Route definitions
├── main.tsx         # Entry point
└── index.css        # Tailwind config + theme tokens
```

## Data Privacy

All data stays in your browser's IndexedDB. Once the app is loaded (HTML, JS, CSS, and self-hosted fonts — all served from the same origin), Seedbank makes **zero network calls**: no server, no analytics, no telemetry, no font CDN. Your ideas are yours.

Export regularly to JSON for backup — IndexedDB can be cleared by the browser in some circumstances (storage pressure, clearing site data).

## License

MIT
