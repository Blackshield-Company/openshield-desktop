<script lang="ts">
  import Icon from "$lib/components/Icon.svelte";
  /**
   * /swarm — agent pool monitor (M5).
   *
   * Status summary + consensus doc up top, agent cards (role / status /
   * model / task) in a grid below, and start/stop controls with honest busy
   * states. Auto-refreshes every 5s while the backend is connected; a dead
   * server shows the page-level error banner, never a silently frozen pool.
   */
  import { onDestroy } from "svelte";
  import { connected } from "$lib/services/backend";
  import {
    swarm,
    swarmLoading,
    swarmError,
    swarmActionBusy,
    refreshSwarm,
    controlSwarm,
  } from "$lib/services/swarm";

  const POLL_MS = 5000;

  let pollTimer: ReturnType<typeof setInterval> | null = null;

  function startPolling(): void {
    if (pollTimer) return;
    void refreshSwarm();
    pollTimer = setInterval(() => void refreshSwarm(), POLL_MS);
  }

  function stopPolling(): void {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
  }

  // Polling follows the connection banner: connected → poll, otherwise idle.
  $: if ($connected) startPolling();
  else stopPolling();
  onDestroy(stopPolling);

  async function onControl(action: "start" | "stop") {
    if ($swarmActionBusy) return;
    await controlSwarm(action); // busy flag always clears in the service's finally
  }

  function dismissError() {
    swarmError.set(null);
  }

  /** Map an engine/agent status string to a tone for the chip CSS. */
  function statusTone(status: string): string {
    const s = status.toLowerCase();
    if (s === "running" || s === "working" || s === "active" || s === "ok") return "ok";
    if (s === "blocked" || s === "waiting" || s === "pending" || s === "connecting") return "warn";
    if (s === "error" || s === "failed" || s === "critical") return "err";
    return "idle";
  }

  $: engineState = $swarm?.status.toLowerCase() ?? "";
  $: engineRunning = engineState === "running" || engineState === "active";
</script>

<svelte:head>
  <title>Swarm — OpenShield</title>
</svelte:head>

