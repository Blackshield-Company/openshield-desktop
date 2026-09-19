import { browser } from "$app/environment";
import { writable } from "svelte/store";

export type ThemeId = "blackshield" | "synthwave84";

export interface ThemeMeta {
  id: ThemeId;
  label: string;
  swatches: string[];
}

export const THEMES: ThemeMeta[] = [
  {
    id: "blackshield",
    label: "Blackshield",
    swatches: ["#101014", "#8F959C", "#C1121F", "#D8D3C8"],
  },
  {
    id: "synthwave84",
    label: "Synthwave '84",
    swatches: ["#240037", "#8F00FF", "#FF7EDB", "#F3E70F"],
  },
];

const STORAGE_KEY = "openshield.theme";

function initialTheme(): ThemeId {
  if (!browser) return "blackshield";
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "blackshield" || stored === "synthwave84") return stored;
  return "blackshield";
}

function applyToDom(theme: ThemeId) {
  if (!browser) return;
  document.documentElement.dataset.theme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "blackshield" ? "#101014" : "#240037");
}

export const theme = writable<ThemeId>(initialTheme());

if (browser) {
  applyToDom(initialTheme());
  theme.subscribe((t) => {
    applyToDom(t);
    try {
      localStorage.setItem(STORAGE_KEY, t);
    } catch {
      /* storage unavailable — theme just won't persist */
    }
  });
}

export function setTheme(t: ThemeId) {
  theme.set(t);
}
