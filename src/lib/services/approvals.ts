/*
 * OpenShield Desktop — approvals service (M3).
 *
 * The killer pincer. The L1–L4 guardrail engine raises `approval_req` over the
 * §4 WS envelope when a risky tool call needs a human, and blocks the call with
 * a timeout (default 120s, then deny). This service owns:
 *
 *  - the pending inbox + resolved history stores (badge count derives from the
 *    pending list and feeds the nav in both layouts)
 *  - WS dispatch (chat.ts routes approval_req / approval_res here BEFORE its
 *    foreign-session filter — an approval for another session still belongs
 *    in the inbox)
 *  - POST /api/v1/approvals/:id decisions ({decision: approve|reject|
 *    approve_always}), always returning {success,error} and never leaking
 *  - a 10s GET /api/v1/approvals poll as a fallback while the WS stream is
 *    down, so a disconnected banner never means a silently missed gate
 *  - client-side expiry sweep: a pending request that hits its deadline is
 *    recorded as "expired" (the server denies it too — timeout defaults to
 *    deny per design doc §6)
 *
 * Part of the Blackshield Company.
 */

import { browser } from "$app/environment";
import { derived, get, writable } from "svelte/store";
import {
  getApprovals,
  resolveApproval,
  wsStatus,
  type Result,
  type WsEnvelope,
} from "./backend";
import { mockMode, mockGetApprovals } from "./mock";

// ── Model ────────────────────────────────────────────────────────────────

export type ApprovalRisk = "low" | "medium" | "high" | "critical";

/** UI-level decisions; the wire uses approve/reject (see toWireDecision). */
export type ApprovalDecision = "approved" | "rejected" | "approve_always" | "expired";

export interface ApprovalRequest {
  id: string;
  risk: ApprovalRisk;
  tool: string;
  args: Record<string, unknown>;
  session: string;
  /** Epoch ms when the gate raised the request. */
  requestedAt: number;
  /** requestedAt + timeout (default 120s per §4/§6). */
  expiresAt: number;
}

export interface ResolvedApproval extends ApprovalRequest {
  decision: Exclude<ApprovalDecision, "pending">;
  resolvedAt: number;
}

export interface ApprovalToast {
  id: string;
  tool: string;
  risk: ApprovalRisk;
  session: string;
}

/** Server default per design doc §4: gate blocks with a 120s timeout, then deny. */
export const APPROVAL_TIMEOUT_MS = 120_000;

// ── Stores ───────────────────────────────────────────────────────────────

export const pendingApprovals = writable<ApprovalRequest[]>([]);
export const approvalHistory = writable<ResolvedApproval[]>([]);
/** Last decision/REST failure — surfaced as a dismissible in-page banner. */
export const approvalError = writable<string | null>(null);
/** 1s ticker driving countdowns and the expiry sweep. */
export const now = writable<number>(Date.now());
/** Pending count for the nav badge (rail + bottom nav read this). */
export const approvalBadge = derived(pendingApprovals, ($p) => $p.length);
/** Transient in-app toasts for fresh approval_req events. */
export const approvalToasts = writable<ApprovalToast[]>([]);

// ── Internal state ───────────────────────────────────────────────────────

let booted = false;
let tickTimer: ReturnType<typeof setInterval> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let toastSeq = 0;

// ── Envelope dispatch (called from chat.ts before session filtering) ─────

/**
 * Route an approval_req / approval_res envelope. Idempotent by request id:
 * reconnects and poll merges may deliver the same request twice.
 */
export function handleApprovalEnvelope(env: WsEnvelope): void {
  if (env.type === "approval_req") {
    const req = normalizeRequest(env);
    if (!req) return;
    const alreadyPending = get(pendingApprovals).some((a) => a.id === req.id);
    const alreadyResolved = get(approvalHistory).some((a) => a.id === req.id);
    if (alreadyPending || alreadyResolved) return;
    pendingApprovals.update((arr) => [...arr, req]);
    pushToast(req);
  } else if (env.type === "approval_res") {
    const data = (env.data ?? {}) as Record<string, unknown>;
    const id = String(data.id ?? "");
    if (!id) return;
    const decision = normalizeDecision(data.decision);
    settle(id, decision, Date.now());
  }
}

