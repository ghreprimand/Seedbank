import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DirectoryPickerUnavailableError,
  folderOpenCommand,
  linuxFileManagerCandidates,
  selectDirectory,
} from '../src/systemOpen.js';

test('folderOpenCommand uses the standard macOS opener', () => {
  assert.deepEqual(folderOpenCommand('/tmp/project', { platform: 'darwin' }), {
    command: 'open',
    args: ['/tmp/project'],
  });
});

test('folderOpenCommand uses the standard Windows file explorer', () => {
  assert.deepEqual(folderOpenCommand('C:\\Projects\\demo', { platform: 'win32' }), {
    command: 'explorer.exe',
    args: ['C:\\Projects\\demo'],
  });
});

test('folderOpenCommand prefers an installed Linux file manager over xdg-open', () => {
  const command = folderOpenCommand('/tmp/project', {
    platform: 'linux',
    env: { XDG_CURRENT_DESKTOP: 'Hyprland' },
    executableExists: (candidate) => candidate === 'dolphin' || candidate === 'xdg-open',
  });

  assert.deepEqual(command, {
    command: 'dolphin',
    args: ['/tmp/project'],
  });
});

test('folderOpenCommand falls back to gio before xdg-open when no file manager is installed', () => {
  const command = folderOpenCommand('/tmp/project', {
    platform: 'linux',
    env: { XDG_CURRENT_DESKTOP: 'unknown' },
    executableExists: (candidate) => candidate === 'gio',
  });

  assert.deepEqual(command, {
    command: 'gio',
    args: ['open', '/tmp/project'],
  });
});

test('folderOpenCommand falls back to xdg-open as the last Linux option', () => {
  const command = folderOpenCommand('/tmp/project', {
    platform: 'linux',
    env: { XDG_CURRENT_DESKTOP: 'unknown' },
    executableExists: () => false,
  });

  assert.deepEqual(command, {
    command: 'xdg-open',
    args: ['/tmp/project'],
  });
});

test('linuxFileManagerCandidates orders desktop-native file managers first', () => {
  assert.equal(linuxFileManagerCandidates({ XDG_CURRENT_DESKTOP: 'KDE' })[0], 'dolphin');
  assert.equal(linuxFileManagerCandidates({ XDG_CURRENT_DESKTOP: 'GNOME' })[0], 'nautilus');
  assert.equal(linuxFileManagerCandidates({ XDG_CURRENT_DESKTOP: 'XFCE' })[0], 'thunar');
});

test('selectDirectory surfaces a clear Linux unsupported error when no GUI picker is installed', async () => {
  await assert.rejects(
    selectDirectory({
      platform: 'linux',
      executableExists: () => false,
    }),
    (err: unknown) =>
      err instanceof DirectoryPickerUnavailableError
      && err.message.includes('Install zenity, kdialog, yad, or xdg-desktop-portal with gdbus/dbus-monitor'),
  );
});

test('selectDirectory surfaces a clear Windows unsupported error when no PowerShell runtime exists', async () => {
  await assert.rejects(
    selectDirectory({
      platform: 'win32',
      executableExists: () => false,
    }),
    (err: unknown) =>
      err instanceof DirectoryPickerUnavailableError
      && err.message.includes('Install PowerShell'),
  );
});
