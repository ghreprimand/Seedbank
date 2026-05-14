# Project Drafting

Project drafting generates reviewable starter files from a Seedbank idea using the normal AI provider routing system. It does not launch a separate runner and does not use a separate auth path.

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
2. Click **Draft project files** above the Thinking Partner panel.
3. Adjust the prompt if you want specific files or a narrower scope.
4. Generate the draft.
5. Review each proposed file in the panel.
6. Download the selected files, or save them into the graduated project when the idea already has a configured project path.

The default prompt asks for practical starter files such as `SPEC.md`, `IMPLEMENTATION_NOTES.md`, and `TODO.md`. The model may also produce `RESEARCH_NOTES.md` or similar text files when they fit the idea.

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

Project drafting is review-first:

- It generates text content and safe relative paths only.
- Absolute paths, parent traversal, hidden directories, and empty files are rejected server-side.
- It returns at most eight files per request.
- It does not overwrite canonical idea fields.
- Saving to a project is an explicit second step after review.
- Project saves are allowed only when the idea has a `graduatedTo` path inside a configured project root.
- Existing project files are not overwritten; if a selected path already exists, the apply request returns `409`.
- The browser downloads or saves only the files the user selects.

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
