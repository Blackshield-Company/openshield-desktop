<script lang="ts">
  import "../app.css";
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { status, lastError, initBackend, config, wsStatus } from "$lib/services/backend";
  import { initChat, retryChatStream } from "$lib/services/chat";
  import { initApprovals, approvalBadge, approvalToasts, dismissToast } from "$lib/services/approvals";
  import { theme, THEMES } from "$lib/themes";

  interface NavRoute {
    path: string;
    label: string;
    icon: string;
  }

  const NAV: NavRoute[] = [
    { path: "/chat", label: "Chat", icon: "💬" },
    { path: "/sessions", label: "Sessions", icon: "🗂" },
    { path: "/approvals", label: "Approvals", icon: "🛡" },
    { path: "/swarm", label: "Swarm", icon: "🐝" },
    { path: "/memory", label: "Memory", icon: "🧠" },
    { path: "/doctor", label: "Doctor", icon: "🩺" },
    { path: "/settings", label: "Settings", icon: "⚙" },
  ];

  // Boot the backend connection in the background — first render never waits.
  onMount(() => {
    initBackend();
    initChat();
    initApprovals();
  });

  $: currentPath = $page.url.pathname;
  $: isActive = (p: string) =>
    currentPath === p || (p !== "/chat" && currentPath.startsWith(p));
</script>

