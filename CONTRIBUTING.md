# Contributing to Seedbank

Thanks for taking the time to improve Seedbank. The project is small enough to stay approachable, but it has a real architecture: a React client, an Express/SQLite backend, shared TypeScript types, and plugin-style integrations.

## Development Setup

Prerequisites:

- Node.js 18+
- npm

```bash
git clone https://github.com/ghreprimand/Seedbank.git
cd Seedbank
npm install
npm run dev
```

The workspace starts:

- Client: `http://localhost:5173`
- API: `http://localhost:4800`

Before opening a pull request, run:

```bash
npm run typecheck
npm run lint
npm run build
```

## Code Style

- Use TypeScript throughout.
- Keep shared domain shapes in `shared/types.ts`.
- Keep UI data access behind `client/src/api/client.ts`.
- Preserve the Dexie fallback path when adding client-side data operations.
- Prefer existing components, theme tokens, and local conventions over new abstractions.
- Keep comments short and useful. Explain non-obvious decisions, not syntax.

The client is linted with ESLint and React Hooks rules. The server is typechecked with TypeScript strictness through its package config.

## Issues and Pull Requests

Good issues include:

- What you expected to happen.
- What happened instead.
- Steps to reproduce.
- Browser, OS, Node.js version, and whether the backend was running.

Good pull requests include:

- A short problem statement.
- A concise implementation summary.
- Any migration or data-shape implications.
- Verification commands run locally.
- Screenshots for visible UI changes.

## Architecture Conventions

Seedbank follows a few important boundaries:

- `shared/types.ts` defines the domain contract between client and server.
- `server/src/repository.ts` owns SQLite reads/writes and data normalization.
- `server/src/index.ts` owns HTTP route wiring.
- `client/src/api/client.ts` owns REST calls, response hydration, and IndexedDB fallback.
- `client/src/db/` is fallback/cache logic, not the primary data path.
- `server/src/integrations/` owns graduation plugins.
- `server/src/ai/` owns provider config, chat, suggestions, and usage tracking.

When changing an API response, update the shared types or client hydration code in the same PR.

## Adding an Integration Plugin

1. Create a new file under `server/src/integrations/`, for example `myTool.ts`.
2. Implement the integration interface:

   ```ts
   interface Integration {
     id: string;
     name: string;
     description: string;
     icon: string;
     isConfigured(): boolean;
     configure(config: Record<string, string>): void;
     canGraduate(idea: Idea): { ready: boolean; missing: string[] };
     graduate(idea: Idea): Promise<GraduationResult>;
   }
   ```

3. Store configuration through the repository settings helpers rather than hard-coding local paths.
4. Make `canGraduate` specific and helpful. Return missing fields the UI can show directly.
5. In `graduate`, create the target project or resource and return a `GraduationResult`.
6. Register the plugin in `server/src/integrations/registry.ts`.
7. Test the API:

   ```bash
   curl http://localhost:4800/api/integrations
   ```

8. Verify the Graduation UI can configure and run the integration.

## Data Safety

Seedbank is personal-archive software. Be conservative with destructive changes:

- Prefer soft-delete to permanent deletion.
- Preserve IDs and timestamps during imports and migrations.
- Keep backups readable and portable.
- Do not remove IndexedDB fallback behavior without a replacement.

## Documentation

When adding user-facing behavior, update the relevant guide:

- AI behavior: `docs/AI_GUIDE.md`
- Graduation plugins: `docs/INTEGRATIONS.md`
- Storage, backup, migration, or system design: `docs/ARCHITECTURE.md`
- User setup or feature overview: `README.md`