<div class="swarm">
  <header class="page-head">
    <h1>Swarm</h1>
    {#if $swarm}
      <span class="pill" data-testid="swarm-status" data-tone={statusTone($swarm.status)}>{$swarm.status}</span>
      {#if $swarm.round !== null && engineRunning}<span class="round-chip">round {$swarm.round}</span>{/if}
    {/if}
    <span class="spacer"></span>
    <button
      type="button"
      class="primary"
      disabled={!$connected || $swarmActionBusy !== null || engineRunning}
      onclick={() => onControl("start")}
    >
      {$swarmActionBusy === "start" ? "Starting…" : "▶ Start"}
    </button>
    <button
      type="button"
      class="danger"
      disabled={!$connected || $swarmActionBusy !== null || !engineRunning}
      onclick={() => onControl("stop")}
    >
      {$swarmActionBusy === "stop" ? "Stopping…" : "■ Stop"}
    </button>
  </header>

  {#if $swarmError}
    <div class="err-banner" role="alert">
      <span><Icon name="alert" size={15} /> {$swarmError}</span>
      <button type="button" class="dismiss" onclick={dismissError} aria-label="Dismiss error">✕</button>
    </div>
  {/if}

  {#if !$connected}
    <div class="empty">
      <div class="glyph"><Icon name="swarm" size={36} /></div>
      <h2>Swarm is out of reach.</h2>
      <p>The monitor polls <code>GET /api/v1/swarm</code> — connect to an <code>openshield serve</code> backend (or flip on Demo mode in Settings) to watch the pool.</p>
    </div>
  {:else if $swarm && $swarm.consensus}
    <section class="consensus" data-testid="consensus-panel">
      <header>🗳 Consensus doc</header>
      <pre>{$swarm.consensus}</pre>
    </section>
  {/if}

  {#if $connected}
    <section class="pool">
      {#if $swarm === null && $swarmLoading}
        <div class="empty"><p>Contacting the swarm engine…</p></div>
      {:else if $swarm === null}
        <div class="empty">
          <h2>No swarm report yet.</h2>
          <p>Start the engine to spin up the agent pool.</p>
        </div>
      {:else if $swarm.agents.length === 0}
        <div class="empty">
          <h2>Pool is empty.</h2>
          <p>The engine reports no agents — start the swarm to recruit the pool.</p>
        </div>
      {:else}
        <div class="grid">
          {#each $swarm.agents as agent (agent.id)}
            <article class="agent" data-testid="agent-card">
              <header>
                <strong>{agent.role}</strong>
                <span class="chip" data-tone={statusTone(agent.status)}>{agent.status}</span>
              </header>
              {#if agent.model}<code class="model">{agent.model}</code>{/if}
              {#if agent.task}
                <p class="task">{agent.task}</p>
              {:else}
                <p class="task faint">No active task</p>
              {/if}
            </article>
          {/each}
        </div>
      {/if}
    </section>
  {/if}
</div>

<style>
  .swarm {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .page-head {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .page-head h1 {
    font-size: 18px;
  }

  .spacer {
    flex: 1;
  }

  .pill {
    font-family: var(--font-mono);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    border-radius: 999px;
    padding: 2px 10px;
    border: 1px solid var(--border-strong);
    color: var(--text);
  }

  .pill[data-tone="ok"] {
    border-color: var(--ok);
    color: var(--ok);
  }

  .pill[data-tone="warn"] {
    border-color: var(--warn);
    color: var(--warn);
  }

  .pill[data-tone="err"] {
    border-color: var(--err);
    color: var(--err);
  }

  .round-chip {
    font-family: var(--font-mono);
    font-size: 10.5px;
    color: var(--text-faint);
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

  .consensus {
    border: 1px solid var(--border);
    border-left: 3px solid var(--accent);
    border-radius: var(--radius);
    background: var(--bg-elevated);
    padding: 10px 14px;
  }

  .consensus header {
    color: var(--text-strong);
    font-weight: 600;
    font-size: 13px;
    margin-bottom: 6px;
  }

  .consensus pre {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
    font-size: 12px;
    color: var(--text);
    line-height: 1.55;
  }

  .pool {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 10px;
  }

  .agent {
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--bg-inset);
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .agent header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .agent strong {
    color: var(--text-strong);
    font-size: 13.5px;
    text-transform: capitalize;
  }

  .chip {
    font-family: var(--font-mono);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    border-radius: 999px;
    padding: 2px 8px;
    border: 1px solid var(--border-strong);
    color: var(--text-faint);
  }

  .chip[data-tone="ok"] {
    border-color: var(--ok);
    color: var(--ok);
  }

  .chip[data-tone="warn"] {
    border-color: var(--warn);
    color: var(--warn);
  }

  .chip[data-tone="err"] {
    border-color: var(--err);
    color: var(--err);
  }

  .model {
    font-size: 11px;
    color: var(--text-faint);
    word-break: break-all;
  }

  .task {
    margin: 0;
    font-size: 12.5px;
    color: var(--text);
    line-height: 1.45;
  }

  .task.faint {
    color: var(--text-faint);
    font-style: italic;
  }

  .danger {
    border-color: var(--err);
    color: var(--err);
  }

  .danger:hover:not(:disabled) {
    background: var(--accent-soft);
    border-color: var(--err);
  }

  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    text-align: center;
    color: var(--text-faint);
    padding: 32px 24px;
    border: 1px dashed var(--border-strong);
    border-radius: 10px;
    background: var(--bg-elevated);
  }

  .empty .glyph {
    font-size: 36px;
  }

  .empty h2 {
    font-size: 15px;
  }

  .empty p {
    margin: 0;
    max-width: 460px;
    font-size: 13px;
  }

  .empty code {
    font-size: 11.5px;
  }
</style>
