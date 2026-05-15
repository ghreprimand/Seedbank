#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

const RELEASE_DIR = path.join(ROOT, '.release');
const STAGE_ROOT = path.join(RELEASE_DIR, 'stage');
const ARTIFACT_ROOT = path.join(RELEASE_DIR, 'artifacts');
const TARGET_FORMATS = new Map([
  ['linux-x64', 'tar.gz'],
  ['macos', 'tar.gz'],
  ['windows-x64', 'zip'],
]);
const LEGACY_TARGET_ALIASES = new Map([
  ['macos-universal', 'macos'],
]);

const INCLUDE_PATHS = [
  'README.md',
  'INSTALL.md',
  'CHANGELOG.md',
  'package.json',
  'package-lock.json',
  'client',
  'server',
  'shared',
  'scripts',
  'docs',
];

const TARGET_INSTALLERS = {
  'linux-x64': ['Install-Seedbank.sh'],
  macos: ['Install-Seedbank.command'],
  'windows-x64': ['Install-Seedbank.bat'],
};

const TARGET_SCRIPT_KEEP = {
  'linux-x64': new Set(['seedbank', 'install-desktop.sh', 'seedbank.desktop']),
  macos: new Set(['seedbank']),
  'windows-x64': new Set(['seedbank.ps1', 'Install-Seedbank.ps1']),
};

const ROOT_EXCLUDES = new Set([
  '.git',
  '.archon',
  '.release',
  'node_modules',
  'test-results',
]);

function parseArgs(argv) {
  const args = { target: null, format: null, all: false, versionTag: null };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--target') {
      args.target = argv[i + 1] ?? null;
      i += 1;
      continue;
    }
    if (token === '--format') {
      args.format = argv[i + 1] ?? null;
      i += 1;
      continue;
    }
    if (token === '--version-tag') {
      args.versionTag = argv[i + 1] ?? null;
      i += 1;
      continue;
    }
    if (token === '--all') {
      args.all = true;
      continue;
    }
    if (token === '--help' || token === '-h') {
      args.help = true;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }
  return args;
}

function usage() {
  console.log(`Usage: node scripts/release/package-release.mjs [--all] [--target <linux-x64|macos|windows-x64>] [--format <tar.gz|zip>] [--version-tag <vX.Y.Z>]

Examples:
  node scripts/release/package-release.mjs
  node scripts/release/package-release.mjs --all
  node scripts/release/package-release.mjs --target linux-x64 --format tar.gz
  node scripts/release/package-release.mjs --target macos --format tar.gz
  node scripts/release/package-release.mjs --target windows-x64 --format zip
  node scripts/release/package-release.mjs --version-tag v1.2.3`);
}

function normalizeVersionTag(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) {
    throw new Error('Version tag cannot be empty.');
  }
  return raw.startsWith('v') ? raw : `v${raw}`;
}

function readPackageVersionTag() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const value = typeof pkg.version === 'string' && pkg.version.trim() ? pkg.version.trim() : '0.0.0';
  return normalizeVersionTag(value);
}

function resolveVersionTag(args) {
  const packageVersionTag = readPackageVersionTag();
  if (!args.versionTag) {
    return packageVersionTag;
  }
  const requested = normalizeVersionTag(args.versionTag);
  if (requested !== packageVersionTag) {
    console.warn(`Warning: packaging with ${requested} while package.json is ${packageVersionTag}.`);
  }
  return requested;
}

function shouldExclude(absPath) {
  const rel = path.relative(ROOT, absPath);
  if (!rel || rel.startsWith('..')) return false;
  const parts = rel.split(path.sep);
  return parts.some((segment) => ROOT_EXCLUDES.has(segment));
}

function copyPathToStage(stageDir, relPath, destRelPath = relPath) {
  const src = path.join(ROOT, relPath);
  if (!fs.existsSync(src)) return false;
  const dest = path.join(stageDir, destRelPath);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, {
    recursive: true,
    force: true,
    filter: (item) => !shouldExclude(item),
  });
  return true;
}

