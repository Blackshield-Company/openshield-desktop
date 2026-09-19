/*
 * M4 headless test — Pocket pairing flow (design doc §3.3).
 *
 * Covers the paste-payload contract end to end without a browser:
 *   1. parsePairingPayload accepts the /api/v1/pair shape {host, port, token, expires}
 *   2. rejects garbage: bad JSON, missing fields, wild ports/hosts — with
 *      human-readable errors (this text lands in the settings feedback line)
 *   3. storage round-trip: saveConfig → loadConnection returns the record and
 *      hasSavedConnection flips true (Pocket routes first render off that flag)
 *   4. corrupted storage degrades to "no saved connection", never a throw
 *
 * jsdom has no Tauri runtime, so storage.ts exercises its localStorage
 * fallback — the same code path browser dev uses.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { get } from "svelte/store";

beforeAll(() => {
  // Demo mode ON so saveConfig's background health probe hits the mock.
  localStorage.setItem("openshield.mock", "1");
});

describe("M4 pairing payload parsing", () => {
  it("accepts the full /api/v1/pair shape", async () => {
    const { parsePairingPayload } = await import("$lib/services/pairing");
    const r = parsePairingPayload(
      JSON.stringify({
        host: "192.168.1.100",
        port: 9310,
        token: "osh_live_testtoken",
        expires: "2026-09-16T03:30:00Z",
      }),
    );
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.host).toBe("192.168.1.100");
      expect(r.data.port).toBe(9310);
      expect(r.data.token).toBe("osh_live_testtoken");
      expect(r.data.expires).toBe("2026-09-16T03:30:00Z");
    }
  });

  it("coerces a string port and ignores unknown keys", async () => {
    const { parsePairingPayload } = await import("$lib/services/pairing");
    const r = parsePairingPayload(
      JSON.stringify({ host: "desktop.lan", port: "9310", token: "tok", qr: true }),
    );
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.port).toBe(9310);
      expect(r.data.expires).toBeUndefined();
    }
  });

  it("rejects bad JSON, missing fields, and wild values", async () => {
    const { parsePairingPayload } = await import("$lib/services/pairing");
    const cases: Array<[string, string]> = [
      ["not json at all", "Not valid JSON"],
      ["{}", "missing a host"],
      [JSON.stringify({ host: "192.168.1.100", port: 9310 }), "missing a bearer token"],
      [JSON.stringify({ host: "192.168.1.100", port: 99999, token: "t" }), "valid port"],
      [JSON.stringify({ host: "bad host!", port: 9310, token: "t" }), "host looks invalid"],
      ["[1,2,3]", "JSON object"],
    ];
    for (const [raw, fragment] of cases) {
      const r = parsePairingPayload(raw);
      expect(r.success).toBe(false);
      if (!r.success) expect(r.error).toContain(fragment);
    }
  });

  it("payloadToConnection matches the storage shape", async () => {
    const { parsePairingPayload, payloadToConnection } = await import("$lib/services/pairing");
    const r = parsePairingPayload(
      JSON.stringify({ host: "192.168.1.100", port: 9310, token: "tok", expires: "x" }),
    );
    expect(r.success).toBe(true);
    if (r.success) {
      expect(payloadToConnection(r.data)).toEqual({
        host: "192.168.1.100",
        port: 9310,
        token: "tok",
      });
    }
  });
});

describe("M4 connection persistence", () => {
  it("saveConfig persists + flips hasSavedConnection; loadConnection reads back", async () => {
    const backend = await import("$lib/services/backend");
    const storage = await import("$lib/services/storage");

    const r = backend.saveConfig({ host: "192.168.1.100", port: 9310, token: "osh_tok" });
    expect(r.success).toBe(true);
    expect(get(backend.hasSavedConnection)).toBe(true);

    const stored = await storage.loadConnection();
    expect(stored).toEqual({ host: "192.168.1.100", port: 9310, token: "osh_tok" });
  });

  it("corrupted storage degrades to null, never throws", async () => {
    const storage = await import("$lib/services/storage");
    localStorage.setItem("openshield.backend", "{not json");
    const r1 = await storage.reloadConnection();
    expect(r1).toBeNull();
    localStorage.setItem("openshield.backend", JSON.stringify({ host: "", port: -1 }));
    const r2 = await storage.reloadConnection();
    expect(r2).toBeNull();
  });
});
