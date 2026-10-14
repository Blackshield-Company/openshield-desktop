/*
 * OpenShield Desktop — mock backend layer.
 *
 * Emulates `openshield serve` in-memory (REST + WS) so every screen is
 * demoable with no server configured. Toggle lives in Settings → Demo mode
 * (`mockMode` store, persisted to localStorage). The real service layer in
 * backend.ts routes to these implementations whenever the toggle is on.
 *
 * The scripted chat turn exercises the full §4 envelope: token chunks,
 * tool_start/tool_result, turn_done. Part of the Blackshield Company.
 */

import { browser } from "$app/environment";
import { writable } from "svelte/store";
import type { HealthReport, WsEnvelope } from "./backend";

const MOCK_KEY = "openshield.mock";

function initialMock(): boolean {
  if (!browser) return false;
  try {
    return localStorage.getItem(MOCK_KEY) === "1";
  } catch {
    return false;
  }
}

/** True when the in-memory demo backend is active (Settings → Demo mode). */
export const mockMode = writable<boolean>(initialMock());

export function setMockMode(on: boolean): void {
  mockMode.set(on);
  if (browser) {
    try {
      localStorage.setItem(MOCK_KEY, on ? "1" : "0");
    } catch {
      /* storage unavailable — toggle just won't persist */
    }
  }
}

// ── Mock session store ───────────────────────────────────────────────────

