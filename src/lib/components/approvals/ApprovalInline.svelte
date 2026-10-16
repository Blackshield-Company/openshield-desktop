<script lang="ts">
  import Icon from "$lib/components/Icon.svelte";
  /**
   * ApprovalInline — chat-stream variant of the approval gate. Reads the
   * shared pending/history stores by id, so a decision made HERE or on the
   * /approvals page settles the card everywhere at once.
   */
  import {
    pendingApprovals,
    approvalHistory,
  } from "$lib/services/approvals";
  import ApprovalCard from "./ApprovalCard.svelte";

  export let approvalId: string;

  $: pending = $pendingApprovals.find((a) => a.id === approvalId) ?? null;
  $: resolved = $approvalHistory.find((a) => a.id === approvalId) ?? null;
</script>

{#if pending}
  <div class="inline-wrap">
    <span class="gate-tag">⏸ security gate — human approval required</span>
    <ApprovalCard approval={pending} inline />
  </div>
{:else if resolved}
  <div class="settled" data-decision={resolved.decision}>
    <Icon name="tool" size={13} /> {resolved.tool} — {resolved.decision === "approve_always" ? "approved (always)" : resolved.decision}
  </div>
{:else}
  <!-- Unknown id (e.g. resumed history) — show nothing rather than a zombie. -->
{/if}

<style>
  .inline-wrap {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin: 6px 0;
  }

  .gate-tag {
    font-family: var(--font-mono);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--warn);
  }

  .settled {
    font-family: var(--font-mono);
    font-size: 11.5px;
    color: var(--text-faint);
    margin: 6px 0;
  }

  .settled[data-decision="approved"],
  .settled[data-decision="approve_always"] {
    color: var(--ok);
  }

  .settled[data-decision="rejected"],
  .settled[data-decision="expired"] {
    color: var(--err);
  }
</style>
