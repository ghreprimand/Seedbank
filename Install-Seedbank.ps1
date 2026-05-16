param(
  [switch]$NoStart
)

$ErrorActionPreference = 'Stop'

$SeedbankDir = if ($env:SEEDBANK_DIR) { $env:SEEDBANK_DIR } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
$Launcher = Join-Path $SeedbankDir 'scripts\seedbank.ps1'
$LocalNodeDir = Join-Path $SeedbankDir '.runtime\node'
$RequiredNodeMajor = 18
$NodeDownloadUrl = 'https://nodejs.org/en/download'
$NodeDistIndexUrl = 'https://nodejs.org/dist/index.json'

try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
} catch {
  # Older PowerShell installations can still proceed with their default protocol.
}

function Write-Step([string]$Message) {
  Write-Host ''
  Write-Host $Message
}

function Get-NodeMajor {
  try {
    $major = node -p "Number(process.versions.node.split('.')[0])" 2>$null
    return [int]$major
  } catch {
    return 0
  }
}

function Test-UsableNode {
  Update-ProcessPath
  $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
  $npmCmd = Get-Command npm -ErrorAction SilentlyContinue
  return ($null -ne $nodeCmd -and $null -ne $npmCmd -and (Get-NodeMajor) -ge $RequiredNodeMajor)
}

