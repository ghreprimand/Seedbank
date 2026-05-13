import fs from 'node:fs';
import path from 'node:path';
import type { ConfigFieldDescriptor, GraduationResult, Idea } from '../../../shared/types.js';
import {
  expandHome,
  readinessFor,
  targetStageFor,
  uniqueProjectDir,
  writeBaseScaffold,
} from './scaffold.js';
import type { ConnectorAction, HealthResult, Integration, IntegrationConfigStore } from './types.js';

interface GenericProjectConfig {
  projectRoot?: string;
}

export class GenericProjectIntegration implements Integration {
  readonly id = 'generic-project';
  readonly name = 'Local Project';
  readonly description = 'Create a standalone project scaffold in a local directory.';
  readonly icon = 'FolderPlus';
  readonly kind = 'filesystem' as const;
  readonly helpSectionId = 'settings-integrations';

  readonly configSchema: ConfigFieldDescriptor[] = [
    {
      key: 'projectRoot',
      label: 'Project root',
      type: 'path',
      placeholder: '~/Projects/Seedbank-Graduated',
      helpText: 'Directory where graduated project scaffolds will be created. Defaults to ~/Projects/Seedbank-Graduated when left blank.',
      required: false,
    },
  ];

  constructor(private readonly configStore: IntegrationConfigStore) {}

  private config(): GenericProjectConfig {
    return this.configStore.getConfig<GenericProjectConfig>(this.id);
  }

  private projectRoot(): string {
    return expandHome(this.config().projectRoot || '~/Projects/Seedbank-Graduated');
  }

  isConfigured(): boolean {
    return Boolean(this.projectRoot());
  }

  configuredRoots(): string[] {
    return [path.resolve(this.projectRoot())];
  }

  configure(config: Record<string, string>): void {
    // Start from the raw stored object (not the processed config() view).
    const raw = this.configStore.getConfig<Record<string, string>>(this.id);
    const next: Record<string, string> = { ...raw };
    for (const [k, v] of Object.entries(config)) {
      // Empty string means "clear this field" — remove the key so the
      // default value is used instead of an empty string being stored.
      if (v === '') {
        delete next[k];
      } else {
        next[k] = v;
      }
    }
    this.configStore.setConfig(this.id, next);
  }

  currentConfigValues(): Record<string, string> {
    return { projectRoot: this.config().projectRoot?.trim() ?? '' };
  }

  async healthCheck(): Promise<HealthResult> {
    const start = Date.now();
    const root = this.projectRoot();
    if (!root) return { status: 'unconfigured', message: 'No project root configured.' };

    // If the path already exists, verify it is a directory.
    if (fs.existsSync(root)) {
      const stat = fs.statSync(root);
      if (!stat.isDirectory()) {
        return { status: 'degraded', message: `${root} exists but is not a directory.`, latencyMs: Date.now() - start };
      }
      return { status: 'ok', message: root, latencyMs: Date.now() - start };
    }

    // Path doesn't exist yet — that is fine; it will be created at graduation time.
    const parent = path.dirname(root);
    if (fs.existsSync(parent)) {
      return { status: 'ok', message: `Directory will be created at ${root} on first graduation.`, latencyMs: Date.now() - start };
    }
    return { status: 'degraded', message: `Parent directory not found: ${parent}`, latencyMs: Date.now() - start };
  }

  actions(): ConnectorAction[] {
    return [];
  }

  canGraduate(idea: Idea) {
    return readinessFor(idea);
  }

  async graduate(idea: Idea): Promise<GraduationResult> {
    const projectDir = uniqueProjectDir(this.projectRoot(), idea.title);
    const filesCreated = writeBaseScaffold(projectDir, idea, this.name);
    const stage = targetStageFor(idea.category, 'prototype');

    return {
      integrationId: this.id,
      ideaId: idea.id,
      projectName: path.basename(projectDir),
      path: projectDir,
      url: `file://${projectDir}`,
      graduatedTo: projectDir,
      stage,
      filesCreated,
      message: `Created local project scaffold at ${projectDir}.`,
    };
  }
}
