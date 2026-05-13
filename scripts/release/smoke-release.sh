#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
ARTIFACTS_DIR="$ROOT_DIR/.release/artifacts"

check_contains() {
  local listing="$1"
  local pattern="$2"
  if ! grep -Eq "$pattern" <<<"$listing"; then
    echo "Missing expected entry: $pattern" >&2
    exit 1
  fi
}

verify_manifest_entry() {
  local artifact="$1"
  local file_name
  file_name="$(basename "$artifact")"
  local version=""
  if [[ "$file_name" =~ ^seedbank-(v.+)-(linux-x64|macos|windows-x64)\.(tar\.gz|zip)$ ]]; then
    version="${BASH_REMATCH[1]}"
  fi
  if [[ -z "$version" ]]; then
    echo "Unable to infer version from artifact name: $file_name" >&2
    exit 1
  fi

  local manifest="$ARTIFACTS_DIR/manifest-${version}.json"
  if [[ ! -f "$manifest" ]]; then
    echo "No aggregate manifest for $file_name (expected $manifest); skipping checksum verification."
    return 0
  fi

  node - <<'NODE' "$manifest" "$artifact"
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const manifestPath = process.argv[2];
const artifactPath = process.argv[3];
const artifactName = path.basename(artifactPath);

const payload = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const entry = Array.isArray(payload.artifacts)
  ? payload.artifacts.find((row) => row && row.name === artifactName)
  : null;
if (!entry) {
  console.error(`Manifest ${manifestPath} does not include ${artifactName}`);
  process.exit(1);
}

const stat = fs.statSync(artifactPath);
if (Number(entry.bytes) !== stat.size) {
  console.error(`Byte mismatch for ${artifactName}: manifest=${entry.bytes} actual=${stat.size}`);
  process.exit(1);
}

const hash = crypto.createHash('sha256');
hash.update(fs.readFileSync(artifactPath));
const actualSha = hash.digest('hex');
if (String(entry.sha256) !== actualSha) {
  console.error(`SHA256 mismatch for ${artifactName}`);
  process.exit(1);
}
NODE
}

list_archive() {
  local artifact="$1"
  if [[ "$artifact" == *.tar.gz ]]; then
    tar -tzf "$artifact"
    return 0
  fi

  if [[ "$artifact" == *.zip ]]; then
    if command -v unzip >/dev/null 2>&1; then
      unzip -Z1 "$artifact"
      return 0
    fi
    if command -v python3 >/dev/null 2>&1; then
      python3 - <<'PY' "$artifact"
import sys, zipfile
with zipfile.ZipFile(sys.argv[1], 'r') as z:
    for name in z.namelist():
        print(name)
PY
      return 0
    fi
    echo "No unzip/python3 available to inspect zip artifact" >&2
    exit 1
  fi

  echo "Unsupported artifact format: $artifact" >&2
  exit 1
}

extract_archive() {
  local artifact="$1"
  local dest="$2"
  if [[ "$artifact" == *.tar.gz ]]; then
    tar -xzf "$artifact" -C "$dest"
    return 0
  fi

  if [[ "$artifact" == *.zip ]]; then
    if command -v unzip >/dev/null 2>&1; then
      unzip -q "$artifact" -d "$dest"
      return 0
    fi
    if command -v python3 >/dev/null 2>&1; then
      python3 - <<'PY' "$artifact" "$dest"
import sys, zipfile
with zipfile.ZipFile(sys.argv[1], 'r') as z:
    z.extractall(sys.argv[2])
PY
      return 0
    fi
    echo "No unzip/python3 available to extract zip artifact" >&2
    exit 1
  fi

  echo "Unsupported artifact format: $artifact" >&2
  exit 1
}

