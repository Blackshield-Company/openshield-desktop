<script lang="ts">
  import Icon from "$lib/components/Icon.svelte";
  /**
   * /approvals — the approval inbox (M3).
   *
   * Pending High/Critical security-gate requests from the L1–L4 engine: tool
   * name, risk badge, pretty args, owning session, and a live countdown from
   * the 120s deny-by-default timeout. Decisions POST to
   * /api/v1/approvals/:id; the WS stream (or the 10s REST fallback) keeps the
   * inbox honest. Settled requests collapse into the history section.
   */
  import { onMount } from "svelte";
  import {
    pendingApprovals,
    approvalHistory,
    approvalError,
    approvalBadge,
    now,
    initApprovals,
    refreshApprovals,
  } from "$lib/services/approvals";
  import { wsStatus } from "$lib/services/backend";
  import ApprovalCard from "$lib/components/approvals/ApprovalCard.svelte";

  let refreshing = false;

  onMount(() => {
    initApprovals(); // idempotent — the layout may have beaten us to it
  });

  async function onRefresh() {
    refreshing = true;
    try {
      await refreshApprovals();
    } finally {
      refreshing = false;
    }
  }

  function dismissError() {
    approvalError.set(null);
  }

  function timeAgo(ts: number): string {
    const s = Math.max(0, Math.round(($now - ts) / 1000));
    if (s < 5) return "just now";
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }

  function decisionLabel(d: string): string {
    if (d === "approve_always") return "approved · always";
    if (d === "expired") return "expired → denied";
    return d;
  }
</script>

<svelte:head>
  <title>Approvals — OpenShield</title>
</svelte:head>

<div class="approvals">
  <header class="page-head">
    <h1>Approvals</h1>
    {#if $approvalBadge > 0}<span class="count">{$approvalBadge} pending</span>{/if}
    <span class="spacer"></span>
    {#if $wsStatus !== "connected"}
      <span class="poll-note" title="The WS stream is down; decisions still POST, and the inbox re-syncs every 10s.">
        <Icon name="refresh" size={13} /> polling fallback (10s)
      </span>
    {/if}
    <button type="button" onclick={onRefresh} disabled={refreshing}>
      {refreshing ? "Refreshing…" : "↻ Refresh"}
    </button>
  </header>

  {#if $approvalError}
    <div class="err-banner" role="alert">
      <span><Icon name="alert" size={15} /> {$approvalError}</span>
      <button type="button" class="dismiss" onclick={dismissError} aria-label="Dismiss error">✕</button>
    </div>
  {/if}

  <section class="inbox" aria-label="Pending approvals">
    {#if $pendingApprovals.length === 0}
      <div class="empty">
        <div class="glyph"><Icon name="approvals" size={36} /></div>
        <h2>Inbox clear.</h2>
        <p>
          When the guardrail gate pauses a risky tool call, it lands here with
          a 120-second window before it denies by default.
        </p>
        <small>Demo: flip on Demo mode in Settings and wait 5s for a high-risk terminal call.</small>
      </div>
    {:else}
      {#each $pendingApprovals as a (a.id)}
        <ApprovalCard approval={a} />
      {/each}
    {/if}
  </section>

  {#if $approvalHistory.length > 0}
    <details class="history">
      <summary>
        History <span class="hist-count">({$approvalHistory.length})</span>
      </summary>
      <ul>
        {#each $approvalHistory as h (h.id)}
          <li class:rejected={h.decision === "rejected" || h.decision === "expired"}>
            <span class="h-tool"><Icon name="tool" size={13} /> {h.tool}</span>
            <span class="h-risk" data-risk={h.risk}>{h.risk}</span>
            <span class="h-decision" data-decision={h.decision}>{decisionLabel(h.decision)}</span>
            <span class="h-when">{timeAgo(h.resolvedAt)}</span>
          </li>
        {/each}
      </ul>
    </details>
  {/if}
</div>

<style>
  .approvals {
    display: flex;
    flex-direction: column;
    gap: 14px;
    max-width: 860px;
    width: 100%;
    margin: 0 auto;
  }

  .page-head {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .page-head h1 {
    font-size: 18px;
  }

  .count {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--err);
    border: 1px solid var(--err);
    border-radius: 999px;
    padding: 2px 8px;
  }

  .spacer {
    flex: 1;
  }

  .poll-note {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--warn);
  }

  .err-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    background: var(--accent-soft);
    border: 1px solid var(--err);
    color: var(--text-strong);
    border-radius: var(--radius);
    padding: 7px 12px;
    font-size: 13px;
  }

  .dismiss {
    border: none;
    background: transparent;
    padding: 2px 6px;
    color: var(--text-faint);
  }

  .inbox {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    text-align: center;
    color: var(--text-faint);
    padding: 40px 20px;
    border: 1px dashed var(--border-strong);
    border-radius: 10px;
  }

  .empty .glyph {
    font-size: 34px;
  }

  .empty h2 {
    font-size: 15px;
  }

  .empty p {
    margin: 0;
    max-width: 440px;
    font-size: 13px;
  }

  .empty small {
    font-family: var(--font-mono);
    font-size: 11px;
  }

  .history summary {
    cursor: pointer;
    font-size: 13px;
    color: var(--text);
    padding: 6px 2px;
    user-select: none;
  }

  .hist-count {
    color: var(--text-faint);
  }

  .history ul {
    list-style: none;
    margin: 6px 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .history li {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--bg-elevated);
    font-size: 12px;
  }

  .h-tool {
    font-family: var(--font-mono);
    color: var(--text-strong);
  }

  .h-risk {
    font-family: var(--font-mono);
    font-size: 9.5px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 1px 6px;
    border-radius: 999px;
    border: 1px solid var(--ok);
    color: var(--ok);
  }

  .h-risk[data-risk="high"],
  .h-risk[data-risk="critical"] {
    border-color: var(--err);
    color: var(--err);
  }

  .h-risk[data-risk="medium"] {
    border-color: var(--warn);
    color: var(--warn);
  }

  .h-decision {
    color: var(--ok);
  }

  .h-decision[data-decision="rejected"],
  .h-decision[data-decision="expired"] {
    color: var(--err);
  }

  .h-decision[data-decision="approve_always"] {
    color: var(--warn);
  }

  li.rejected {
    opacity: 0.75;
  }

  .h-when {
    margin-left: auto;
    color: var(--text-faint);
    font-family: var(--font-mono);
    font-size: 11px;
  }
</style>
