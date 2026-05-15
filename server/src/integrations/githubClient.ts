import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import type {
  GitHubAuthStatusResult,
  GitHubPublishRequest,
  GitHubPublishResult,
  Idea,
} from '../../../shared/types.js';

const execFileAsync = promisify(execFile);
const GITHUB_API_ROOT = 'https://api.github.com';

const GH_TIMEOUT_MS = 10_000;
const GH_MAX_BUFFER = 256 * 1024;
const GIT_TIMEOUT_MS = 15_000;
const GIT_MAX_BUFFER = 256 * 1024;
const INITIAL_COMMIT_MESSAGE = 'Initial commit from Seedbank';

export class GitHubPublishError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'GitHubPublishError';
    this.statusCode = statusCode;
  }
}

interface GhAuthStatusParsed {
  authenticated: boolean;
  login?: string;
  scopes?: string[];
}

interface GitHubUserProfile {
  login: string;
  name?: string | null;
  avatar_url: string;
  html_url: string;
  public_repos: number;
  followers: number;
  following: number;
  total_private_repos?: number;
  owned_private_repos?: number;
  private_gists?: number;
  plan?: {
    name?: string;
    space?: number;
    private_repos?: number;
    collaborators?: number;
  } | null;
}

interface CreatedRepo {
  html_url: string;
  clone_url: string;
}

interface GhErrorWithCode {
  code?: string;
  stderr?: string;
  stdout?: string;
  message?: string;
}

interface RunResult {
  stdout: string;
  stderr: string;
}

function isNotLoggedInMessage(text: string): boolean {
  const normalized = text.toLowerCase();
  return normalized.includes('not logged into any github hosts')
    || normalized.includes('run gh auth login')
    || normalized.includes('authentication failed')
    || normalized.includes('you are not logged into any github hosts');
}

function parseScopeList(raw: string | undefined): string[] | undefined {
  if (!raw) return undefined;
  const items = raw
    .replace(/'/g, '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length > 0 ? items : undefined;
}

export function parseGhAuthStatusOutput(output: string): GhAuthStatusParsed {
  const accountMatch = output.match(/Logged in to\s+\S+\s+account\s+([^\s]+)/i);
  const scopesMatch = output.match(/Token scopes:\s*(.+)/i);
  return {
    authenticated: Boolean(accountMatch?.[1]),
    ...(accountMatch?.[1] ? { login: accountMatch[1] } : {}),
    ...(parseScopeList(scopesMatch?.[1]) ? { scopes: parseScopeList(scopesMatch?.[1]) } : {}),
  };
}

export function sanitizeGitHubRepoName(input: string): string {
  const trimmed = input.trim();
  const collapsed = trimmed
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-zA-Z0-9.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 100);
  return collapsed.toLowerCase();
}

export function repoNameFromIdeaTitle(title: string): string {
  return sanitizeGitHubRepoName(title);
}

export function ensurePublishableIdea(idea: Idea | undefined): { projectPath: string } {
  if (!idea) throw new GitHubPublishError('Idea not found.', 404);
  if (!idea.graduatedTo?.trim()) {
    throw new GitHubPublishError('This idea has not been graduated to a project path.', 400);
  }
  return { projectPath: path.resolve(idea.graduatedTo) };
}

function errorMessage(err: unknown): string {
  if (!err || typeof err !== 'object') return String(err);
  const cast = err as GhErrorWithCode;
  return cast.stderr?.trim() || cast.message || String(err);
}

function ghMissing(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as GhErrorWithCode).code === 'ENOENT';
}

function gitMissing(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as GhErrorWithCode).code === 'ENOENT';
}

async function runGh(args: string[]): Promise<RunResult> {
  try {
    const result = await execFileAsync('gh', args, {
      timeout: GH_TIMEOUT_MS,
      maxBuffer: GH_MAX_BUFFER,
    });
    return {
      stdout: result.stdout,
      stderr: result.stderr,
    };
  } catch (err) {
    if (ghMissing(err)) {
      throw new GitHubPublishError(
        'GitHub CLI (gh) is not installed or not available in PATH. Install GitHub CLI and run `gh auth login`.',
        503,
      );
    }
    throw err;
  }
}

async function runGit(args: string[], cwd: string, allowFailure = false): Promise<RunResult> {
  try {
    const result = await execFileAsync('git', args, {
      cwd,
      timeout: GIT_TIMEOUT_MS,
      maxBuffer: GIT_MAX_BUFFER,
    });
    return {
      stdout: result.stdout,
      stderr: result.stderr,
    };
  } catch (err) {
    if (gitMissing(err)) {
      throw new GitHubPublishError('git is not installed or not available in PATH.', 503);
    }
    if (allowFailure) {
      const cast = err as { stdout?: string; stderr?: string };
      return {
        stdout: cast.stdout ?? '',
        stderr: cast.stderr ?? '',
      };
    }
    throw err;
  }
}