interface MockSession {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface MockHistory {
  messages: Record<string, unknown>[];
}

const NOW = Date.now();
const MIN = 60_000;

let mockSessions: MockSession[] = [
  {
    id: "mock-s1",
    title: "Port WS envelope to chat UI",
    created_at: new Date(NOW - 52 * MIN).toISOString(),
    updated_at: new Date(NOW - 11 * MIN).toISOString(),
  },
  {
    id: "mock-s2",
    title: "Guardrail audit of tool allowlist",
    created_at: new Date(NOW - 26 * MIN).toISOString(),
    updated_at: new Date(NOW - 3 * MIN).toISOString(),
  },
];

const mockHistories = new Map<string, MockHistory>([
  [
    "mock-s1",
    {
      messages: [
        { role: "user", text: "Walk me through the §4 WS envelope types." },
        {
          role: "assistant",
          text: "Straightforward dispatch. The server sends typed envelopes: `token`, `tool_start`, `tool_result`, `turn_done`, plus `approval_req`/`approval_res` when the guardrail gate wants a human.\n\nEach card in the UI maps 1:1 to an envelope type. The chat client keys everything by session id and ignores foreign sessions.",
        },
      ],
    },
  ],
  [
    "mock-s2",
    {
      messages: [
        { role: "user", text: "Audit the current tool allowlist against the L2 sandbox." },
        {
          role: "assistant",
          blocks: [
            {
              kind: "tool",
              name: "guardrail.audit",
              args: { scope: "tools", level: "L2" },
              ok: true,
              ms: 128,
              result: "14 tools checked — 0 violations",
            },
            {
              kind: "text",
              text: "Audit clean. All 14 registered tools resolve inside sandbox paths; nothing escalates past L2.",
            },
          ],
        },
        { role: "user", text: "And the PII redaction pass?" },
        {
          role: "assistant",
          text: "Redaction is active on `memory.recall` and `fs.read` results. No raw PII reached the stream in the last 200 turns.",
        },
      ],
    },
  ],
]);

// ── Mock REST surface ────────────────────────────────────────────────────

export function mockHealth(): HealthReport {
  return {
    status: "ok",
    version: "0.1.0-mock",
    model: "mock-provider/blackshield-7b",
    mock: true,
  };
}

export function mockSessionsList(): MockSession[] {
  return [...mockSessions].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

export function mockSessionHistory(id: string): unknown | null {
  return mockHistories.get(id) ?? null;
}

// ── Mock approval store (M3) ─────────────────────────────────────────────

export type MockApprovalDecision = "approved" | "rejected" | "approve_always";

interface MockApproval {
  id: string;
  risk: string;
  tool: string;
  args: Record<string, unknown>;
  session: string;
  requested_at: string;
  timeout_secs: number;
}

/** Pending gate requests, REST shape. Resolved ones drop out of this list. */
let mockApprovals: MockApproval[] = [];

const DEMO_APPROVAL_ID = "mock-approve-1";

/** Live mock sockets, so resolving one broadcasts approval_res to all. */
const mockSockets = new Set<(env: WsEnvelope) => void>();

function broadcast(env: WsEnvelope): void {
  for (const emit of mockSockets) emit(env);
}

/** REST: GET /api/v1/approvals — pending only, newest first. */
export function mockGetApprovals(): MockApproval[] {
  return [...mockApprovals].sort((a, b) => b.requested_at.localeCompare(a.requested_at));
}

/**
 * Raise a gate request through the REAL mock path: store + WS broadcast +
 * armed auto-deny. Powers the scripted demo and gives tests (and a future
 * dev "simulate gate" button) the same surface the demo approval uses.
 */
export function mockRaiseApproval(partial: {
  id: string;
  risk: string;
  tool: string;
  args: Record<string, unknown>;
  session: string;
  timeout_secs?: number;
}): void {
  if (mockApprovals.some((a) => a.id === partial.id)) return;
  const req: MockApproval = {
    id: partial.id,
    risk: partial.risk,
    tool: partial.tool,
    args: partial.args,
    session: partial.session,
    requested_at: new Date().toISOString(),
    timeout_secs: partial.timeout_secs ?? 120,
  };
  mockApprovals.push(req);
  armAutoDeny(req);
  broadcast({ type: "approval_req", session: req.session, data: { ...req } });
}

/**
 * REST: POST /api/v1/approvals/:id. Settles the gate, broadcasts the §4
 * approval_res echo to every open mock socket, and arms the 120s auto-deny
 * on anything still pending (timeout defaults to deny, §6).
 */
export function mockResolveApproval(
  id: string,
  decision: "approve" | "reject" | "approve_always",
): { ok: boolean; error?: string } {
  const idx = mockApprovals.findIndex((a) => a.id === id);
  if (idx === -1) return { ok: false, error: `approval ${id} not pending` };
  const req = mockApprovals[idx];
  mockApprovals.splice(idx, 1);
  const mapped: MockApprovalDecision =
    decision === "approve" ? "approved" : decision === "reject" ? "rejected" : "approve_always";
  broadcast({ type: "approval_res", session: req.session, data: { id, decision: mapped } });
  return { ok: true };
}

/** Arm the 120s auto-deny on a freshly raised request (§6: timeout = deny). */
function armAutoDeny(req: MockApproval): void {
  setTimeout(() => {
    const idx = mockApprovals.findIndex((a) => a.id === req.id);
    if (idx === -1) return; // already settled
    mockApprovals.splice(idx, 1);
    broadcast({ type: "approval_res", session: req.session, data: { id: req.id, decision: "expired" } });
  // Small grace past the deadline: the client marks "expired" the moment the
  // countdown hits zero, and the server-side deny lands shortly after — the
  // approval_res broadcast that follows is idempotent either way.
  }, req.timeout_secs * 1000 + 1500);
}

// ── Mock swarm surface (M5) ─────────────────────────────────────────────

interface MockSwarmAgent {
  id: string;
  role: string;
  status: string;
  model: string;
  task: string | null;
}

/** Engine state flips with mockControlSwarm; drives the /swarm demo. */
let mockSwarmRunning = true;

const MOCK_SWARM_TASKS: Record<string, string> = {
  "agent-arch": "Drafting consensus doc for the M5 extras landing",
  "agent-impl": "Porting the WS envelope types into the swarm monitor",
  "agent-review": "Awaiting the implementer's diff",
  "agent-test": "Blocked on approvals-inbox sync before the e2e pass",
};

const mockSwarmAgents: MockSwarmAgent[] = [
  { id: "agent-arch", role: "architect", status: "working", model: "mock-provider/claude-opus-4-1", task: MOCK_SWARM_TASKS["agent-arch"] },
  { id: "agent-impl", role: "implementer", status: "working", model: "mock-provider/blackshield-7b", task: MOCK_SWARM_TASKS["agent-impl"] },
  { id: "agent-review", role: "reviewer", status: "idle", model: "mock-provider/claude-haiku-4-5", task: null },
  { id: "agent-test", role: "tester", status: "blocked", model: "mock-provider/gpt-5-mini", task: MOCK_SWARM_TASKS["agent-test"] },
];

/** REST: GET /api/v1/swarm — engine state, pool, consensus doc. */
export function mockGetSwarm(): unknown {
  return {
    status: mockSwarmRunning ? "running" : "stopped",
    round: mockSwarmRunning ? 3 : 0,
    consensus: mockSwarmRunning
      ? "M5 consensus (round 3)\n- Swarm monitor and memory browser ride the same backend client, no new spine.\n- Model override travels on the §4 chat frame; global config stays untouched.\n- Demo mode must drive all three screens serverless."
      : null,
    updated_at: new Date().toISOString(),
    agents: mockSwarmAgents.map((a) => ({ ...a })),
  };
}

/** REST: POST /api/v1/swarm/:action — flips the demo engine + pool state. */
export function mockControlSwarm(action: "start" | "stop"): { ok: boolean; error?: string } {
  if (action === "stop") {
    mockSwarmRunning = false;
    for (const a of mockSwarmAgents) {
      a.status = "idle";
      a.task = null;
    }
    return { ok: true };
  }
  if (action === "start") {
    mockSwarmRunning = true;
    for (const a of mockSwarmAgents) {
      a.status = a.id === "agent-review" ? "idle" : "working";
      a.task = MOCK_SWARM_TASKS[a.id] ?? null;
    }
    return { ok: true };
  }
  return { ok: false, error: `unknown swarm action: ${String(action)}` };
}

// ── Mock memory store (M5) ───────────────────────────────────────────────

interface MockMemory {
  id: string;
  session: string;
  project: string;
  timestamp: string;
  snippet: string;
  score: number;
}

const MOCK_DAY = 86_400_000;

const mockMemories: MockMemory[] = [
  {
    id: "mem-1",
    session: "mock-s2",
    project: "openshield",
    timestamp: new Date(NOW - 3 * MIN).toISOString(),
    snippet: "Guardrail audit of the tool allowlist came back clean: 14 tools resolve inside sandbox paths, nothing escalates past L2.",
    score: 0.94,
  },
  {
    id: "mem-2",
    session: "mock-s1",
    project: "openshield-desktop",
    timestamp: new Date(NOW - 11 * MIN).toISOString(),
    snippet: "The §4 WS envelope types (token / tool_start / tool_result / turn_done) map 1:1 to chat UI cards, keyed by session id.",
    score: 0.91,
  },
  {
    id: "mem-3",
    session: "mock-s2",
    project: "openshield",
    timestamp: new Date(NOW - 40 * MIN).toISOString(),
    snippet: "PII redaction is active on memory.recall and fs.read results; no raw PII reached the stream in the last 200 turns.",
    score: 0.87,
  },
  {
    id: "mem-4",
    session: "mock-s1",
    project: "openshield-desktop",
    timestamp: new Date(NOW - 2 * 52 * MIN).toISOString(),
    snippet: "Approval timeout defaults to deny per §6 — a gate request left 120s unanswered is recorded as expired, never approved.",
    score: 0.83,
  },
  {
    id: "mem-5",
    session: "mock-s2",
    project: "openshield",
    timestamp: new Date(NOW - 1 * MOCK_DAY).toISOString(),
    snippet: "Pairing tokens are short-lived (120s TTL). A bearer token is required on every host, including localhost and the WebSocket handshake.",
    score: 0.78,
  },
  {
    id: "mem-6",
    session: "mock-s3",
    project: "openshield-desktop",
    timestamp: new Date(NOW - 2 * MOCK_DAY).toISOString(),
    snippet: "Tauri on Linux needs webkit2gtk-4.1 and RGBA PNG icons; the icon key lives only under bundle.icon in tauri.conf.json.",
    score: 0.71,
  },
  {
    id: "mem-7",
    session: "mock-s3",
    project: "openshield-desktop",
    timestamp: new Date(NOW - 3 * MOCK_DAY).toISOString(),
    snippet: "Svelte 5 on WebKitGTK: verify every onchange handler in the real webview — silent failures are the default failure mode.",
    score: 0.66,
  },
  {
    id: "mem-8",
    session: "mock-s4",
    project: "openshield",
    timestamp: new Date(NOW - 5 * MOCK_DAY).toISOString(),
    snippet: "The harness event system already emits §4-equivalent events internally; the WS layer only serializes them for clients.",
    score: 0.59,
  },
];

/** REST: GET /api/v1/memory/search?q= — case-insensitive substring filter. */
export function mockSearchMemory(q: string): unknown[] {
  const needle = q.trim().toLowerCase();
  const hits = needle
    ? mockMemories.filter((m) =>
        [m.id, m.session, m.project, m.snippet].join(" ").toLowerCase().includes(needle),
      )
    : mockMemories;
  return hits.map((m) => ({ ...m }));
}

// ── Mock model registry (M5) ─────────────────────────────────────────────

/** REST: GET /api/v1/models — providers + exact-match router names. */
export function mockGetModels(): unknown {
  return {
    providers: [
      {
        name: "anthropic",
        models: [
          { id: "anthropic/claude-opus-4-1", label: "Claude Opus 4.1" },
          { id: "anthropic/claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
          { id: "anthropic/claude-haiku-4-5", label: "Claude Haiku 4.5" },
        ],
      },
      {
        name: "openai",
        models: [
          { id: "openai/gpt-5.2", label: "GPT-5.2" },
          { id: "openai/gpt-5-mini", label: "GPT-5 Mini" },
        ],
      },
      {
        name: "mock",
        models: [{ id: "mock-provider/blackshield-7b", label: "blackshield 7B (demo)" }],
      },
    ],
  };
}

// ── Mock WS surface (scripted streaming turn) ────────────────────────────

export interface MockSocket {
  close: () => void;
  send: (env: WsEnvelope) => void;
}

export interface SocketHandlers {
  onOpen?: () => void;
  onClose?: () => void;
}

export function mockOpenSocket(
  onEvent: (env: WsEnvelope) => void,
  handlers?: SocketHandlers,
): MockSocket {
  let closed = false;
  const timers: ReturnType<typeof setTimeout>[] = [];

  const later = (fn: () => void, delay: number) => {
    timers.push(
      setTimeout(() => {
        if (!closed) fn();
      }, delay),
    );
  };

  const emit = (env: WsEnvelope, delay: number) => {
    later(() => onEvent(env), delay);
  };

  // Simulated connect — resolves on the next tick.
  later(() => handlers?.onOpen?.(), 0);
  mockSockets.add(onEvent);
  // 5s into the mock session: the guardrail gate pauses a HIGH-RISK terminal
  // call and asks a human. mockRaiseApproval is idempotent, so reconnects
  // never re-raise a request that's pending or already settled.
  later(() => {
    mockRaiseApproval({
      id: DEMO_APPROVAL_ID,
      risk: "high",
      tool: "terminal",
      args: { command: "git push --force origin main", cwd: "~/Projects/active/openshield" },
      session: "mock-s2",
      timeout_secs: 120,
    });
  }, 5000);

  /** Scripted assistant turn: tokens → tool_start → tool_result → tokens → turn_done. */
  function runTurn(session: string, userText: string, model?: string) {
    let existing = mockSessions.find((s) => s.id === session);
    if (!existing) {
      existing = {
        id: session,
        title: userText.length > 42 ? `${userText.slice(0, 42)}…` : userText,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      mockSessions.push(existing);
      mockHistories.set(session, { messages: [] });
    }
    const history = mockHistories.get(session);
    // The §4 model override rides the inbound chat frame; the demo store
    // records it on the user turn so the picker wiring is inspectable.
    history?.messages.push({ role: "user", text: userText, ...(model ? { model } : {}) });

    const part1 = `On it — taking a look at "${userText}". Checking the workspace first.\n\n`;
    const part2 = `The workspace checks out. Here's the relevant snippet:\n\n\`\`\`rust\nfn shield_up() -> bool {\n    // matte black, no reflection, no surrender\n    true\n}\n\`\`\`\n\nGuardrails report zero violations and the sandbox paths are intact. Want me to dig deeper into anything?`;

    let t = 120;
    const stream = (chunk: string, step = 4, every = 26, reasoning = false) => {
      for (let i = 0; i < chunk.length; i += step) {
        emit(
          { type: "token", session, data: { text: chunk.slice(i, i + step), reasoning } },
          t,
        );
        t += every;
      }
    };

    // Part 1 streams as reasoning-phase tokens (faint block in the UI).
    stream(part1, 4, 26, true);
    t += 200;
    emit(
      {
        type: "tool_start",
        session,
        data: { name: "fs.read", args: { path: "src/shield.rs", limit: 40 } },
      },
      t,
    );
    t += 850;
    emit(
      {
        type: "tool_result",
        session,
        data: {
          name: "fs.read",
          ok: true,
          ms: 87,
          result: 'fn shield_up() -> bool {\n    true\n}\n\nfn main() {\n    assert!(shield_up());\n}',
        },
      },
      t,
    );
    t += 200;
    stream(part2);
    t += 150;

    const fullText = part1 + part2;
    const tokens = fullText.split(/\s+/).filter(Boolean).length;
    later(() => {
      history?.messages.push({ role: "assistant", text: fullText });
      existing.updated_at = new Date().toISOString();
    }, t);
    emit({ type: "turn_done", session, data: { tokens, ms: t } }, t + 10);
  }

  return {
    send: (env) => {
      if (closed) return;
      if (env.type === "chat" && typeof env.session === "string") {
        // Same inbound shape the live backend accepts: {type:"chat", session, message, model?}
        const text = env.message ?? String((env.data as { text?: unknown }).text ?? "");
        const model = typeof env.model === "string" && env.model ? env.model : undefined;
        if (text.trim()) runTurn(env.session, text.trim(), model);
      }
    },
    close: () => {
      if (closed) return;
      closed = true;
      mockSockets.delete(onEvent);
      for (const timer of timers) clearTimeout(timer);
      handlers?.onClose?.();
    },
  };
}
