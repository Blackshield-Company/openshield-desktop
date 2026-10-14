/*
 * OpenShield Desktop — backend client (REST + WS) for `openshield serve`.
 *
 * Contract (design doc §3.1 / §4): the app talks to an existing axum REST +
 * WebSocket server, default 127.0.0.1:9310. The client connects in the
 * BACKGROUND and NEVER blocks first render. Every call is wrapped in
 * try/catch and returns a discriminated result so UI code stays simple and
 * buttons can manage loading states without leaking exceptions.
 *
 * Hard rules honored here:
 *  - No LAN subnet scanning. Ever. 127.0.0.1 / configured host only.
 *  - 127.0.0.1/localhost hosts fast-fail (short timeout, mobile-safe).
 *  - A bearer token is required on every host, including localhost.
 *    HTTP always sends Authorization: Bearer <token>. WS upgrades send ?token=.
 *    A 401 raises needsPairing so the UI can re-pair.
 */

import { browser } from "$app/environment";
import { writable, derived, get } from "svelte/store";
import {
  mockMode,
  mockHealth,
  mockSessionsList,
  mockSessionHistory,
  mockOpenSocket,
  mockGetApprovals,
  mockResolveApproval,
  mockGetSwarm,
  mockControlSwarm,
  mockSearchMemory,
  mockGetModels,
} from "./mock";
import { loadConnection, persistConnection } from "./storage";
import { isTauriShell, readLocalToken } from "./shell";

// ── Types ────────────────────────────────────────────────────────────────

export interface BackendConfig {
  host: string;
  port: number;
  token: string;
}

export type Result<T> =
  | { success: true; data: T }
  | { success: false; error: string };

export type ConnectionStatus = "disconnected" | "connecting" | "connected";

export interface HealthReport {
  status?: string;
  version?: string;
  model?: string;
  [key: string]: unknown;
}

export interface DoctorComponent {
  name: string;
  status: "ok" | "warn" | "err";
  detail: string;
}

export interface DoctorReport {
  generated_at?: string;
  components: DoctorComponent[];
}

export interface WsEnvelope {
  type: string;
  session?: string;
  /** Server→client frames carry their payload here (may be absent inbound). */
  data?: Record<string, unknown>;
  /** Inbound chat frames: {type:"chat", session, message}. */
  message?: string;
  /**
   * Inbound chat frames only (§4): optional per-turn model override — exact
   * router name from GET /api/v1/models. Absent = the server's configured
   * default. Never persisted to global config.
   */
  model?: string;
}

/** One agent in the swarm pool (GET /api/v1/swarm → agents[]). */
export interface SwarmAgentInfo {
  id: string;
  role: string;
  status: string;
  model?: string;
  task?: string;
}

/** GET /api/v1/swarm — engine state + pool + consensus doc. */
export interface SwarmReport {
  status: string;
  round?: number;
  consensus?: string;
  updated_at?: string;
  agents: SwarmAgentInfo[];
}

/** One hit from GET /api/v1/memory/search?q=. */
export interface MemoryHit {
  id: string;
  session?: string;
  project?: string;
  timestamp?: string;
  snippet: string;
  /** Relevance score — 0..1 when present (also tolerates 0..100). */
  score?: number;
}

/** One routable model from GET /api/v1/models (exact-match router name). */
export interface ModelInfo {
  id: string;
  label?: string;
  provider?: string;
}

// ── Defaults ─────────────────────────────────────────────────────────────

export const DEFAULT_HOST = "127.0.0.1";
export const DEFAULT_PORT = 9310;

export const UNAUTHORIZED_ERROR = "Unauthorized — re-pair with your OpenShield server";
export const PAIR_RATE_LIMIT_ERROR = "Too many pairing attempts, wait a minute";
export const TOKEN_REQUIRED_ERROR = "A bearer token is required.";

const LOCAL_TIMEOUT_MS = 1500;

function defaultConfig(): BackendConfig {
  return { host: DEFAULT_HOST, port: DEFAULT_PORT, token: "" };
}

function isLocalHost(host: string): boolean {
  const h = host.trim().toLowerCase();
  return h === "127.0.0.1" || h === "localhost" || h === "::1" || h === "[::1]";
}

