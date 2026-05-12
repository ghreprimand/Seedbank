# README Screenshot Assets

This folder holds deterministic screenshots used by the top-level `README.md`.

Generated image captures in this folder are ignored by default via `.gitignore`.
Only final curated screenshots should be explicitly staged, reviewed for privacy/platform-neutral wording, and committed.

## Capture Script

Use the capture script from repo root:

```bash
node scripts/capture-readme-screenshots.mjs
```

Default assumptions:
- Client is running at `http://127.0.0.1:5173`
- API is running at `http://127.0.0.1:4800`

Optional flags:

```bash
node scripts/capture-readme-screenshots.mjs \
  --base-url=http://127.0.0.1:5173 \
  --api-url=http://127.0.0.1:4800 \
  --out-dir=docs/assets/screenshots \
  --strict-help
```

## Privacy and Safety Rules

- Use deterministic demo data only (the script seeds this via `/api/import` replace mode).
- Do not capture private API keys, raw tokens, personal names, or private project content.
- Do not expose personal filesystem paths in screenshots.
- If showing API/Server surfaces, sanitize DB path text in the capture pipeline.

## Recommended Isolated Run

To avoid using personal/local Seedbank data, run server/client with an isolated data dir:

```bash
SEEDBANK_DATA_DIR=<seedbank-data-dir> npm run dev -w server
npm run dev -w client
node scripts/capture-readme-screenshots.mjs --api-url=http://127.0.0.1:4800
```

## Expected Outputs

- `garden-overview.jpg`
- `idea-detail-thinking-partner.jpg`
- `settings-theme.jpg`
- `settings-ai-agents.jpg`
- `settings-api-server.jpg`
- `manual-help-overlay.jpg` (when help/manual UI exists)
- `theme-dark-view.jpg` (dark theme)
- `theme-mid-view.jpg` (mid-depth theme)

The script supports v2.2 theme names with fallbacks to v2.1 theme names.
