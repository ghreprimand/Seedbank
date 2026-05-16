import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { newIdea } from '../src/domain.js';
import {
  ensurePublishableIdea,
  GitHubPublishError,
  gitCliSearchPaths,
  githubCliSearchPaths,
  gitHubTokenGitEnv,
  parseGhAuthStatusOutput,
  parseGitHubPublishRequest,
  parseGitHubRepositoryReference,
  repoNameFromIdeaTitle,
  resolveGitExecutable,
  resolveGitHubCliExecutable,
  sanitizeGitHubRepoName,
} from '../src/integrations/githubClient.js';

test('parseGhAuthStatusOutput extracts login and scopes', () => {
  const parsed = parseGhAuthStatusOutput([
    'github.com',
    '  ✓ Logged in to github.com account octocat (/home/user/.config/gh/hosts.yml)',
    '  - Active account: true',
    "  - Token scopes: 'repo', 'read:org', 'gist'",
  ].join('\n'));

  assert.equal(parsed.authenticated, true);
  assert.equal(parsed.login, 'octocat');
  assert.deepEqual(parsed.scopes, ['repo', 'read:org', 'gist']);
});

test('githubCliSearchPaths includes standard Windows GitHub CLI install directories before Path', () => {
  const env = {
    ProgramFiles: 'C:\\Program Files',
    LOCALAPPDATA: 'C:\\Users\\octo\\AppData\\Local',
    Path: '"C:\\Tools";C:\\Windows\\System32',
  };

  assert.deepEqual(githubCliSearchPaths(env, 'win32'), [
    path.join('C:\\Program Files', 'GitHub CLI'),
    path.join('C:\\Users\\octo\\AppData\\Local', 'Programs', 'GitHub CLI'),
    path.join('C:\\Users\\octo\\AppData\\Local', 'GitHub CLI'),
    path.join('C:\\Users\\octo\\AppData\\Local', 'Microsoft', 'WinGet', 'Links'),
    path.join('C:\\Users\\octo\\AppData\\Local', 'Microsoft', 'WindowsApps'),
    'C:\\Tools',
    'C:\\Windows\\System32',
  ]);
});

test('resolveGitHubCliExecutable returns a discovered Windows gh executable', () => {
  const env = {
    ProgramFiles: 'C:\\Program Files',
    Path: 'C:\\Tools',
  };
  const expected = path.join('C:\\Program Files', 'GitHub CLI', 'gh.exe');

  const resolved = resolveGitHubCliExecutable({
    env,
    platform: 'win32',
    fileExists: (candidate) => candidate === expected,
  });

  assert.equal(resolved, expected);
});

test('resolveGitHubCliExecutable falls back to gh.exe on Windows', () => {
  const resolved = resolveGitHubCliExecutable({
    env: { Path: 'C:\\Tools' },
    platform: 'win32',
    fileExists: () => false,
  });

  assert.equal(resolved, 'gh.exe');
});

test('gitCliSearchPaths includes standard Windows Git install directories before Path', () => {
  const env = {
    ProgramW6432: 'C:\\Program Files',
    ProgramFiles: 'C:\\Program Files',
    LOCALAPPDATA: 'C:\\Users\\octo\\AppData\\Local',
    Path: '"C:\\Tools";C:\\Windows\\System32',
  };

  assert.deepEqual(gitCliSearchPaths(env, 'win32'), [
    path.join('C:\\Program Files', 'Git', 'cmd'),
    path.join('C:\\Program Files', 'Git', 'bin'),
    path.join('C:\\Users\\octo\\AppData\\Local', 'Programs', 'Git', 'cmd'),
    path.join('C:\\Users\\octo\\AppData\\Local', 'Programs', 'Git', 'bin'),
    path.join('C:\\Users\\octo\\AppData\\Local', 'Microsoft', 'WinGet', 'Links'),
    path.join('C:\\Users\\octo\\AppData\\Local', 'Microsoft', 'WindowsApps'),
    'C:\\Tools',
    'C:\\Windows\\System32',
  ]);
});

test('resolveGitExecutable returns a discovered Windows git executable', () => {
  const env = {
    ProgramFiles: 'C:\\Program Files',
    Path: 'C:\\Tools',
  };
  const expected = path.join('C:\\Program Files', 'Git', 'cmd', 'git.exe');

  const resolved = resolveGitExecutable({
    env,
    platform: 'win32',
    fileExists: (candidate) => candidate === expected,
  });

  assert.equal(resolved, expected);
});

