param(
  [ValidateSet('start', 'stop', 'restart', 'status', 'logs')]
  [string]$Command = 'start'
)

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$SeedbankDir = if ($env:SEEDBANK_DIR) { $env:SEEDBANK_DIR } else { (Resolve-Path (Join-Path $ScriptDir '..')).Path }
$LocalNodeDir = Join-Path $SeedbankDir '.runtime\node'
$ClientPort = if ($env:SEEDBANK_CLIENT_PORT) { [int]$env:SEEDBANK_CLIENT_PORT } else { 5173 }
$ServerPort = if ($env:SEEDBANK_SERVER_PORT) { [int]$env:SEEDBANK_SERVER_PORT } else { 4800 }
$CacheDir = Join-Path $env:APPDATA 'seedbank'
$ClientPidFile = Join-Path $CacheDir 'client.pid'
$ServerPidFile = Join-Path $CacheDir 'server.pid'
$ClientPortFile = Join-Path $CacheDir 'client.port'
$ServerPortFile = Join-Path $CacheDir 'server.port'
$LogFile = Join-Path $CacheDir 'seedbank.log'
$ServerLogFile = Join-Path $CacheDir 'server.log'
$ServerErrorLogFile = Join-Path $CacheDir 'server.error.log'
$ClientLogFile = Join-Path $CacheDir 'client.log'
$ClientErrorLogFile = Join-Path $CacheDir 'client.error.log'
$StartLockDir = Join-Path $CacheDir 'start.lock.d'
$BrowserOpenLockDir = Join-Path $CacheDir 'browser-open.lock.d'
$LastBrowserOpenFile = Join-Path $CacheDir 'last-browser-open'
$BrowserOpenDebounceSeconds = if ($env:SEEDBANK_BROWSER_OPEN_DEBOUNCE_SECONDS) { [int]$env:SEEDBANK_BROWSER_OPEN_DEBOUNCE_SECONDS } else { 3 }
$Url = "http://127.0.0.1:$ClientPort"

New-Item -ItemType Directory -Force -Path $CacheDir | Out-Null

if (Test-Path $LocalNodeDir) {
  $env:Path = @($LocalNodeDir, $env:Path) -join ';'
}

function Get-PortPid([int]$Port) {
  $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($conn) { return $conn.OwningProcess }
  return $null
}

function Wait-PortFree([int]$Port, [int]$Attempts = 40) {
  for ($i = 0; $i -lt $Attempts; $i++) {
    if (-not (Get-PortPid $Port)) {
      return $true
    }
    Start-Sleep -Milliseconds 250
  }
  return $false
}

function Test-ProcessRunning([int]$ProcessId) {
  try {
    $process = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
    return ($null -ne $process)
  } catch {
    return $false
  }
}

function Get-ProcessCommandLine([int]$ProcessId) {
  try {
    $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction SilentlyContinue
    if ($processInfo) {
      return [string]$processInfo.CommandLine
    }
  } catch {
    return ''
  }
  return ''
}

function Stop-ProcessTree([int]$ProcessId) {
  & taskkill.exe /PID $ProcessId /T /F *> $null
  Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
}

function Stop-SeedbankPortProcess([int]$Port) {
  $portPid = Get-PortPid $Port
  if (-not $portPid) {
    return
  }

  $commandLine = Get-ProcessCommandLine $portPid
  if ($commandLine -and $commandLine.Contains($SeedbankDir)) {
    Write-Host "Stopping stale Seedbank process PID $portPid on port $Port..."
    Stop-ProcessTree $portPid
  } elseif ($commandLine -match 'seedbank|vite|server\\dist\\server\\src\\index\.js') {
    Write-Host "Stopping Seedbank process PID $portPid on port $Port..."
    Stop-ProcessTree $portPid
  }
}

function Quote-ProcessArgument([string]$Value) {
  return '"' + ($Value -replace '"', '\"') + '"'
}

function Get-NodePath {
  $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
  if (-not $nodeCommand) {
    throw 'Node.js was not found. Run Install-Seedbank again.'
  }
  return $nodeCommand.Source
}

