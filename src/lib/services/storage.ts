/*
 * OpenShield Desktop — connection credential storage (M4).
 *
 * Persists the {host, port, token} connection record the pairing flow
 * produces (design doc §3.3). Two backends, one interface:
 *
 *  - Tauri shell (desktop AND Android): tauri-plugin-store, which writes to
 *    the app's private data dir. On Android that storage is app-private —
 *    other apps can't read it, and it dies with the uninstall.
 *  - Browser dev (no Tauri runtime): localStorage fallback so the pairing
 *    flow is testable under `vite dev` exactly as it ships.
 *
 * SECURITY (design doc §6): v0.1 stores the bearer token in app-private
 * storage. The v0.2 hardening is keystore-backed storage — Android Keystore
 * via a stronghold plugin on Pocket, OS keychain on desktop — so the token
 * survives backups only encrypted at rest. Do NOT regress this comment
 * when wiring the plugin; the keystore work is a tracked hardening item.
 *
 * All functions are async and never throw — a storage failure must degrade
 * to "no saved connection", never a dead screen.
 */

import { browser } from "$app/environment";
import type { BackendConfig } from "./backend";

export interface StoredConnection {
  host: string;
  port: number;
  token: string;
}

export const CONFIG_KEY = "openshield.backend";

// True when running inside the Tauri webview (desktop or Android shell).
// The plugin-store import is dynamic so browser dev never pulls Tauri code.
function inTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function sanitize(raw: unknown): StoredConnection | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.host !== "string" || !o.host) return null;
  if (typeof o.port !== "number" || !Number.isInteger(o.port) || o.port < 1 || o.port > 65535) {
    return null;
  }
  if (typeof o.token !== "string") return null;
  return { host: o.host, port: o.port, token: o.token };
}

async function loadViaPlugin(): Promise<StoredConnection | null> {
  const { load } = await import("@tauri-apps/plugin-store");
  const store = await load(CONFIG_KEY);
  const raw = await store.get<unknown>(CONFIG_KEY);
  await store.close();
  return sanitize(raw);
}

function loadViaLocalStorage(): StoredConnection | null {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return null;
    return sanitize(JSON.parse(raw));
  } catch {
    return null;
  }
}

// ── Public API ───────────────────────────────────────────────────────────

let cached: Promise<StoredConnection | null> | null = null;

/**
 * Load the saved connection (null = never saved / unreadable). Cached after
 * the first call; `persistConnection` keeps the cache warm.
 */
export function loadConnection(): Promise<StoredConnection | null> {
  if (!browser) return Promise.resolve(null);
  cached ??= inTauri()
    ? loadViaPlugin().catch(() => null)
    : Promise.resolve(loadViaLocalStorage());
  return cached;
}

/** Force a re-read (e.g. after an external write). Rarely needed. */
export function reloadConnection(): Promise<StoredConnection | null> {
  cached = null;
  return loadConnection();
}

export async function persistConnection(next: BackendConfig): Promise<void> {
  if (!browser) return;
  const record: StoredConnection = {
    host: next.host,
    port: next.port,
    token: next.token,
  };
  if (inTauri()) {
    try {
      const { load } = await import("@tauri-apps/plugin-store");
      const store = await load(CONFIG_KEY);
      await store.set(CONFIG_KEY, record);
      await store.save();
      await store.close();
    } catch {
      /* app-private store unavailable — keep the in-memory value only */
    }
  } else {
    try {
      localStorage.setItem(CONFIG_KEY, JSON.stringify(record));
    } catch {
      /* non-fatal */
    }
  }
  cached = Promise.resolve(record);
}
