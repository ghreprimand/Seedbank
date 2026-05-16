import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

export interface FolderOpenCommand {
  command: string;
  args: string[];
}

export interface FolderOpenCommandOptions {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  pathValue?: string;
  executableExists?: (command: string) => boolean;
}

export interface DirectoryPickerOptions {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  pathValue?: string;
  executableExists?: (command: string) => boolean;
  title?: string;
  initialPath?: string;
}

export class DirectoryPickerUnavailableError extends Error {
  statusCode = 503;

  constructor(message: string) {
    super(message);
    this.name = 'DirectoryPickerUnavailableError';
  }
}

export function executableExists(command: string, pathValue = process.env.PATH ?? ''): boolean {
  const paths = pathValue.split(path.delimiter).filter(Boolean);
  for (const searchPath of paths) {
    try {
      fs.accessSync(path.join(searchPath, command), fs.constants.X_OK);
      return true;
    } catch {
      // Keep looking through PATH.
    }
  }
  return false;
}

export function linuxFileManagerCandidates(env: NodeJS.ProcessEnv = process.env): string[] {
  const desktop = (env.XDG_CURRENT_DESKTOP ?? env.DESKTOP_SESSION ?? '').toLowerCase();
  const common = ['dolphin', 'nautilus', 'nemo', 'thunar', 'caja', 'pcmanfm-qt', 'pcmanfm'];
  const extras = ['pantheon-files', 'io.elementary.files', 'spacefm', 'krusader', 'konqueror', 'rox'];
  if (desktop.includes('kde')) return ['dolphin', 'krusader', 'konqueror', 'nautilus', 'nemo', 'thunar', 'caja', 'pcmanfm-qt', 'pcmanfm', 'spacefm', 'rox'];
  if (desktop.includes('gnome')) return ['nautilus', 'nemo', 'dolphin', 'thunar', 'caja', 'pcmanfm-qt', 'pcmanfm', ...extras];
  if (desktop.includes('cinnamon')) return ['nemo', 'nautilus', 'dolphin', 'thunar', 'caja', 'pcmanfm-qt', 'pcmanfm', ...extras];
  if (desktop.includes('xfce')) return ['thunar', 'nemo', 'nautilus', 'dolphin', 'caja', 'pcmanfm-qt', 'pcmanfm', ...extras];
  if (desktop.includes('mate')) return ['caja', 'nemo', 'nautilus', 'dolphin', 'thunar', 'pcmanfm-qt', 'pcmanfm', ...extras];
  if (desktop.includes('lxqt')) return ['pcmanfm-qt', 'pcmanfm', 'thunar', 'nemo', 'nautilus', 'dolphin', 'caja', ...extras];
  return [...common, ...extras];
}

export function folderOpenCommand(folderPath: string, options: FolderOpenCommandOptions = {}): FolderOpenCommand {
  const platform = options.platform ?? process.platform;
  if (platform === 'darwin') return { command: 'open', args: [folderPath] };
  if (platform === 'win32') return { command: 'cmd.exe', args: ['/d', '/c', 'start', '', folderPath] };

  const commandExists = options.executableExists
    ?? ((command: string) => executableExists(command, options.pathValue ?? process.env.PATH ?? ''));
  const fileManager = linuxFileManagerCandidates(options.env).find((command) => commandExists(command));
  if (fileManager) return { command: fileManager, args: [folderPath] };
  if (commandExists('gio')) return { command: 'gio', args: ['open', folderPath] };
  return { command: 'xdg-open', args: [folderPath] };
}

function runPickerCommand(command: string, args: string[]): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (code) => {
      const selected = stdout.trim();
      if (code === 0) {
        resolve(selected || null);
        return;
      }
      if (code === 1 || code === 130 || code === -128) {
        resolve(null);
        return;
      }
      reject(new Error((stderr || stdout || `${command} exited with code ${code}`).trim()));
    });
  });
}

function fileUriToPath(uri: string): string | null {
  try {
    const parsed = new URL(uri);
    if (parsed.protocol !== 'file:') return null;
    return decodeURIComponent(parsed.pathname);
  } catch {
    return null;
  }
}

