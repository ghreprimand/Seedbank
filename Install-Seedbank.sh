#!/usr/bin/env bash
# User-facing installer for Linux and macOS release archives.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SEEDBANK_DIR="${SEEDBANK_DIR:-$SCRIPT_DIR}"
LAUNCHER="$SEEDBANK_DIR/scripts/seedbank"
NODE_DOWNLOAD_URL="https://nodejs.org/en/download"
REQUIRED_NODE_MAJOR=18
START_AFTER_INSTALL="${SEEDBANK_START_AFTER_INSTALL:-true}"

say() {
  printf '\n%s\n' "$*"
}

fail() {
  printf '\nSeedbank install could not continue:\n%s\n' "$*" >&2
  exit 1
}

confirm() {
  local prompt="$1"
  local answer=""
  if [[ ! -t 0 ]]; then
    return 1
  fi
  read -r -p "$prompt [Y/n] " answer
  [[ -z "$answer" || "$answer" =~ ^[Yy]$ ]]
}

open_url() {
  local url="$1"
  if [[ "$(uname -s)" == "Darwin" ]] && command -v open >/dev/null 2>&1; then
    open "$url" >/dev/null 2>&1 || true
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$url" >/dev/null 2>&1 || true
  fi
}

node_major() {
  node -p "Number(process.versions.node.split('.')[0])" 2>/dev/null || echo 0
}

has_usable_node() {
  command -v node >/dev/null 2>&1 &&
    command -v npm >/dev/null 2>&1 &&
    [[ "$(node_major)" -ge "$REQUIRED_NODE_MAJOR" ]]
}

install_node_with_package_manager() {
  local system
  system="$(uname -s)"

  if [[ "$system" == "Darwin" ]]; then
    if command -v brew >/dev/null 2>&1; then
      say "Installing Node.js with Homebrew..."
      brew install node
      return 0
    fi
    return 1
  fi

  if command -v apt-get >/dev/null 2>&1; then
    say "Installing Node.js and npm with apt..."
    sudo apt-get update
    sudo apt-get install -y nodejs npm
    return 0
  fi

  if command -v dnf >/dev/null 2>&1; then
    say "Installing Node.js and npm with dnf..."
    sudo dnf install -y nodejs npm
    return 0
  fi

  if command -v pacman >/dev/null 2>&1; then
    say "Installing Node.js and npm with pacman..."
    sudo pacman -Sy --needed nodejs npm
    return 0
  fi

  if command -v zypper >/dev/null 2>&1; then
    say "Installing Node.js and npm with zypper..."
    sudo zypper install -y nodejs npm
    return 0
  fi

  if command -v apk >/dev/null 2>&1; then
    say "Installing Node.js and npm with apk..."
    sudo apk add nodejs npm
    return 0
  fi

  return 1
}

ensure_node() {
  if has_usable_node; then
    say "Node.js $(node -v) and npm $(npm -v) found."
    return 0
  fi

  say "Seedbank needs Node.js ${REQUIRED_NODE_MAJOR}+ and npm."
  if command -v node >/dev/null 2>&1; then
    say "Current Node.js is $(node -v), which is too old."
  fi

  if confirm "Install Node.js/npm now using this computer's package manager?"; then
    install_node_with_package_manager || {
      say "No supported package manager was found for automatic Node.js install."
    }
  fi

  if has_usable_node; then
    say "Node.js $(node -v) is ready."
    return 0
  fi

  open_url "$NODE_DOWNLOAD_URL"
  fail "Install Node.js ${REQUIRED_NODE_MAJOR}+ from $NODE_DOWNLOAD_URL, then run Install-Seedbank again."
}

prepare_seedbank() {
  [[ -f "$LAUNCHER" ]] || fail "Missing launcher: $LAUNCHER"
  chmod +x "$LAUNCHER" 2>/dev/null || true

  say "Installing Seedbank dependencies..."
  (cd "$SEEDBANK_DIR" && npm install)

  say "Preparing Seedbank runtime..."
  (cd "$SEEDBANK_DIR" && npm run build)
}

install_linux_launcher() {
  say "Installing Linux application launcher..."
  bash "$SEEDBANK_DIR/scripts/install-desktop.sh"
}

