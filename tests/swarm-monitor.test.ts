/*
 * M5 headless DOM test — swarm monitor.
 *
 * Walks the /swarm contract against the mock backend:
 *   1. while connected, the page polls GET /api/v1/swarm and renders the
 *      engine status pill, the consensus panel, and one card per agent
 *   2. Stop drives POST /api/v1/swarm/stop with a busy label, and the
 *      button ALWAYS re-enables (finally) — pool flips to stopped/idle
 *   3. Start brings the engine back to running with tasks reassigned
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

describe("M5 swarm monitor", () => {
  it("status + agent cards render, stop/start flip the pool, buttons re-enable", async () => {
    vi.useFakeTimers();
    try {
      const backend = await import("$lib/services/backend");
      const swarm = await import("$lib/services/swarm");
      const page = await import("../src/routes/swarm/+page.svelte");

      backend.initBackend();
      await vi.advanceTimersByTimeAsync(0); // mock health → connected
      expect(get(backend.connected)).toBe(true);

      const { container } = render(page.default);
      await vi.advanceTimersByTimeAsync(0); // first poll resolves

      // 1) Running state: pill, consensus, full pool.
      expect(container.querySelector('[data-testid="swarm-status"]')?.textContent).toBe(
        "running",
      );
      expect(container.querySelector('[data-testid="consensus-panel"]')).not.toBeNull();
      const cards = () => [...container.querySelectorAll('[data-testid="agent-card"]')];
      expect(cards().length).toBe(4);
      expect(cards().some((c) => c.textContent!.includes("architect"))).toBe(true);

      const stopBtn = () =>
        Array.from(container.querySelectorAll("button")).find((b) =>
          b.textContent!.includes("Stop"),
        ) as HTMLButtonElement;
      const startBtn = () =>
        Array.from(container.querySelectorAll("button")).find((b) =>
          b.textContent!.includes("Start"),
        ) as HTMLButtonElement;

      // Stop is enabled while running; Start is not.
      expect(stopBtn().disabled).toBe(false);
      expect(startBtn().disabled).toBe(true);

      // 2a) Busy/finally contract at the service level: the flag is set while
      // the action is in flight and ALWAYS clears, even though the awaited
      // UI click below would drain microtasks past it.
      const pending = swarm.controlSwarm("stop");
      expect(get(swarm.swarmActionBusy)).toBe("stop");
      const settled = await pending;
      expect(settled.success).toBe(true);
      expect(get(swarm.swarmActionBusy)).toBe(null); // finally ran
      expect(get(swarm.swarm)?.status).toBe("stopped");
      await vi.advanceTimersByTimeAsync(0); // let the page re-render

      // 2b) UI reflects the stopped pool: Stop disabled (nothing to stop),
      // Start armed, labels restored after the busy state cleared.
      expect(stopBtn().disabled).toBe(true);
      expect(startBtn().disabled).toBe(false);
      expect(stopBtn().textContent).toContain("■ Stop");
      expect(container.querySelector('[data-testid="swarm-status"]')?.textContent).toBe(
        "stopped",
      );
      expect(container.querySelector('[data-testid="consensus-panel"]')).toBeNull();
      const chips = [...container.querySelectorAll('[data-testid="agent-card"] .chip')];
      expect(chips.every((c) => c.textContent === "idle")).toBe(true);

      // 3) Start: engine back to running, tasks reassigned.
      await fireEvent.click(startBtn());
      expect(get(swarm.swarm)?.status).toBe("running");
      expect(container.querySelector('[data-testid="consensus-panel"]')).not.toBeNull();
      expect(
        [...container.querySelectorAll('[data-testid="agent-card"] .chip')].some(
          (c) => c.textContent === "working",
        ),
      ).toBe(true);
      // Running again: Start stands down, Stop is armed.
      expect(startBtn().disabled).toBe(true);
      expect(stopBtn().disabled).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