function isAndroidShell(): boolean {
  return typeof navigator !== "undefined" && /android/i.test(navigator.userAgent);
}

/** Desktop Tauri only — Pocket has no read_local_token command. */
function canReadDesktopToken(): boolean {
  return isTauriShell() && !isAndroidShell();
}

// ── Stores ───────────────────────────────────────────────────────────────

export const config = writable<BackendConfig>(defaultConfig());
export const status = writable<ConnectionStatus>("disconnected");
export const lastError = writable<string | null>(null);

/**
 * True once a connection record exists in persistent storage (plugin-store
 * on Tauri, localStorage in browser dev). Pocket's first-render routing
 * keys off this: no saved connection → land on /settings to pair, not on a
 * dead chat screen.
 */
export const hasSavedConnection = writable<boolean>(false);

/** True once we have a confirmed /api/v1/health round-trip. */
export const connected = derived(status, ($s) => $s === "connected");

/**
 * Lifecycle of the /ws/v1/chat stream, tracked separately from the REST
 * health probe so the banner can flag a dead stream while REST is fine.
 * Owned by the chat service; updated on open/close/retry.
 */
export const wsStatus = writable<ConnectionStatus>("disconnected");

/**
 * Set when the server rejects the bearer token (HTTP 401), or the chat
 * socket drops right after a 401 health check. Cleared by a successful
 * authorized response or a new saveConfig.
 */
export const needsPairing = writable<boolean>(false);

/** Last /api/v1/health was 401 — a following WS close/fail is an auth failure. */
let healthUnauthorized = false;

function markUnauthorized(path: string): void {
  needsPairing.set(true);
  if (path === "/api/v1/health" || path.startsWith("/api/v1/health?")) {
    healthUnauthorized = true;
  }
}

function clearAuthFailure(): void {
  needsPairing.set(false);
  healthUnauthorized = false;
}

function markWsAuthFailure(): void {
  if (healthUnauthorized) needsPairing.set(true);
}

export function saveConfig(next: BackendConfig): Result<null> {
  const host = next.host.trim();
  if (!host) return { success: false, error: "Host is required." };
  if (!/^[a-zA-Z0-9.\-]+$/.test(host) && !/^\[[0-9a-fA-F:]+\]$/.test(host)) {
    return { success: false, error: "Host looks invalid (use an IP or hostname)." };
  }
  if (!Number.isInteger(next.port) || next.port < 1 || next.port > 65535) {
    return { success: false, error: "Port must be an integer between 1 and 65535." };
  }
  if (!next.token.trim()) {
    return { success: false, error: TOKEN_REQUIRED_ERROR };
  }
  const clean: BackendConfig = { host, port: next.port, token: next.token.trim() };
  config.set(clean);
  hasSavedConnection.set(true);
  clearAuthFailure();
  // Persist via tauri-plugin-store (Tauri) / localStorage (browser dev).
  void persistConnection(clean);
  // Kick a background reconnect with the new target — never blocks the UI.
  void checkHealth();
  return { success: true, data: null };
}

/**
 * Desktop convenience: if the target is loopback and no token is saved, read
 * ~/.config/openshield/desktop.token. No-op outside the desktop shell.
 */
export async function maybeFillLocalToken(): Promise<void> {
  const c = get(config);
  if (!isLocalHost(c.host) || c.token.trim() || !canReadDesktopToken()) return;
  const read = await readLocalToken();
  if (!read.success) return;
  const token = read.data?.trim() ?? "";
  if (!token) return;
  const next: BackendConfig = { ...c, token };
  config.set(next);
  hasSavedConnection.set(true);
  void persistConnection(next);
}

/** Banner action: load the desktop token file and save it as the bearer token. */
export async function useLocalToken(): Promise<Result<null>> {
  if (!canReadDesktopToken()) {
    return { success: false, error: "Local token is only available in the desktop app." };
  }
  const read = await readLocalToken();
  if (!read.success) return { success: false, error: read.error };
  const token = read.data?.trim() ?? "";
  if (!token) {
    return { success: false, error: "No token found in ~/.config/openshield/desktop.token." };
  }
  return saveConfig({ ...get(config), token });
}