function parsePortalResponse(output: string): string | null | undefined {
  const responseIndex = output.indexOf('Response');
  if (responseIndex === -1) return undefined;

  const responseOutput = output.slice(responseIndex);
  const responseCode = responseOutput.match(/uint32\s+(\d+)\b/);
  if (!responseCode) return undefined;
  if (responseCode[1] !== '0') return null;

  const match = responseOutput.match(/file:\/\/[^"'\s,\])]+/);
  if (!match) return undefined;

  return fileUriToPath(match[0]);
}

function runPortalDirectoryPickerWithDbusMonitor(title: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const token = `seedbank_${process.pid}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    const monitor = spawn('dbus-monitor', [
      '--session',
      "type='signal',interface='org.freedesktop.portal.Request',member='Response'",
    ], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let monitorOutput = '';
    let monitorReady = false;
    let requestHandle: string | null = null;
    let settled = false;
    let timeout: NodeJS.Timeout | null = null;

    const cleanup = () => {
      if (timeout) clearTimeout(timeout);
      monitor.kill('SIGTERM');
    };
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn();
    };

    const openPortal = () => {
      const options = `{'directory': <true>, 'modal': <true>, 'handle_token': <'${token}'>}`;
      const call = spawn('gdbus', [
        'call',
        '--session',
        '--dest',
        'org.freedesktop.portal.Desktop',
        '--object-path',
        '/org/freedesktop/portal/desktop',
        '--method',
        'org.freedesktop.portal.FileChooser.OpenFile',
        '',
        title,
        options,
      ], {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let callStdout = '';
      let callStderr = '';
      call.stdout.setEncoding('utf8');
      call.stderr.setEncoding('utf8');
      call.stdout.on('data', (chunk) => { callStdout += chunk; });
      call.stderr.on('data', (chunk) => { callStderr += chunk; });
      call.once('error', (err) => settle(() => reject(err)));
      call.once('close', (code) => {
        if (code !== 0) {
          settle(() => reject(new Error((callStderr || callStdout || `gdbus call exited with code ${code}`).trim())));
          return;
        }
        requestHandle = callStdout.match(/objectpath '([^']+)'/)?.[1] ?? null;
      });
    };

    monitor.stdout.setEncoding('utf8');
    monitor.stderr.setEncoding('utf8');
    monitor.stdout.on('data', (chunk) => {
      monitorOutput += chunk;

      if (!monitorReady && monitorOutput.includes('signal')) {
        monitorReady = true;
        openPortal();
      }

      const tokenIndex = monitorOutput.lastIndexOf(token);
      const handleIndex = requestHandle ? monitorOutput.lastIndexOf(requestHandle) : -1;
      const responseIndex = monitorOutput.lastIndexOf('member=Response');
      const relevantIndex = Math.max(tokenIndex, handleIndex, responseIndex);
      if (relevantIndex === -1) return;

      const selected = parsePortalResponse(monitorOutput.slice(relevantIndex));
      if (selected !== undefined) {
        settle(() => resolve(selected));
      }
    });
    monitor.once('error', (err) => settle(() => reject(err)));
    monitor.once('close', () => {
      if (!settled) settle(() => resolve(null));
    });

    timeout = setTimeout(() => {
      settle(() => reject(new Error('Timed out waiting for the Linux desktop portal folder chooser response.')));
    }, 120 * 1000);

    setTimeout(() => {
      if (!monitorReady && !settled) {
        monitorReady = true;
        openPortal();
      }
    }, 250);
  });
}

function runPortalDirectoryPicker(title: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const call = spawn('gdbus', [
      'call',
      '--session',
      '--dest',
      'org.freedesktop.portal.Desktop',
      '--object-path',
      '/org/freedesktop/portal/desktop',
      '--method',
      'org.freedesktop.portal.FileChooser.OpenFile',
      '',
      title,
      "{'directory': <true>, 'modal': <true>}",
    ], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let callStdout = '';
    let callStderr = '';
    call.stdout.setEncoding('utf8');
    call.stderr.setEncoding('utf8');
    call.stdout.on('data', (chunk) => { callStdout += chunk; });
    call.stderr.on('data', (chunk) => { callStderr += chunk; });
    call.once('error', reject);
    call.once('close', (code) => {
      if (code !== 0) {
        reject(new Error((callStderr || callStdout || `gdbus call exited with code ${code}`).trim()));
        return;
      }

      const handle = callStdout.match(/objectpath '([^']+)'/)?.[1];
      if (!handle) {
        reject(new Error(`Could not read portal request handle from: ${callStdout.trim()}`));
        return;
      }

      const monitor = spawn('gdbus', [
        'monitor',
        '--session',
        '--dest',
        'org.freedesktop.portal.Desktop',
        '--object-path',
        handle,
      ], {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let monitorOutput = '';
      let settled = false;
      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        monitor.kill('SIGTERM');
        fn();
      };

      monitor.stdout.setEncoding('utf8');
      monitor.stderr.setEncoding('utf8');
      monitor.stdout.on('data', (chunk) => {
        monitorOutput += chunk;
        const selected = parsePortalResponse(monitorOutput);
        if (selected !== undefined) {
          settle(() => resolve(selected));
        }
      });
      monitor.once('error', (err) => settle(() => reject(err)));
      monitor.once('close', () => {
        if (!settled) settle(() => resolve(null));
      });
    });
  });
}

export async function selectDirectory(options: DirectoryPickerOptions = {}): Promise<string | null> {
  const platform = options.platform ?? process.platform;
  const title = options.title ?? 'Choose Seedbank project directory';
  const initialPath = options.initialPath && fs.existsSync(options.initialPath)
    ? options.initialPath
    : (options.env?.HOME ?? process.env.HOME ?? process.env.USERPROFILE ?? '');

  if (platform === 'win32') {
    const commandExists = options.executableExists
      ?? ((command: string) => executableExists(command, options.pathValue ?? process.env.PATH ?? ''));
    const powershellCommand = ['pwsh', 'powershell.exe', 'powershell'].find((command) => commandExists(command));
    if (!powershellCommand) {
      throw new DirectoryPickerUnavailableError(
        'No PowerShell runtime was found. Install PowerShell to enable Browse on Windows.',
      );
    }

    const script = [
      'Add-Type -AssemblyName System.Windows.Forms',
      '$dialog = New-Object System.Windows.Forms.FolderBrowserDialog',
      `$dialog.Description = ${JSON.stringify(title)}`,
      '$dialog.ShowNewFolderButton = $true',
      initialPath ? `$dialog.SelectedPath = ${JSON.stringify(initialPath)}` : '',
      'if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.WriteLine($dialog.SelectedPath) }',
    ].filter(Boolean).join('; ');
    const selected = await runPickerCommand(
      powershellCommand,
      ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-Command', script],
    );
    return selected ? path.resolve(selected) : null;
  }

  if (platform === 'darwin') {
    const appleScript = `POSIX path of (choose folder with prompt ${JSON.stringify(title)})`;
    const selected = await runPickerCommand('osascript', ['-e', appleScript]);
    return selected ? path.resolve(selected) : null;
  }

  const commandExists = options.executableExists
    ?? ((command: string) => executableExists(command, options.pathValue ?? process.env.PATH ?? ''));
  if (commandExists('zenity')) {
    const args = ['--file-selection', '--directory', `--title=${title}`];
    if (initialPath) args.push(`--filename=${initialPath.endsWith(path.sep) ? initialPath : `${initialPath}${path.sep}`}`);
    const selected = await runPickerCommand('zenity', args);
    return selected ? path.resolve(selected) : null;
  }
  if (commandExists('kdialog')) {
    const selected = await runPickerCommand('kdialog', ['--getexistingdirectory', initialPath || '.', '--title', title]);
    return selected ? path.resolve(selected) : null;
  }
  if (commandExists('yad')) {
    const args = ['--file-selection', '--directory', `--title=${title}`];
    if (initialPath) args.push(`--filename=${initialPath.endsWith(path.sep) ? initialPath : `${initialPath}${path.sep}`}`);
    const selected = await runPickerCommand('yad', args);
    return selected ? path.resolve(selected) : null;
  }
  if (commandExists('gdbus') && commandExists('dbus-monitor')) {
    const selected = await runPortalDirectoryPickerWithDbusMonitor(title);
    return selected ? path.resolve(selected) : null;
  }
  if (commandExists('gdbus')) {
    const selected = await runPortalDirectoryPicker(title);
    return selected ? path.resolve(selected) : null;
  }

  throw new DirectoryPickerUnavailableError(
    'No graphical folder chooser was found. Install zenity, kdialog, yad, or xdg-desktop-portal with gdbus/dbus-monitor to enable Browse on Linux.',
  );
}
