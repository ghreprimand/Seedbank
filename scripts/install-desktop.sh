#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SEEDBANK_DIR="${SEEDBANK_DIR:-$(cd "$SCRIPT_DIR/.." && pwd)}"
APPLICATIONS_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
TARGET_FILE="$APPLICATIONS_DIR/seedbank.desktop"

mkdir -p "$APPLICATIONS_DIR"
sed "s|{SEEDBANK_DIR}|$SEEDBANK_DIR|g" "$SCRIPT_DIR/seedbank.desktop" > "$TARGET_FILE"
chmod 644 "$TARGET_FILE"

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$APPLICATIONS_DIR" >/dev/null 2>&1 || true
fi

echo "Installed $TARGET_FILE"
