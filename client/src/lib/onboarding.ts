const ONBOARDING_STORAGE_KEY = 'seedbank.onboarding.v1.dismissed';

export const ONBOARDING_OPEN_EVENT = 'seedbank:onboarding-open';

export function hasDismissedOnboarding(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function dismissOnboarding(): void {
  try {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, 'true');
  } catch {
    // Ignore storage failures; the modal should never block app usage.
  }
}

export function resetOnboarding(): void {
  try {
    localStorage.removeItem(ONBOARDING_STORAGE_KEY);
  } catch {
    // Ignore storage failures; manual testing can still open the modal.
  }
}

export function requestOnboardingOpen(): void {
  window.dispatchEvent(new Event(ONBOARDING_OPEN_EVENT));
}