function Update-ProcessPath {
  $paths = @()
  if (Test-Path $LocalNodeDir) {
    $paths += $LocalNodeDir
  }
  if ($env:APPDATA) {
    $npmGlobalDir = Join-Path $env:APPDATA 'npm'
    if (Test-Path $npmGlobalDir) { $paths += $npmGlobalDir }
  }
  if ($env:LOCALAPPDATA) {
    $userNodeDir = Join-Path $env:LOCALAPPDATA 'Programs\nodejs'
    if (Test-Path $userNodeDir) { $paths += $userNodeDir }
  }
  if ($env:ProgramFiles) {
    $machineNodeDir = Join-Path $env:ProgramFiles 'nodejs'
    if (Test-Path $machineNodeDir) { $paths += $machineNodeDir }
  }
  if (${env:ProgramFiles(x86)}) {
    $machineNodeX86Dir = Join-Path ${env:ProgramFiles(x86)} 'nodejs'
    if (Test-Path $machineNodeX86Dir) { $paths += $machineNodeX86Dir }
  }
  if ($env:ProgramFiles) {
    $machineGhDir = Join-Path $env:ProgramFiles 'GitHub CLI'
    if (Test-Path $machineGhDir) { $paths += $machineGhDir }
  }
  if (${env:ProgramFiles(x86)}) {
    $machineGhX86Dir = Join-Path ${env:ProgramFiles(x86)} 'GitHub CLI'
    if (Test-Path $machineGhX86Dir) { $paths += $machineGhX86Dir }
  }
  if ($env:ProgramW6432) {
    $machineGitCmdDir = Join-Path $env:ProgramW6432 'Git\cmd'
    if (Test-Path $machineGitCmdDir) { $paths += $machineGitCmdDir }
    $machineGitBinDir = Join-Path $env:ProgramW6432 'Git\bin'
    if (Test-Path $machineGitBinDir) { $paths += $machineGitBinDir }
    $machinePortableGitCmdDir = Join-Path $env:ProgramW6432 'PortableGit\cmd'
    if (Test-Path $machinePortableGitCmdDir) { $paths += $machinePortableGitCmdDir }
    $machinePortableGitBinDir = Join-Path $env:ProgramW6432 'PortableGit\bin'
    if (Test-Path $machinePortableGitBinDir) { $paths += $machinePortableGitBinDir }
  }
  if ($env:ProgramFiles) {
    $machineGitCmdDir = Join-Path $env:ProgramFiles 'Git\cmd'
    if (Test-Path $machineGitCmdDir) { $paths += $machineGitCmdDir }
    $machineGitBinDir = Join-Path $env:ProgramFiles 'Git\bin'
    if (Test-Path $machineGitBinDir) { $paths += $machineGitBinDir }
    $machinePortableGitCmdDir = Join-Path $env:ProgramFiles 'PortableGit\cmd'
    if (Test-Path $machinePortableGitCmdDir) { $paths += $machinePortableGitCmdDir }
    $machinePortableGitBinDir = Join-Path $env:ProgramFiles 'PortableGit\bin'
    if (Test-Path $machinePortableGitBinDir) { $paths += $machinePortableGitBinDir }
  }
  if (${env:ProgramFiles(x86)}) {
    $machineGitX86CmdDir = Join-Path ${env:ProgramFiles(x86)} 'Git\cmd'
    if (Test-Path $machineGitX86CmdDir) { $paths += $machineGitX86CmdDir }
    $machineGitX86BinDir = Join-Path ${env:ProgramFiles(x86)} 'Git\bin'
    if (Test-Path $machineGitX86BinDir) { $paths += $machineGitX86BinDir }
    $machinePortableGitX86CmdDir = Join-Path ${env:ProgramFiles(x86)} 'PortableGit\cmd'
    if (Test-Path $machinePortableGitX86CmdDir) { $paths += $machinePortableGitX86CmdDir }
    $machinePortableGitX86BinDir = Join-Path ${env:ProgramFiles(x86)} 'PortableGit\bin'
    if (Test-Path $machinePortableGitX86BinDir) { $paths += $machinePortableGitX86BinDir }
  }
  if ($env:LOCALAPPDATA) {
    $userGhProgramDir = Join-Path $env:LOCALAPPDATA 'Programs\GitHub CLI'
    if (Test-Path $userGhProgramDir) { $paths += $userGhProgramDir }
    $userGhDir = Join-Path $env:LOCALAPPDATA 'GitHub CLI'
    if (Test-Path $userGhDir) { $paths += $userGhDir }
    $userGitCmdDir = Join-Path $env:LOCALAPPDATA 'Programs\Git\cmd'
    if (Test-Path $userGitCmdDir) { $paths += $userGitCmdDir }
    $userGitBinDir = Join-Path $env:LOCALAPPDATA 'Programs\Git\bin'
    if (Test-Path $userGitBinDir) { $paths += $userGitBinDir }
    $userPortableGitCmdDir = Join-Path $env:LOCALAPPDATA 'Programs\PortableGit\cmd'
    if (Test-Path $userPortableGitCmdDir) { $paths += $userPortableGitCmdDir }
    $userPortableGitBinDir = Join-Path $env:LOCALAPPDATA 'Programs\PortableGit\bin'
    if (Test-Path $userPortableGitBinDir) { $paths += $userPortableGitBinDir }
    $githubDesktopBinDir = Join-Path $env:LOCALAPPDATA 'GitHubDesktop\bin'
    if (Test-Path $githubDesktopBinDir) { $paths += $githubDesktopBinDir }
    $wingetLinksDir = Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Links'
    if (Test-Path $wingetLinksDir) { $paths += $wingetLinksDir }
    $windowsAppsDir = Join-Path $env:LOCALAPPDATA 'Microsoft\WindowsApps'
    if (Test-Path $windowsAppsDir) { $paths += $windowsAppsDir }
  }
  if ($env:USERPROFILE) {
    $profileGitCmdDir = Join-Path $env:USERPROFILE 'Git\cmd'
    if (Test-Path $profileGitCmdDir) { $paths += $profileGitCmdDir }
    $profileGitBinDir = Join-Path $env:USERPROFILE 'Git\bin'
    if (Test-Path $profileGitBinDir) { $paths += $profileGitBinDir }
    $profilePortableGitCmdDir = Join-Path $env:USERPROFILE 'PortableGit\cmd'
    if (Test-Path $profilePortableGitCmdDir) { $paths += $profilePortableGitCmdDir }
    $profilePortableGitBinDir = Join-Path $env:USERPROFILE 'PortableGit\bin'
    if (Test-Path $profilePortableGitBinDir) { $paths += $profilePortableGitBinDir }
    $scoopShimsDir = Join-Path $env:USERPROFILE 'scoop\shims'
    if (Test-Path $scoopShimsDir) { $paths += $scoopShimsDir }
    $scoopGitCmdDir = Join-Path $env:USERPROFILE 'scoop\apps\git\current\cmd'
    if (Test-Path $scoopGitCmdDir) { $paths += $scoopGitCmdDir }
    $scoopGitBinDir = Join-Path $env:USERPROFILE 'scoop\apps\git\current\bin'
    if (Test-Path $scoopGitBinDir) { $paths += $scoopGitBinDir }
  }
  if ($env:ProgramData) {
    $chocoBinDir = Join-Path $env:ProgramData 'chocolatey\bin'
    if (Test-Path $chocoBinDir) { $paths += $chocoBinDir }
  }
  if ($env:ChocolateyInstall) {
    $chocoInstallBinDir = Join-Path $env:ChocolateyInstall 'bin'
    if (Test-Path $chocoInstallBinDir) { $paths += $chocoInstallBinDir }
  }
  $machinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
  if ($machinePath) { $paths += $machinePath }
  if ($userPath) { $paths += $userPath }
  $env:Path = ($paths | Select-Object -Unique) -join ';'
}

