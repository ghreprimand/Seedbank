param(
  [ValidateSet('start', 'stop', 'restart', 'status', 'logs')]
  [string]$Command = 'start'
)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$SeedbankDir = if ($env:SEEDBANK_DIR) { $env:SEEDBANK_DIR } else { (Resolve-Path (Join-Path $ScriptDir '..')).Path }
$ClientPort = if ($env:SEEDBANK_CLIENT_PORT) { [int]$env:SEEDBANK_CLIENT_PORT } else { 5173 }
$ServerPort = if ($env:SEEDBANK_SERVER_PORT) { [int]$env:SEEDBANK_SERVER_PORT } else { 4800 }
$CacheDir = Join-Path $env:APPDATA 'seedbank'
$ClientPidFile = Join-Path $CacheDir 'client.pid'
$ServerPidFile = Join-Path $CacheDir 'server.pid'
$LogFile = Join-Path $CacheDir 'seedbank.log'
$Url = "http://localhost:$ClientPort"

New-Item -ItemType Directory -Force -Path $CacheDir | Out-Null

function Get-PortPid([int]$Port) {
  $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($conn) { return $conn.OwningProcess }
  return $null
}

function Ensure-Setup {
  if (-not (Test-Path (Join-Path $SeedbankDir 'node_modules'))) {
    Push-Location $SeedbankDir
    cmd /c "npm install >> `"$LogFile`" 2>&1"
    if ($LASTEXITCODE -ne 0) { throw 'npm install failed' }
    Pop-Location
  }

  $clientDist = Join-Path $SeedbankDir 'client/dist/index.html'
  $serverDist = Join-Path $SeedbankDir 'server/dist'
  if (-not (Test-Path $clientDist) -or -not (Test-Path $serverDist)) {
    Push-Location $SeedbankDir
    cmd /c "npm run build >> `"$LogFile`" 2>&1"
    if ($LASTEXITCODE -ne 0) { throw 'npm run build failed' }
    Pop-Location
  }
}

function Start-Seedbank {
  $clientPid = Get-PortPid $ClientPort
  $serverPid = Get-PortPid $ServerPort
  if ($clientPid) { throw "Client port $ClientPort is already in use by PID $clientPid." }
  if ($serverPid) { throw "Server port $ServerPort is already in use by PID $serverPid." }

  Ensure-Setup
  Add-Content -Path $LogFile -Value "`n=== $(Get-Date -Format o) - seedbank start client=$ClientPort server=$ServerPort ==="

  $server = Start-Process -FilePath 'cmd.exe' -ArgumentList "/c cd /d `"$SeedbankDir`" && set PORT=$ServerPort&& npm run start -w server >> `"$LogFile`" 2>&1" -WindowStyle Hidden -PassThru
  Set-Content -Path $ServerPidFile -Value $server.Id

  $client = Start-Process -FilePath 'cmd.exe' -ArgumentList "/c cd /d `"$SeedbankDir`" && set VITE_SEEDBANK_API_URL=http://localhost:$ServerPort&& npm run preview -w client -- --host 127.0.0.1 --port $ClientPort --strictPort >> `"$LogFile`" 2>&1" -WindowStyle Hidden -PassThru
  Set-Content -Path $ClientPidFile -Value $client.Id

  Start-Sleep -Seconds 2
  Start-Process $Url
  Write-Host "Seedbank started at $Url"
}

function Stop-Seedbank {
  foreach ($file in @($ClientPidFile, $ServerPidFile)) {
    if (Test-Path $file) {
      $pidValue = Get-Content $file -ErrorAction SilentlyContinue | Select-Object -First 1
      if ($pidValue) {
        Stop-Process -Id ([int]$pidValue) -Force -ErrorAction SilentlyContinue
      }
      Remove-Item $file -Force -ErrorAction SilentlyContinue
    }
  }
  Write-Host 'Seedbank stopped.'
}

function Show-Status {
  $clientPid = Get-PortPid $ClientPort
  $serverPid = Get-PortPid $ServerPort
  Write-Host 'Seedbank status:'
  Write-Host "  client $ClientPort: $(if ($clientPid) { "running PID $clientPid" } else { 'stopped' })"
  Write-Host "  server $ServerPort: $(if ($serverPid) { "running PID $serverPid" } else { 'stopped' })"
  Write-Host "  URL: $Url"
  Write-Host "  log: $LogFile"
}

switch ($Command) {
  'start' { Start-Seedbank }
  'stop' { Stop-Seedbank }
  'restart' { Stop-Seedbank; Start-Sleep -Seconds 1; Start-Seedbank }
  'status' { Show-Status }
  'logs' {
    if (Test-Path $LogFile) { Get-Content -Path $LogFile -Tail 100 -Wait }
    else { Write-Host "No log at $LogFile yet." }
  }
}
