/*
 * OpenShield Desktop — memory service (M5).
 *
 * Backs the /memory browser: GET /api/v1/memory/search?q= (design doc §3.1).
 * The page debounces keystrokes through queueMemorySearch; direct calls (the
 * initial "recent entries" load, explicit submit) go through searchMemory and
 * cancel any queued debounce so results never arrive out of order.
 *
 * Part of the Blackshield Company.
 */

import { writable } from "svelte/store";
import { getMemory, type Result } from "./backend";

// ── Model ────────────────────────────────────────────────────────────────

export interface MemoryEntryView {
  id: string;
  session: string | null;
  project: string | null;
  timestamp: string | null;
  snippet: string;
  /** Relevance 0..1 (backend may ship 0..100 — normalized on view). */
  score: number | null;
}

// ── Stores ───────────────────────────────────────────────────────────────

export const memoryEntries = writable<MemoryEntryView[]>([]);
export const memoryLoading = writable<boolean>(false);
/** Last search error — surfaced as a dismissible in-page banner. */
export const memoryError = writable<string | null>(null);
/** True once any search has resolved — separates "no results" from "not yet loaded". */
export const memoryLoaded = writable<boolean>(false);

let searchTimer: ReturnType<typeof setTimeout> | null = null;

// ── Actions ──────────────────────────────────────────────────────────────

/** Run a search now (cancels any queued debounce). Returns {success,error}. */
export async function searchMemory(q: string): Promise<Result<MemoryEntryView[]>> {
  if (searchTimer) {
    clearTimeout(searchTimer);
    searchTimer = null;
  }
  memoryLoading.set(true);
  try {
    const r = await getMemory(q);
    if (!r.success) {
      memoryError.set(r.error);
      return { success: false, error: r.error };
    }
    const entries = normalizeMemory(r.data);
    memoryEntries.set(entries);
    memoryError.set(null);
    memoryLoaded.set(true);
    return { success: true, data: entries };
  } catch (e) {
    const err = e instanceof Error ? e.message : "Memory search failed.";
    memoryError.set(err);
    return { success: false, error: err };
  } finally {
    memoryLoading.set(false);
  }
}

/**
 * Debounced search for live keystrokes. Each call resets the timer — the
 * backend only sees the query once the user stops typing for `debounceMs`.
 */
export function queueMemorySearch(q: string, debounceMs = 250): void {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    searchTimer = null;
    void searchMemory(q);
  }, debounceMs);
}

// ── Normalizer (tolerant of REST shape drift) ────────────────────────────

export function normalizeMemory(raw: unknown): MemoryEntryView[] {
  // Tolerate a bare array, {results: []}, {entries: []}, or {hits: []}.
  let list: unknown[] = [];
  if (Array.isArray(raw)) {
    list = raw;
  } else if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    const candidate = obj.results ?? obj.entries ?? obj.hits ?? obj.items;
    if (Array.isArray(candidate)) list = candidate;
  }

  const out: MemoryEntryView[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const m = item as Record<string, unknown>;
    const id = String(m.id ?? m.memory_id ?? "");
    const snippet =
      typeof m.snippet === "string"
        ? m.snippet
        : typeof m.text === "string"
          ? m.text
          : typeof m.content === "string"
            ? m.content
            : "";
    if (!id || !snippet) continue;
    const rawScore = typeof m.score === "number" ? m.score : null;
    out.push({
      id,
      session: typeof m.session === "string" && m.session ? m.session : null,
      project: typeof m.project === "string" && m.project ? m.project : null,
      timestamp: typeof m.timestamp === "string" ? m.timestamp : typeof m.created_at === "string" ? m.created_at : null,
      snippet,
      // Some backends ship 0..100 already; fold everything into 0..1.
      score: rawScore === null ? null : rawScore > 1 ? rawScore / 100 : rawScore,
    });
  }
  return out;
}