function Get-NodeWindowsArch {
  $arch = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }
  switch -Regex ($arch) {
    'ARM64' { return 'arm64' }
    'AMD64|IA64|x64' { return 'x64' }
    default { return 'x64' }
  }
}

function Get-LatestNodeLtsPackageUrl([string]$PackageKind) {
  $arch = Get-NodeWindowsArch
  $fileKey = "win-$arch-$PackageKind"
  Write-Step "Looking up latest Node.js LTS $PackageKind package for Windows $arch..."
  $releases = Invoke-RestMethod -Uri $NodeDistIndexUrl -UseBasicParsing
  $release = $releases |
    Where-Object { $_.lts -ne $false -and $_.files -contains $fileKey } |
    Select-Object -First 1

  if (-not $release) {
    throw "Could not find a Node.js LTS Windows $PackageKind package in $NodeDistIndexUrl."
  }

  $version = [string]$release.version
  $extension = if ($PackageKind -eq 'zip') { 'zip' } else { 'msi' }
  $fileName = "node-$version-$arch.$extension"
  return "https://nodejs.org/dist/$version/$fileName"
}

function Install-NodePortable {
  $zipUrl = Get-LatestNodeLtsPackageUrl 'zip'
  $zipPath = Join-Path $env:TEMP (Split-Path -Leaf $zipUrl)
  $extractRoot = Join-Path $env:TEMP 'seedbank-node-portable'

  Write-Step "Downloading portable Node.js from $zipUrl..."
  Invoke-WebRequest -Uri $zipUrl -OutFile $zipPath -UseBasicParsing

  Write-Step "Installing portable Node.js into $LocalNodeDir..."
  Remove-Item $extractRoot -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item $LocalNodeDir -Recurse -Force -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Force -Path $extractRoot | Out-Null
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $LocalNodeDir) | Out-Null
  Expand-Archive -Path $zipPath -DestinationPath $extractRoot -Force

  $expanded = Get-ChildItem -Path $extractRoot -Directory | Select-Object -First 1
  if (-not $expanded) {
    throw "Could not unpack portable Node.js from $zipPath."
  }

  Move-Item -Path $expanded.FullName -Destination $LocalNodeDir
  Remove-Item $extractRoot -Recurse -Force -ErrorAction SilentlyContinue
  Update-ProcessPath
}