/** Move a pending request to history. Safe to call twice (POST + WS echo). */
function settle(id: string, decision: ApprovalDecision, at: number): void {
  const pending = get(pendingApprovals).find((a) => a.id === id);
  if (!pending) {
    // Unknown id (raised while we were away and settled server-side): record
    // a minimal entry so nothing the server decided goes missing.
    if (!get(approvalHistory).some((a) => a.id === id)) {
      approvalHistory.update((h) => [
        { id, risk: "high", tool: "unknown", args: {}, session: "", requestedAt: at, expiresAt: at, decision, resolvedAt: at },
        ...h,
      ]);
    }
    return;
  }
  pendingApprovals.update((arr) => arr.filter((a) => a.id !== id));
  if (get(approvalHistory).some((a) => a.id === id)) return;
  approvalHistory.update((h) => [{ ...pending, decision, resolvedAt: at }, ...h].slice(0, 50));
}

function normalizeRequest(env: WsEnvelope): ApprovalRequest | null {
  const data = (env.data ?? {}) as Record<string, unknown>;
  const id = String(data.id ?? "");
  if (!id) return null;
  const timeoutMs =
    typeof data.timeout_secs === "number" && data.timeout_secs > 0
      ? data.timeout_secs * 1000
      : APPROVAL_TIMEOUT_MS;
  const requestedAt = Date.now();
  return {
    id,
    risk: normalizeRisk(data.risk),
    tool: String(data.tool ?? data.name ?? "tool"),
    args: (data.args ?? {}) as Record<string, unknown>,
    session: typeof env.session === "string" ? env.session : "",
    requestedAt,
    expiresAt: requestedAt + timeoutMs,
  };
}

function normalizeRisk(raw: unknown): ApprovalRisk {
  const r = String(raw ?? "").toLowerCase();
  if (r === "critical") return "critical";
  if (r === "high") return "high";
  if (r === "medium" || r === "moderate") return "medium";
  return "low";
}

function normalizeDecision(raw: unknown): ApprovalDecision {
  const d = String(raw ?? "").toLowerCase();
  if (d.startsWith("approve_always")) return "approve_always";
  if (d.startsWith("approv")) return "approved";
  if (d.startsWith("expir") || d.startsWith("timeout")) return "expired";
  if (d.startsWith("deny") || d.startsWith("reject")) return "rejected";
  return "rejected";
}

// ── Decisions ────────────────────────────────────────────────────────────

function toWireDecision(d: Exclude<ApprovalDecision, "expired">): "approve" | "reject" | "approve_always" {
  return d === "approved" ? "approve" : d === "rejected" ? "reject" : "approve_always";
}

/**
 * Approve / reject / approve-always one request. Posts the decision, then
 * settles the inbox (idempotent — the mock also echoes approval_res, and the
 * live backend's WS broadcast does the same). A failed POST leaves the
 * request pending and surfaces the error; buttons re-enable in `finally`
 * at the call site.
 */
export async function decideApproval(
  id: string,
  decision: Exclude<ApprovalDecision, "expired">,
): Promise<Result<null>> {
  const req = get(pendingApprovals).find((a) => a.id === id);
  if (!req) return { success: false, error: "That request is no longer pending." };

  let r: Result<unknown>;
  try {
    r = await resolveApproval(id, toWireDecision(decision));
  } catch (e) {
    const err = e instanceof Error ? e.message : "Decision request failed.";
    approvalError.set(err);
    return { success: false, error: err };
  }
  if (!r.success) {
    approvalError.set(r.error);
    return { success: false, error: r.error };
  }
  settle(id, decision, Date.now());
  return { success: true, data: null };
}

// ── REST fallback polling (design doc §3.1) ─────────────────────────────