function copyIncludedTree(stageDir) {
  for (const relPath of INCLUDE_PATHS) {
    copyPathToStage(stageDir, relPath);
  }
}

function makeExecutableIfPresent(stageDir, relPath) {
  const filePath = path.join(stageDir, relPath);
  if (!fs.existsSync(filePath)) return;
  const mode = fs.statSync(filePath).mode;
  fs.chmodSync(filePath, mode | 0o755);
}

function pruneTargetScripts(stageDir, target) {
  const scriptsDir = path.join(stageDir, 'scripts');
  if (!fs.existsSync(scriptsDir)) return;

  const keep = TARGET_SCRIPT_KEEP[target] ?? new Set();
  for (const name of fs.readdirSync(scriptsDir)) {
    if (keep.has(name)) continue;
    fs.rmSync(path.join(scriptsDir, name), { recursive: true, force: true });
  }
}

function installTargetInstallers(stageDir, target) {
  for (const relPath of TARGET_INSTALLERS[target] ?? []) {
    if (target === 'macos' && relPath === 'Install-Seedbank.command') {
      if (!copyPathToStage(stageDir, 'Install-Seedbank.sh', relPath)) {
        throw new Error('Missing Install-Seedbank.sh needed to create the macOS installer.');
      }
    } else if (!copyPathToStage(stageDir, relPath)) {
      throw new Error(`Missing target installer: ${relPath}`);
    }
    makeExecutableIfPresent(stageDir, relPath);
  }

  if (target === 'windows-x64') {
    if (!copyPathToStage(stageDir, 'Install-Seedbank.ps1', 'scripts/Install-Seedbank.ps1')) {
      throw new Error('Missing Install-Seedbank.ps1 needed by the Windows batch installer.');
    }
  }

  pruneTargetScripts(stageDir, target);
  makeExecutableIfPresent(stageDir, 'scripts/seedbank');
  makeExecutableIfPresent(stageDir, 'scripts/install-desktop.sh');
}

function pruneNonRuntimeFiles(stageDir) {
  fs.rmSync(path.join(stageDir, 'server', 'tests'), { recursive: true, force: true });
}

function assertBuildOutputs() {
  const required = [
    path.join(ROOT, 'client', 'dist', 'index.html'),
    path.join(ROOT, 'server', 'dist', 'server', 'src', 'index.js'),
  ];
  const missing = required.filter((item) => !fs.existsSync(item));
  if (missing.length > 0) {
    throw new Error(`Missing build outputs:\n${missing.map((item) => `- ${item}`).join('\n')}\nRun "npm run build" first.`);
  }
}

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, {
    cwd: options.cwd ?? ROOT,
    stdio: 'pipe',
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    const stderr = result.stderr?.trim();
    const stdout = result.stdout?.trim();
    throw new Error(`Command failed: ${cmd} ${args.join(' ')}\n${stderr || stdout || 'No output'}`);
  }
}

function hasCommand(command) {
  const probeArgs = command === 'python3' ? ['-V'] : ['--version'];
  const result = spawnSync(command, probeArgs, { stdio: 'ignore' });
  return result.status === 0;
}

function createTarGz(artifactPath, stageRoot, bundleDirName) {
  run('tar', ['-czf', artifactPath, bundleDirName], { cwd: stageRoot });
}

function createZip(artifactPath, stageRoot, bundleDirName) {
  if (hasCommand('zip')) {
    run('zip', ['-rq', artifactPath, bundleDirName], { cwd: stageRoot });
    return;
  }
  if (hasCommand('python3')) {
    run('python3', ['-m', 'zipfile', '-c', artifactPath, bundleDirName], { cwd: stageRoot });
    return;
  }
  if (hasCommand('pwsh')) {
    run('pwsh', [
      '-NoProfile',
      '-Command',
      `Compress-Archive -Path "${path.join(stageRoot, bundleDirName, '*')}" -DestinationPath "${artifactPath}" -Force`,
    ]);
    return;
  }
  throw new Error('No zip tool available. Install zip, python3, or pwsh.');
}

