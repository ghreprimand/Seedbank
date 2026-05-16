import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import type {
  GitHubAuthStatusResult,
  GitHubPublishRequest,
  GitHubPublishResult,
  GitHubRepoStatusResult,
  GitHubRepoUpdateResult,
  Idea,
} from '../../../shared/types.js';

const execFileAsync = promisify(execFile);
const GITHUB_API_ROOT = 'https://api.github.com';

const GH_TIMEOUT_MS = 10_000;
const GH_MAX_BUFFER = 256 * 1024;
const GIT_TIMEOUT_MS = 15_000;
const GIT_MAX_BUFFER = 256 * 1024;
const INITIAL_COMMIT_MESSAGE = 'Initial commit from Seedbank';
const WINDOWS_GH_EXECUTABLE_NAMES = ['gh.exe', 'gh.cmd', 'gh.bat', 'gh'];
const WINDOWS_GIT_EXECUTABLE_NAMES = ['git.exe', 'git.cmd', 'git.bat', 'git'];

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
  default_branch?: string;
  private?: boolean;
}

interface RepoLookup {
  html_url: string;
  clone_url?: string;
  ssh_url?: string;
  default_branch?: string;
  private?: boolean;
  owner?: {
    login?: string;
  };
  name?: string;
}

interface GitHubRepoReference {
  owner: string;
  name: string;
  repoUrl: string;
  remoteUrl?: string;
  source: 'idea-link' | 'git-remote';
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

interface RunGitOptions {
  allowFailure?: boolean;
  env?: NodeJS.ProcessEnv;
}

const FALLBACK_GIT_AUTHOR_NAME = 'Seedbank';
const FALLBACK_GIT_AUTHOR_EMAIL = 'seedbank@local';

function windowsEnvValue(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const match = Object.keys(env).find((envKey) => envKey.toLowerCase() === key.toLowerCase());
  return match ? env[match] : undefined;
}

function cleanPathEntry(value: string): string {
  return value.trim().replace(/^"|"$/g, '');
}

function uniqueValues(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function pathValueForEnv(env: NodeJS.ProcessEnv, platform: NodeJS.Platform): string {
  if (platform === 'win32') return windowsEnvValue(env, 'Path') ?? '';
  return env.PATH ?? '';
}

function pathDelimiterForPlatform(platform: NodeJS.Platform): string {
  return platform === 'win32' ? ';' : path.delimiter;
}

function windowsGitHubCliInstallDirs(env: NodeJS.ProcessEnv): string[] {
  const programFiles = windowsEnvValue(env, 'ProgramFiles');
  const programFilesX86 = windowsEnvValue(env, 'ProgramFiles(x86)');
  const localAppData = windowsEnvValue(env, 'LOCALAPPDATA');
  return uniqueValues([
    ...(programFiles ? [path.join(programFiles, 'GitHub CLI')] : []),
    ...(programFilesX86 ? [path.join(programFilesX86, 'GitHub CLI')] : []),
    ...(localAppData
      ? [
          path.join(localAppData, 'Programs', 'GitHub CLI'),
          path.join(localAppData, 'GitHub CLI'),
          path.join(localAppData, 'Microsoft', 'WinGet', 'Links'),
          path.join(localAppData, 'Microsoft', 'WindowsApps'),
        ]
      : []),
  ]);
}

function windowsGitInstallDirs(env: NodeJS.ProcessEnv): string[] {
  const programW6432 = windowsEnvValue(env, 'ProgramW6432');
  const programFiles = windowsEnvValue(env, 'ProgramFiles');
  const programFilesX86 = windowsEnvValue(env, 'ProgramFiles(x86)');
  const localAppData = windowsEnvValue(env, 'LOCALAPPDATA');
  const roots = uniqueValues([
    ...(programW6432 ? [programW6432] : []),
    ...(programFiles ? [programFiles] : []),
    ...(programFilesX86 ? [programFilesX86] : []),
    ...(localAppData ? [path.join(localAppData, 'Programs')] : []),
  ]);
  return uniqueValues([
    ...roots.flatMap((root) => [
      path.join(root, 'Git', 'cmd'),
      path.join(root, 'Git', 'bin'),
    ]),
    ...(localAppData
      ? [
          path.join(localAppData, 'Microsoft', 'WinGet', 'Links'),
          path.join(localAppData, 'Microsoft', 'WindowsApps'),
        ]
      : []),
  ]);
}

function commandSearchPaths(
  windowsInstallDirs: string[],
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
): string[] {
  const pathEntries = pathValueForEnv(env, platform)
    .split(pathDelimiterForPlatform(platform))
    .map(cleanPathEntry)
    .filter(Boolean);
  if (platform !== 'win32') return uniqueValues(pathEntries);
  return uniqueValues([...windowsInstallDirs, ...pathEntries]);
}

export function githubCliSearchPaths(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string[] {
  return commandSearchPaths(windowsGitHubCliInstallDirs(env), env, platform);
}

export function gitCliSearchPaths(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string[] {
  return commandSearchPaths(windowsGitInstallDirs(env), env, platform);
}

export function resolveGitHubCliExecutable(
  options: {
    env?: NodeJS.ProcessEnv;
    platform?: NodeJS.Platform;
    fileExists?: (filePath: string) => boolean;
  } = {},
): string {
  const platform = options.platform ?? process.platform;
  if (platform !== 'win32') return 'gh';

  const env = options.env ?? process.env;
  const fileExists = options.fileExists ?? fs.existsSync;
  for (const searchPath of githubCliSearchPaths(env, platform)) {
    for (const executableName of WINDOWS_GH_EXECUTABLE_NAMES) {
      const candidate = path.join(searchPath, executableName);
      if (fileExists(candidate)) return candidate;
    }
  }
  return 'gh.exe';
}

export function resolveGitExecutable(
  options: {
    env?: NodeJS.ProcessEnv;
    platform?: NodeJS.Platform;
    fileExists?: (filePath: string) => boolean;
  } = {},
): string {
  const platform = options.platform ?? process.platform;
  if (platform !== 'win32') return 'git';

  const env = options.env ?? process.env;
  const fileExists = options.fileExists ?? fs.existsSync;
  for (const searchPath of gitCliSearchPaths(env, platform)) {
    for (const executableName of WINDOWS_GIT_EXECUTABLE_NAMES) {
      const candidate = path.join(searchPath, executableName);
      if (fileExists(candidate)) return candidate;
    }
  }
  return 'git.exe';
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
    const result = await execFileAsync(resolveGitHubCliExecutable(), args, {
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

function redactSensitiveText(value: string): string {
  return value.replace(/(AUTHORIZATION:\s*basic\s+)[A-Za-z0-9+/=]+/gi, '$1[redacted]');
}

export function gitHubTokenGitEnv(token: string, baseEnv: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const header = `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`, 'utf8').toString('base64')}`;
  return {
    ...baseEnv,
    GIT_TERMINAL_PROMPT: '0',
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader',
    GIT_CONFIG_VALUE_0: header,
  };
}

async function runGit(args: string[], cwd: string, options: RunGitOptions = {}): Promise<RunResult> {
  try {
    const result = await execFileAsync(resolveGitExecutable(), args, {
      cwd,
      timeout: GIT_TIMEOUT_MS,
      maxBuffer: GIT_MAX_BUFFER,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0',
        ...options.env,
      },
    });
    return {
      stdout: result.stdout,
      stderr: result.stderr,
    };
  } catch (err) {
    if (gitMissing(err)) {
      throw new GitHubPublishError(
        'Git is not installed or not available in PATH. Install Git for Windows, then restart Seedbank.',
        503,
      );
    }
    if (options.allowFailure) {
      const cast = err as { stdout?: string; stderr?: string };
      return {
        stdout: cast.stdout ?? '',
        stderr: cast.stderr ?? '',
      };
    }
    if (err instanceof Error) {
      err.message = redactSensitiveText(err.message);
    }
    throw err;
  }
}

async function fallbackCommitIdentityEnv(cwd: string, baseEnv: NodeJS.ProcessEnv = process.env): Promise<NodeJS.ProcessEnv> {
  const [nameResult, emailResult] = await Promise.all([
    runGit(['config', '--get', 'user.name'], cwd, { allowFailure: true }),
    runGit(['config', '--get', 'user.email'], cwd, { allowFailure: true }),
  ]);
  const env: NodeJS.ProcessEnv = {};
  const hasName = Boolean(baseEnv.GIT_AUTHOR_NAME || baseEnv.GIT_COMMITTER_NAME || nameResult.stdout.trim());
  const hasEmail = Boolean(baseEnv.GIT_AUTHOR_EMAIL || baseEnv.GIT_COMMITTER_EMAIL || emailResult.stdout.trim());

  if (!hasName) {
    env.GIT_AUTHOR_NAME = FALLBACK_GIT_AUTHOR_NAME;
    env.GIT_COMMITTER_NAME = FALLBACK_GIT_AUTHOR_NAME;
  }
  if (!hasEmail) {
    env.GIT_AUTHOR_EMAIL = FALLBACK_GIT_AUTHOR_EMAIL;
    env.GIT_COMMITTER_EMAIL = FALLBACK_GIT_AUTHOR_EMAIL;
  }
  return env;
}

async function runGitCommit(args: string[], cwd: string): Promise<RunResult> {
  return runGit(args, cwd, {
    env: await fallbackCommitIdentityEnv(cwd),
  });
}

async function runGitPush(args: string[], cwd: string, token: string): Promise<RunResult> {
  return runGit(args, cwd, {
    env: gitHubTokenGitEnv(token),
  });
}

async function preflightGitForPush(projectPath: string): Promise<void> {
  await runGit(['--version'], projectPath);
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
    const statusCode = [401, 403, 404, 409, 422].includes(response.status) ? response.status : 502;
    throw new GitHubPublishError(`GitHub API ${response.status} ${response.statusText}: ${message}`, statusCode);
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
  const probe = await runGit(['rev-parse', '--is-inside-work-tree'], projectPath, { allowFailure: true });
  if (!probe.stdout.trim().toLowerCase().includes('true')) {
    await runGit(['init'], projectPath);
  }
}

async function repositoryHasCommits(projectPath: string): Promise<boolean> {
  const probe = await runGit(['rev-parse', '--verify', 'HEAD'], projectPath, { allowFailure: true });
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

async function getOriginUrl(projectPath: string): Promise<string | undefined> {
  const remoteProbe = await runGit(['remote', 'get-url', 'origin'], projectPath, { allowFailure: true });
  const current = remoteProbe.stdout.trim();
  return current || undefined;
}

async function configureOrigin(projectPath: string, remoteUrl: string): Promise<void> {
  const remoteProbe = await runGit(['remote', 'get-url', 'origin'], projectPath, { allowFailure: true });
  const current = remoteProbe.stdout.trim();
  if (!current) {
    await runGit(['remote', 'add', 'origin', remoteUrl], projectPath);
    return;
  }
  if (current !== remoteUrl) {
    await runGit(['remote', 'set-url', 'origin', remoteUrl], projectPath);
  }
}

async function pushInitialProject(projectPath: string, remoteUrl: string, token: string): Promise<void> {
  await ensureGitInitialized(projectPath);
  await runGit(['add', '-A'], projectPath);

  const hasCommits = await repositoryHasCommits(projectPath);
  const staged = await hasStagedChanges(projectPath);

  if (!hasCommits) {
    if (staged) {
      await runGitCommit(['commit', '-m', INITIAL_COMMIT_MESSAGE], projectPath);
    } else {
      await runGitCommit(['commit', '--allow-empty', '-m', INITIAL_COMMIT_MESSAGE], projectPath);
    }
  } else if (staged) {
    await runGitCommit(['commit', '-m', INITIAL_COMMIT_MESSAGE], projectPath);
  }

  await runGit(['branch', '-M', 'main'], projectPath);
  await configureOrigin(projectPath, remoteUrl);
  await runGitPush(['push', '-u', 'origin', 'main'], projectPath, token);
}

async function commitAndPushProject(projectPath: string, remoteUrl: string, token: string): Promise<{ committed: boolean; pushed: boolean }> {
  await ensureGitInitialized(projectPath);
  await runGit(['add', '-A'], projectPath);

  const hasCommits = await repositoryHasCommits(projectPath);
  const staged = await hasStagedChanges(projectPath);
  let committed = false;

  if (!hasCommits) {
    if (staged) {
      await runGitCommit(['commit', '-m', INITIAL_COMMIT_MESSAGE], projectPath);
    } else {
      await runGitCommit(['commit', '--allow-empty', '-m', INITIAL_COMMIT_MESSAGE], projectPath);
    }
    committed = true;
  } else if (staged) {
    await runGitCommit(['commit', '-m', 'Update project files from Seedbank'], projectPath);
    committed = true;
  }

  await runGit(['branch', '-M', 'main'], projectPath);
  await configureOrigin(projectPath, remoteUrl);
  await runGitPush(['push', '-u', 'origin', 'main'], projectPath, token);
  return { committed, pushed: true };
}

export function parseGitHubRepositoryReference(input: string): { owner: string; name: string; repoUrl: string; remoteUrl?: string } | null {
  const value = input.trim();
  if (!value) return null;

  const sshMatch = value.match(/^git@github\.com:([^/\s]+)\/([^/\s]+?)(?:\.git)?$/i);
  if (sshMatch?.[1] && sshMatch[2]) {
    const owner = sshMatch[1];
    const name = sshMatch[2].replace(/\.git$/i, '');
    return {
      owner,
      name,
      repoUrl: `https://github.com/${owner}/${name}`,
      remoteUrl: value,
    };
  }

  try {
    const url = new URL(value);
    if (url.hostname.toLowerCase() !== 'github.com') return null;
    const [owner, rawName] = url.pathname.split('/').filter(Boolean);
    if (!owner || !rawName) return null;
    const name = rawName.replace(/\.git$/i, '');
    const parsed = {
      owner,
      name,
      repoUrl: `https://github.com/${owner}/${name}`,
    };
    return value.endsWith('.git') ? { ...parsed, remoteUrl: value } : parsed;
  } catch {
    return null;
  }
}

async function findRepoReference(idea: Idea, projectPath: string): Promise<GitHubRepoReference | null> {
  const githubLink = idea.links.find((link) => link.label.trim().toLowerCase() === 'github')
    ?? idea.links.find((link) => link.url.toLowerCase().includes('github.com/'));
  if (githubLink) {
    const parsed = parseGitHubRepositoryReference(githubLink.url);
    if (parsed) return { ...parsed, source: 'idea-link' };
  }

  const originUrl = await getOriginUrl(projectPath);
  if (originUrl) {
    const parsed = parseGitHubRepositoryReference(originUrl);
    if (parsed) return { ...parsed, source: 'git-remote' };
  }

  return null;
}

function repoStatusFromAuth(status: GitHubAuthStatusResult, projectPath: string): GitHubRepoStatusResult | null {
  if (!status.available) {
    return {
      available: false,
      authenticated: false,
      projectPath,
      repoKnown: false,
      exists: false,
      source: 'none',
      message: status.message,
    };
  }
  if (!status.authenticated) {
    return {
      available: true,
      authenticated: false,
      projectPath,
      repoKnown: false,
      exists: false,
      source: 'none',
      message: status.message,
    };
  }
  return null;
}

export async function getIdeaGitHubRepoStatus(idea: Idea, options?: { enforceDirectory?: boolean }): Promise<GitHubRepoStatusResult> {
  const { projectPath } = ensurePublishableIdea(idea);
  if (options?.enforceDirectory !== false) ensureDirectory(projectPath);

  const authStatus = await getGitHubAuthStatus();
  const authBlock = repoStatusFromAuth(authStatus, projectPath);
  if (authBlock) return authBlock;

  const reference = await findRepoReference(idea, projectPath);
  if (!reference) {
    return {
      available: true,
      authenticated: true,
      projectPath,
      repoKnown: false,
      exists: false,
      source: 'none',
      message: 'No GitHub repository link or origin remote has been recorded for this project yet.',
    };
  }

  const token = await readGhToken();
  try {
    const repo = await ghFetch<RepoLookup>(
      token,
      `/repos/${encodeURIComponent(reference.owner)}/${encodeURIComponent(reference.name)}`,
    );
    return {
      available: true,
      authenticated: true,
      projectPath,
      repoKnown: true,
      exists: true,
      source: reference.source,
      repoUrl: repo.html_url || reference.repoUrl,
      remoteUrl: repo.clone_url || reference.remoteUrl,
      owner: repo.owner?.login ?? reference.owner,
      name: repo.name ?? reference.name,
      ...(typeof repo.private === 'boolean' ? { private: repo.private } : {}),
      ...(repo.default_branch ? { defaultBranch: repo.default_branch } : {}),
      message: 'GitHub repository found.',
    };
  } catch (err) {
    if (err instanceof GitHubPublishError && err.statusCode === 404) {
      return {
        available: true,
        authenticated: true,
        projectPath,
        repoKnown: true,
        exists: false,
        source: reference.source,
        repoUrl: reference.repoUrl,
        ...(reference.remoteUrl ? { remoteUrl: reference.remoteUrl } : {}),
        owner: reference.owner,
        name: reference.name,
        message: 'A GitHub repository link or remote exists locally, but GitHub did not find that repository.',
      };
    }
    throw err;
  }
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
  const pushToken = input.pushInitial ? await readGhToken() : undefined;
  if (input.pushInitial) await preflightGitForPush(projectPath);

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
  if (!pushToken) {
    throw new GitHubPublishError('GitHub CLI returned an empty auth token. Run `gh auth login` and try again.', 401);
  }

  try {
    await pushInitialProject(projectPath, createdRepo.clone_url, pushToken);
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

export async function updateIdeaProjectOnGitHub(
  idea: Idea,
  options?: { enforceDirectory?: boolean },
): Promise<GitHubRepoUpdateResult> {
  const status = await getIdeaGitHubRepoStatus(idea, options);
  if (!status.authenticated) {
    throw new GitHubPublishError(status.message, status.available ? 401 : 503);
  }
  if (!status.repoKnown) {
    throw new GitHubPublishError('No GitHub repository link or origin remote has been recorded for this project yet.', 400);
  }
  if (!status.exists || !status.repoUrl) {
    throw new GitHubPublishError(status.message, 404);
  }

  const remoteUrl = status.remoteUrl ?? `${status.repoUrl}.git`;
  try {
    const token = await readGhToken();
    const gitResult = await commitAndPushProject(status.projectPath ?? ensurePublishableIdea(idea).projectPath, remoteUrl, token);
    return {
      pushed: gitResult.pushed,
      committed: gitResult.committed,
      repoUrl: status.repoUrl,
      remoteUrl,
      projectPath: status.projectPath ?? ensurePublishableIdea(idea).projectPath,
      message: gitResult.committed
        ? 'Committed local project changes and pushed them to GitHub.'
        : 'No local file changes to commit. GitHub remote is configured and push completed.',
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      pushed: false,
      committed: false,
      repoUrl: status.repoUrl,
      remoteUrl,
      projectPath: status.projectPath ?? ensurePublishableIdea(idea).projectPath,
      message: `GitHub repository found, but update push failed: ${message}`,
      error: message,
    };
  }
}
