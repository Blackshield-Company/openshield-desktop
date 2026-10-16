<script lang="ts">
  import Icon from "$lib/components/Icon.svelte";
  /**
   * /sessions — list, resume, and start sessions (M2).
   *
   * List comes from GET /api/v1/sessions (or the mock store). Resuming loads
   * the history via GET /api/v1/sessions/:id and hands off to /chat.
   */
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import {
    sessions,
    sessionsLoading,
    currentSessionId,
    refreshSessions,
    resumeSession,
    newSession,
  } from "$lib/services/chat";

  let busyId: string | null = null;
  let error: string | null = null;

  onMount(() => {
    void onRefresh();
  });

  async function onResume(id: string) {
    if (busyId) return;
    busyId = id;
    error = null;
    try {
      const r = await resumeSession(id);
      if (r.success) {
        await goto(`/chat?session=${encodeURIComponent(id)}`);
      } else {
        error = r.error;
      }
    } finally {
      busyId = null;
    }
  }

  async function onNew() {
    if (busyId) return;
    newSession();
    await goto("/chat");
  }

  async function onRefresh() {
    error = null;
    const r = await refreshSessions();
    if (!r.success) error = r.error;
  }

  function relTime(iso: string): string {
    if (!iso) return "";
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return iso;
    const mins = Math.max(0, Math.round((Date.now() - t) / 60_000));
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins} min ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours} h ago`;
    return new Date(t).toLocaleDateString();
  }

  function shortId(id: string): string {
    return id.length > 12 ? `${id.slice(0, 12)}…` : id;
  }
</script>

<svelte:head>
  <title>Sessions — OpenShield</title>
</svelte:head>

<header class="page-head">
  <h1>Sessions</h1>
  <span class="spacer"></span>
  <button type="button" class="primary" onclick={() => void onNew()} disabled={busyId !== null}>
    ＋ New session
  </button>
  <button type="button" onclick={() => void onRefresh()} disabled={$sessionsLoading}>
    {$sessionsLoading ? "Loading…" : "↻ Refresh"}
  </button>
</header>

{#if error}
  <div class="err-banner" role="alert"><Icon name="alert" size={15} /> {error}</div>
{/if}

{#if $sessionsLoading && $sessions.length === 0}
  <p class="hint">Loading sessions…</p>
{:else if $sessions.length === 0}
  <div class="empty">
    <div class="glyph"><Icon name="sessions" size={36} /></div>
    <h2>No sessions yet</h2>
    <p>Start one from Chat — it lands here once the backend has it.</p>
    <button type="button" class="primary" onclick={() => void onNew()}>Open a new session</button>
  </div>
{:else}
  <ul class="list">
    {#each $sessions as s (s.id)}
      <li>
        <button
          type="button"
          class="sess"
          class:current={s.id === $currentSessionId}
          onclick={() => void onResume(s.id)}
          disabled={busyId !== null}
        >
          <span class="title">{s.title}</span>
          <span class="meta">
            {shortId(s.id)}{#if relTime(s.updatedAt)} · {relTime(s.updatedAt)}{/if}
            {#if s.id === $currentSessionId} · current{/if}
          </span>
          <span class="go" aria-hidden="true">➤</span>
        </button>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .page-head {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 14px;
  }

  .page-head h1 {
    font-size: 18px;
  }

  .spacer {
    flex: 1;
  }

  .err-banner {
    background: var(--accent-soft);
    border: 1px solid var(--err);
    color: var(--text-strong);
    border-radius: var(--radius);
    padding: 7px 12px;
    font-size: 13px;
    margin-bottom: 12px;
  }

  .hint {
    color: var(--text-faint);
  }

  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    text-align: center;
    margin: 8vh auto 0;
    max-width: 420px;
    padding: 32px;
    border: 1px dashed var(--border-strong);
    border-radius: 10px;
    background: var(--bg-elevated);
    color: var(--text-faint);
  }

  .empty .glyph {
    font-size: 38px;
  }

  .empty h2 {
    font-size: 16px;
  }

  .empty p {
    margin: 0;
    font-size: 13px;
  }

  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-width: 760px;
  }

  .sess {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    text-align: left;
    padding: 12px 14px;
    background: var(--bg-elevated);
  }

  .sess.current {
    border-color: var(--accent);
  }

  .title {
    color: var(--text-strong);
    font-weight: 600;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .meta {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--text-faint);
    white-space: nowrap;
  }

  .go {
    color: var(--accent);
  }
</style>
