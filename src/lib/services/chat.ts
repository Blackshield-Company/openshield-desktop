/*
 * OpenShield Desktop — chat service (M2).
 *
 * Owns the /ws/v1/chat stream and the per-session message stores. Dispatches
 * the §4 typed envelope (token / tool_start / tool_result / turn_done /
 * error) keyed by session, reconnects with exponential backoff, and never
 * lets a dead stream stay silent — the layout banner mirrors wsStatus.
 *
 * Rendering contract: messages update by mutating the active assistant
 * message's blocks in place and publishing a shallow-copied array, so keyed
 * {#each} blocks only patch the streaming bubble, never rebuild the list.
 *
 * Part of the Blackshield Company.
 */

import { browser } from "$app/environment";
import { get, writable } from "svelte/store";
import {
  config,
  wsStatus,
  openSocket,
  getSessions,
  getSessionHistory,
  type ChatSocket,
  type Result,
  type WsEnvelope,
} from "./backend";
import { mockMode } from "./mock";
import { handleApprovalEnvelope } from "./approvals";
import { selectedModelFor } from "./models";

// ── Model ────────────────────────────────────────────────────────────────

export interface ToolCallInfo {
  id: string;
  name: string;
  args: Record<string, unknown>;
  ok?: boolean;
  result?: string;
  ms?: number;
  startedAt: number;
}

export type Block =
  | { kind: "text"; text: string; reasoning?: boolean }
  | { kind: "tool"; tool: ToolCallInfo }
  | { kind: "approval"; approvalId: string };

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  blocks: Block[];
  createdAt: number;
}

