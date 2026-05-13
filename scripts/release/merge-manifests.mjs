#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

function parseArgs(argv) {
  const args = { artifactsDir: '.', versionTag: null, out: null };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--artifacts-dir') {
      args.artifactsDir = argv[i + 1] ?? '.';
      i += 1;
      continue;
    }
    if (token === '--version-tag') {
      args.versionTag = argv[i + 1] ?? null;
      i += 1;
      continue;
    }
    if (token === '--out') {
      args.out = argv[i + 1] ?? null;
      i += 1;
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
  console.log(`Usage: node scripts/release/merge-manifests.mjs --artifacts-dir <dir> [--version-tag <vX.Y.Z>] [--out <path>]\n`);
}

function normalizeVersionTag(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) {
    throw new Error('Version tag cannot be empty.');
  }
  return raw.startsWith('v') ? raw : `v${raw}`;
}

function sha256(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function collectArtifacts(artifactsDir) {
  const entries = fs.readdirSync(artifactsDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && /^seedbank-v.+-(linux-x64|macos|windows-x64)\.(tar\.gz|zip)$/.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  if (files.length === 0) {
    throw new Error(`No seedbank artifacts found in ${artifactsDir}`);
  }

  return files.map((name) => {
    const match = name.match(/^seedbank-(v.+)-(linux-x64|macos|windows-x64)\.(tar\.gz|zip)$/);
    if (!match) {
      throw new Error(`Unexpected artifact name: ${name}`);
    }
    const [, version, target, ext] = match;
    const abs = path.join(artifactsDir, name);
    return {
      name,
      version,
      target,
      format: ext,
      bytes: fs.statSync(abs).size,
      sha256: sha256(abs),
      relativePath: name,
    };
  });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }

  const artifactsDir = path.resolve(ROOT, args.artifactsDir);
  const artifacts = collectArtifacts(artifactsDir);

  const inferredVersions = new Set(artifacts.map((item) => item.version));
  if (inferredVersions.size !== 1) {
    throw new Error(`Artifacts include multiple versions: ${Array.from(inferredVersions).join(', ')}`);
  }

  const inferredVersion = artifacts[0].version;
  const versionTag = args.versionTag ? normalizeVersionTag(args.versionTag) : inferredVersion;
  if (versionTag !== inferredVersion) {
    throw new Error(`Version mismatch: artifacts are ${inferredVersion}, requested ${versionTag}`);
  }

  const payload = {
    version: versionTag,
    generatedAt: new Date().toISOString(),
    artifacts: artifacts.map((item) => ({
      name: item.name,
      target: item.target,
      format: item.format,
      bytes: item.bytes,
      sha256: item.sha256,
      relativePath: item.relativePath,
    })),
  };

  const outPath = args.out
    ? path.resolve(ROOT, args.out)
    : path.join(artifactsDir, `manifest-${versionTag}.json`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`Wrote ${outPath}`);
}

try {
  main();
} catch (err) {
  usage();
  const message = err instanceof Error ? err.message : String(err);
  console.error(message);
  process.exit(1);
}
