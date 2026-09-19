<script lang="ts">
  /**
   * /chat — streaming chat (M2).
   *
   * Message list with live token rendering, inline tool-call cards, perf
   * footer from the last turn_done, and a composer with send + abort.
   * Stream state lives in $lib/services/chat; this page only renders it.
   */
  import { onMount, tick } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import {
    messages,
    currentSessionId,
    streaming,
    perf,
    chatError,
    sendMessage,
    abortTurn,
    resumeSession,
    newSession,
    initChat,
    type ChatMessage,
  } from "$lib/services/chat";
  import MessageBubble from "$lib/components/chat/MessageBubble.svelte";
  import ModelPicker from "$lib/components/chat/ModelPicker.svelte";

  let input = "";
  let sendBusy = false;
  let listEl: HTMLDivElement | null = null;
  /** Stick to the bottom only while the user is already near the bottom. */
  let stick = true;

  onMount(() => {
    initChat(); // idempotent — layout may have beaten us to it
    const sid = $page.url.searchParams.get("session");
    if (sid && sid !== $currentSessionId) void resumeSession(sid);
  });

  async function onSend() {
    if (!input.trim() || $streaming || sendBusy) return;
    sendBusy = true;
    try {
      const r = sendMessage(input);
      if (r.success) {
        input = "";
        stick = true;
      }
    } finally {
      sendBusy = false;
    }
  }

  function onAbort() {
    abortTurn();
  }

  function onNewChat() {
    newSession();
    if ($page.url.pathname !== "/chat" || $page.url.searchParams.has("session")) {
      void goto("/chat");
    }
  }

  function dismissError() {
    chatError.set(null);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void onSend();
    }
  }

  function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    void onSend();
  }

  function handleScroll() {
    if (!listEl) return;
    stick = listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight < 60;
  }

  // Keep the stream pinned to the newest token while the user is tailing.
  $: void tail($messages, $streaming);
  function tail(_m: ChatMessage[], _s: boolean) {
    if (!stick) return;
    void tick().then(() => {
      if (listEl) listEl.scrollTop = listEl.scrollHeight;
    });
  }

  function shortId(id: string | null): string {
    if (!id) return "";
    return id.length > 14 ? `${id.slice(0, 14)}…` : id;
  }
</script>

<svelte:head>
  <title>Chat — OpenShield</title>
</svelte:head>

<div class="chat">
  <header class="page-head">
    <h1>💬 Chat</h1>
    {#if $currentSessionId}<span class="sess-chip" title={$currentSessionId}>{shortId($currentSessionId)}</span>{/if}
    <ModelPicker />
    <span class="spacer"></span>
    <button type="button" onclick={onNewChat} disabled={$streaming}>New session</button>
  </header>

  {#if $chatError}
    <div class="err-banner" role="alert">
      <span>⚠ {$chatError}</span>
      <button type="button" class="dismiss" onclick={dismissError} aria-label="Dismiss error">✕</button>
    </div>
  {/if}

  <div class="scroll" bind:this={listEl} onscroll={handleScroll}>
    {#if $messages.length === 0}
      <div class="empty">
        <div class="glyph" aria-hidden="true">🛡</div>
        <h2>The shield is up.</h2>
        <p>
          Send a message to open a session — tokens stream live over
          <code>/ws/v1/chat</code>, tool calls render inline as they run.
        </p>
        <small>Tip: flip on Demo mode in Settings to try it with no server.</small>
      </div>
    {:else}
      <div class="stream">
        {#each $messages as msg (msg.id)}
          <MessageBubble message={msg} streaming={$streaming && msg.id === $messages[$messages.length - 1]?.id} />
        {/each}
      </div>
    {/if}
  </div>

  <footer class="perf" aria-live="polite">
    {#if $perf}
      <span>{$perf.tokens} tokens</span>
      <span>{$perf.ms.toLocaleString()} ms</span>
      <span>{$perf.tps === null ? "— tok/s" : `${$perf.tps.toFixed(1)} tok/s`}</span>
    {:else}
      <span class="faint">No turns yet</span>
    {/if}
  </footer>

  <form class="composer" onsubmit={handleSubmit}>
    <textarea
      bind:value={input}
      onkeydown={handleKeydown}
      placeholder="Message the harness… (Enter to send, Shift+Enter for a newline)"
      rows="2"
      aria-label="Chat message"
    ></textarea>
    {#if $streaming}
      <button type="button" class="abort" onclick={onAbort}>■ Abort</button>
    {:else}
      <button type="submit" class="primary" disabled={!input.trim() || sendBusy}>
        {sendBusy ? "Sending…" : "Send ➤"}
      </button>
    {/if}
  </form>
</div>

<style>
  .chat {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .page-head {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    row-gap: 6px;
  }

  .page-head h1 {
    font-size: 18px;
  }

  .spacer {
    flex: 1;
  }

  .sess-chip {
    font-family: var(--font-mono);
    font-size: 10.5px;
    color: var(--text-faint);
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 2px 8px;
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

  .scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--bg-inset);
    padding: 14px;
  }

  .stream {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .empty {
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    text-align: center;
    color: var(--text-faint);
    padding: 24px;
  }

  .empty .glyph {
    font-size: 40px;
  }

  .empty h2 {
    font-size: 16px;
  }

  .empty p {
    margin: 0;
    max-width: 420px;
    font-size: 13px;
  }

  .empty small {
    font-family: var(--font-mono);
    font-size: 11px;
  }

  .perf {
    display: flex;
    gap: 16px;
    font-family: var(--font-mono);
    font-size: 11.5px;
    color: var(--text);
    padding: 0 4px;
    min-height: 16px;
  }

  .perf .faint {
    color: var(--text-faint);
  }

  .composer {
    display: flex;
    gap: 8px;
    align-items: flex-end;
  }

  .composer textarea {
    flex: 1;
    resize: none;
    line-height: 1.45;
  }

  .composer button {
    white-space: nowrap;
    height: fit-content;
  }

  .composer .abort {
    border-color: var(--err);
    color: var(--err);
  }
</style>
