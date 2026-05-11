import type { GraduationResult, Idea, IntegrationSummary } from '../../../shared/types.js';
import type { SeedbankRepository } from '../repository.js';
import { ArchonIntegration } from './archon.js';
import { GenericProjectIntegration } from './genericProject.js';
import type { Integration, IntegrationConfigStore } from './types.js';

class RepositoryConfigStore implements IntegrationConfigStore {
  constructor(private readonly repository: SeedbankRepository) {}

  getConfig<T extends object>(integrationId: string): T {
    return this.repository.getSetting<T>(`integration:${integrationId}`) ?? {} as T;
  }

  setConfig(integrationId: string, config: Record<string, string>): void {
    this.repository.setSetting(`integration:${integrationId}`, config);
  }
}

export class IntegrationRegistry {
  private readonly integrations: Integration[];

  constructor(private readonly repository: SeedbankRepository) {
    const configStore = new RepositoryConfigStore(repository);
    this.integrations = [
      new ArchonIntegration(configStore),
      new GenericProjectIntegration(configStore),
    ];
  }

  list(): IntegrationSummary[] {
    return this.integrations.map((integration) => ({
      id: integration.id,
      name: integration.name,
      description: integration.description,
      icon: integration.icon,
      configured: integration.isConfigured(),
    }));
  }

  get(id: string): Integration | undefined {
    return this.integrations.find((integration) => integration.id === id);
  }

  configure(id: string, config: Record<string, string>): IntegrationSummary | undefined {
    const integration = this.get(id);
    if (!integration) return undefined;
    integration.configure(config);
    return this.list().find((item) => item.id === id);
  }

  readinessFor(id: string, idea: Idea) {
    return this.get(id)?.canGraduate(idea);
  }

  async graduate(id: string, ideaId: string): Promise<{ result: GraduationResult; idea: Idea } | undefined> {
    const integration = this.get(id);
    const idea = this.repository.getIdea(ideaId);
    if (!integration || !idea) return undefined;

    const readiness = integration.canGraduate(idea);
    if (!readiness.ready) {
      throw new Error(`Idea is not ready to graduate. Missing: ${readiness.missing.join(', ') || 'required fields'}.`);
    }

    const result = await integration.graduate(idea);
    const updated = this.repository.updateIdea(idea.id, {
      graduatedTo: result.graduatedTo,
      stage: result.stage,
    });

    if (!updated) throw new Error('Graduation completed but idea update failed.');
    return { result, idea: updated };
  }
}
