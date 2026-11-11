export const SIDEBAR_STORAGE_KEY = "folio.sidebar";
const CHANGE_EVENT = "folio:sidebar-change";

type PreferenceStorage = Pick<Storage, "getItem" | "setItem">;

function browserStorage(): PreferenceStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Only the exact stored value "collapsed" collapses the sidebar; anything else means expanded. */
export function readSidebarCollapsed(storage: PreferenceStorage | null = browserStorage()): boolean {
  try {
    return storage?.getItem(SIDEBAR_STORAGE_KEY) === "collapsed";
  } catch {
    return false;
  }
}

export function writeSidebarCollapsed(
  collapsed: boolean,
  storage: PreferenceStorage | null = browserStorage(),
): void {
  try {
    storage?.setItem(SIDEBAR_STORAGE_KEY, collapsed ? "collapsed" : "expanded");
  } catch {
    // Storage can be unavailable (private mode, quota); the toggle still works for this page.
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function subscribeToSidebarPreference(onChange: () => void): () => void {
  function handleStorage(event: StorageEvent) {
    if (event.key === SIDEBAR_STORAGE_KEY) onChange();
  }
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", handleStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", handleStorage);
  };
}