// ── HTTP helpers ─────────────────────────────────────────────────────────

function baseHttp(c: BackendConfig): string {
  return `http://${c.host}:${c.port}`;
}

function baseWs(c: BackendConfig): string {
  return `ws://${c.host}:${c.port}`;
}

function authHeaders(c: BackendConfig): Record<string, string> {
  return {
    Accept: "application/json",
    Authorization: `Bearer ${c.token}`,
  };
}

export async function request<T>(path: string, init?: RequestInit): Promise<Result<T>> {
  const c = get(config);
  try {
    const res = await fetch(`${baseHttp(c)}${path}`, {
      ...init,
      headers: { ...(init?.headers ?? {}), ...authHeaders(c) },
      // Fast-fail on loopback — never leave the user staring at a spinner.
      signal: AbortSignal.timeout(isLocalHost(c.host) ? LOCAL_TIMEOUT_MS : 8000),
    });
    if (res.status === 401) {
      markUnauthorized(path);
      return { success: false, error: UNAUTHORIZED_ERROR };
    }
    if (res.status === 429) {
      return { success: false, error: PAIR_RATE_LIMIT_ERROR };
    }
    if (!res.ok) {
      return { success: false, error: `HTTP ${res.status} from ${path}` };
    }
    clearAuthFailure();
    const data = (await res.json()) as T;
    return { success: true, data };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Network request failed",
    };
  }
}

// ── Public API (design doc §3.1) ─────────────────────────────────────────

export async function checkHealth(): Promise<Result<HealthReport>> {
  status.set("connecting");
  if (get(mockMode)) {
    status.set("connected");
    lastError.set(null);
    clearAuthFailure();
    return { success: true, data: mockHealth() };
  }
  const r = await request<HealthReport>("/api/v1/health");
  if (r.success) {
    status.set("connected");
    lastError.set(null);
  } else {
    status.set("disconnected");
    lastError.set(r.error);
  }
  return r;
}

export async function getDoctor(): Promise<Result<DoctorReport>> {
  return request<DoctorReport>("/api/v1/doctor");
}

export async function fixDoctor(): Promise<Result<unknown>> {
  return request<unknown>("/api/v1/doctor/fix", { method: "POST" });
}

export async function getSessions(): Promise<Result<unknown[]>> {
  if (get(mockMode)) return { success: true, data: mockSessionsList() };
  return request<unknown[]>("/api/v1/sessions");
}

/** Full message history for one session (used by /chat resume). */
export async function getSessionHistory(id: string): Promise<Result<unknown>> {
  if (get(mockMode)) {
    const history = mockSessionHistory(id);
    if (history === null) return { success: false, error: `Session ${id} not found.` };
    return { success: true, data: history };
  }
  return request<unknown>(`/api/v1/sessions/${encodeURIComponent(id)}`);
}

export async function getApprovals(): Promise<Result<unknown[]>> {
  if (get(mockMode)) return { success: true, data: mockGetApprovals() };
  return request<unknown[]>("/api/v1/approvals");
}

/** Wire decisions per §3.1: approve | reject | approve_always. */
export type WireDecision = "approve" | "reject" | "approve_always";