export interface SessionInfo {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface PerfStats {
  tokens: number;
  ms: number;
  /** null when the backend reports ms <= 0 — tok/s would be a lie. */
  tps: number | null;
}

// ── Stores ───────────────────────────────────────────────────────────────

export const sessions = writable<SessionInfo[]>([]);
export const sessionsLoading = writable<boolean>(false);
export const currentSessionId = writable<string | null>(null);
export const messages = writable<ChatMessage[]>([]);
/** True while an assistant turn is streaming (send → turn_done/error). */
export const streaming = writable<boolean>(false);
/** Stats from the most recent turn_done — feeds the perf footer. */
export const perf = writable<PerfStats | null>(null);
/** Last stream-level error, surfaced as a dismissible in-page banner. */
export const chatError = writable<string | null>(null);

// ── Internal state ───────────────────────────────────────────────────────

let booted = false;
let socket: ChatSocket | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let attempt = 0;
let generation = 0;
let lastTarget = "";
let idSeq = 0;
/** Message id of the assistant message for the in-flight turn, if any. */
let streamMsgId: string | null = null;

function genId(prefix: string): string {
  idSeq += 1;
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${idSeq}-${rand}`;
}

function targetKey(): string {
  const c = get(config);
  return `${get(mockMode) ? "mock" : "live"}|${c.host}|${c.port}|${c.token}`;
}

// ── WS lifecycle (connect + backoff reconnect) ───────────────────────────

function connect(): void {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  // Invalidate callbacks from any previous socket before tearing it down.
  const gen = ++generation;
  socket?.close();
  socket = null;
  wsStatus.set("connecting");
  socket = openSocket("/ws/v1/chat", handleEnvelope, {
    onOpen: () => {
      if (gen !== generation) return;
      attempt = 0;
      wsStatus.set("connected");
    },
    onClose: () => {
      if (gen !== generation) return;
      socket = null;
      scheduleRetry();
    },
  });
}

function scheduleRetry(): void {
  // Banner reads this as "connecting" while we back off — honest, not flap.
  wsStatus.set("connecting");
  const delay = Math.min(15_000, 1000 * 2 ** attempt);
  attempt += 1;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    connect();
  }, delay);
}

/** Banner tap → drop backoff and reconnect immediately. */
export function retryChatStream(): void {
  attempt = 0;
  connect();
}

/**
 * Abort the in-flight turn. Closing the stream is the cancel signal the
 * backend understands; we then re-establish the stream immediately.
 */
export function abortTurn(): void {
  if (!get(streaming)) return;
  streaming.set(false);
  streamMsgId = null;
  attempt = 0;
  connect();
}

/** Boot the chat stream once from the root layout. Never blocks first paint. */
export function initChat(): void {
  if (!browser || booted) return;
  booted = true;
  lastTarget = targetKey();
  connect();
  void refreshSessions();
  // Reconnect whenever the target (host/port/token/backend mode) changes.
  config.subscribe(() => reevaluateTarget());
  mockMode.subscribe(() => reevaluateTarget());
}

function reevaluateTarget(): void {
  const key = targetKey();
  if (key === lastTarget) return;
  lastTarget = key;
  attempt = 0;
  connect();
}

// ── §4 envelope dispatch ─────────────────────────────────────────────────

/** §4 envelope dispatcher — exported so alternate streams/tests can route envelopes through the same path. */
export function handleEnvelope(env: WsEnvelope): void {
  // Approval events belong to the global inbox FIRST — a gate pause for a
  // foreign session still needs a human. The approvals service dedupes and
  // owns pending/history/toasts; here we only mirror the request inline when
  // it targets the session the user is looking at.
  if (env.type === "approval_req" || env.type === "approval_res") {
    handleApprovalEnvelope(env);
    if (env.type === "approval_req") maybeInlineApproval(env);
    return;
  }

  // Events are keyed by session. The live backend assigns its own session id
  // for a new conversation, so adopt it when our turn has produced nothing
  // yet; otherwise ignore foreign sessions.
  if (env.session) {
    const current = get(currentSessionId);
    if (env.session !== current) {
      const adoptable = !current || (get(streaming) && streamIsEmpty());
      if (!adoptable) return;
      currentSessionId.set(env.session);
    }
  }

  switch (env.type) {
    case "token": {
      const text = String((env.data as { text?: unknown }).text ?? "");
      if (!text) return;
      // Reasoning-phase tokens get their own faint block; a phase change
      // starts a new block so the two never interleave.
      const reasoning = (env.data as { reasoning?: unknown }).reasoning === true;
      // The live backend can emit a final full-text echo AFTER turn_done.
      // Fold strays into the closed turn instead of opening a new message.
      if (!get(streaming) && streamMsgId === null) {
        foldStrayToken(text, reasoning);
        return;
      }
      ensureAssistantMessage();
      messages.update((arr) => {
        const msg = arr.find((m) => m.id === streamMsgId);
        if (!msg) return arr;
        const last = msg.blocks[msg.blocks.length - 1];
        if (last && last.kind === "text" && last.reasoning === reasoning) last.text += text;
        else msg.blocks.push({ kind: "text", text, reasoning });
        return [...arr];
      });
      break;
    }

    case "tool_start": {
      ensureAssistantMessage();
      const tool: ToolCallInfo = {
        id: genId("tool"),
        name: String((env.data as { name?: unknown }).name ?? "tool"),
        args: ((env.data as { args?: unknown }).args ?? {}) as Record<string, unknown>,
        startedAt: Date.now(),
      };
      messages.update((arr) => {
        const msg = arr.find((m) => m.id === streamMsgId);
        if (!msg) return arr;
        msg.blocks.push({ kind: "tool", tool });
        return [...arr];
      });
      break;
    }

    case "tool_result": {
      messages.update((arr) => {
        const msg = arr.find((m) => m.id === streamMsgId);
        if (!msg) return arr;
        // Complete the most recent still-running tool block.
        const block = [...msg.blocks]
          .reverse()
          .find((b) => b.kind === "tool" && b.tool.ok === undefined);
        if (block && block.kind === "tool") {
          block.tool.ok = Boolean((env.data as { ok?: unknown }).ok);
          const ms = (env.data as { ms?: unknown }).ms;
          block.tool.ms = typeof ms === "number" ? ms : Date.now() - block.tool.startedAt;
          const result = (env.data as { result?: unknown }).result;
          if (typeof result === "string") block.tool.result = result;
        }
        return [...arr];
      });
      break;
    }

    case "turn_done": {
      streaming.set(false);
      streamMsgId = null;
      const tokens = Number((env.data as { tokens?: unknown }).tokens ?? 0);
      const ms = Number((env.data as { ms?: unknown }).ms ?? 0);
      perf.set({ tokens, ms, tps: ms > 0 ? (tokens / ms) * 1000 : null });
      // Pick up any server-side title/ordering changes.
      void refreshSessions();
      break;
    }

    case "error": {
      streaming.set(false);
      streamMsgId = null;
      chatError.set(String((env.data as { message?: unknown }).message ?? "Unknown stream error."));
      break;
    }

    default:
      /* Unknown type — forward-compatible ignore. */
      break;
  }
}

/**
 * Handle a token that arrives after turn_done closed the turn. The live
 * backend emits a final full-text echo in that gap; if the text is already
 * represented in the closed assistant message we drop it, otherwise append
 * it to that message so nothing the server said goes missing.
 */
function foldStrayToken(text: string, reasoning: boolean): void {
  const arr = get(messages);
  const last = arr[arr.length - 1];
  if (!last || last.role !== "assistant") return;
  const accumulated = last.blocks
    .filter((b): b is { kind: "text"; text: string; reasoning?: boolean } => b.kind === "text")
    .map((b) => b.text)
    .join("");
  if (accumulated.includes(text)) return;
  messages.update((a) => {
    const msg = a[a.length - 1];
    if (!msg || msg.role !== "assistant") return a;
    const tail = msg.blocks[msg.blocks.length - 1];
    if (tail && tail.kind === "text" && tail.reasoning === reasoning) tail.text += text;
    else msg.blocks.push({ kind: "text", text, reasoning });
    return [...a];
  });
}

/**
 * Mirror an approval_req into the active session's message stream so the gate
 * pause is visible where the user is already looking. Dedupes by approval id;
 * resolves via the approvals stores (the inline card reads pending/history by
 * id, so a decision anywhere settles it here too).
 */
function maybeInlineApproval(env: WsEnvelope): void {
  const session = typeof env.session === "string" ? env.session : "";
  if (!session || session !== get(currentSessionId)) return;
  const id = String((env.data as { id?: unknown })?.id ?? "");
  if (!id) return;
  const exists = get(messages).some((m) => m.blocks.some((b) => b.kind === "approval" && b.approvalId === id));
  if (exists) return;
  ensureAssistantMessage();
  messages.update((arr) => {
    const msg = arr.find((m) => m.id === streamMsgId);
    if (!msg) return arr;
    msg.blocks.push({ kind: "approval", approvalId: id });
    return [...arr];
  });
}

function streamIsEmpty(): boolean {
  if (!streamMsgId) return true;
  const msg = get(messages).find((m) => m.id === streamMsgId);
  return !msg || msg.blocks.length === 0;
}

function ensureAssistantMessage(): void {
  if (streamMsgId && get(messages).some((m) => m.id === streamMsgId)) return;
  const msg: ChatMessage = {
    id: genId("m"),
    role: "assistant",
    blocks: [],
    createdAt: Date.now(),
  };
  streamMsgId = msg.id;
  messages.update((arr) => [...arr, msg]);
}

// ── Public actions ───────────────────────────────────────────────────────

/** Append a user message and kick off a streaming turn over the WS. */
export function sendMessage(text: string): Result<null> {
  const trimmed = text.trim();
  if (!trimmed) return { success: false, error: "Nothing to send." };
  if (get(streaming)) {
    return { success: false, error: "A turn is already in progress — abort it first." };
  }
  if (get(wsStatus) !== "connected" || !socket) {
    const err = "Chat stream is not connected — check the backend in Settings.";
    chatError.set(err);
    return { success: false, error: err };
  }

  let sid = get(currentSessionId);
  if (!sid) {
    sid = genId("sess");
    currentSessionId.set(sid);
  }

  chatError.set(null);
  perf.set(null);
  streamMsgId = null;
  messages.update((arr) => [
    ...arr,
    {
      id: genId("m"),
      role: "user",
      blocks: [{ kind: "text", text: trimmed }],
      createdAt: Date.now(),
    },
  ]);
  streaming.set(true);

  try {
    // Live `openshield serve` inbound shape: {type:"chat", session, message}.
    // §4 optional `model` override: only when this session has a picker
    // selection — absent means "the server's configured default".
    const model = selectedModelFor(sid);
    socket.send({ type: "chat", session: sid, message: trimmed, ...(model ? { model } : {}) });
  } catch (e) {
    streaming.set(false);
    const err = e instanceof Error ? e.message : "Failed to send the message.";
    chatError.set(err);
    return { success: false, error: err };
  }
  return { success: true, data: null };
}

/** Start a fresh session and switch to it. */
export function newSession(): string {
  const sid = genId("sess");
  currentSessionId.set(sid);
  messages.set([]);
  streaming.set(false);
  streamMsgId = null;
  perf.set(null);
  chatError.set(null);
  return sid;
}

/** Load a session's history and make it current. */
export async function resumeSession(id: string): Promise<Result<null>> {
  const r = await getSessionHistory(id);
  if (!r.success) {
    chatError.set(`Could not load session: ${r.error}`);
    return { success: false, error: r.error };
  }
  currentSessionId.set(id);
  messages.set(normalizeHistory(r.data));
  streaming.set(false);
  streamMsgId = null;
  perf.set(null);
  chatError.set(null);
  return { success: true, data: null };
}

/** Refresh the sessions list (GET /api/v1/sessions, or mock). */
export async function refreshSessions(): Promise<Result<SessionInfo[]>> {
  sessionsLoading.set(true);
  try {
    const r = await getSessions();
    if (!r.success) return { success: false, error: r.error };
    const list = normalizeSessions(r.data);
    sessions.set(list);
    return { success: true, data: list };
  } catch (e) {
    // Never leak — a malformed payload shows an error, not a dead screen.
    const err = e instanceof Error ? e.message : "Failed to load sessions.";
    return { success: false, error: err };
  } finally {
    sessionsLoading.set(false);
  }
}

// ── Normalizers (tolerant of REST shape drift) ───────────────────────────

function normalizeHistory(raw: unknown): ChatMessage[] {
  let list: unknown[] = [];
  if (Array.isArray(raw)) {
    list = raw;
  } else if (
    raw &&
    typeof raw === "object" &&
    Array.isArray((raw as { messages?: unknown[] }).messages)
  ) {
    list = (raw as { messages: unknown[] }).messages;
  }

  const out: ChatMessage[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const rm = item as {
      role?: unknown;
      text?: unknown;
      content?: unknown;
      blocks?: unknown;
    };
    const role = rm.role === "assistant" ? "assistant" : rm.role === "user" ? "user" : null;
    if (!role) continue;

    const blocks: Block[] = [];
    if (Array.isArray(rm.blocks)) {
      for (const rb of rm.blocks) {
        if (!rb || typeof rb !== "object") continue;
        const b = rb as {
          kind?: unknown;
          text?: unknown;
          name?: unknown;
          args?: unknown;
          ok?: unknown;
          ms?: unknown;
          result?: unknown;
        };
        if (b.kind === "tool") {
          blocks.push({
            kind: "tool",
            tool: {
              id: genId("tool"),
              name: String(b.name ?? "tool"),
              args: (b.args ?? {}) as Record<string, unknown>,
              ok: typeof b.ok === "boolean" ? b.ok : undefined,
              ms: typeof b.ms === "number" ? b.ms : undefined,
              result: typeof b.result === "string" ? b.result : undefined,
              startedAt: 0,
            },
          });
        } else if (b.kind === "text" && typeof b.text === "string" && b.text) {
          blocks.push({ kind: "text", text: b.text });
        }
      }
    }
    if (blocks.length === 0) {
      const text =
        typeof rm.text === "string" ? rm.text : typeof rm.content === "string" ? rm.content : "";
      if (text) blocks.push({ kind: "text", text });
    }
    if (blocks.length === 0) continue;

    out.push({ id: genId("m"), role, blocks, createdAt: Date.now() });
  }
  return out;
}

function normalizeSessions(raw: unknown): SessionInfo[] {
  // Tolerate every envelope seen in the wild: a bare array, {sessions: []},
  // or {items: []}.
  let list: unknown[] = [];
  if (Array.isArray(raw)) {
    list = raw;
  } else if (raw && typeof raw === "object") {
    const candidate = (raw as Record<string, unknown>).sessions ?? (raw as Record<string, unknown>).items;
    if (Array.isArray(candidate)) list = candidate;
  }

  const out: SessionInfo[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const s = item as Record<string, unknown>;
    const id = String(s.id ?? s.session_id ?? "");
    if (!id) continue;
    out.push({
      id,
      title: String(s.title ?? "") || `Session ${id.slice(0, 8)}`,
      createdAt: String(s.created_at ?? s.started_at ?? ""),
      updatedAt: String(s.updated_at ?? s.last_active ?? s.started_at ?? ""),
    });
  }
  return out;
}
