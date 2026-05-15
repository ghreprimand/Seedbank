import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Category, GraduationReadiness, Idea, Stage } from '../../../shared/types.js';

export function expandHome(input: string): string {
  if (input === '~') return os.homedir();
  if (input.startsWith('~/')) return path.join(os.homedir(), input.slice(2));
  return input;
}

export function slugify(input: string): string {
  return (input || 'untitled-idea')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 72) || 'untitled-idea';
}

export function uniqueProjectDir(root: string, name: string): string {
  fs.mkdirSync(root, { recursive: true });
  const base = slugify(name);
  let candidate = path.join(root, base);
  let suffix = 2;
  while (fs.existsSync(candidate)) {
    candidate = path.join(root, `${base}-${suffix}`);
    suffix += 1;
  }
  return candidate;
}

export function readinessFor(idea: Idea, extraRequired: string[] = []): GraduationReadiness {
  const checks: Array<[string, boolean]> = [
    ['title', Boolean(idea.title.trim())],
    ['pitch', Boolean(idea.pitch.trim())],
    ['notes', Boolean(idea.fullNotes.trim())],
    ['hook', Boolean(idea.hook.trim())],
    ['risks', Boolean(idea.risks.trim())],
    ['tech stack', Boolean(idea.techStack.trim())],
    ['tags', idea.tags.length > 0],
    ...extraRequired.map((field) => [field, false] as [string, boolean]),
  ];
  const missing = checks.filter(([, present]) => !present).map(([label]) => label);
  const score = Math.round(((checks.length - missing.length) / checks.length) * 100);
  return {
    ready: missing.length <= 2 && Boolean(idea.title.trim()) && Boolean(idea.pitch.trim()),
    missing,
    score,
  };
}

export function targetStageFor(category: Category, preferred: 'plot' | 'prototype'): Stage {
  if (preferred === 'plot') return 'plot';
  if (category === 'tool' || category === 'app' || category === 'browser') return 'prototype';
  return 'plot';
}

function mdList(items: string[]): string {
  return items.length ? items.map((item) => `- ${item}`).join('\n') : '- None yet';
}

export function readmeFor(idea: Idea, integrationName: string): string {
  return [
    `# ${idea.title || 'Untitled Project'}`,
    '',
    `Generated from Seedbank via ${integrationName}.`,
    '',
    '## Pitch',
    '',
    idea.pitch || 'No pitch captured yet.',
    '',
    '## Context',
    '',
    idea.fullNotes || 'No long-form notes captured yet.',
    '',
    '## Hook',
    '',
    idea.hook || 'No hook captured yet.',
    '',
    '## Why It Might Work',
    '',
    idea.whyItMightWork || 'No supporting argument captured yet.',
    '',
    '## Risks',
    '',
    idea.risks || 'No risks captured yet.',
    '',
    '## Tech Stack',
    '',
    idea.techStack || 'No stack notes captured yet.',
    '',
    '## Tags',
    '',
    mdList(idea.tags),
    '',
    '## Seedbank Metadata',
    '',
    `- Idea ID: ${idea.id}`,
    `- Category: ${idea.category}`,
    `- Stage at graduation: ${idea.stage}`,
    `- Graduated: ${new Date().toISOString()}`,
    '',
  ].join('\n');
}

export function agentGuideFor(idea: Idea, integrationName: string, extraContext = ''): string {
  return [
    `# ${idea.title || 'Untitled Project'} - Agent Guide`,
    '',
    `This project was graduated from Seedbank using ${integrationName}.`,
    '',
    '## Original Idea',
    '',
    `- Seedbank ID: ${idea.id}`,
    `- Category: ${idea.category}`,
    `- Prior stage: ${idea.stage}`,
    `- Pitch: ${idea.pitch || 'Not captured'}`,
    '',
    '## Product Direction',
    '',
    idea.fullNotes || 'Use the README as the starting project brief.',
    '',
    '## Implementation Notes',
    '',
    idea.techStack || 'Choose a minimal stack that matches the scaffold.',
    '',
    '## Constraints and Risks',
    '',
    idea.risks || 'Review scope before implementation.',
    '',
    extraContext.trim(),
    '',
  ].filter(Boolean).join('\n');
}

export function packageJsonFor(idea: Idea, packageName: string): string | null {
  const normalized = packageName.replace(/[^a-z0-9-]/g, '-');
  if (idea.category === 'game') return null;
  if (idea.category === 'tool' || /\bcli\b/i.test(idea.techStack)) {
    return JSON.stringify({
      name: normalized,
      version: '0.1.0',
      private: true,
      type: 'module',
      bin: {
        [normalized]: './bin/index.js',
      },
      scripts: {
        dev: 'node bin/index.js',
      },
    }, null, 2) + '\n';
  }

  return JSON.stringify({
    name: normalized,
    version: '0.1.0',
    private: true,
    type: 'module',
    scripts: {
      dev: 'next dev',
      build: 'next build',
      start: 'next start',
    },
    dependencies: {
      next: 'latest',
      react: 'latest',
      'react-dom': 'latest',
    },
    devDependencies: {
      typescript: 'latest',
      '@types/node': 'latest',
      '@types/react': 'latest',
      '@types/react-dom': 'latest',
    },
  }, null, 2) + '\n';
}

export function writeBaseScaffold(projectDir: string, idea: Idea, integrationName: string, extraAgentContext = ''): string[] {
  const files: string[] = [];
  const projectName = path.basename(projectDir);
  fs.mkdirSync(projectDir, { recursive: true });

  const write = (relativePath: string, content: string) => {
    const fullPath = path.join(projectDir, relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
    files.push(relativePath);
  };

  write('README.md', readmeFor(idea, integrationName));
  write('AGENTS.md', agentGuideFor(idea, integrationName, extraAgentContext));

  const packageJson = packageJsonFor(idea, projectName);
  if (packageJson) {
    write('package.json', packageJson);
    if (idea.category === 'tool' || /\bcli\b/i.test(idea.techStack)) {
      write('bin/index.js', '#!/usr/bin/env node\n\nconsole.log("Seedbank scaffold ready.");\n');
    } else {
      write('app/page.tsx', [
        'export default function Page() {',
        '  return (',
        '    <main>',
        `      <h1>${idea.title || 'Seedbank Project'}</h1>`,
        `      <p>${idea.pitch || 'Project scaffold generated from Seedbank.'}</p>`,
        '    </main>',
        '  );',
        '}',
        '',
      ].join('\n'));
    }
  } else {
    write('project.godot', [
      '; Engine configuration file.',
      `; Generated from Seedbank idea ${idea.id}.`,
      '',
      '[application]',
      '',
      `config/name="${idea.title || 'Seedbank Game'}"`,
      '',
    ].join('\n'));
  }

  return files;
}
