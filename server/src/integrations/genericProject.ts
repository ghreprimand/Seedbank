import path from 'node:path';
import type { GraduationResult, Idea } from '../../../shared/types.js';
import {
  expandHome,
  readinessFor,
  targetStageFor,
  uniqueProjectDir,
  writeBaseScaffold,
} from './scaffold.js';
import type { Integration, IntegrationConfigStore } from './types.js';

interface GenericProjectConfig {
  projectRoot?: string;
}

export class GenericProjectIntegration implements Integration {
  readonly id = 'generic-project';
  readonly name = 'Local Project';
  readonly description = 'Create a standalone project scaffold in a local directory.';
  readonly icon = 'FolderPlus';

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

  configure(config: Record<string, string>): void {
    this.configStore.setConfig(this.id, {
      ...this.config(),
      ...config,
    });
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
