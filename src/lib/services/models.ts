/*
 * OpenShield Desktop — model registry + per-session picker state (M5).
 *
 * GET /api/v1/models feeds the compact picker on /chat, grouped by provider.
 * The selection is a PER-SESSION override: it persists to localStorage under
 * `openshield.model.<sessionId>` and rides the optional `model` field of the
 * §4 inbound chat frame. It never touches global config — clearing a session's
 * picker restores the server's configured default.
 *
 * Part of the Blackshield Company.
 */

import { browser } from "$app/environment";
import { get, writable } from "svelte/store";
import { getModels, type Result } from "./backend";

// ── Model ────────────────────────────────────────────────────────────────

export interface ModelOption {
  /** Exact-match router name — the value sent as the chat frame's `model`. */
  id: string;
  label: string;
}

export interface ModelGroup {
  provider: string;
  models: ModelOption[];
}

// ── Stores ───────────────────────────────────────────────────────────────

export const modelGroups = writable<ModelGroup[]>([]);
export const modelsLoading = writable<boolean>(false);
/** Last load error — the picker shows a ⚠ instead of dying. */
export const modelsError = writable<string | null>(null);
/** sessionId → chosen model id. Absent key = the server's default. */
export const sessionModels = writable<Record<string, string>>({});

const MODEL_KEY_PREFIX = "openshield.model.";

// ── Actions ──────────────────────────────────────────────────────────────

/** Fetch + normalize the provider/model registry (GET /api/v1/models). */
export async function loadModels(): Promise<Result<ModelGroup[]>> {
  modelsLoading.set(true);
  try {
    const r = await getModels();
    if (!r.success) {
      modelsError.set(r.error);
      return { success: false, error: r.error };
    }
    const groups = normalizeModels(r.data);
    modelGroups.set(groups);
    modelsError.set(null);
    return { success: true, data: groups };
  } catch (e) {
    const err = e instanceof Error ? e.message : "Failed to load models.";
    modelsError.set(err);
    return { success: false, error: err };
  } finally {
    modelsLoading.set(false);
  }
}

/** The selected override for a session, or null = server default. */
export function selectedModelFor(sessionId: string | null): string | null {
  if (!sessionId) return null;
  const fromStore = get(sessionModels)[sessionId];
  if (fromStore) return fromStore;
  if (browser) {
    try {
      const stored = localStorage.getItem(MODEL_KEY_PREFIX + sessionId);
      if (stored) {
        sessionModels.update((m) => ({ ...m, [sessionId]: stored }));
        return stored;
      }
    } catch {
      /* storage unavailable — override just won't persist */
    }
  }
  return null;
}

/**
 * Set (or clear, with null) a session's model override. Updates the reactive
 * store and localStorage together so a remounted picker sees the same pick.
 */
export function selectModel(sessionId: string | null, modelId: string | null): void {
  if (!sessionId) return;
  sessionModels.update((m) => {
    const next = { ...m };
    if (modelId) next[sessionId] = modelId;
    else delete next[sessionId];
    return next;
  });
  if (browser) {
    try {
      if (modelId) localStorage.setItem(MODEL_KEY_PREFIX + sessionId, modelId);
      else localStorage.removeItem(MODEL_KEY_PREFIX + sessionId);
    } catch {
      /* storage unavailable — the store still carries the pick for now */
    }
  }
}

// ── Normalizer (tolerant of REST shape drift) ────────────────────────────

export function normalizeModels(raw: unknown): ModelGroup[] {
  // Canonical shape: {providers: [{name, models: [{id,label}]}]}. Tolerates
  // bare arrays of groups, string-only model lists, and flat string arrays.
  let groupsRaw: unknown[] = [];
  if (Array.isArray(raw)) {
    groupsRaw = raw;
  } else if (raw && typeof raw === "object" && Array.isArray((raw as Record<string, unknown>).providers)) {
    groupsRaw = (raw as { providers: unknown[] }).providers;
  }

  const groups: ModelGroup[] = [];
  for (const g of groupsRaw) {
    if (!g || typeof g !== "object") continue;
    const gr = g as Record<string, unknown>;
    const provider = String(gr.name ?? gr.provider ?? "models");
    const modelsRaw = Array.isArray(gr.models) ? gr.models : [];

    const models: ModelOption[] = [];
    for (const m of modelsRaw) {
      if (typeof m === "string" && m) {
        models.push({ id: m, label: m });
      } else if (m && typeof m === "object") {
        const mo = m as Record<string, unknown>;
        const id = String(mo.id ?? mo.name ?? "");
        if (!id) continue;
        models.push({ id, label: typeof mo.label === "string" && mo.label ? mo.label : id });
      }
    }
    if (models.length > 0) groups.push({ provider, models });
  }

  // Flat string array fallback: one synthetic group.
  if (groups.length === 0 && Array.isArray(raw)) {
    const flat = raw.filter((m): m is string => typeof m === "string" && m.length > 0);
    if (flat.length > 0) {
      groups.push({ provider: "models", models: flat.map((id) => ({ id, label: id })) });
    }
  }
  return groups;
}
