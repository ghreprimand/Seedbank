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

interface CustomLocalConfig {
  workspaceRoot?: string;
  projectRoot?: string;
  archonRoot?: string;
}

function normalizeConfig(config: CustomLocalConfig): CustomLocalConfig {
  const workspaceRoot = config.workspaceRoot?.trim() || config.archonRoot?.trim() || '';
  return {
    ...(workspaceRoot ? { workspaceRoot } : {}),
    ...(config.projectRoot?.trim() ? { projectRoot: config.projectRoot.trim() } : {}),
  };
}

export class CustomLocalIntegration implements Integration {
  readonly id = 'custom-local';
  readonly name = 'Custom local adapter';
  readonly description = 'An optional adapter for a local project workflow tool. Configure a workspace root to enable graduation to this adapter.';
  readonly icon = 'Network';

  constructor(private readonly configStore: IntegrationConfigStore) {}

  private config(): CustomLocalConfig {
    return normalizeConfig(this.configStore.getConfig<CustomLocalConfig>(this.id));
  }

  private workspaceRoot(): string {
    return expandHome(this.config().workspaceRoot || '~/Projects/Seedbank-Workspace');
  }

  private projectRoot(): string {
    return expandHome(this.config().projectRoot || path.join(this.workspaceRoot(), 'projects'));
  }

  isConfigured(): boolean {
    const configuredRoot = this.config().workspaceRoot;
    return Boolean(configuredRoot && fs.existsSync(this.workspaceRoot()));
  }

  configuredRoots(): string[] {
    const roots = new Set<string>();
    const config = this.config();
    if (config.workspaceRoot?.trim()) roots.add(path.resolve(path.join(this.workspaceRoot(), 'projects')));
    if (config.projectRoot?.trim()) roots.add(path.resolve(this.projectRoot()));
    return [...roots];
  }

  configure(config: Record<string, string>): void {
    const normalized = normalizeConfig({ ...this.config(), ...config });
    this.configStore.setConfig(this.id, normalized as Record<string, string>);
  }

  canGraduate(idea: Idea) {
    const missing = this.isConfigured() ? [] : ['workspace root'];
    const readiness = readinessFor(idea, missing);
    return {
      ...readiness,
      ready: readiness.ready && this.isConfigured(),
    };
  }

  async graduate(idea: Idea): Promise<GraduationResult> {
    if (!this.isConfigured()) {
      throw new Error(`Workspace root not found at ${this.workspaceRoot()}. Configure a valid local adapter workspace path first.`);
    }

    const projectDir = uniqueProjectDir(this.projectRoot(), idea.title);
    const adapterContext = [
      '## Local Adapter Context',
      '',
      `- Workspace root: ${this.workspaceRoot()}`,
      '- This project was scaffolded by Seedbank for a custom local project workflow.',
      '- Keep implementation notes in README.md and agent-facing context in CLAUDE.md.',
      '',
    ].join('\n');
    const filesCreated = writeBaseScaffold(projectDir, idea, this.name, adapterContext);

    fs.writeFileSync(
      path.join(projectDir, 'CLAUDE.md'),
      claudeFor(idea, this.name, adapterContext),
    );

    fs.mkdirSync(path.join(projectDir, '.seedbank'), { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, '.seedbank', 'seedbank.json'),
      JSON.stringify({
        source: 'seedbank',
        ideaId: idea.id,
        graduatedAt: new Date().toISOString(),
        workspaceRoot: this.workspaceRoot(),
        operatorHome: os.homedir(),
      }, null, 2) + '\n',
    );
    filesCreated.push('.seedbank/seedbank.json');

    return {
      integrationId: this.id,
      ideaId: idea.id,
      projectName: path.basename(projectDir),
      path: projectDir,
      url: `file://${projectDir}`,
      graduatedTo: projectDir,
      stage: 'plot',
      filesCreated,
      message: `Created custom local project workspace at ${projectDir}.`,
    };
  }
}