<div class="shell">
  <!-- Wide layout: left sidebar rail -->
  <nav class="rail" aria-label="Primary">
    <div class="brand">
      <span class="shield">🛡</span>
      <div class="brand-text">
        <strong>OpenShield</strong>
        <small>{$config.host}:{$config.port}</small>
      </div>
    </div>
    <ul>
      {#each NAV as r}
        <li>
          <a href={r.path} class:active={isActive(r.path)}>
            <span class="icon" aria-hidden="true">{r.icon}</span>
            <span>{r.label}</span>
            {#if r.path === "/approvals" && $approvalBadge > 0}
              <span class="badge" aria-label="{$approvalBadge} pending approvals">{$approvalBadge}</span>
            {/if}
          </a>
        </li>
      {/each}
    </ul>
    <div class="rail-footer">
      <div class="theme-dots" aria-label="Theme">
        {#each THEMES as t}
          <button
            class="dot"
            class:selected={$theme === t.id}
            style:background={t.swatches[2]}
            title={t.label}
            aria-label={`Switch to ${t.label} theme`}
            onclick={() => theme.set(t.id)}
          ></button>
        {/each}
      </div>
    </div>
  </nav>

  <div class="main">
    {#if $status !== "connected"}
      <!-- Hard rule: disconnected = tappable banner OPENING connection settings.
           The retry lives on the settings screen (Save & connect / Retry). -->
      <a class="banner" class:connecting={$status === "connecting"} href="/settings">
        {#if $status === "connecting"}
          ⟳ Connecting to openshield serve…
        {:else}
          ⚠ Disconnected from {$config.host}:{$config.port}
          {#if $lastError}— {$lastError}{/if} — tap to open connection settings
        {/if}
      </a>
    {:else if $wsStatus !== "connected"}
      <!-- REST is fine but the chat stream is down — the chat service is
           already backing off and retrying; the tap forces an immediate retry. -->
      <button
        class="banner"
        class:connecting={$wsStatus === "connecting"}
        onclick={retryChatStream}
        title="Tap to retry the chat stream now"
      >
        {#if $wsStatus === "connecting"}
          ⟳ Reconnecting chat stream ({$config.host}:{$config.port})…
        {:else}
          ⚠ Chat stream disconnected — tap to retry
        {/if}
      </button>
    {/if}

    <main>
      <div class="page">
        <slot />
      </div>
    </main>

    <!-- Narrow layout: bottom nav (same routes, media-query driven) -->
    <nav class="bottom" aria-label="Primary">
      {#each NAV as r}
        <a href={r.path} class:active={isActive(r.path)}>
          <span class="icon" aria-hidden="true">{r.icon}</span>
          {#if r.path === "/approvals" && $approvalBadge > 0}
            <span class="badge" aria-label="{$approvalBadge} pending approvals">{$approvalBadge}</span>
          {/if}
          <span class="label">{r.label}</span>
        </a>
      {/each}
    </nav>
  </div>

  <!-- In-app toasts for fresh approval_req events (native-notification
       style; the inbox is always the source of truth). -->
  {#if $approvalToasts.length > 0}
    <div class="toasts" role="status" aria-live="polite">
      {#each $approvalToasts as t (t.id)}
        <div class="toast" data-testid="approval-toast">
          <a class="toast-body" href="/approvals">
            <strong>Approval needed: {t.tool}</strong>
            <small>risk {t.risk}{t.session ? ` · ${t.session.slice(0, 12)}` : ""} — tap to review</small>
          </a>
          <button type="button" class="toast-dismiss" onclick={() => dismissToast(t.id)} aria-label="Dismiss">
            ✕
          </button>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .shell {
    display: flex;
    height: 100vh;
    overflow: hidden;
  }

  /* ── Sidebar rail (wide) ── */
  .rail {
    display: none;
    flex-direction: column;
    width: var(--nav-rail-width);
    flex: 0 0 var(--nav-rail-width);
    background: var(--bg-elevated);
    border-right: 1px solid var(--border);
    padding: 16px 10px;
    gap: 16px;
  }

  @media (min-width: 760px) {
    .rail {
      display: flex;
    }
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 8px;
  }

  .shield {
    font-size: 22px;
    line-height: 1;
  }

  .brand-text {
    display: flex;
    flex-direction: column;
  }

  .brand-text strong {
    color: var(--text-strong);
    letter-spacing: 0.02em;
  }

  .brand-text small {
    color: var(--text-faint);
    font-family: var(--font-mono);
    font-size: 11px;
  }

  .rail ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
  }

  .rail a {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 10px;
    border-radius: var(--radius);
    color: var(--text);
    border-left: 3px solid transparent;
  }

  .rail a:hover {
    background: var(--surface-hover);
    color: var(--text-strong);
  }

  .rail a.active {
    background: var(--accent-soft);
    color: var(--text-strong);
    border-left-color: var(--accent);
  }

  /* Pending-approval badge — rail + bottom nav. Blood-red, impossible to miss. */
  .badge {
    margin-left: auto;
    min-width: 18px;
    height: 18px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0 5px;
    border-radius: 999px;
    background: var(--err);
    color: var(--accent-contrast);
    font-family: var(--font-mono);
    font-size: 10.5px;
    font-weight: 700;
    line-height: 1;
  }

  .bottom .badge {
    position: absolute;
    top: 4px;
    margin-left: 0;
    transform: translateX(10px);
  }

  .bottom a {
    position: relative;
  }

  .rail-footer {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 0 8px;
  }

  .theme-dots {
    display: flex;
    gap: 8px;
  }

  .dot {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    padding: 0;
    border: 2px solid var(--border-strong);
  }

  .dot.selected {
    border-color: var(--text-strong);
    box-shadow: 0 0 0 2px var(--accent-soft);
  }

  /* ── Main column ── */
  .main {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  main {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }

  /* Page wrapper: normal block flow for standard pages, flex-fill for
     full-height screens like /chat that manage their own scrolling. */
  .page {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    padding: 20px;
  }

  @media (max-width: 759px) {
    .page {
      padding: 14px;
      padding-bottom: calc(var(--nav-bottom-height) + 14px);
    }
  }

  .banner {
    display: block;
    width: 100%;
    border: none;
    border-radius: 0;
    border-bottom: 1px solid var(--border);
    background: var(--accent-soft);
    color: var(--text-strong);
    padding: 8px 14px;
    text-align: center;
    font-size: 13px;
    text-decoration: none;
    cursor: pointer;
  }

  .banner.connecting {
    color: var(--warn);
  }

  /* ── Bottom nav (narrow) ── */
  .bottom {
    display: flex;
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    height: var(--nav-bottom-height);
    background: var(--bg-elevated);
    border-top: 1px solid var(--border);
    z-index: 10;
  }

  .bottom a {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    color: var(--text);
    font-size: 10px;
    border-top: 3px solid transparent;
  }

  .bottom a.active {
    color: var(--text-strong);
    border-top-color: var(--accent);
    background: var(--accent-soft);
  }

  .bottom .icon {
    font-size: 16px;
  }

  @media (min-width: 760px) {
    .bottom {
      display: none;
    }
  }

  /* ── Approval toasts ── */
  .toasts {
    position: fixed;
    top: 14px;
    right: 14px;
    z-index: 50;
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-width: min(340px, calc(100vw - 28px));
  }

  .toast {
    display: flex;
    align-items: stretch;
    border: 1px solid var(--err);
    border-left: 3px solid var(--err);
    border-radius: var(--radius);
    background: var(--bg-elevated);
    box-shadow: 0 6px 22px rgba(0, 0, 0, 0.45);
    overflow: hidden;
    animation: toast-in 0.18s ease-out;
  }

  @keyframes toast-in {
    from {
      opacity: 0;
      transform: translateX(12px);
    }
  }

  .toast-body {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 9px 10px;
    color: var(--text-strong);
    font-size: 12.5px;
    text-decoration: none;
  }

  .toast-body small {
    color: var(--text-faint);
    font-family: var(--font-mono);
    font-size: 10.5px;
  }

  .toast-dismiss {
    border: none;
    border-left: 1px solid var(--border);
    border-radius: 0;
    background: transparent;
    padding: 0 10px;
    color: var(--text-faint);
  }

  .toast-dismiss:hover {
    color: var(--text-strong);
    background: var(--surface-hover);
  }
</style>
