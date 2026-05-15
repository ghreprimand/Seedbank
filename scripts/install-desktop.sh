#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SEEDBANK_DIR="${SEEDBANK_DIR:-$(cd "$SCRIPT_DIR/.." && pwd)}"
APPLICATIONS_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
TARGET_FILE="$APPLICATIONS_DIR/seedbank.desktop"
ICON_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor/scalable/apps"
ICON_TARGET="$ICON_DIR/seedbank.svg"
SOURCE_ICON="$SEEDBANK_DIR/client/public/favicon.svg"
LAUNCHER_PATH="$SEEDBANK_DIR/scripts/seedbank"

escape_desktop_string() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  printf '%s' "$value"
}

ESCAPED_LAUNCHER="$(escape_desktop_string "$LAUNCHER_PATH")"

mkdir -p "$APPLICATIONS_DIR"
mkdir -p "$ICON_DIR"
cat > "$TARGET_FILE" <<EOF
[Desktop Entry]
Type=Application
Name=Seedbank
GenericName=Idea Vault
Comment=Permanent idea vault for project seeds
Exec="$ESCAPED_LAUNCHER" restart
Icon=seedbank
Terminal=false
Categories=Development;Utility;ProjectManagement;
StartupNotify=false
Keywords=ideas;seedbank;projects;brainstorm;
EOF
chmod 644 "$TARGET_FILE"
if [[ -f "$SOURCE_ICON" ]]; then
  cp "$SOURCE_ICON" "$ICON_TARGET"
  chmod 644 "$ICON_TARGET"
fi

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$APPLICATIONS_DIR" >/dev/null 2>&1 || true
fi

echo "Installed $TARGET_FILE"
if [[ -f "$ICON_TARGET" ]]; then
  echo "Installed $ICON_TARGET"
fi