function Get-ViteEntry {
  $candidates = @(
    (Join-Path $SeedbankDir 'node_modules\vite\bin\vite.js'),
    (Join-Path $SeedbankDir 'client\node_modules\vite\bin\vite.js')
  )
  foreach ($candidate in $candidates) {
    if (Test-Path $candidate) {
      return $candidate
    }
  }
  throw 'Vite was not found in node_modules. Run Install-Seedbank again.'
}

function Update-Url {
  $script:Url = 'http://127.0.0.1:{0}' -f $script:ClientPort
}

function Use-CachedPorts {
  if (-not $env:SEEDBANK_CLIENT_PORT -and (Test-Path $ClientPortFile)) {
    $raw = Get-Content $ClientPortFile -ErrorAction SilentlyContinue | Select-Object -First 1
    $cached = 0
    if ([int]::TryParse([string]$raw, [ref]$cached)) {
      $script:ClientPort = $cached
    }
  }
  Update-Url
}

function Find-FreePort([int]$StartPort) {
  for ($port = $StartPort; $port -lt ($StartPort + 50); $port++) {
    if (-not (Get-PortPid $port)) {
      return $port
    }
  }
  throw "No free port found near $StartPort."
}

function Test-PidFileRunning([string]$Path) {
  if (-not (Test-Path $Path)) { return $false }
  $pidValue = Get-Content $Path -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $pidValue) { return $false }
  try {
    $process = Get-Process -Id ([int]$pidValue) -ErrorAction SilentlyContinue
    return ($null -ne $process)
  } catch {
    return $false
  }
}

function Test-SeedbankRunning {
  Use-CachedPorts
  $clientPortPid = Get-PortPid $ClientPort
  $serverPortPid = Get-PortPid $ServerPort
  return (
    $null -ne $clientPortPid -and
    $null -ne $serverPortPid -and
    (Test-PidFileRunning $ClientPidFile) -and
    (Test-PidFileRunning $ServerPidFile)
  )
}

function Test-ServerReady {
  try {
    $response = Invoke-WebRequest -Uri "http://127.0.0.1:$ServerPort/api/health" -UseBasicParsing -TimeoutSec 2
    return ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500 -and $response.Content -match '"ok"\s*:\s*true')
  } catch {
    return $false
  }
}

function Test-ClientReady {
  try {
    $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
    return ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500 -and $response.Content -match 'Seedbank')
  } catch {
    return $false
  }
}

