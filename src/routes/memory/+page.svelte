<script lang="ts">
  /**
   * /memory — memory store browser (M5).
   *
   * Search box with a 250ms debounce into GET /api/v1/memory/search?q=
   * (design doc §3.1). An empty query loads recent entries, so the screen
   * browses even before the user types. Result cards carry session, project,
   * timestamp, snippet, and a relevance score when the backend ships one.
   */
  import { onMount } from "svelte";
  import { get } from "svelte/store";
  import {
    memoryEntries,
    memoryLoading,
    memoryError,
    memoryLoaded,
    searchMemory,
    queueMemorySearch,
  } from "$lib/services/memory";

  let query = "";

  onMount(() => {
    // Initial recents load — only if nothing has searched yet this session.
    if (!get(memoryLoaded)) void searchMemory("");
  });

  function onInput() {
    queueMemorySearch(query);
  }

  function onSubmit(e: SubmitEvent) {
    e.preventDefault();
    void searchMemory(query); // explicit submit skips the debounce
  }

  function dismissError() {
    memoryError.set(null);
  }

  function fmtTime(ts: string | null): string {
    if (!ts) return "";
    const d = new Date(ts);
    return Number.isNaN(d.getTime()) ? ts : d.toLocaleString();
  }
</script>

<svelte:head>
  <title>Memory — OpenShield</title>
</svelte:head>

<div class="memory">
  <header class="page-head">
    <h1>🧠 Memory</h1>
    {#if $memoryLoaded}
      <span class="count">{ $memoryEntries.length } { $memoryEntries.length === 1 ? "entry" : "entries" }</span>
    {/if}
  </header>

  <form class="search" onsubmit={onSubmit} role="search">
    <input
      type="search"
      bind:value={query}
      oninput={onInput}
      placeholder="Search the memory store… (session, project, content)"
      aria-label="Search memory"
    />
    {#if $memoryLoading}<span class="busy" aria-live="polite">Searching…</span>{/if}
  </form>

  {#if $memoryError}
    <div class="err-banner" role="alert">
      <span>⚠ {$memoryError}</span>
      <button type="button" class="dismiss" onclick={dismissError} aria-label="Dismiss error">✕</button>
    </div>
  {/if}

  <div class="results">
    {#if $memoryLoaded && $memoryEntries.length === 0 && !$memoryLoading}
      <div class="empty" data-testid="memory-empty">
        <div class="glyph" aria-hidden="true">🧠</div>
        <h2>No memories matched.</h2>
        <p>{query.trim() ? `Nothing in the store matches “${query.trim()}”.` : "The memory store is empty."}</p>
      </div>
    {:else}
      {#each $memoryEntries as entry (entry.id)}
        <article class="hit" data-testid="memory-card">
          <p class="snippet">{entry.snippet}</p>
          <footer>
            {#if entry.session}<span class="tag" title="Session">🗂 {entry.session}</span>{/if}
            {#if entry.project}<span class="tag" title="Project">📁 {entry.project}</span>{/if}
            {#if entry.timestamp}<time datetime={entry.timestamp}>🕒 {fmtTime(entry.timestamp)}</time>{/if}
            {#if entry.score !== null}
              <span class="score" title="Relevance score">{Math.round(entry.score * 100)}%</span>
            {/if}
          </footer>
        </article>
      {/each}
      {#if $memoryLoading && $memoryEntries.length === 0}
        <div class="empty"><p>Searching the memory store…</p></div>
      {/if}
    {/if}
  </div>
</div>

<style>
  .memory {
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

  .count {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--text-faint);
  }

  .search {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .search input {
    flex: 1;
    min-width: 0;
  }

  .busy {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--text-faint);
    white-space: nowrap;
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

  .results {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .hit {
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--bg-inset);
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .snippet {
    margin: 0;
    font-size: 13.5px;
    color: var(--text-strong);
    line-height: 1.5;
    word-break: break-word;
  }

  .hit footer {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    font-family: var(--font-mono);
    font-size: 10.5px;
    color: var(--text-faint);
  }

  .score {
    margin-left: auto;
    border: 1px solid var(--border-strong);
    border-radius: 999px;
    padding: 1px 8px;
    color: var(--text);
  }

  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    text-align: center;
    color: var(--text-faint);
    padding: 40px 24px;
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
    max-width: 420px;
    font-size: 13px;
  }
</style>