function Install-Node {
  Write-Step "Seedbank needs Node.js $RequiredNodeMajor+ and npm."
  $winget = Get-Command winget -ErrorAction SilentlyContinue
  if ($winget) {
    $answer = Read-Host 'Install Node.js LTS now with winget? [Y/n]'
    if ([string]::IsNullOrWhiteSpace($answer) -or $answer -match '^[Yy]$') {
      try {
        winget install --id OpenJS.NodeJS.LTS -e --source winget --accept-package-agreements --accept-source-agreements
        Update-ProcessPath
      } catch {
        Write-Host "winget install failed: $($_.Exception.Message)"
      }
    }
  }

  if (-not (Test-UsableNode)) {
    Install-NodePortable
  }

  if (-not (Test-UsableNode)) {
    Start-Process $NodeDownloadUrl
    throw "Install Node.js $RequiredNodeMajor+ from $NodeDownloadUrl, then run Install-Seedbank again."
  }

  Write-Step "Node.js $(node -v) and npm $(npm -v) are ready."
}

function New-SeedbankIcon {
  $runtimeDir = Join-Path $SeedbankDir '.runtime'
  $iconPath = Join-Path $runtimeDir 'seedbank-leaf-v2.ico'

  try {
    Add-Type -AssemblyName System.Drawing
    New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
    Remove-Item $iconPath -Force -ErrorAction SilentlyContinue

    $bitmap = New-Object System.Drawing.Bitmap 128, 128
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.Clear([System.Drawing.Color]::Transparent)

    $outerBrush = New-Object System.Drawing.SolidBrush -ArgumentList ([System.Drawing.Color]::FromArgb(86, 125, 74))
    $innerBrush = New-Object System.Drawing.SolidBrush -ArgumentList ([System.Drawing.Color]::FromArgb(67, 98, 58))
    $leftLeafBrush = New-Object System.Drawing.SolidBrush -ArgumentList ([System.Drawing.Color]::FromArgb(168, 200, 154))
    $rightLeafBrush = New-Object System.Drawing.SolidBrush -ArgumentList ([System.Drawing.Color]::FromArgb(185, 215, 165))
    $leafPen = New-Object System.Drawing.Pen -ArgumentList ([System.Drawing.Color]::FromArgb(232, 240, 220)), 3
    $stemPen = New-Object System.Drawing.Pen -ArgumentList ([System.Drawing.Color]::FromArgb(246, 241, 231)), 9
    $leafPen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    $stemPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $stemPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round

    $graphics.FillEllipse($outerBrush, 2, 2, 124, 124)
    $graphics.FillEllipse($innerBrush, 8, 8, 112, 112)

    $leftLeaf = New-Object System.Drawing.Drawing2D.GraphicsPath
    $leftLeaf.StartFigure()
    $leftLeaf.AddBezier(62, 57, 43, 57, 31, 43, 26, 25)
    $leftLeaf.AddBezier(44, 26, 58, 36, 66, 53, 62, 57)
    $leftLeaf.CloseFigure()

    $rightLeaf = New-Object System.Drawing.Drawing2D.GraphicsPath
    $rightLeaf.StartFigure()
    $rightLeaf.AddBezier(68, 55, 87, 51, 100, 37, 104, 22)
    $rightLeaf.AddBezier(86, 23, 72, 34, 63, 53, 68, 55)
    $rightLeaf.CloseFigure()

    $graphics.FillPath($leftLeafBrush, $leftLeaf)
    $graphics.DrawPath($leafPen, $leftLeaf)
    $graphics.FillPath($rightLeafBrush, $rightLeaf)
    $graphics.DrawPath($leafPen, $rightLeaf)
    $graphics.DrawBezier($stemPen, 64, 101, 64, 80, 62, 62, 66, 44)

    $icon = [System.Drawing.Icon]::FromHandle($bitmap.GetHicon())
    $stream = [System.IO.File]::Open($iconPath, [System.IO.FileMode]::Create)
    try {
      $icon.Save($stream)
    } finally {
      $stream.Close()
      $icon.Dispose()
      $rightLeaf.Dispose()
      $leftLeaf.Dispose()
      $stemPen.Dispose()
      $leafPen.Dispose()
      $rightLeafBrush.Dispose()
      $leftLeafBrush.Dispose()
      $innerBrush.Dispose()
      $outerBrush.Dispose()
      $graphics.Dispose()
      $bitmap.Dispose()
    }

    return $iconPath
  } catch {
    return $null
  }
}