/**
 * GET /api/v1/approvals and merge anything we don't already track. Runs on
 * boot and then every 10s while the WS stream is down — a dead socket must
 * never mean a silently missed security gate.
 */
export async function refreshApprovals(): Promise<Result<number>> {
  let r: Result<unknown[]>;
  try {
    r = get(mockMode) ? { success: true, data: mockGetApprovals() } : await getApprovals();
  } catch (e) {
    const err = e instanceof Error ? e.message : "Failed to load approvals.";
    approvalError.set(err);
    return { success: false, error: err };
  }
  if (!r.success) {
    // Quiet on poll failures — the connection banner already tells the story;
    // don't spam the approvals page with noise while the backend is down.
    return { success: false, error: r.error };
  }

  const raw = r.data;
  const list = Array.isArray(raw) ? raw : [];
  let added = 0;
  try {
    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      const s = item as Record<string, unknown>;
      const id = String(s.id ?? "");
      if (!id) continue;
      if (get(pendingApprovals).some((a) => a.id === id)) continue;
      if (get(approvalHistory).some((a) => a.id === id)) continue;
      const timeoutMs =
        typeof s.timeout_secs === "number" && s.timeout_secs > 0 ? s.timeout_secs * 1000 : APPROVAL_TIMEOUT_MS;
      const requestedMs = Date.parse(
        String(s.requested_at ?? s.requestedAt ?? s.created_at ?? ""),
      );
      const requestedAt = Number.isNaN(requestedMs) ? Date.now() : requestedMs;
      const req: ApprovalRequest = {
        id,
        risk: normalizeRisk(s.risk),
        tool: String(s.tool ?? s.name ?? "tool"),
        args: (s.args ?? {}) as Record<string, unknown>,
        session: String(s.session ?? s.session_id ?? ""),
        requestedAt,
        expiresAt: requestedAt + timeoutMs,
      };
      pendingApprovals.update((arr) => [...arr, req]);
      pushToast(req);
      added += 1;
    }
  } catch (e) {
    const err = e instanceof Error ? e.message : "Malformed approvals payload.";
    approvalError.set(err);
    return { success: false, error: err };
  }
  return { success: true, data: added };
}

// ── Expiry sweep + toasts ────────────────────────────────────────────────

function sweepExpired(): void {
  const t = get(now);
  for (const a of get(pendingApprovals)) {
    if (t >= a.expiresAt) settle(a.id, "expired", t);
  }
}

function pushToast(req: ApprovalRequest): void {
  toastSeq += 1;
  const toast: ApprovalToast = { id: `toast-${toastSeq}`, tool: req.tool, risk: req.risk, session: req.session };
  approvalToasts.update((arr) => [...arr, toast].slice(-3));
  // Auto-dismiss — the inbox is the source of truth, toasts are just a tap on
  // the shoulder. Timers are best-effort; beforeunload cleans up the rest.
  setTimeout(() => dismissToast(toast.id), 10_000);
}

export function dismissToast(id: string): void {
  approvalToasts.update((arr) => arr.filter((t) => t.id !== id));
}

// ── Bootstrap ────────────────────────────────────────────────────────────

/**
 * Boot the approvals inbox from the root layout — background only, never
 * blocks first paint. Idempotent.
 */
export function initApprovals(): void {
  if (!browser || booted) return;
  booted = true;
  // 1s ticker: drives countdowns, sweeps expired pendings into history.
  tickTimer = setInterval(() => {
    now.set(Date.now());
    sweepExpired();
  }, 1000);
  // Initial sync catches requests raised while the app was closed.
  void refreshApprovals();
  // 10s fallback poll, only meaningful while the WS stream is down.
  pollTimer = setInterval(() => {
    if (get(wsStatus) !== "connected") void refreshApprovals();
  }, 10_000);
  if (typeof window !== "undefined") {
    window.addEventListener("beforeunload", () => {
      if (tickTimer) clearInterval(tickTimer);
      if (pollTimer) clearInterval(pollTimer);
    });
  }
}
