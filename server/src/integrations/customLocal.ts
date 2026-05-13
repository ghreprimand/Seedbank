import fs from 'node:fs';
import path from 'node:path';
import type { ConfigFieldDescriptor, GraduationResult, Idea } from '../../../shared/types.js';
import {
  claudeFor,
  expandHome,
  readinessFor,
  uniqueProjectDir,
  writeBaseScaffold,
} from './scaffold.js';
import type { ConnectorAction, HealthResult, Integration, IntegrationConfigStore } from './types.js';

interface CustomLocalConfig {
  workspaceRoot?: string;
  projectRoot?: string;
  archonRoot?: string;
}

function normalizeConfig(config: CustomLocalConfig): Record<string, string> {
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
  readonly kind = 'filesystem' as const;
  readonly helpSectionId = 'settings-integrations';

  readonly configSchema: ConfigFieldDescriptor[] = [
    {
      key: 'workspaceRoot',
      label: 'Workspace root',
      type: 'path',
      placeholder: '/path/to/your/adapter-workspace',
      helpText: 'Root directory of your local workflow tool workspace. Required to enable graduation to this adapter.',
      required: true,
    },
    {
      key: 'projectRoot',
      label: 'Project root (optional)',
      type: 'path',
      placeholder: 'Defaults to <workspace>/projects',
      helpText: 'Override where project scaffolds are created inside the workspace. Defaults to <workspaceRoot>/projects when left blank.',
      required: false,
    },
  ];

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

  currentConfigValues(): Record<string, string> {
    const config = this.config();
    return {
      workspaceRoot: config.workspaceRoot?.trim() ?? '',
      projectRoot: config.projectRoot?.trim() ?? '',
    };
  }

  async healthCheck(): Promise<HealthResult> {
    const start = Date.now();
    const config = this.config();
    if (!config.workspaceRoot?.trim()) {
      return { status: 'unconfigured', message: 'Workspace root not configured.' };
    }
    const workspaceRoot = this.workspaceRoot();
    if (!fs.existsSync(workspaceRoot)) {
      return { status: 'unreachable', message: `Workspace root not found: ${workspaceRoot}`, latencyMs: Date.now() - start };
    }
    const stat = fs.statSync(workspaceRoot);
    if (!stat.isDirectory()) {
      return { status: 'degraded', message: `${workspaceRoot} exists but is not a directory.`, latencyMs: Date.now() - start };
    }
    return { status: 'ok', message: workspaceRoot, latencyMs: Date.now() - start };
  }

  actions(): ConnectorAction[] {
    return [];
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
      '- Workspace root is configured in Seedbank Settings.',
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
