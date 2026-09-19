/*
 * OpenShield Desktop — swarm service (M5).
 *
 * Owns the /swarm monitor state: GET /api/v1/swarm polls while the backend is
 * connected, and POST /api/v1/swarm/start|stop drives the engine. Every call
 * returns {success,error} — a dead server shows an error banner, never a
 * silent dead button. Control actions carry a busy flag that ALWAYS clears in
 * finally, so buttons re-enable even when the wire fails.
 *
 * Part of the Blackshield Company.
 */

import { get, writable } from "svelte/store";
import { controlSwarm as controlSwarmRequest, getSwarm, type Result } from "./backend";

// ── Model ────────────────────────────────────────────────────────────────

export interface SwarmAgentView {
  id: string;
  role: string;
  status: string;
  model: string | null;
  task: string | null;
}

export interface SwarmView {
  status: string;
  round: number | null;
  consensus: string | null;
  updatedAt: string | null;
  agents: SwarmAgentView[];
}

// ── Stores ───────────────────────────────────────────────────────────────

export const swarm = writable<SwarmView | null>(null);
export const swarmLoading = writable<boolean>(false);
/** Last poll/control error — surfaced as a dismissible in-page banner. */
export const swarmError = writable<string | null>(null);
/** Which control action is in flight ("start" | "stop") — drives busy labels. */
export const swarmActionBusy = writable<"start" | "stop" | null>(null);

// ── Actions ──────────────────────────────────────────────────────────────

/**
 * Poll the swarm report. Polls never stack: a refresh already in flight wins
 * so the 5s auto-refresh can't stampede the backend.
 */
export async function refreshSwarm(): Promise<Result<SwarmView | null>> {
  if (get(swarmLoading)) return { success: true, data: get(swarm) };
  swarmLoading.set(true);
  try {
    const r = await getSwarm();
    if (!r.success) {
      swarmError.set(r.error);
      return { success: false, error: r.error };
    }
    const view = normalizeSwarm(r.data);
    swarm.set(view);
    swarmError.set(null);
    return { success: true, data: view };
  } catch (e) {
    // Never leak — a malformed payload shows an error, not a dead screen.
    const err = e instanceof Error ? e.message : "Failed to load swarm status.";
    swarmError.set(err);
    return { success: false, error: err };
  } finally {
    swarmLoading.set(false);
  }
}

/** Start or stop the swarm engine, then re-poll so the UI reflects the flip. */
export async function controlSwarm(action: "start" | "stop"): Promise<Result<unknown>> {
  if (get(swarmActionBusy)) {
    return { success: false, error: "A control action is already in progress." };
  }
  swarmActionBusy.set(action);
  try {
    const r = await controlSwarmRequest(action);
    if (!r.success) {
      swarmError.set(r.error);
      return r;
    }
    swarmError.set(null);
    return await refreshSwarm();
  } finally {
    // Buttons re-enable no matter what happened on the wire.
    swarmActionBusy.set(null);
  }
}

// ── Normalizer (tolerant of REST shape drift) ────────────────────────────

export function normalizeSwarm(raw: unknown): SwarmView {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const agentsRaw = Array.isArray(obj.agents) ? obj.agents : [];

  const agents: SwarmAgentView[] = [];
  for (const item of agentsRaw) {
    if (!item || typeof item !== "object") continue;
    const a = item as Record<string, unknown>;
    const id = String(a.id ?? a.agent_id ?? "");
    if (!id) continue;
    agents.push({
      id,
      role: String(a.role ?? a.name ?? "agent"),
      status: String(a.status ?? "unknown"),
      model: typeof a.model === "string" && a.model ? a.model : null,
      task: typeof a.task === "string" && a.task ? a.task : null,
    });
  }

  const round = typeof obj.round === "number" ? obj.round : null;
  return {
    status: String(obj.status ?? "unknown"),
    round,
    consensus: typeof obj.consensus === "string" && obj.consensus ? obj.consensus : null,
    updatedAt: typeof obj.updated_at === "string" ? obj.updated_at : null,
    agents,
  };
}