export async function resolveApproval(
  id: string,
  decision: WireDecision,
): Promise<Result<unknown>> {
  if (get(mockMode)) {
    const r = mockResolveApproval(id, decision);
    return r.ok ? { success: true, data: r } : { success: false, error: r.error ?? "mock decision failed" };
  }
  return request<unknown>(`/api/v1/approvals/${encodeURIComponent(id)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ decision }),
  });
}

export async function getSwarm(): Promise<Result<unknown>> {
  if (get(mockMode)) return { success: true, data: mockGetSwarm() };
  return request<unknown>("/api/v1/swarm");
}

/**
 * Swarm engine control (M5 monitor start/stop buttons). The design doc §3.1
 * fixes GET /api/v1/swarm; start/stop ride the natural POST sub-paths.
 * Mock mode flips the in-memory demo engine instead.
 */
export async function controlSwarm(action: "start" | "stop"): Promise<Result<unknown>> {
  if (get(mockMode)) {
    const r = mockControlSwarm(action);
    return r.ok ? { success: true, data: r } : { success: false, error: r.error ?? "mock control failed" };
  }
  return request<unknown>(`/api/v1/swarm/${action}`, { method: "POST" });
}

export async function getMemory(q = ""): Promise<Result<unknown>> {
  if (get(mockMode)) return { success: true, data: mockSearchMemory(q) };
  const qs = q ? `?q=${encodeURIComponent(q)}` : "";
  return request<unknown>(`/api/v1/memory/search${qs}`);
}

export async function getModels(): Promise<Result<unknown>> {
  if (get(mockMode)) return { success: true, data: mockGetModels() };
  return request<unknown>("/api/v1/models");
}

export async function pairDevice(): Promise<Result<unknown>> {
  return request<unknown>("/api/v1/pair", { method: "POST" });
}

// ── WebSocket (design doc §4 envelope) ───────────────────────────────────

export type WsHandler = (env: WsEnvelope) => void;

export interface SocketHandlers {
  onOpen?: () => void;
  onClose?: () => void;
}

export interface ChatSocket {
  close: () => void;
  send: (env: WsEnvelope) => void;
}

/**
 * Open a WS stream against `openshield serve`. Caller owns the lifecycle;
 * close() tears it down. Events arrive as typed WsEnvelope records.
 *
 * When demo mode (mock) is on this returns an in-memory scripted socket with
 * an identical interface, so callers never care which backend is live.
 *
 * handlers.onOpen fires once the stream is usable; handlers.onClose fires on
 * any terminal close (network drop, server gone, close() called) so the
 * caller can drive its own reconnect policy.
 */
export function openSocket(
  path: string,
  onEvent: WsHandler,
  handlers?: SocketHandlers,
): ChatSocket {
  if (get(mockMode)) return mockOpenSocket(onEvent, handlers);
  const c = get(config);
  let ws: WebSocket | null = null;
  try {
    const sep = path.includes("?") ? "&" : "?";
    const url = `${baseWs(c)}${path}${sep}token=${encodeURIComponent(c.token)}`;
    ws = new WebSocket(url);
    ws.onopen = () => handlers?.onOpen?.();
    ws.onerror = () => markWsAuthFailure();
    ws.onclose = () => {
      markWsAuthFailure();
      handlers?.onClose?.();
    };
    ws.onmessage = (ev) => {
      try {
        onEvent(JSON.parse(String(ev.data)) as WsEnvelope);
      } catch {
        /* malformed frame — ignore, stream continues */
      }
    };
  } catch {
    ws = null;
  }
  if (!ws) {
    // Construction failed synchronously — report as a close so the caller's
    // reconnect/backoff logic kicks in instead of stalling on "connecting".
    markWsAuthFailure();
    handlers?.onClose?.();
  }
  return {
    close: () => {
      try {
        ws?.close();
      } catch {
        /* already closed */
      }
    },
    send: (env) => {
      try {
        ws?.send(JSON.stringify(env));
      } catch {
        /* socket not open — drop */
      }
    },
  };
}

// ── Background bootstrap ─────────────────────────────────────────────────

let booted = false;

/**
 * Fire-and-forget background health check. Called once from the root layout
 * so the first paint is NEVER gated on the backend being reachable.
 *
 * Storage hydration is async (plugin-store), so it runs first: a saved
 * pairing record replaces the defaults, THEN the health probe fires against
 * the real target. A local host with an empty token tries the desktop token
 * file before that probe.
 */
export function initBackend(): void {
  if (!browser || booted) return;
  booted = true;
  void (async () => {
    const stored = await loadConnection();
    if (stored) {
      config.set(stored);
      hasSavedConnection.set(true);
    }
    await maybeFillLocalToken();
    void checkHealth();
  })();
  // Gentle auto-retry while disconnected — keeps the banner honest.
  const timer = setInterval(() => {
    if (get(status) === "disconnected") void checkHealth();
  }, 15000);
  // Don't hold the page open for the timer in odd embed contexts.
  if (typeof window !== "undefined") {
    window.addEventListener("beforeunload", () => clearInterval(timer));
  }
}
