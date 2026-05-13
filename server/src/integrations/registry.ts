import type { GraduationResult, Idea, IntegrationSummary } from '../../../shared/types.js';
import type { SeedbankRepository } from '../repository.js';
import { CustomLocalIntegration } from './customLocal.js';
import { GenericProjectIntegration } from './genericProject.js';
import type { HealthResult, Integration, IntegrationConfigStore } from './types.js';

const LEGACY_INTEGRATION_IDS = new Map<string, string>([
  ['archon', 'custom-local'],
]);

interface LegacyCustomLocalConfig {
  archonRoot?: string;
  workspaceRoot?: string;
  projectRoot?: string;
}

function normalizeIntegrationId(id: string): string {
  return LEGACY_INTEGRATION_IDS.get(id) ?? id;
}

function migrateLegacyCustomLocalConfig(repository: SeedbankRepository): void {
  const current = repository.getSetting<LegacyCustomLocalConfig>('integration:custom-local');
  if (current?.workspaceRoot?.trim() || current?.projectRoot?.trim()) return;

  const legacy = repository.getSetting<LegacyCustomLocalConfig>('integration:archon');
  if (!legacy) return;

  const workspaceRoot = legacy.workspaceRoot?.trim() || legacy.archonRoot?.trim() || '';
  repository.setSetting('integration:custom-local', {
    ...(workspaceRoot ? { workspaceRoot } : {}),
    ...(legacy.projectRoot?.trim() ? { projectRoot: legacy.projectRoot.trim() } : {}),
  });
}

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
    migrateLegacyCustomLocalConfig(repository);
    const configStore = new RepositoryConfigStore(repository);
    this.integrations = [
      new GenericProjectIntegration(configStore),
      new CustomLocalIntegration(configStore),
    ];
  }

  list(): IntegrationSummary[] {
    return this.integrations.map((integration) => ({
      id: integration.id,
      name: integration.name,
      description: integration.description,
      icon: integration.icon,
      configured: integration.isConfigured(),
      configSchema: integration.configSchema,
      configValues: integration.currentConfigValues(),
      ...(integration.helpSectionId ? { helpSectionId: integration.helpSectionId } : {}),
    }));
  }

  get(id: string): Integration | undefined {
    const normalizedId = normalizeIntegrationId(id);
    return this.integrations.find((integration) => integration.id === normalizedId);
  }

  async healthCheck(id: string): Promise<HealthResult | undefined> {
    const integration = this.get(id);
    if (!integration) return undefined;
    return integration.healthCheck();
  }

  /** Stub for future user-dropped connector modules. */
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  scanUserPlugins(): void {
    // Future: scan <data-dir>/integrations/ for user connector modules.
    // Requires --allow-plugins flag. Not implemented yet.
  }

  configure(id: string, config: Record<string, string>): IntegrationSummary | undefined {
    const normalizedId = normalizeIntegrationId(id);
    const integration = this.get(normalizedId);
    if (!integration) return undefined;
    integration.configure(config);
    return this.list().find((item) => item.id === normalizedId);
  }

  readinessFor(id: string, idea: Idea) {
    return this.get(id)?.canGraduate(idea);
  }

  configuredRoots(): string[] {
    const roots = new Set<string>();
    for (const integration of this.integrations) {
      for (const root of integration.configuredRoots?.() ?? []) {
        roots.add(root);
      }
    }
    return [...roots];
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
