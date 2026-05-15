# Seedbank Archive Install

This archive is a **Node.js-based local app bundle** (not a native installer). It includes launch scripts and built outputs.

## Easiest Install

Use the installer for your platform from the extracted Seedbank folder.

### Linux
```bash
bash Install-Seedbank.sh
```

The installer checks Node.js/npm, offers to install them with your package manager when possible, installs Seedbank dependencies, prepares the runtime, creates an application launcher, and starts Seedbank.

### macOS
Double-click `Install-Seedbank.command`, or run:

```bash
bash Install-Seedbank.command
```

The installer checks Node.js/npm, uses Homebrew if available for Node.js, creates `~/Applications/Seedbank.app`, and starts Seedbank.
The app launcher writes troubleshooting output to `~/Library/Logs/Seedbank/launcher.log`.

### Windows
Double-click `Install-Seedbank.bat`, or run it from Command Prompt.

The installer checks Node.js/npm, offers to install Node.js LTS with `winget` when available, installs Seedbank dependencies, creates a Start Menu shortcut, and starts Seedbank.
If another copy of Seedbank is already running from a different extracted folder, the installer stops the old local Seedbank processes before starting the new one.

If the automatic Node.js install is not available on your computer, the installer opens the Node.js download page. Install Node.js 18+ and run the Seedbank installer again.

## Start Manually

### Linux / macOS
```bash
bash scripts/seedbank start
```

### Windows PowerShell
```powershell
powershell -ExecutionPolicy Bypass -File scripts/seedbank.ps1 start
```

The app opens at `http://localhost:5173` (or the next free client port on Linux/macOS).

## Stop / Status

### Linux / macOS
```bash
bash scripts/seedbank status
bash scripts/seedbank stop
```

### Windows PowerShell
```powershell
powershell -ExecutionPolicy Bypass -File scripts/seedbank.ps1 status
powershell -ExecutionPolicy Bypass -File scripts/seedbank.ps1 stop
```

## macOS Quarantine Note
Unsigned downloaded archives may be blocked by Gatekeeper. If launch is blocked, run this in the extracted directory:

```bash
xattr -rc .
```

## What This Archive Is (And Is Not)
- Includes built client/server output and launch scripts.
- Starts the built runtime (`server/dist` + `vite preview`), not hot-reload dev mode.
- Installs a user-level launcher shortcut: Linux application launcher, macOS `~/Applications/Seedbank.app`, or Windows Start Menu shortcut.
