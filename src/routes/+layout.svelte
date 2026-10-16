<script lang="ts">
  import "../app.css";
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { status, lastError, initBackend, config, wsStatus, needsPairing, useLocalToken } from "$lib/services/backend";
  import { initChat, retryChatStream } from "$lib/services/chat";
  import { isTauriShell } from "$lib/services/shell";
  import { initApprovals, approvalBadge, approvalToasts, dismissToast } from "$lib/services/approvals";
  import { theme, THEMES } from "$lib/themes";
  import Icon from "$lib/components/Icon.svelte";
  import ShieldMark from "$lib/components/ShieldMark.svelte";
  import KnightSprite from "$lib/components/KnightSprite.svelte";

  interface NavRoute {
    path: string;
    label: string;
    icon: string;
  }

  const NAV: NavRoute[] = [
    { path: "/chat", label: "Chat", icon: "chat" },
    { path: "/sessions", label: "Sessions", icon: "sessions" },
    { path: "/approvals", label: "Approvals", icon: "approvals" },
    { path: "/swarm", label: "Swarm", icon: "swarm" },
    { path: "/memory", label: "Memory", icon: "memory" },
    { path: "/doctor", label: "Doctor", icon: "doctor" },
    { path: "/settings", label: "Settings", icon: "settings" },
  ];

  let desktopShell = false;
  let usingLocal = false;
  let localTokenError: string | null = null;

  // Boot the backend connection in the background — first render never waits.
  onMount(() => {
    desktopShell = isTauriShell() && !/android/i.test(navigator.userAgent);
    initBackend();
    initChat();
    initApprovals();
  });

  async function onUseLocalToken() {
    usingLocal = true;
    localTokenError = null;
    try {
      const r = await useLocalToken();
      if (!r.success) localTokenError = r.error;
    } finally {
      usingLocal = false;
    }
  }

  $: currentPath = $page.url.pathname;
  $: isActive = (p: string) =>
    currentPath === p || (p !== "/chat" && currentPath.startsWith(p));
</script>

<div class="shell">
  <!-- Wide layout: left sidebar rail -->
  <nav class="rail" aria-label="Primary">
    <div class="brand">
      <ShieldMark size={30} />
      <div class="brand-text">
        <strong>OpenShield</strong>
        <small>{$config.host}:{$config.port}</small>
      </div>
    </div>
    <ul>
      {#each NAV as r}
        <li>
          <a href={r.path} class:active={isActive(r.path)}>
            <span class="icon"><Icon name={r.icon} /></span>
            <span>{r.label}</span>
            {#if r.path === "/approvals" && $approvalBadge > 0}
              <span class="badge" aria-label="{$approvalBadge} pending approvals">{$approvalBadge}</span>
            {/if}
          </a>
        </li>
      {/each}
    </ul>
    <div class="rail-footer">
      <div class="theme-switch" role="radiogroup" aria-labelledby="theme-label">
        <span id="theme-label" class="theme-label">Theme</span>
        {#each THEMES as t}
          <button
            type="button"
            role="radio"
            aria-checked={$theme === t.id}
            class="theme-opt"
            class:selected={$theme === t.id}
            onclick={() => theme.set(t.id)}
          >
            <span class="swatch" style:background={t.swatches[2]}></span>
            {t.label}
          </button>
        {/each}
      </div>
    </div>
  </nav>

  <div class="main">
    {#if $needsPairing}
      <div class="banner auth" role="alert">
        <span>OpenShield server rejected the token. Re-pair to continue.</span>
        {#if localTokenError}
          <span class="banner-detail">{localTokenError}</span>
        {/if}
        <span class="banner-actions">
          <button type="button" onclick={() => void goto("/settings")}>Re-pair</button>
          {#if desktopShell}
            <button type="button" onclick={() => void onUseLocalToken()} disabled={usingLocal}>
              {usingLocal ? "Reading…" : "Use local token"}
            </button>
          {/if}
        </span>
      </div>
    {:else if $status !== "connected"}
      <!-- Disconnected: a quiet status strip, not an alarm. The chat page
           shows the "Connect or try Demo" first-run card; this strip keeps
           the connection settings one click away on every page. -->
      <div class="status-strip" class:connecting={$status === "connecting"} role="status">
        <KnightSprite state={$status === "connecting" ? "thinking" : "error"} size={26} />
        <span class="status-text">
          {#if $status === "connecting"}
            Connecting to openshield serve…
          {:else}
            Not connected to openshield serve
            {#if $lastError}<span class="status-detail">· {$lastError}</span>{/if}
          {/if}
        </span>
        <code class="status-host">{$config.host}:{$config.port}</code>
        <a class="status-action" href="/settings">Open settings</a>
      </div>
    {:else if $wsStatus !== "connected"}
      <!-- REST is fine but the chat stream is down — the chat service is
           already backing off and retrying; the tap forces an immediate retry. -->
      <button
        class="banner"
        class:connecting={$wsStatus === "connecting"}
        onclick={retryChatStream}
        title="Retry the chat stream now"
      >
        {#if $wsStatus === "connecting"}
          <Icon name="refresh" size={14} /> Reconnecting chat stream ({$config.host}:{$config.port})…
        {:else}
          <Icon name="alert" size={14} /> Chat stream disconnected. Retry now
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
          <span class="icon"><Icon name={r.icon} /></span>
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
            <small>risk {t.risk}{t.session ? ` · ${t.session.slice(0, 12)}` : ""} · review</small>
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


  .brand-text {
    display: flex;
    flex-direction: column;
  }

  .brand-text strong {
    color: var(--text-strong);
    font-family: var(--font-display);
    font-weight: 600;
    font-size: 16px;
    letter-spacing: 0.06em;
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

  .theme-switch {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .theme-label {
    color: var(--text-faint);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .theme-opt {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 8px;
    font-size: 12.5px;
    text-align: left;
    background: transparent;
    color: var(--text);
    border-color: transparent;
  }

  .theme-opt.selected {
    background: var(--surface-hover);
    border-color: var(--border);
    color: var(--text-strong);
  }

  .swatch {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex: none;
  }

  .rail .icon,
  .bottom .icon {
    display: inline-flex;
  }

  .rail a.active .icon {
    color: var(--accent);
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

  .status-strip {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 14px 20px 0;
    padding: 8px 8px 8px 14px;
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    color: var(--text-strong);
    font-size: 13px;
  }

  .status-text {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .status-detail {
    color: var(--text-faint);
  }

  .status-host {
    color: var(--text-faint);
    font-size: 12px;
  }

  .status-action {
    padding: 5px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--text-strong);
    font-weight: 600;
    font-size: 12.5px;
  }

  .status-action:hover {
    background: var(--surface-hover);
  }

  @media (max-width: 759px) {
    .status-strip {
      margin: 10px 14px 0;
    }
    .status-host {
      display: none;
    }
  }

  .banner.auth {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 8px 12px;
    border-bottom-color: var(--err);
  }

  .banner-actions {
    display: inline-flex;
    gap: 8px;
    flex-wrap: wrap;
    justify-content: center;
  }

  .banner.auth button {
    padding: 4px 10px;
    font-size: 12px;
    background: var(--bg-elevated);
    color: var(--text-strong);
    border: 1px solid var(--border-strong);
  }

  .banner-detail {
    color: var(--err);
    font-size: 12px;
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
