/**
 * Theme store.
 *
 * The theme lives on `document.documentElement[data-theme]` — that attribute is
 * the single source of truth every colour token in `globals.css` keys off.
 * React subscribes to it through `useSyncExternalStore` rather than mirroring it
 * in component state, which means there is no effect-driven catch-up render and
 * no possibility of the toggle disagreeing with what is actually painted.
 */

export type Theme = "dark" | "light";

export const THEME_STORAGE_KEY = "finhub-theme";

const listeners = new Set<() => void>();

function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

function getSnapshot(): Theme {
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

/** The server always renders the dark theme; the pre-paint script corrects it. */
function getServerSnapshot(): Theme {
  return "dark";
}

export const themeStore = { subscribe, getSnapshot, getServerSnapshot };

/** Apply a theme, persist the choice, and notify subscribers. */
export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Private browsing modes can reject storage writes; the theme still applies.
  }
  listeners.forEach((listener) => listener());
}

/**
 * Inline script injected before first paint so a stored light-theme preference
 * never flashes dark. Kept as a string because it must run before hydration.
 */
export const THEME_BOOTSTRAP_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t);}}catch(e){}})();`;
