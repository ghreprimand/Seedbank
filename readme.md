# Seedbank

Seedbank is a local-first project idea manager for games, apps, tools, experiments, and half-formed sparks that should not disappear into old notes. It is meant to be more than a database of pitches: it should feel like a small creative workspace where ideas can be planted, revisited, crossed with other ideas, and eventually grown into something worth building.

The core job is simple:

- Capture a project idea quickly, before it fades.
- Store the pitch, hook, mechanics, target audience, risks, tech notes, and references in one place.
- Categorize ideas by type, mood, scope, platform, jam fit, technical novelty, and personal excitement.
- Search old ideas by keyword, category, tag, status, or fuzzy memory.
- Keep an idea's history instead of overwriting it: rough seed, stronger pitch, prototype notes, abandoned version, revived version.

## Product Shape

Seedbank should open directly into the user's living idea collection. No landing page, no heavy setup, no forced workflow. The first screen should show a searchable, filterable board of ideas with enough detail to recognize each one at a glance.

Each idea can have:

- Title
- One-line pitch
- Category, such as game, app, tool, art project, local AI, mobile, browser, open-source utility
- Stage, such as seed, sprout, pitch, prototype, shelved, shipped
- Tags and mood labels
- Full pitch notes
- Hook or 30-second demo concept
- Why it might work
- Risks and blockers
- Tech stack notes
- Jam suitability score
- Personal excitement score
- Related ideas
- Links, images, documents, and inspirations

The storage model should be local-first. The user's idea archive should outlive the app. A good default would be IndexedDB for the app experience, plus export/import to plain Markdown or JSON.

## Theme Direction

The name Seedbank gives the app a useful metaphor without needing to become childish or overly decorative. The interface can borrow gardening language, but it should still feel like a serious creative tool.

Possible theme language:

- Ideas are **seeds** when they are new and rough.
- Stronger concepts become **sprouts**.
- More developed concepts become **pitches**.
- Active experiments become **plots**.
- Related ideas can be **grafted** together.
- Archived ideas go into **cold storage**, still preserved and searchable.
- Weekly review can be called **tending**.
- A random old idea resurfacer can be called **draw from storage**.

The visual style should be warm, tactile, and focused:

- A restrained palette with soft greens, ink, clay, and off-white paper tones.
- Dense but calm layouts, closer to a writing tool than a SaaS dashboard.
- Small organic details: seed dots, growth rings, pressed-label tags, field-note typography.
- Cards with sharp enough edges to feel useful, not toy-like.
- Search and filters should be prominent, because rediscovery is the main promise.

## What Makes It Fun

Seedbank should reward returning to old ideas. The delight should come from rediscovery, recombination, and seeing thoughts mature over time.

Feature ideas:

- **Daily seed:** resurface one forgotten idea with a prompt like "add one reason this might work."
- **Cross-pollinate:** pick two random ideas and ask what hybrid could exist between them.
- **Pitch pressure:** turn a messy note into a one-line pitch, 30-second hook, and build plan.
- **Jam lens:** score ideas against a specific jam's constraints, such as browser-playable, no login, open source, two-week scope.
- **Idea weather:** show patterns in the archive, like "you keep returning to local-first tools" or "your strongest ideas involve procedural systems."
- **Version branches:** keep alternate forms of an idea instead of flattening them into one note.
- **Shelf without shame:** make shelving an idea feel like preservation, not failure.

## Initial Build Target

The first usable version should be a browser app with:

- Create, edit, delete, and duplicate ideas.
- Categories, tags, and status labels.
- Full-text search across titles, pitches, notes, and tags.
- Filter chips for category, status, and jam fit.
- A focused detail editor for a single idea.
- Local persistence.
- Import of the existing Markdown pitch documents.
- Export to Markdown or JSON.

The project should prove the concept by using the current pitch documents as the first Seedbank archive.

## Open Source Angle

Seedbank can be valuable as an open-source project because the core is personal, portable, and forkable. People could adapt the schema, scoring rubrics, prompt templates, importers, and visual themes to match how they think.

The forkable soul should be:

- `schema.json` for idea fields and statuses.
- `rubrics/` for jam scoring and project evaluation templates.
- `prompts/` for pitch sharpening, recombination, and review flows.
- `importers/` for Markdown, Notion, Obsidian, Apple Notes exports, and voice memos.
- `themes/` for visual styles.

Seedbank should feel like a creative companion, but it should never trap the user's ideas. The archive belongs to the user.