install_macos_icon() {
  local resources_dir="$1"
  local source_icon="$SEEDBANK_DIR/client/public/favicon.svg"
  local iconset="$resources_dir/Seedbank.iconset"
  local icns="$resources_dir/Seedbank.icns"
  local base_png="$resources_dir/Seedbank-1024.png"

  [[ -f "$source_icon" ]] || return 1
  command -v iconutil >/dev/null 2>&1 || return 1

  mkdir -p "$resources_dir"
  rm -rf "$iconset" "$icns" "$base_png"
  mkdir -p "$iconset"

  if command -v qlmanage >/dev/null 2>&1; then
    qlmanage -t -s 1024 -o "$resources_dir" "$source_icon" >/dev/null 2>&1 || true
    if [[ -f "$resources_dir/favicon.svg.png" ]]; then
      mv "$resources_dir/favicon.svg.png" "$base_png"
    fi
  fi

  if [[ ! -f "$base_png" ]] && command -v sips >/dev/null 2>&1; then
    sips -s format png "$source_icon" --out "$base_png" >/dev/null 2>&1 || true
  fi

  [[ -f "$base_png" ]] || return 1
  command -v sips >/dev/null 2>&1 || return 1

  sips -z 16 16 "$base_png" --out "$iconset/icon_16x16.png" >/dev/null
  sips -z 32 32 "$base_png" --out "$iconset/icon_16x16@2x.png" >/dev/null
  sips -z 32 32 "$base_png" --out "$iconset/icon_32x32.png" >/dev/null
  sips -z 64 64 "$base_png" --out "$iconset/icon_32x32@2x.png" >/dev/null
  sips -z 128 128 "$base_png" --out "$iconset/icon_128x128.png" >/dev/null
  sips -z 256 256 "$base_png" --out "$iconset/icon_128x128@2x.png" >/dev/null
  sips -z 256 256 "$base_png" --out "$iconset/icon_256x256.png" >/dev/null
  sips -z 512 512 "$base_png" --out "$iconset/icon_256x256@2x.png" >/dev/null
  sips -z 512 512 "$base_png" --out "$iconset/icon_512x512.png" >/dev/null
  cp "$base_png" "$iconset/icon_512x512@2x.png"

  iconutil -c icns "$iconset" -o "$icns" >/dev/null
  rm -rf "$iconset" "$base_png"
  [[ -f "$icns" ]]
}

install_macos_launcher() {
  local apps_dir="$HOME/Applications"
  local app_dir="$apps_dir/Seedbank.app"
  local macos_dir="$app_dir/Contents/MacOS"
  local resources_dir="$app_dir/Contents/Resources"
  local plist="$app_dir/Contents/Info.plist"
  local executable="$macos_dir/Seedbank"

  say "Installing macOS application launcher..."
  mkdir -p "$macos_dir" "$resources_dir"
  cat > "$executable" <<EOF
#!/usr/bin/env bash
export SEEDBANK_DIR="$SEEDBANK_DIR"
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:\${PATH:-}"
LOG_DIR="\$HOME/Library/Logs/Seedbank"
mkdir -p "\$LOG_DIR"
exec "$LAUNCHER" start >> "\$LOG_DIR/launcher.log" 2>&1
EOF
  chmod +x "$executable"

  if install_macos_icon "$resources_dir"; then
    say "Installed macOS app icon."
  else
    say "macOS app icon could not be generated; launcher will use the default app icon."
  fi

  cat > "$plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>Seedbank</string>
  <key>CFBundleIdentifier</key>
  <string>local.seedbank.app</string>
  <key>CFBundleName</key>
  <string>Seedbank</string>
  <key>CFBundleDisplayName</key>
  <string>Seedbank</string>
  <key>CFBundleIconFile</key>
  <string>Seedbank</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
</dict>
</plist>
EOF

  touch "$app_dir"

  say "Installed $app_dir"
}

install_launcher() {
  case "$(uname -s)" in
    Linux) install_linux_launcher ;;
    Darwin) install_macos_launcher ;;
    *) say "Launcher install skipped for this OS. Use scripts/seedbank start." ;;
  esac
}

main() {
  say "Seedbank installer"
  say "Location: $SEEDBANK_DIR"
  ensure_node
  prepare_seedbank
  install_launcher

  say "Seedbank is installed."
  if [[ "$START_AFTER_INSTALL" == "true" ]]; then
    say "Starting Seedbank..."
    bash "$LAUNCHER" restart
  else
    say "Start it later with: bash scripts/seedbank start"
  fi
}

main "$@"