test('resolveGitExecutable falls back to git.exe on Windows', () => {
  const resolved = resolveGitExecutable({
    env: { Path: 'C:\\Tools' },
    platform: 'win32',
    fileExists: () => false,
  });

  assert.equal(resolved, 'git.exe');
});

test('gitHubTokenGitEnv injects one-shot HTTPS auth without changing remote URLs', () => {
  const env = gitHubTokenGitEnv('gho_test-token', { PATH: '/usr/bin' });

  assert.equal(env.PATH, '/usr/bin');
  assert.equal(env.GIT_TERMINAL_PROMPT, '0');
  assert.equal(env.GIT_CONFIG_COUNT, '1');
  assert.equal(env.GIT_CONFIG_KEY_0, 'http.https://github.com/.extraheader');
  assert.match(env.GIT_CONFIG_VALUE_0 ?? '', /^AUTHORIZATION: basic /);
  assert.equal(
    Buffer.from((env.GIT_CONFIG_VALUE_0 ?? '').replace(/^AUTHORIZATION: basic /, ''), 'base64').toString('utf8'),
    'x-access-token:gho_test-token',
  );
});

test('sanitizeGitHubRepoName strips unsafe characters and normalizes', () => {
  const safe = sanitizeGitHubRepoName('  My Cool__Repo!!! v2  ');
  assert.equal(safe, 'my-cool-repo-v2');

  const empty = sanitizeGitHubRepoName('...___---');
  assert.equal(empty, '');
});

test('repoNameFromIdeaTitle slugifies idea title', () => {
  assert.equal(repoNameFromIdeaTitle('Seedbank Project: Alpha/Beta'), 'seedbank-project-alpha-beta');
});

test('parseGitHubRepositoryReference accepts browser and git remote URLs', () => {
  assert.deepEqual(parseGitHubRepositoryReference('https://github.com/octocat/hello-world'), {
    owner: 'octocat',
    name: 'hello-world',
    repoUrl: 'https://github.com/octocat/hello-world',
  });

  assert.deepEqual(parseGitHubRepositoryReference('https://github.com/octocat/hello-world.git'), {
    owner: 'octocat',
    name: 'hello-world',
    repoUrl: 'https://github.com/octocat/hello-world',
    remoteUrl: 'https://github.com/octocat/hello-world.git',
  });

  assert.deepEqual(parseGitHubRepositoryReference('git@github.com:octocat/hello-world.git'), {
    owner: 'octocat',
    name: 'hello-world',
    repoUrl: 'https://github.com/octocat/hello-world',
    remoteUrl: 'git@github.com:octocat/hello-world.git',
  });

  assert.equal(parseGitHubRepositoryReference('https://example.com/octocat/hello-world'), null);
});

test('parseGitHubPublishRequest validates visibility and repo name', () => {
  assert.throws(
    () => parseGitHubPublishRequest({ visibility: 'friends-only', pushInitial: true }, 'fallback-name'),
    (error: unknown) => {
      assert.ok(error instanceof GitHubPublishError);
      assert.equal(error.statusCode, 400);
      assert.match(error.message, /visibility must be/i);
      return true;
    },
  );

  const request = parseGitHubPublishRequest(
    { repoName: ' Test Repo ', visibility: 'private', pushInitial: false },
    'fallback-name',
  );
  assert.equal(request.repoName, 'test-repo');
  assert.equal(request.visibility, 'private');
  assert.equal(request.pushInitial, false);
});

test('ensurePublishableIdea rejects ideas without graduated project path', () => {
  const idea = newIdea({
    id: 'idea-no-project',
    title: 'No project path',
    graduatedTo: null,
  });

  assert.throws(
    () => ensurePublishableIdea(idea),
    (error: unknown) => {
      assert.ok(error instanceof GitHubPublishError);
      assert.equal(error.statusCode, 400);
      assert.match(error.message, /has not been graduated/i);
      return true;
    },
  );
});

test('ensurePublishableIdea returns resolved path for graduated idea', () => {
  const idea = newIdea({
    id: 'idea-with-project',
    title: 'Has project path',
    graduatedTo: './tmp/project-path',
  });
  const resolved = ensurePublishableIdea(idea);
  assert.ok(resolved.projectPath.endsWith('/tmp/project-path') || resolved.projectPath.endsWith('\\tmp\\project-path'));
});
