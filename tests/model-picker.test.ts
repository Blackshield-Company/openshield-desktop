/*
 * M5 headless DOM test — model picker.
 *
 * Walks the whole per-session override contract against the mock backend:
 *   1. GET /api/v1/models normalizes into provider groups
 *   2. the picker renders one <optgroup> per provider + a server-default row
 *   3. choosing a model persists under openshield.model.<sessionId>
 *   4. sendMessage rides the §4 chat frame's optional `model` field — the
 *      mock records it on the user turn so the wire shape is inspectable
 *   5. switching back to "Default (server)" clears the key and the frame
 *      goes out without a model field
 */
import { beforeAll, afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/svelte";
import { get } from "svelte/store";

beforeAll(() => {
  // Demo mode ON before any service module reads it at import time.
  localStorage.setItem("openshield.mock", "1");
});

afterEach(() => {
  cleanup();
});

describe("M5 model picker", () => {
  it("groups by provider, persists per session, rides the chat frame", async () => {
    vi.useFakeTimers();
    try {
      const backend = await import("$lib/services/backend");
      const chat = await import("$lib/services/chat");
      const models = await import("$lib/services/models");
      const mock = await import("$lib/services/mock");
      const picker = await import("../src/lib/components/chat/ModelPicker.svelte");

      backend.initBackend();
      chat.initChat();
      await vi.advanceTimersByTimeAsync(0); // mock socket onOpen → stream connected

      // 1) Registry loads + groups by provider.
      const r = await models.loadModels();
      expect(r.success).toBe(true);
      expect(get(models.modelGroups).map((g) => g.provider)).toEqual([
        "anthropic",
        "openai",
        "mock",
      ]);

      // 2) Picker renders grouped options.
      chat.currentSessionId.set("sess-m5");
      const { container } = render(picker.default);
      await vi.advanceTimersByTimeAsync(0);
      const select = container.querySelector("select");
      expect(select).not.toBeNull();
      expect(select!.querySelectorAll("optgroup").length).toBe(3);
      expect(select!.querySelector('option[value=""]')?.textContent).toContain("Default");
      expect(select!.querySelector('option[value="anthropic/claude-opus-4-1"]')).not.toBeNull();

      // 3) Choosing a model persists per session.
      const target = "anthropic/claude-opus-4-1";
      await fireEvent.change(select!, { target: { value: target } });
      expect(localStorage.getItem("openshield.model.sess-m5")).toBe(target);
      expect(models.selectedModelFor("sess-m5")).toBe(target);
      // Other sessions stay on the server default.
      expect(models.selectedModelFor("sess-other")).toBeNull();

      // 4) The chat frame carries the override — the mock records it on the
      //    user turn, proving the §4 envelope shape end to end.
      const send = chat.sendMessage("hold the line");
      expect(send.success).toBe(true);
      const history1 = mock.mockSessionHistory("sess-m5") as {
        messages: Record<string, unknown>[];
      };
      expect(history1.messages[0].role).toBe("user");
      expect(history1.messages[0].model).toBe(target);

      // Let the scripted turn finish so the next send isn't rejected as
      // "turn already in progress".
      await vi.advanceTimersByTimeAsync(6000);

      // 5) Back to server default: key cleared, frame omits `model`.
      await fireEvent.change(select!, { target: { value: "" } });
      expect(localStorage.getItem("openshield.model.sess-m5")).toBeNull();
      expect(models.selectedModelFor("sess-m5")).toBeNull();
      const send2 = chat.sendMessage("default model turn");
      expect(send2.success).toBe(true);
      const history2 = mock.mockSessionHistory("sess-m5") as {
        messages: Record<string, unknown>[];
      };
      expect(history2.messages[2].role).toBe("user");
      expect(history2.messages[2].model).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});
