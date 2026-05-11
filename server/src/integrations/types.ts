import type { GraduationReadiness, GraduationResult, Idea, IntegrationSummary } from '../../../shared/types.js';

export interface IntegrationConfigStore {
  getConfig<T extends object>(integrationId: string): T;
  setConfig(integrationId: string, config: Record<string, string>): void;
}

export interface Integration {
  id: string;
  name: string;
  description: string;
  icon: string;
  isConfigured(): boolean;
  configure(config: Record<string, string>): void;
  canGraduate(idea: Idea): GraduationReadiness;
  graduate(idea: Idea): Promise<GraduationResult>;
}

export type IntegrationListItem = IntegrationSummary;
