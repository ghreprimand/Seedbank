import { spawnSync } from 'node:child_process';
import path from 'node:path';
import type { AgentProvider } from './types.js';

function defaultBinary(provider: AgentProvider): string {
  return provider === 'claude' ? 'claude' : 'codex';
}

function cleanVersionText(raw: string): string {
  const text = raw.trim();
  if (!text) return 'unknown';
  const line = text.split('\n')[0]?.trim() ?? text;
  return line.slice(0, 200);
}

export function resolveCliPath(provider: AgentProvider, cliPath?: string): string {
  if (cliPath?.trim()) return path.resolve(cliPath.trim());
  return defaultBinary(provider);
}

export function validateCli(provider: AgentProvider, cliPath?: string): { cliPath: string; version: string } {
  const resolved = resolveCliPath(provider, cliPath);
  const result = spawnSync(resolved, ['--version'], {
    encoding: 'utf8',
    timeout: 5000,
  });

  if (result.error) {
    throw new Error(`Failed to execute ${provider} CLI: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const stderr = result.stderr?.trim() || 'unknown error';
    throw new Error(`${provider} CLI validation failed: ${stderr}`);
  }

  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  return {
    cliPath: resolved,
    version: cleanVersionText(output),
  };
}

export function runArgs(provider: AgentProvider, prompt: string): string[] {
  if (provider === 'claude') return ['-p', prompt];
  return ['exec', prompt];
}