function Stop-ExistingSeedbankProcesses {
  Write-Step 'Stopping any existing Seedbank processes...'
  $ports = @(5173, 4800)
  foreach ($port in $ports) {
    try {
      $connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
      foreach ($connection in $connections) {
        $pidValue = [int]$connection.OwningProcess
        if ($pidValue -gt 0) {
          $process = Get-CimInstance Win32_Process -Filter "ProcessId = $pidValue" -ErrorAction SilentlyContinue
          $commandLine = if ($process) { [string]$process.CommandLine } else { '' }
          if ($commandLine -match 'seedbank|vite|server\\dist\\server\\src\\index\.js') {
            Write-Host "Stopping Seedbank process PID $pidValue on port $port..."
            & taskkill.exe /PID $pidValue /T /F *> $null
          }
        }
      }
    } catch {
      Write-Host "Could not inspect port ${port}: $($_.Exception.Message)"
    }
  }

  $cacheDir = Join-Path $env:APPDATA 'seedbank'
  if (Test-Path $cacheDir) {
    Remove-Item (Join-Path $cacheDir '*.pid') -Force -ErrorAction SilentlyContinue
    Remove-Item (Join-Path $cacheDir '*.port') -Force -ErrorAction SilentlyContinue
    Remove-Item (Join-Path $cacheDir 'last-browser-open') -Force -ErrorAction SilentlyContinue
    Remove-Item (Join-Path $cacheDir 'start.lock.d') -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item (Join-Path $cacheDir 'browser-open.lock.d') -Recurse -Force -ErrorAction SilentlyContinue
  }
}

function Install-Shortcut {
  Write-Step 'Installing Start Menu shortcut...'
  $startMenu = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
  New-Item -ItemType Directory -Force -Path $startMenu | Out-Null
  $shortcutPath = Join-Path $startMenu 'Seedbank.lnk'
  Remove-Item $shortcutPath -Force -ErrorAction SilentlyContinue
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($shortcutPath)
  $shortcut.TargetPath = 'powershell.exe'
  $shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$Launcher`" restart"
  $shortcut.WorkingDirectory = $SeedbankDir
  $shortcut.WindowStyle = 7
  $shortcut.Description = 'Start Seedbank'
  $iconPath = New-SeedbankIcon
  if ($iconPath) {
    $shortcut.IconLocation = "$iconPath,0"
  }
  $shortcut.Save()

  $oldIconPath = Join-Path $SeedbankDir '.runtime\seedbank.ico'
  Remove-Item $oldIconPath -Force -ErrorAction SilentlyContinue
  $ie4uinit = Join-Path $env:WINDIR 'System32\ie4uinit.exe'
  if (Test-Path $ie4uinit) {
    & $ie4uinit -show 2>$null
  }
  Write-Host "Installed $shortcutPath"
}

Write-Step 'Seedbank installer'
Write-Host "Location: $SeedbankDir"

if (-not (Test-Path $Launcher)) {
  throw "Missing launcher: $Launcher"
}

if (-not (Test-UsableNode)) {
  Install-Node
} else {
  Write-Step "Node.js $(node -v) and npm $(npm -v) found."
}

Write-Step 'Installing Seedbank dependencies...'
Push-Location $SeedbankDir
try {
  npm install
  Write-Step 'Preparing Seedbank runtime...'
  npm run build
} finally {
  Pop-Location
}

Stop-ExistingSeedbankProcesses
Install-Shortcut

Write-Step 'Seedbank is installed.'
if (-not $NoStart) {
  Write-Step 'Starting Seedbank...'
  powershell -NoProfile -ExecutionPolicy Bypass -File $Launcher restart
} else {
  Write-Host 'Start it later from the Start Menu or with scripts\seedbank.ps1 restart.'
}
