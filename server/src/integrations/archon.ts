import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { GraduationResult, Idea } from '../../../shared/types.js';
import {
  claudeFor,
  expandHome,
  readinessFor,
  uniqueProjectDir,
  writeBaseScaffold,
} from './scaffold.js';
import type { Integration, IntegrationConfigStore } from './types.js';

interface ArchonConfig {
  archonRoot?: string;
  projectRoot?: string;
}

export class ArchonIntegration implements Integration {
  readonly id = 'archon';
  readonly name = 'Custom local adapter';
  readonly description = 'An optional adapter for a local project workflow tool. Configure a workspace root to enable graduation to this adapter.';
  readonly icon = 'Network';

  constructor(private readonly configStore: IntegrationConfigStore) {}

  private config(): ArchonConfig {
    return this.configStore.getConfig<ArchonConfig>(this.id);
  }

  private archonRoot(): string {
    return expandHome(this.config().archonRoot || '~/Projects/Archon');
  }

  private projectRoot(): string {
    return expandHome(this.config().projectRoot || path.join(this.archonRoot(), 'projects'));
  }

  isConfigured(): boolean {
    return fs.existsSync(this.archonRoot());
  }

  configure(config: Record<string, string>): void {
    this.configStore.setConfig(this.id, {
      ...this.config(),
      ...config,
    });
  }

  canGraduate(idea: Idea) {
    const missing = this.isConfigured() ? [] : ['Archon root'];
    const readiness = readinessFor(idea, missing);
    return {
      ...readiness,
      ready: readiness.ready && this.isConfigured(),
    };
  }

  async graduate(idea: Idea): Promise<GraduationResult> {
    if (!this.isConfigured()) {
      throw new Error(`Archon root not found at ${this.archonRoot()}. Configure a valid Archon path first.`);
    }

    const projectDir = uniqueProjectDir(this.projectRoot(), idea.title);
    const archonContext = [
      '## Archon Context',
      '',
      `- Archon root: ${this.archonRoot()}`,
      '- This project was scaffolded for work inside the Archon workflow ecosystem.',
      '- Keep implementation notes in README.md and agent-facing context in CLAUDE.md.',
      '',
    ].join('\n');
    const filesCreated = writeBaseScaffold(projectDir, idea, this.name, archonContext);

    fs.writeFileSync(
      path.join(projectDir, 'CLAUDE.md'),
      claudeFor(idea, this.name, archonContext),
    );

    fs.mkdirSync(path.join(projectDir, '.archon'), { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, '.archon', 'seedbank.json'),
      JSON.stringify({
        source: 'seedbank',
        ideaId: idea.id,
        graduatedAt: new Date().toISOString(),
        archonRoot: this.archonRoot(),
        operatorHome: os.homedir(),
      }, null, 2) + '\n',
    );
    filesCreated.push('.archon/seedbank.json');

    return {
      integrationId: this.id,
      ideaId: idea.id,
      projectName: path.basename(projectDir),
      path: projectDir,
      url: `file://${projectDir}`,
      graduatedTo: projectDir,
      stage: 'plot',
      filesCreated,
      message: `Created Archon project workspace at ${projectDir}.`,
    };
  }
}
