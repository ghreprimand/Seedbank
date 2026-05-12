import type { Idea } from '../../../shared/types.js';

export type AgentProvider = 'claude' | 'codex';
export type AgentRunState = 'running' | 'completed' | 'failed' | 'stopped';

export interface AgentRunRecord {
  id: string;
  ideaId: string | null;
  projectPath: string | null;
  provider: AgentProvider;
  state: AgentRunState;
  startedAt: string;
  endedAt: string | null;
  exitCode: number | null;
  transcriptPath: string;
  proposedFiles: string[];
}

export interface AgentRunDetail extends AgentRunRecord {
  transcript: string;
  truncated: boolean;
}

export interface AgentLinkRequest {
  provider: AgentProvider;
  cliPath?: string;
}

export interface AgentLinkPublic {
  claudeLinked: boolean;
  codexLinked: boolean;
  claudeVersion: string | null;
  codexVersion: string | null;
}

export interface AgentRunCreateInput {
  ideaId?: string;
  projectPath?: string;
  provider: AgentProvider;
  prompt: string;
}

export interface AgentRunCreateResult {
  runId: string;
  state: AgentRunState;
}

export interface AgentRunApplyInput {
  paths: string[];
}

export interface AgentRunApplyResult {
  appliedPaths: string[];
  idea: Idea;
}

export interface AgentRunStreamEvent {
  type: 'state' | 'delta' | 'error' | 'done';
  runId: string;
  timestamp: string;
  state?: AgentRunState;
  delta?: string;
  error?: string;
}

