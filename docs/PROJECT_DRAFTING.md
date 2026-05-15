# Project Generation and Drafting

Project generation creates a local project folder, generates repo-ready starter files from a Seedbank idea, writes them to that folder, and then lets the user publish the folder to GitHub as a separate explicit step. It uses the normal AI provider routing system. It does not launch a separate runner and does not use a separate auth path.

## How It Is Configured

Go to **Settings → AI & Agents → Feature Defaults** and configure the **Project drafting** row.

That row controls:

- provider instance
- model
- reasoning effort, when the selected provider/model supports it
- text verbosity, when supported
- effective inherited route when set to **Use global default**

Usage guardrails, remote-provider confirmation, model allowlists, disabled providers, disabled features, and token budgets are enforced by the same server-side preflight and guardrail checks used by other AI assist features.

## User Workflow

1. Open an idea detail page.
2. Use the **Project generation** section near the bottom of the page.
3. If the Settings project root is blank, either follow the section link to **Settings → Project Graduation** or let Seedbank use the default `~/Projects/Seedbank-Graduated`.
4. Adjust the file generation brief if you want a narrower scope.
5. Click **Create project files**. Seedbank creates the local project folder when needed, generates starter files, and writes them to disk.
6. Click **Create GitHub repo** from the same section when you want to publish and push the generated files.
7. After the repo exists, the section shows the GitHub repo link and **Update GitHub repo** instead. That action commits changed local project files when present and pushes them to the linked repo.

The default generation prompt asks for `README.md`, `SPEC.md`, `IMPLEMENTATION_NOTES.md`, and `TODO.md`. The server adds conservative fallback versions for any of those files that the AI omits.

## API

`POST /api/ai/project-draft` requires `ai:suggest`.

Request:

```json
{
  "ideaId": "uuid",
  "prompt": "Write a SPEC.md and TODO.md for the smallest useful version.",
  "aiConfirmationToken": "optional-preflight-token",
  "providerInstanceId": "optional-request-route-override",
  "model": "optional-request-model-override",
  "effort": "medium",
  "verbosity": "medium"
}
```

`POST /api/ai/project-generate` requires `ai:suggest` and `write:ideas`, and accepts the same request shape. It creates or reuses the idea project folder, writes repo-ready files to disk, updates `graduatedTo`, and returns:

```json
{
  "summary": "Generated starter documentation.",
  "provider": "codex-account",
  "providerInstanceId": "codex-account",
  "model": "gpt-5.3-codex",
  "targetPath": "/path/to/project",
  "filesWritten": ["README.md", "SPEC.md", "IMPLEMENTATION_NOTES.md", "TODO.md"],
  "createdProject": true,
  "idea": { "id": "uuid", "graduatedTo": "/path/to/project" },
  "files": []
}
```

Response:

```json
{
  "summary": "Drafted a compact specification and implementation checklist.",
  "provider": "openai",
  "providerInstanceId": "openai-api",
  "model": "gpt-5.4",
  "files": [
    {
      "path": "SPEC.md",
      "description": "Product and implementation spec.",
      "content": "# Spec\n..."
    }
  ]
}
```

## Safety Model

Project generation is local-first:

- It generates text content and safe relative paths only.
- Absolute paths, parent traversal, hidden directories, and empty files are rejected server-side.
- Drafting returns at most eight model files per request; generation may add required fallback repo docs.
- It does not overwrite canonical idea fields.
- Project generation creates a local folder first; GitHub publishing is optional.
- Existing project files are not overwritten; if a selected/generated path already exists, the request returns an error.

## Apply API

`POST /api/ai/project-draft/apply` requires `ai:suggest`.

Request:

```json
{
  "ideaId": "uuid",
  "files": [
    {
      "path": "SPEC.md",
      "content": "# Spec\n..."
    }
  ]
}
```

Response:

```json
{
  "targetPath": "/configured/project/root/example-project",
  "filesWritten": ["SPEC.md"]
}
```

## Relationship To Account Auth

Claude account and Codex account are normal routable provider methods. If either account session expires, the app shell shows the persistent reauth notice when this browser has previously seen that account authenticated. The notice links directly to Settings → AI & Agents so the user can reauthenticate from the relevant provider card.
