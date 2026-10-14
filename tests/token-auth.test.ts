/*
 * Bearer token is required on every host, including localhost
 * (openshield serve 1.1.1). Covers saveConfig, Authorization, 401 →
 * needsPairing, a later success clearing it, 429, and a WS drop after a
 * 401 health check.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";
import {
  PAIR_RATE_LIMIT_ERROR,
  TOKEN_REQUIRED_ERROR,
  UNAUTHORIZED_ERROR,
  config,
  needsPairing,
  openSocket,
  request,
  saveConfig,
} from "$lib/services/backend";

function jsonResponse(status: number, body: unknown = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  fetchMock = vi.fn(async () => jsonResponse(200, { status: "ok" }));
  vi.stubGlobal("fetch", fetchMock);
  const saved = saveConfig({ host: "127.0.0.1", port: 9310, token: "test-token" });
  expect(saved.success).toBe(true);
  needsPairing.set(false);
  await new Promise((r) => setTimeout(r, 0));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("saveConfig requires a token on every host", () => {
  it("rejects an empty token for localhost", () => {
    needsPairing.set(true);
    for (const host of ["127.0.0.1", "localhost"]) {
      const r = saveConfig({ host, port: 9310, token: "   " });
      expect(r.success).toBe(false);
      if (!r.success) expect(r.error).toBe(TOKEN_REQUIRED_ERROR);
    }
    expect(get(config).token).toBe("test-token");
    expect(get(needsPairing)).toBe(true);
  });

  it("a successful saveConfig clears needsPairing", () => {
    needsPairing.set(true);
    const r = saveConfig({ host: "localhost", port: 9310, token: "abc" });
    expect(r.success).toBe(true);
    expect(get(needsPairing)).toBe(false);
    expect(get(config)).toEqual({ host: "localhost", port: 9310, token: "abc" });
  });
});

describe("request auth", () => {
  it("always sends the Authorization header, including on localhost", async () => {
    config.set({ host: "127.0.0.1", port: 9310, token: "sekrit" });
    const r = await request("/api/v1/doctor");
    expect(r.success).toBe(true);
    const call = fetchMock.mock.calls.find((c) => String(c[0]).includes("/api/v1/doctor"));
    expect(call).toBeTruthy();
    const headers = (call?.[1] as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer sekrit");

    config.set({ host: "localhost", port: 9310, token: "" });
    await request("/api/v1/health");
    const health = fetchMock.mock.calls.filter((c) => String(c[0]).endsWith("/api/v1/health")).at(-1);
    const healthHeaders = (health?.[1] as RequestInit).headers as Record<string, string>;
    expect(healthHeaders.Authorization).toBe("Bearer ");
  });

  it("a 401 sets needsPairing and returns the re-pair error", async () => {
    fetchMock.mockImplementation(async () => jsonResponse(401, { error: "unauthorized" }));
    const r = await request("/api/v1/sessions");
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toBe(UNAUTHORIZED_ERROR);
    expect(get(needsPairing)).toBe(true);
  });

  it("a later successful call clears needsPairing", async () => {
    fetchMock.mockImplementationOnce(async () => jsonResponse(401, { error: "unauthorized" }));
    const denied = await request("/api/v1/health");
    expect(denied.success).toBe(false);
    expect(get(needsPairing)).toBe(true);

    fetchMock.mockImplementation(async () => jsonResponse(200, { status: "ok" }));
    const ok = await request<{ status: string }>("/api/v1/health");
    expect(ok.success).toBe(true);
    expect(get(needsPairing)).toBe(false);
  });

  it("429 returns a friendly pairing cooldown error and does not set needsPairing", async () => {
    needsPairing.set(false);
    fetchMock.mockImplementation(async () => jsonResponse(429, { error: "slow down" }));
    const r = await request("/api/v1/pair", { method: "POST" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toBe(PAIR_RATE_LIMIT_ERROR);
    expect(get(needsPairing)).toBe(false);
  });
});

describe("WS auth failure", () => {
  it("a socket close right after a 401 health check sets needsPairing", async () => {
    fetchMock.mockImplementation(async () => jsonResponse(401, { error: "unauthorized" }));
    const health = await request("/api/v1/health");
    expect(health.success).toBe(false);
    needsPairing.set(false);

    const prev = globalThis.WebSocket;
    globalThis.WebSocket = class {
      onclose: (() => void) | null = null;
      constructor() {
        setTimeout(() => this.onclose?.(), 0);
      }
      close() {}
      send() {}
    } as unknown as typeof WebSocket;
    try {
      openSocket("/ws/v1/chat", () => {});
      await new Promise((r) => setTimeout(r, 0));
      expect(get(needsPairing)).toBe(true);
    } finally {
      globalThis.WebSocket = prev;
    }
  });
});
