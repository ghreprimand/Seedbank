# Releasing Seedbank (Archive-Based v1)

Seedbank release v1 ships installable **archives** around the current launcher model, not a Tauri/Electron desktop bundle.

## Scope Of This Flow
- Build `client/dist` and `server/dist`.
- Package the runtime source + launch scripts into per-platform archives.
- Attach archives and checksum manifest to a GitHub Release.
- Include `INSTALL.md` in each archive for post-extract quick start.

Runtime note:
- Launchers start the built runtime (`npm run start -w server` + `npm run preview -w client`), not hot-reload dev mode.

Current archive targets:
- `seedbank-vX.Y.Z-linux-x64.tar.gz`
- `seedbank-vX.Y.Z-macos.tar.gz`
- `seedbank-vX.Y.Z-windows-x64.zip`

## Preconditions
- Clean working tree (recommended).
- `npm ci` completed.
- Git tag prepared (for CI release path).

## Local Packaging
Build first:

```bash
npm run build
```

Create all target archives (default):

```bash
npm run release:package
```

Create one target archive:

```bash
npm run release:package -- --target linux-x64 --format tar.gz
npm run release:package -- --target macos --format tar.gz
npm run release:package -- --target windows-x64 --format zip
```

Artifacts land in:

```text
.release/artifacts/
```

Manifest outputs:
- `manifest-vX.Y.Z-linux-x64.json`
- `manifest-vX.Y.Z-macos.json`
- `manifest-vX.Y.Z-windows-x64.json`
- `manifest-vX.Y.Z.json` (aggregate, produced in all-target mode)

Version behavior:
- By default, artifact version tags come from `package.json`.
- CI passes `--version-tag` from the release tag to ensure artifact names and release tags stay aligned.
- Local override is available: `npm run release:package -- --version-tag vX.Y.Z`.

## Local Smoke Check
Verify all discovered artifacts:

```bash
npm run release:smoke
```

Verify a specific archive path:

```bash
npm run release:smoke -- .release/artifacts/seedbank-vX.Y.Z-linux-x64.tar.gz
```

You can also pass multiple artifact paths.
Smoke checks now validate:
- required files and top-level layout
- extractability
- Unix executable bit on `scripts/seedbank` for Linux/macOS artifacts
- checksum/bytes against aggregate `manifest-vX.Y.Z.json` when available

## GitHub Release Workflow
Workflow file: `.github/workflows/release.yml`

Trigger modes:
- `push` tag `v*`
- manual `workflow_dispatch` with required `release_tag` input (existing tag)

Pipeline behavior:
1. Validate release tag format and ensure workflow ref matches the tag commit.
2. Package Linux + Windows on hosted runners.
3. Package macOS on a **self-hosted** macOS runner (`runs-on: [self-hosted, macOS]`).
4. Upload only platform artifacts.
5. Build aggregate manifest from downloaded artifacts in the publish job.
6. Publish GitHub Release attachments via `softprops/action-gh-release` with explicit `tag_name`.

Permissions model:
- Workflow default token permission is `contents:read`.
- Only the `publish` job elevates to `contents:write` to create/update the GitHub Release.

Tag example:

```bash
git tag v1.2.3
git push origin v1.2.3
```

## macOS Runner Notes
Current workflow does **not** use hosted macOS runners.
It requires a registered self-hosted macOS runner with at least these labels:
- `self-hosted`
- `macOS`

Operational behavior:
- If the self-hosted Mac runner is offline/asleep, the macOS package job remains queued and the release workflow waits.
- Bring the runner online and the queued job will continue automatically.
- If you need a release while the Mac runner is unavailable, either:
  - bring the Mac runner online so the queued CI workflow can finish and publish, or
  - package artifacts locally and create/upload the GitHub Release manually (archives + aggregate manifest) instead of waiting for CI publish.

Recommended setup pattern:
- Install runner under `~/actions-runner`.
- Register with default labels (`self-hosted`, `macOS`, arch).
- Install as LaunchAgent/service via `./svc.sh install` and `./svc.sh start`.

Public-repo safety constraints:
- Seedbank is a public repository. Self-hosted runners execute workflow code and must only be used for trusted release flows.
- The release workflow is intentionally limited to trusted triggers (`push` tags `v*` and manual `workflow_dispatch`) and does not run on `pull_request`/`pull_request_target`.
- Do not store Apple credentials, SSH keys, API keys, or other long-lived secrets on the release runner for this archive flow.
- Any future signing/notarization secret use should be implemented as a separate protected design (manual approvals/protected environments/isolated runner), not in this archive workflow.

Unsigned macOS archives may be quarantined by Gatekeeper. If launch is blocked after download/extract, run:

```bash
xattr -rc .
```

If/when signing/notarization is introduced:
- Add a dedicated self-hosted macOS runner label set, e.g. `[self-hosted, macOS, ARM64, seedbank-release]`.
- Restrict signing jobs to that runner.
- Keep Apple credentials only on that runner.

## What This Does Not Do Yet
- No MSI/MSIX/DMG/PKG/AppImage installers.
- No auto-update mechanism.
- No notarization/signing pipeline.
- No automatic Windows shortcut creation (manual shortcut only).

Those remain a subsequent release phase after packaging approach is finalized.
