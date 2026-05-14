export type AccountAuthProvider = 'claude-account' | 'codex-account';

const STORAGE_PREFIX = 'seedbank:account-auth-seen:';

export function rememberAccountAuth(provider: AccountAuthProvider) {
  window.localStorage.setItem(`${STORAGE_PREFIX}${provider}`, 'true');
}

export function forgetAccountAuth(provider: AccountAuthProvider) {
  window.localStorage.removeItem(`${STORAGE_PREFIX}${provider}`);
}

export function hasRememberedAccountAuth(provider: AccountAuthProvider) {
  return window.localStorage.getItem(`${STORAGE_PREFIX}${provider}`) === 'true';
}
