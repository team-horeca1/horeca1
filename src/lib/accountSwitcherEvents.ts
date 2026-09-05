/** Dispatches a window event that BusinessAccountSwitcherDropdown listens for. */
export function openAccountSwitcher(): void {
  window.dispatchEvent(new CustomEvent('horeca:open-account-switcher'));
}

export const ACCOUNT_SWITCHER_OPEN_EVENT = 'horeca:open-account-switcher';