function Open-SeedbankBrowser {
  if (-not (New-Item -ItemType Directory -Path $BrowserOpenLockDir -ErrorAction SilentlyContinue)) {
    return
  }

  try {
    $now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    $lastOpened = [int64]0
    if (Test-Path $LastBrowserOpenFile) {
      $raw = Get-Content $LastBrowserOpenFile -ErrorAction SilentlyContinue | Select-Object -First 1
      [void][int64]::TryParse([string]$raw, [ref]$lastOpened)
    }

    if (($now - $lastOpened) -lt $BrowserOpenDebounceSeconds) {
      Write-Host "Seedbank is already open at $Url"
      return
    }

    Set-Content -Path $LastBrowserOpenFile -Value $now
    Start-Process $Url
  } finally {
    Remove-Item $BrowserOpenLockDir -Recurse -Force -ErrorAction SilentlyContinue
  }
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

function Show-LogTail([int]$LineCount = 40) {
  $logFiles = @($LogFile, $ServerLogFile, $ServerErrorLogFile, $ClientLogFile, $ClientErrorLogFile)
  foreach ($file in $logFiles) {
    if (Test-Path $file) {
      Write-Host ''
      Write-Host "Recent Seedbank log lines from ${file}:"
      Get-Content -Path $file -Tail $LineCount
    }
  }
}

function Wait-SeedbankReady([int]$ServerProcessId, [int]$ClientProcessId, [int]$Attempts = 80) {
  Write-Host "Waiting for Seedbank to become ready at $Url..."
  for ($i = 0; $i -lt $Attempts; $i++) {
    $serverReady = Test-ServerReady
    $clientReady = Test-ClientReady

    if ($serverReady -and $clientReady) {
      $serverPortPid = Get-PortPid $ServerPort
      $clientPortPid = Get-PortPid $ClientPort
      if ($serverPortPid) { Set-Content -Path $ServerPidFile -Value $serverPortPid }
      if ($clientPortPid) { Set-Content -Path $ClientPidFile -Value $clientPortPid }
      return $true
    }

    if ((-not $serverReady) -and (-not (Test-ProcessRunning $ServerProcessId))) {
      Show-LogTail
      throw "Seedbank server exited before it became ready. Check the log at $LogFile"
    }
    if ((-not $clientReady) -and (-not (Test-ProcessRunning $ClientProcessId))) {
      Show-LogTail
      throw "Seedbank client exited before it became ready. Check the log at $LogFile"
    }

    if ($i -gt 0 -and ($i % 10) -eq 0) {
      Write-Host "Still waiting for Seedbank... client port ${ClientPort}: $(if ($clientReady) { 'ready' } else { 'waiting' }), server port ${ServerPort}: $(if ($serverReady) { 'ready' } else { 'waiting' })"
    }

    Start-Sleep -Milliseconds 500
  }

  return $false
}

function Start-Seedbank {
  Use-CachedPorts
  $clientPid = Get-PortPid $ClientPort
  $serverPid = Get-PortPid $ServerPort
  $serverAlreadyRunning = $false

  if ((Test-ServerReady) -and (Test-ClientReady)) {
    Write-Host "Seedbank already running at $Url"
    if ($clientPid) { Set-Content -Path $ClientPidFile -Value $clientPid }
    if ($serverPid) { Set-Content -Path $ServerPidFile -Value $serverPid }
    Open-SeedbankBrowser
    return
  }

  if ($clientPid -or $serverPid) {
    if ((Test-PidFileRunning $ClientPidFile) -or (Test-PidFileRunning $ServerPidFile)) {
      Write-Host 'Found a partial Seedbank start. Stopping it before retrying...'
      Stop-Seedbank
      [void](Wait-PortFree $ClientPort)
      [void](Wait-PortFree $ServerPort)
      $clientPid = Get-PortPid $ClientPort
      $serverPid = Get-PortPid $ServerPort
    }
  }

  if ($clientPid) {
    $script:ClientPort = Find-FreePort $ClientPort
    Update-Url
    Write-Host "Client port busy. Using $ClientPort instead."
  }
  if ($serverPid) {
    if (Test-ServerReady) {
      $serverAlreadyRunning = $true
      Write-Host "Seedbank server is already running on port $ServerPort."
    } else {
      throw "Server port $ServerPort is already in use by PID $serverPid, but it is not a healthy Seedbank server. Stop that process or set SEEDBANK_SERVER_PORT and rebuild the client for that API port."
    }
  }

  if (-not (New-Item -ItemType Directory -Path $StartLockDir -ErrorAction SilentlyContinue)) {
    Write-Host 'Seedbank start already in progress.'
    return
  }

  try {
    Ensure-Setup
    Remove-Item $ServerLogFile -Force -ErrorAction SilentlyContinue
    Remove-Item $ServerErrorLogFile -Force -ErrorAction SilentlyContinue
    Remove-Item $ClientLogFile -Force -ErrorAction SilentlyContinue
    Remove-Item $ClientErrorLogFile -Force -ErrorAction SilentlyContinue
    Add-Content -Path $LogFile -Value "`n=== $(Get-Date -Format o) - seedbank start client=$ClientPort server=$ServerPort ==="

    $nodePath = Get-NodePath
    $serverEntry = Join-Path $SeedbankDir 'server\dist\server\src\index.js'
    $viteEntry = Get-ViteEntry
    $clientDir = Join-Path $SeedbankDir 'client'

    if (-not (Test-Path $serverEntry)) {
      throw "Missing built server entry: $serverEntry"
    }
    if (-not (Test-Path $clientDir)) {
      throw "Missing client directory: $clientDir"
    }

    if ($serverAlreadyRunning) {
      $serverProcessId = $serverPid
      Set-Content -Path $ServerPidFile -Value $serverProcessId
    } else {
      Write-Host "Starting Seedbank server on port $ServerPort..."
      $previousPort = $env:PORT
      $env:PORT = [string]$ServerPort
      try {
        $server = Start-Process -FilePath $nodePath -ArgumentList (Quote-ProcessArgument $serverEntry) -WorkingDirectory $SeedbankDir -WindowStyle Hidden -RedirectStandardOutput $ServerLogFile -RedirectStandardError $ServerErrorLogFile -PassThru
      } finally {
        if ($null -eq $previousPort) { Remove-Item Env:\PORT -ErrorAction SilentlyContinue }
        else { $env:PORT = $previousPort }
      }
      $serverProcessId = $server.Id
      Set-Content -Path $ServerPidFile -Value $serverProcessId
    }

    Write-Host "Starting Seedbank client on port $ClientPort..."
    $previousApiUrl = $env:VITE_SEEDBANK_API_URL
    $env:VITE_SEEDBANK_API_URL = "http://127.0.0.1:$ServerPort"
    try {
      $clientArgs = @(
        (Quote-ProcessArgument $viteEntry),
        'preview',
        '--host',
        '127.0.0.1',
        '--port',
        [string]$ClientPort,
        '--strictPort'
      ) -join ' '
      $client = Start-Process -FilePath $nodePath -ArgumentList $clientArgs -WorkingDirectory $clientDir -WindowStyle Hidden -RedirectStandardOutput $ClientLogFile -RedirectStandardError $ClientErrorLogFile -PassThru
    } finally {
      if ($null -eq $previousApiUrl) { Remove-Item Env:\VITE_SEEDBANK_API_URL -ErrorAction SilentlyContinue }
      else { $env:VITE_SEEDBANK_API_URL = $previousApiUrl }
    }
    Set-Content -Path $ClientPidFile -Value $client.Id
    Set-Content -Path $ServerPortFile -Value $ServerPort
    Set-Content -Path $ClientPortFile -Value $ClientPort

    if (-not (Wait-SeedbankReady $serverProcessId $client.Id)) {
      Show-LogTail
      throw "Seedbank did not become ready. Check the log at $LogFile"
    }

    Open-SeedbankBrowser
    Write-Host "Seedbank started at $Url"
  } finally {
    Remove-Item $StartLockDir -Recurse -Force -ErrorAction SilentlyContinue
  }
}

function Stop-Seedbank {
  foreach ($file in @($ClientPidFile, $ServerPidFile)) {
    if (Test-Path $file) {
      $pidValue = Get-Content $file -ErrorAction SilentlyContinue | Select-Object -First 1
      if ($pidValue) {
        $pidInt = [int]$pidValue
        Stop-ProcessTree $pidInt
      }
      Remove-Item $file -Force -ErrorAction SilentlyContinue
    }
  }
  foreach ($port in @($ClientPort, $ServerPort)) {
    Stop-SeedbankPortProcess $port
  }
  Remove-Item $ClientPortFile -Force -ErrorAction SilentlyContinue
  Remove-Item $ServerPortFile -Force -ErrorAction SilentlyContinue
  Remove-Item $LastBrowserOpenFile -Force -ErrorAction SilentlyContinue
  Remove-Item $StartLockDir -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item $BrowserOpenLockDir -Recurse -Force -ErrorAction SilentlyContinue
  Write-Host 'Seedbank stopped.'
}

function Show-Status {
  $clientPid = Get-PortPid $ClientPort
  $serverPid = Get-PortPid $ServerPort
  Write-Host 'Seedbank status:'
  Write-Host "  client ${ClientPort}: $(if ($clientPid) { "running PID $clientPid" } else { 'stopped' })"
  Write-Host "  server ${ServerPort}: $(if ($serverPid) { "running PID $serverPid" } else { 'stopped' })"
  Write-Host "  URL: $Url"
  Write-Host "  log: $LogFile"
  Write-Host "  server log: $ServerLogFile"
  Write-Host "  server error log: $ServerErrorLogFile"
  Write-Host "  client log: $ClientLogFile"
  Write-Host "  client error log: $ClientErrorLogFile"
}

try {
  switch ($Command) {
    'start' { Start-Seedbank }
    'stop' { Stop-Seedbank }
    'restart' { Stop-Seedbank; Start-Sleep -Seconds 1; Start-Seedbank }
    'status' { Show-Status }
    'logs' {
      Show-LogTail 100
    }
  }
} catch {
  Add-Content -Path $LogFile -Value "`n=== $(Get-Date -Format o) - seedbank launcher error ==="
  Add-Content -Path $LogFile -Value $_.Exception.Message
  Add-Content -Path $LogFile -Value $_.ScriptStackTrace
  Show-LogTail
  throw
}
