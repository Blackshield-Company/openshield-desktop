/*
 * M5 headless DOM test — memory browser.
 *
 * Boots the mock backend (Demo mode) and walks the /memory contract:
 *   1. mounting the page loads recent entries (empty query search)
 *   2. typing debounces 250ms before hitting the service
 *   3. a matching query filters the result cards
 *   4. a non-matching query renders the empty state
 *   5. clearing the box restores the full recents list
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

describe("M5 memory browser", () => {
  it("recents load → debounced search → filter → empty state → clear", async () => {
    vi.useFakeTimers();
    try {
      const memory = await import("$lib/services/memory");
      const page = await import("../src/routes/memory/+page.svelte");

      const { container } = render(page.default);
      await vi.advanceTimersByTimeAsync(0); // flush the initial recents load

      const cards = () => [...container.querySelectorAll('[data-testid="memory-card"]')];
      const total = get(memory.memoryEntries).length;
      expect(total).toBeGreaterThan(2);
      expect(cards().length).toBe(total);
      expect(get(memory.memoryLoaded)).toBe(true);
      // Cards carry session/project metadata + a relevance score.
      expect(cards()[0].textContent).toContain("🗂");
      expect(cards()[0].textContent).toMatch(/\d+%/);

      const box = container.querySelector('input[type="search"]');
      expect(box).not.toBeNull();

      // Debounce: nothing fires before 250ms elapse.
      await fireEvent.input(box!, { target: { value: "guardrail" } });
      await vi.advanceTimersByTimeAsync(100);
      expect(get(memory.memoryLoading)).toBe(false); // still waiting on the debounce
      expect(cards().length).toBe(total);
      await vi.advanceTimersByTimeAsync(200); // crosses the 250ms threshold

      const filtered = cards();
      expect(filtered.length).toBeGreaterThan(0);
      expect(filtered.length).toBeLessThan(total);
      expect(
        filtered.every((c) => c.textContent!.toLowerCase().includes("guardrail")),
      ).toBe(true);

      // No match → empty state names the miss.
      await fireEvent.input(box!, { target: { value: "zzz-no-such-memory" } });
      await vi.advanceTimersByTimeAsync(300);
      expect(container.querySelector('[data-testid="memory-empty"]')).not.toBeNull();
      expect(cards().length).toBe(0);

      // Clear → recents again.
      await fireEvent.input(box!, { target: { value: "" } });
      await vi.advanceTimersByTimeAsync(300);
      expect(container.querySelector('[data-testid="memory-empty"]')).toBeNull();
      expect(cards().length).toBe(total);
    } finally {
      vi.useRealTimers();
    }
  });
});
