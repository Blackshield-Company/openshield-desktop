/*
 * Session persistence: new sessions POST /api/v1/sessions (mock store in
 * demo mode) and close archives them. The chat service must use the
 * server-issued id, not a client-only placeholder.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { get } from "svelte/store";

beforeEach(() => {
  localStorage.setItem("openshield.mock", "1");
});

describe("session persistence", () => {
  it("creates a session in the mock store and lists it", async () => {
    const { mockMode, setMockMode } = await import("$lib/services/mock");
    const { newSession, refreshSessions, sessions, currentSessionId } =
      await import("$lib/services/chat");
    setMockMode(true);
    expect(get(mockMode)).toBe(true);

    const before = get(sessions).length;
    const r = await newSession();
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.startsWith("mock-")).toBe(true);
    expect(get(currentSessionId)).toBe(r.data);
    await refreshSessions();
    expect(get(sessions).some((s) => s.id === r.data)).toBe(true);
    expect(get(sessions).length).toBeGreaterThan(before);
  });

  it("closes a session and drops it from the list", async () => {
    const { setMockMode } = await import("$lib/services/mock");
    const { newSession, closeSession, refreshSessions, sessions, currentSessionId } =
      await import("$lib/services/chat");
    setMockMode(true);

    const created = await newSession();
    expect(created.success).toBe(true);
    if (!created.success) return;
    const id = created.data;
    const r = await closeSession(id);
    expect(r.success).toBe(true);
    expect(get(currentSessionId)).toBeNull();
    await refreshSessions();
    expect(get(sessions).some((s) => s.id === id)).toBe(false);
  });
});
