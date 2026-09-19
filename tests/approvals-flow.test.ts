/*
 * M3 headless DOM test — mock approval flow.
 *
 * Boots the mock backend (Demo mode) in jsdom and walks the whole contract:
 *   1. the demo approval_req (high-risk terminal) appears in the inbox 5s in
 *   2. the pending card renders tool/risk/args/countdown on /approvals
 *   3. approving POSTs the decision: card collapses, history updates, badge 0
 *   4. a request for the active chat session mirrors inline in the stream
 *   5. reject + client-side timeout sweep land in history correctly
 *
 * Stores are module-global, so this is one sequential flow with unique ids.
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

describe("M3 mock approval flow", () => {
  it("request appears → approve works → history updates → badge counts", async () => {
    vi.useFakeTimers();
    try {
      const backend = await import("$lib/services/backend");
      const chat = await import("$lib/services/chat");
      const approvals = await import("$lib/services/approvals");
      const mock = await import("$lib/services/mock");
      const page = await import("../src/routes/approvals/+page.svelte");

      // Boot: backend + chat stream (mock socket) + approvals inbox.
      backend.initBackend();
      chat.initChat();
      approvals.initApprovals();

      // Simulate the WS stream being down so the 10s REST fallback poll is
      // the sync path — the demo request must arrive exactly once (dedupe).
      backend.wsStatus.set("disconnected");

      // 5s in: the mock gate raises the high-risk terminal call.
      await vi.advanceTimersByTimeAsync(5100);
      expect(get(approvals.pendingApprovals).map((a) => a.id)).toContain("mock-approve-1");
      expect(get(approvals.approvalBadge)).toBe(1);
      // Toast fired for the fresh request.
      expect(get(approvals.approvalToasts).some((t) => t.tool === "terminal")).toBe(true);

      // 10s poll against the mock REST surface — same id, no duplicate.
      await vi.advanceTimersByTimeAsync(10_000);
      expect(get(approvals.pendingApprovals).length).toBe(1);
      expect(get(approvals.approvalBadge)).toBe(1);

      // Chat tie-in: a request for the session the user is viewing mirrors
      // inline into the message stream.
      chat.currentSessionId.set("mock-s2");
      mock.mockRaiseApproval({
        id: "inline-1",
        risk: "critical",
        tool: "fs.write",
        args: { path: "/etc/shadow" },
        session: "mock-s2",
      });
      const inline = get(chat.messages).flatMap((m) => m.blocks).find((b) => b.kind === "approval");
      expect(inline && inline.kind === "approval" ? inline.approvalId : null).toBe("inline-1");
      expect(get(approvals.approvalBadge)).toBe(2);

      // Render the real /approvals page.
      const { container } = render(page.default);
      await vi.advanceTimersByTimeAsync(0); // flush onMount effects

      // Pending card: tool name, high-risk badge in gate colors, args, clock.
      const card = container.querySelector('[data-testid="approval-card"]');
      expect(card).not.toBeNull();
      expect(card?.textContent).toContain("terminal");
      expect(card?.querySelector('[data-risk="high"]')?.textContent).toBe("high");
      expect(card?.querySelector("pre")?.textContent).toContain("git push --force");
      const clock = card?.querySelector(".clock")?.textContent ?? "";
      expect(clock.trim()).toMatch(/^⏱ \d:\d\d$/);
      // Header chip shows the pending count (feeds the nav badge upstream).
      expect(container.querySelector(".count")?.textContent).toBe("2 pending");

      // Approve the demo card.
      const approveBtn = Array.from(container.querySelectorAll("button")).find((b) =>
        b.textContent?.includes("Approve"),
      );
      expect(approveBtn).toBeDefined();
      fireEvent.click(approveBtn!);
      await vi.advanceTimersByTimeAsync(0); // flush the POST microtasks

      // Card collapses: pending drops, badge follows, history records it.
      expect(get(approvals.pendingApprovals).map((a) => a.id)).not.toContain("mock-approve-1");
      const settled = get(approvals.approvalHistory).find((a) => a.id === "mock-approve-1");
      expect(settled?.decision).toBe("approved");
      expect(get(approvals.approvalBadge)).toBe(1);

      // History section renders the decision inline.
      const history = container.querySelector("details.history");
      expect(history).not.toBeNull();
      expect(history?.textContent).toContain("terminal");
      expect(history?.querySelector('[data-decision="approved"]')?.textContent).toContain("approved");

      // Reject the inline-targeted request via the service (wire: reject).
      const rejectR = await approvals.decideApproval("inline-1", "rejected");
      expect(rejectR.success).toBe(true);
      expect(get(approvals.approvalHistory).find((a) => a.id === "inline-1")?.decision).toBe("rejected");
      expect(get(approvals.approvalBadge)).toBe(0);
      expect(container.querySelector(".count")).toBeNull();

      // Timeout sweep: a 30s request left unanswered expires → denied.
      mock.mockRaiseApproval({
        id: "doomed-1",
        risk: "high",
        tool: "terminal",
        args: {},
        session: "mock-s2",
        timeout_secs: 30,
      });
      expect(get(approvals.pendingApprovals).map((a) => a.id)).toContain("doomed-1");
      await vi.advanceTimersByTimeAsync(31_000);
      expect(get(approvals.pendingApprovals).map((a) => a.id)).not.toContain("doomed-1");
      expect(get(approvals.approvalHistory).find((a) => a.id === "doomed-1")?.decision).toBe("expired");
    } finally {
      vi.useRealTimers();
    }
  });
});
