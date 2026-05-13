# Seedbank Archive Install

This archive is a **Node.js-based local app bundle** (not a native installer). It includes launch scripts and built outputs.

## Prerequisites
- Node.js 18+
- npm

## Start

### Linux / macOS
```bash
npm install
bash scripts/seedbank start
```

### Windows PowerShell
```powershell
npm install
powershell -ExecutionPolicy Bypass -File scripts/seedbank.ps1 start
```

### Windows Command Prompt
```bat
npm install
scripts\seedbank.bat start
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
- Does **not** install system-wide shortcuts automatically on Windows (deferred).
