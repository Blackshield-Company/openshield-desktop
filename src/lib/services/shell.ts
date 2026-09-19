/*
 * OpenShield Desktop — native shell bridge (Tauri IPC).
 *
 * M6 (design §8.1): desktop-only shell features that CANNOT go through
 * `openshield serve` because they belong to the local OS, not the backend:
 *  - autostart: systemd --user unit toggle (Linux)
 *
 * The backend client (backend.ts) stays pure fetch/WS — this module is the
 * ONLY place the frontend touches Tauri IPC, and only for shell features.
 * Every call is wrapped in try/catch returning a discriminated result, and
 * everything degrades gracefully outside the desktop shell (browser dev,
 * Pocket, vitest/jsdom) so the mock service layer keeps working.
 */

import type { Result } from "./backend";

export interface AutostartStatus {
  supported: boolean;
  enabled: boolean;
  unit_path: string;
}

/** True only inside the Tauri webview (desktop or Android). */
export function isTauriShell(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<Result<T>> {
  if (!isTauriShell()) {
    return { success: false, error: "Not running in the desktop shell." };
  }
  try {
    // Dynamic import keeps @tauri-apps/api out of the jsdom/browser graph
    // unless we are actually inside the shell.
    const { invoke } = await import("@tauri-apps/api/core");
    const data = await invoke<T>(cmd, args);
    return { success: true, data };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function getAutostart(): Promise<Result<AutostartStatus>> {
  return call<AutostartStatus>("autostart_status");
}

export async function setAutostart(enabled: boolean): Promise<Result<AutostartStatus>> {
  return call<AutostartStatus>("set_autostart", { enabled });
}
