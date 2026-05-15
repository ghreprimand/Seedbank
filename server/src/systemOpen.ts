import fs from 'node:fs';
import path from 'node:path';

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
  if (platform === 'win32') return { command: 'explorer.exe', args: [folderPath] };

  const commandExists = options.executableExists
    ?? ((command: string) => executableExists(command, options.pathValue ?? process.env.PATH ?? ''));
  const fileManager = linuxFileManagerCandidates(options.env).find((command) => commandExists(command));
  if (fileManager) return { command: fileManager, args: [folderPath] };
  if (commandExists('gio')) return { command: 'gio', args: ['open', folderPath] };
  return { command: 'xdg-open', args: [folderPath] };
}