async function readGhToken(): Promise<string> {
  try {
    const { stdout } = await runGh(['auth', 'token']);
    const token = stdout.trim();
    if (!token) {
      throw new GitHubPublishError('GitHub CLI returned an empty auth token. Run `gh auth login` and try again.', 401);
    }
    return token;
  } catch (err) {
    if (err instanceof GitHubPublishError) throw err;
    const message = errorMessage(err);
    if (isNotLoggedInMessage(message)) {
      throw new GitHubPublishError('GitHub CLI is not authenticated. Run `gh auth login` and refresh status.', 401);
    }
    throw new GitHubPublishError(`Unable to read GitHub auth token: ${message}`, 502);
  }
}

async function ghFetch<T>(token: string, endpoint: string, init: RequestInit = {}): Promise<T> {
  const url = new URL(endpoint, GITHUB_API_ROOT);
  const headers = new Headers(init.headers ?? {});
  headers.set('Authorization', `Bearer ${token}`);
  headers.set('Accept', 'application/vnd.github+json');
  headers.set('X-GitHub-Api-Version', '2022-11-28');
  headers.set('User-Agent', 'seedbank-local');

  const response = await fetch(url, {
    ...init,
    headers,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    const message = text.slice(0, 400) || response.statusText;
    throw new GitHubPublishError(`GitHub API ${response.status} ${response.statusText}: ${message}`, response.status === 401 ? 401 : 502);
  }

  return response.json() as Promise<T>;
}

async function getAuthenticatedProfile(): Promise<GitHubUserProfile> {
  const token = await readGhToken();
  return ghFetch<GitHubUserProfile>(token, '/user');
}

async function createRepository(
  input: {
    name: string;
    owner?: string;
    visibility: 'public' | 'private';
    description: string;
  },
): Promise<CreatedRepo> {
  const token = await readGhToken();
  const user = await ghFetch<GitHubUserProfile>(token, '/user');
  const privateFlag = input.visibility === 'private';

  const body = {
    name: input.name,
    description: input.description,
    private: privateFlag,
    has_issues: true,
    has_projects: false,
    has_wiki: false,
    auto_init: false,
  };

  try {
    if (input.owner && input.owner !== user.login) {
      return await ghFetch<CreatedRepo>(token, `/orgs/${encodeURIComponent(input.owner)}/repos`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    }

    return await ghFetch<CreatedRepo>(token, '/user/repos', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/\b422\b/.test(message) || /already exists/i.test(message)) {
      throw new GitHubPublishError(`A GitHub repository named "${input.name}" already exists for that owner.`, 409);
    }
    if (/\b404\b/.test(message) || /resource not accessible/i.test(message)) {
      throw new GitHubPublishError(
        `Unable to create repository under owner "${input.owner ?? user.login}". Verify owner name and gh permissions.`,
        403,
      );
    }
    throw err;
  }
}

function parseBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  return fallback;
}

function ensureDirectory(pathValue: string): void {
  try {
    const stat = fs.statSync(pathValue);
    if (!stat.isDirectory()) throw new GitHubPublishError(`Graduated project path is not a directory: ${pathValue}`, 400);
  } catch (err) {
    if (err instanceof GitHubPublishError) throw err;
    throw new GitHubPublishError(`Graduated project path does not exist: ${pathValue}`, 400);
  }
}

async function ensureGitInitialized(projectPath: string): Promise<void> {
  const probe = await runGit(['rev-parse', '--is-inside-work-tree'], projectPath, true);
  if (!probe.stdout.trim().toLowerCase().includes('true')) {
    await runGit(['init'], projectPath);
  }
}

async function repositoryHasCommits(projectPath: string): Promise<boolean> {
  const probe = await runGit(['rev-parse', '--verify', 'HEAD'], projectPath, true);
  return probe.stdout.trim().length > 0;
}

async function hasStagedChanges(projectPath: string): Promise<boolean> {
  try {
    await runGit(['diff', '--cached', '--quiet'], projectPath);
    return false;
  } catch {
    return true;
  }
}

async function configureOrigin(projectPath: string, remoteUrl: string): Promise<void> {
  const remoteProbe = await runGit(['remote', 'get-url', 'origin'], projectPath, true);
  const current = remoteProbe.stdout.trim();
  if (!current) {
    await runGit(['remote', 'add', 'origin', remoteUrl], projectPath);
    return;
  }
  if (current !== remoteUrl) {
    await runGit(['remote', 'set-url', 'origin', remoteUrl], projectPath);
  }
}

async function pushInitialProject(projectPath: string, remoteUrl: string): Promise<void> {
  await ensureGitInitialized(projectPath);
  await runGit(['add', '-A'], projectPath);

  const hasCommits = await repositoryHasCommits(projectPath);
  const staged = await hasStagedChanges(projectPath);

  if (!hasCommits) {
    if (staged) {
      await runGit(['commit', '-m', INITIAL_COMMIT_MESSAGE], projectPath);
    } else {
      await runGit(['commit', '--allow-empty', '-m', INITIAL_COMMIT_MESSAGE], projectPath);
    }
  } else if (staged) {
    await runGit(['commit', '-m', INITIAL_COMMIT_MESSAGE], projectPath);
  }

  await runGit(['branch', '-M', 'main'], projectPath);
  await configureOrigin(projectPath, remoteUrl);
  await runGit(['push', '-u', 'origin', 'main'], projectPath);
}

export async function getGitHubAuthStatus(): Promise<GitHubAuthStatusResult> {
  let parsed: GhAuthStatusParsed;
  try {
    const { stdout, stderr } = await runGh(['auth', 'status', '--active']);
    parsed = parseGhAuthStatusOutput(stdout || stderr);
    if (!parsed.authenticated) {
      return {
        available: true,
        authenticated: false,
        message: 'GitHub CLI is installed but not authenticated. Run `gh auth login` and refresh.',
      };
    }
  } catch (err) {
    if (err instanceof GitHubPublishError) {
      if (err.statusCode === 503) {
        return { available: false, authenticated: false, message: err.message };
      }
      return {
        available: true,
        authenticated: false,
        message: err.message,
      };
    }
    const message = errorMessage(err);
    if (isNotLoggedInMessage(message)) {
      return {
        available: true,
        authenticated: false,
        message: 'GitHub CLI is not authenticated. Run `gh auth login` and refresh.',
      };
    }
    return {
      available: true,
      authenticated: false,
      message: `Unable to read GitHub auth status: ${message}`,
    };
  }

  try {
    const profile = await getAuthenticatedProfile();
    return {
      available: true,
      authenticated: true,
      login: profile.login,
      ...(profile.name ? { name: profile.name } : {}),
      avatarUrl: profile.avatar_url,
      profileUrl: profile.html_url,
      publicRepos: profile.public_repos,
      followers: profile.followers,
      following: profile.following,
      ...(typeof profile.total_private_repos === 'number' ? { totalPrivateRepos: profile.total_private_repos } : {}),
      ...(typeof profile.owned_private_repos === 'number' ? { ownedPrivateRepos: profile.owned_private_repos } : {}),
      ...(typeof profile.private_gists === 'number' ? { privateGists: profile.private_gists } : {}),
      ...(profile.plan
        ? {
            plan: {
              ...(profile.plan.name ? { name: profile.plan.name } : {}),
              ...(typeof profile.plan.private_repos === 'number' ? { privateRepos: profile.plan.private_repos } : {}),
              ...(typeof profile.plan.collaborators === 'number' ? { collaborators: profile.plan.collaborators } : {}),
              ...(typeof profile.plan.space === 'number' ? { space: profile.plan.space } : {}),
            },
          }
        : {}),
      ...(parsed.scopes ? { scopes: parsed.scopes } : {}),
      message: 'Authenticated via GitHub CLI.',
    };
  } catch (err) {
    if (err instanceof GitHubPublishError) {
      return {
        available: true,
        authenticated: false,
        message: err.message,
      };
    }
    return {
      available: true,
      authenticated: false,
      message: `Unable to fetch GitHub profile: ${errorMessage(err)}`,
    };
  }
}

export function parseGitHubPublishRequest(value: unknown, fallbackRepoName: string): GitHubPublishRequest {
  const body = (value && typeof value === 'object') ? value as {
    repoName?: unknown;
    owner?: unknown;
    visibility?: unknown;
    pushInitial?: unknown;
  } : {};

  const requestedName = typeof body.repoName === 'string' ? body.repoName : fallbackRepoName;
  const repoName = sanitizeGitHubRepoName(requestedName);
  if (!repoName) {
    throw new GitHubPublishError('Repository name is required. Provide repoName or use an idea title with valid characters.', 400);
  }

  const visibility = body.visibility === 'private' ? 'private' : body.visibility === 'public' ? 'public' : null;
  if (!visibility) {
    throw new GitHubPublishError('visibility must be "public" or "private".', 400);
  }

  const owner = typeof body.owner === 'string' && body.owner.trim() ? body.owner.trim() : undefined;
  return {
    repoName,
    ...(owner ? { owner } : {}),
    visibility,
    pushInitial: parseBoolean(body.pushInitial, true),
  };
}

export async function publishIdeaProject(
  idea: Idea,
  input: GitHubPublishRequest,
  options?: { enforceDirectory?: boolean },
): Promise<GitHubPublishResult> {
  const { projectPath } = ensurePublishableIdea(idea);
  if (options?.enforceDirectory !== false) ensureDirectory(projectPath);

  const createdRepo = await createRepository({
    name: input.repoName,
    owner: input.owner,
    visibility: input.visibility,
    description: `Seedbank idea: ${idea.title}`,
  });

  const result: GitHubPublishResult = {
    repoCreated: true,
    pushed: false,
    repoUrl: createdRepo.html_url,
    remoteUrl: createdRepo.clone_url,
    projectPath,
    message: input.pushInitial
      ? 'GitHub repository created. Preparing initial push...'
      : 'GitHub repository created. Initial push skipped.',
  };

  if (!input.pushInitial) {
    return result;
  }

  try {
    await pushInitialProject(projectPath, createdRepo.clone_url);
    return {
      ...result,
      pushed: true,
      message: 'GitHub repository created and initial files pushed to main.',
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ...result,
      pushed: false,
      message: `Repository created, but initial push failed: ${message}`,
      error: message,
    };
  }
}