inspect_archive() {
  local artifact="$1"
  local listing
  listing="$(list_archive "$artifact")"

  check_contains "$listing" '^seedbank-v[^/]+/$'
  check_contains "$listing" 'README\.md$'
  check_contains "$listing" 'INSTALL\.md$'
  check_contains "$listing" 'package\.json$'
  check_contains "$listing" 'scripts/seedbank$'
  check_contains "$listing" 'scripts/seedbank\.ps1$'
  check_contains "$listing" 'scripts/seedbank\.bat$'
  check_contains "$listing" 'client/dist/index\.html$'
  check_contains "$listing" 'server/dist/server/src/index\.js$'

  local tmp_dir
  tmp_dir="$(mktemp -d)"
  trap 'rm -rf "$tmp_dir"' RETURN
  extract_archive "$artifact" "$tmp_dir"

  local root_dir
  root_dir="$(find "$tmp_dir" -mindepth 1 -maxdepth 1 -type d -name 'seedbank-v*' | head -n 1)"
  if [[ -z "$root_dir" ]]; then
    echo "Unable to find extracted seedbank-v* root in $artifact" >&2
    exit 1
  fi

  [[ -f "$root_dir/README.md" ]] || { echo "Missing README.md after extract" >&2; exit 1; }
  [[ -f "$root_dir/INSTALL.md" ]] || { echo "Missing INSTALL.md after extract" >&2; exit 1; }
  [[ -f "$root_dir/scripts/seedbank" ]] || { echo "Missing scripts/seedbank after extract" >&2; exit 1; }

  grep -Fq "npm run start -w server" "$root_dir/scripts/seedbank" || {
    echo "Launcher regression: scripts/seedbank should run built server runtime." >&2
    exit 1
  }
  grep -Fq "npm run preview -w client" "$root_dir/scripts/seedbank" || {
    echo "Launcher regression: scripts/seedbank should run built client preview runtime." >&2
    exit 1
  }

  if [[ "$artifact" == *"-linux-"* || "$artifact" == *"-macos."* || "$artifact" == *"-macos-"* ]]; then
    if [[ ! -x "$root_dir/scripts/seedbank" ]]; then
      echo "Expected executable bit on scripts/seedbank for $artifact" >&2
      exit 1
    fi
  fi

  trap - RETURN
  rm -rf "$tmp_dir"
}

declare -a artifacts=()
if [[ $# -gt 0 ]]; then
  artifacts=("$@")
else
  latest_manifest="$(ls -1t "$ARTIFACTS_DIR"/manifest-v*.json 2>/dev/null | grep -Ev 'manifest-v.+-(linux-x64|macos|windows-x64)\.json$' | head -n 1 || true)"
  if [[ -n "${latest_manifest:-}" ]]; then
    mapfile -t artifacts < <(node - <<'NODE' "$latest_manifest" "$ARTIFACTS_DIR"
const fs = require('node:fs');
const path = require('node:path');

const manifestPath = process.argv[2];
const artifactsDir = process.argv[3];
const payload = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
for (const row of payload.artifacts ?? []) {
  if (!row?.name) continue;
  console.log(path.join(artifactsDir, row.name));
}
NODE
)
  else
    shopt -s nullglob
    artifacts=(
      "$ARTIFACTS_DIR"/seedbank-v*-linux-x64.tar.gz
      "$ARTIFACTS_DIR"/seedbank-v*-macos.tar.gz
      "$ARTIFACTS_DIR"/seedbank-v*-windows-x64.zip
    )
    shopt -u nullglob
  fi
  if [[ ${#artifacts[@]} -eq 0 ]]; then
    echo "Usage: $0 <artifact-path ...>" >&2
    echo "No artifacts found under $ARTIFACTS_DIR" >&2
    exit 1
  fi
fi

for artifact in "${artifacts[@]}"; do
  if [[ ! -f "$artifact" ]]; then
    echo "Artifact not found: $artifact" >&2
    exit 1
  fi
  inspect_archive "$artifact"
  verify_manifest_entry "$artifact"
  echo "Smoke check passed: $artifact"
done

echo "Smoke check passed for ${#artifacts[@]} artifact(s)."
