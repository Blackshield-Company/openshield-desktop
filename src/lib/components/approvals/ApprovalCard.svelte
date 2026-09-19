<script lang="ts">
  /**
   * ApprovalCard — one pending security-gate request. Tool name, risk badge
   * (high/critical in gate-red), pretty-printed args, owning session, and a
   * live countdown from the 120s deny-by-default timeout. Approve / Reject /
   * Approve-always post the decision; buttons show loading state and always
   * re-enable in `finally` (AGENTS.md hard rule).
   */
  import { now, decideApproval, type ApprovalRequest } from "$lib/services/approvals";

  export let approval: ApprovalRequest;
  /** Compact rendering for the chat inline variant. */
  export let inline = false;

  let busy: "approved" | "rejected" | "approve_always" | null = null;
  let failed: string | null = null;

  $: remaining = Math.max(0, approval.expiresAt - $now);
  $: expired = remaining <= 0;
  $: argsPretty = JSON.stringify(approval.args ?? {}, null, 2);
  $: countdown = formatCountdown(remaining);

  function formatCountdown(ms: number): string {
    const total = Math.ceil(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  async function decide(decision: "approved" | "rejected" | "approve_always") {
    if (busy) return;
    busy = decision;
    failed = null;
    try {
      const r = await decideApproval(approval.id, decision);
      if (!r.success) failed = r.error;
    } finally {
      // Always re-enable — a dead server shows an error, never a dead button.
      busy = null;
    }
  }

  function shortSession(id: string): string {
    if (!id) return "—";
    return id.length > 14 ? `${id.slice(0, 14)}…` : id;
  }
</script>

<div class="approval-card" class:inline class:expired data-testid="approval-card">
  <div class="head">
    <span class="tool">🛡 {approval.tool}</span>
    <span class="risk" data-risk={approval.risk}>{approval.risk}</span>
    <span class="sess" title={approval.session}>{shortSession(approval.session)}</span>
    <span class="clock" class:urgent={remaining < 15_000} title="Deny-by-default timeout">
      ⏱ {expired ? "expired" : countdown}
    </span>
  </div>

  {#if !inline}
    <pre class="args">{argsPretty}</pre>
  {/if}

  {#if failed}
    <div class="fail" role="alert">⚠ {failed}</div>
  {/if}

  {#if expired}
    <div class="expired-note">Timed out — the gate denied this call (default-deny, §6).</div>
  {:else}
    <div class="actions">
      <button
        type="button"
        class="approve"
        disabled={busy !== null}
        onclick={() => decide("approved")}
      >
        {busy === "approved" ? "Approving…" : "✓ Approve"}
      </button>
      <button
        type="button"
        class="always"
        disabled={busy !== null}
        onclick={() => decide("approve_always")}
      >
        {busy === "approve_always" ? "Saving…" : "✓✓ Always"}
      </button>
      <button
        type="button"
        class="reject"
        disabled={busy !== null}
        onclick={() => decide("rejected")}
      >
        {busy === "rejected" ? "Rejecting…" : "✕ Reject"}
      </button>
    </div>
  {/if}
</div>

<style>
  .approval-card {
    border: 1px solid var(--err);
    border-left: 3px solid var(--err);
    border-radius: var(--radius);
    background: var(--bg-elevated);
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .approval-card.inline {
    padding: 8px 10px;
    min-width: 260px;
  }

  .head {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .tool {
    font-family: var(--font-mono);
    font-size: 12.5px;
    font-weight: 600;
    color: var(--text-strong);
  }

  .risk {
    font-size: 10px;
    font-family: var(--font-mono);
    text-transform: uppercase;
    letter-spacing: 0.07em;
    padding: 1px 7px;
    border-radius: 999px;
    border: 1px solid var(--ok);
    color: var(--ok);
  }

  /* High/Critical ride the gate-red. This is the color that matters. */
  .risk[data-risk="high"],
  .risk[data-risk="critical"] {
    border-color: var(--err);
    color: var(--err);
    background: var(--accent-soft);
  }

  .risk[data-risk="medium"] {
    border-color: var(--warn);
    color: var(--warn);
  }

  .sess {
    font-family: var(--font-mono);
    font-size: 10.5px;
    color: var(--text-faint);
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 1px 7px;
  }

  .clock {
    margin-left: auto;
    font-family: var(--font-mono);
    font-size: 11.5px;
    color: var(--text);
  }

  .clock.urgent {
    color: var(--err);
    animation: blink 0.9s steps(2) infinite;
  }

  @keyframes blink {
    50% {
      opacity: 0.35;
    }
  }

  .args {
    margin: 0;
    padding: 8px 10px;
    background: var(--bg-inset);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    font-size: 12px;
    line-height: 1.45;
    overflow-x: auto;
    color: var(--text);
  }

  .fail {
    font-size: 12.5px;
    color: var(--err);
  }

  .expired-note {
    font-size: 12.5px;
    color: var(--text-faint);
    font-style: italic;
  }

  .actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .actions button {
    font-size: 12.5px;
    padding: 6px 12px;
  }

  .approve {
    border-color: var(--ok);
    color: var(--ok);
  }

  .approve:hover:not(:disabled) {
    background: var(--ok);
    color: var(--bg);
  }

  .always {
    border-color: var(--warn);
    color: var(--warn);
  }

  .always:hover:not(:disabled) {
    background: var(--warn);
    color: var(--bg);
  }

  .reject {
    margin-left: auto;
    border-color: var(--err);
    color: var(--err);
  }

  .reject:hover:not(:disabled) {
    background: var(--err);
    color: var(--bg);
  }

  .approval-card.expired {
    opacity: 0.65;
    border-style: dashed;
  }
</style>