function fileSha256(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function resolveTarget(target) {
  if (TARGET_FORMATS.has(target)) {
    return target;
  }
  if (LEGACY_TARGET_ALIASES.has(target)) {
    const normalized = LEGACY_TARGET_ALIASES.get(target);
    console.warn(`Warning: target "${target}" is deprecated. Using "${normalized}".`);
    return normalized;
  }
  return null;
}

function normalizeTargets(args) {
  if (args.all && args.target) {
    throw new Error('Use either --all or --target, not both.');
  }
  if (!args.target && args.format) {
    throw new Error('--format requires --target.');
  }
  if (args.all || !args.target) {
    return Array.from(TARGET_FORMATS.entries()).map(([target, format]) => ({ target, format }));
  }

  const resolvedTarget = resolveTarget(args.target);
  if (!resolvedTarget) {
    throw new Error(`Invalid --target value: ${args.target}`);
  }

  const format = args.format ?? TARGET_FORMATS.get(resolvedTarget);
  if (format !== 'tar.gz' && format !== 'zip') {
    throw new Error(`Invalid --format value: ${format}`);
  }
  return [{ target: resolvedTarget, format }];
}

function createArtifactForTarget(versionTag, target, format) {
  const bundleDirName = `seedbank-${versionTag}`;
  fs.mkdirSync(STAGE_ROOT, { recursive: true });
  const stageRunRoot = fs.mkdtempSync(path.join(STAGE_ROOT, `${target}-`));
  const stageDir = path.join(stageRunRoot, bundleDirName);
  const extension = format === 'zip' ? 'zip' : 'tar.gz';
  const artifactName = `seedbank-${versionTag}-${target}.${extension}`;
  const artifactPath = path.join(ARTIFACT_ROOT, artifactName);

  try {
    fs.mkdirSync(stageDir, { recursive: true });
    fs.mkdirSync(ARTIFACT_ROOT, { recursive: true });
    copyIncludedTree(stageDir);
    installTargetInstallers(stageDir, target);
    pruneNonRuntimeFiles(stageDir);

    fs.rmSync(artifactPath, { force: true });
    if (format === 'tar.gz') {
      createTarGz(artifactPath, stageRunRoot, bundleDirName);
    } else {
      createZip(artifactPath, stageRunRoot, bundleDirName);
    }
  } finally {
    fs.rmSync(stageRunRoot, { recursive: true, force: true });
  }

  const stat = fs.statSync(artifactPath);
  return {
    name: artifactName,
    target,
    format,
    bytes: stat.size,
    sha256: fileSha256(artifactPath),
    relativePath: path.relative(ROOT, artifactPath),
  };
}

function writeManifest(versionTag, artifacts, fileName) {
  const manifestPath = path.join(ARTIFACT_ROOT, fileName);
  const payload = {
    version: versionTag,
    generatedAt: new Date().toISOString(),
    artifacts: [...artifacts].sort((a, b) => String(a.target).localeCompare(String(b.target))),
  };
  fs.writeFileSync(manifestPath, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`Updated ${manifestPath}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }

  const targets = normalizeTargets(args);
  assertBuildOutputs();

  const versionTag = resolveVersionTag(args);
  const artifacts = [];

  for (const spec of targets) {
    const artifact = createArtifactForTarget(versionTag, spec.target, spec.format);
    artifacts.push(artifact);
    console.log(`Created ${path.join(ARTIFACT_ROOT, artifact.name)}`);
    writeManifest(versionTag, [artifact], `manifest-${versionTag}-${artifact.target}.json`);
  }

  if (artifacts.length > 1) {
    writeManifest(versionTag, artifacts, `manifest-${versionTag}.json`);
  }
}

try {
  main();
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  usage();
  console.error(message);
  process.exit(1);
}
