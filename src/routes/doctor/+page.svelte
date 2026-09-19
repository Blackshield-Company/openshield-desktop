<script lang="ts">
  import { onMount } from "svelte";
  import { getDoctor, fixDoctor, type DoctorComponent } from "$lib/services/backend";

  // Offline stand-in for `openshield doctor` so the panel is always alive,
  // even before the backend is configured. Mirrors the real component set.
  const MOCK_COMPONENTS: DoctorComponent[] = [
    { name: "config", status: "ok", detail: "config.toml found, schema valid" },
    { name: "providers", status: "warn", detail: "no API key configured for default provider" },
    { name: "models", status: "ok", detail: "router table parsed (4 roles)" },
    { name: "memory store", status: "ok", detail: "SQLite open, 12 sessions on disk" },
    { name: "security engine", status: "ok", detail: "L1–L4 guardrails loaded" },
    { name: "web-api", status: "err", detail: "openshield serve not reachable" },
  ];

  let components: DoctorComponent[] = [];
  let source: "live" | "mock" = "mock";
  let loading = false;
  let fixing = false;
  let message: string | null = null;

  async function refresh() {
    loading = true;
    message = null;
    try {
      const r = await getDoctor();
      if (r.success) {
        components = normalize(r.data);
        source = "live";
      } else {
        components = MOCK_COMPONENTS;
        source = "mock";
        message = `Live doctor unavailable — showing mock report (${r.error}).`;
      }
    } catch {
      components = MOCK_COMPONENTS;
      source = "mock";
      message = "Live doctor unavailable — showing mock report.";
    } finally {
      loading = false;
    }
  }

  async function runFix() {
    fixing = true;
    message = null;
    try {
      const r = await fixDoctor();
      message = r.success
        ? "Fix pass submitted."
        : `Fix failed: ${r.error}`;
      await refresh();
    } finally {
      fixing = false;
    }
  }

  function normalize(raw: unknown): DoctorComponent[] {
    if (raw && typeof raw === "object" && Array.isArray((raw as { components?: unknown }).components)) {
      return (raw as { components: DoctorComponent[] }).components;
    }
    return MOCK_COMPONENTS;
  }

  onMount(() => {
    void refresh();
  });
</script>

<svelte:head>
  <title>Doctor — OpenShield</title>
</svelte:head>

<header class="page-head">
  <h1>🩺 Doctor</h1>
  <div class="actions">
    <button onclick={() => void refresh()} disabled={loading}>
      {loading ? "Refreshing…" : "Refresh"}
    </button>
    <button
      class="primary"
      onclick={() => void runFix()}
      disabled={fixing || source === "mock"}
      title={source === "mock" ? "Connect to a backend to run --fix" : "Run doctor --fix"}
    >
      {fixing ? "Fixing…" : "Run --fix"}
    </button>
  </div>
</header>

{#if message}
  <p class="notice">{message}</p>
{/if}

{#if source === "mock"}
  <p class="source-note">⚠ Mock report — <code>openshield serve</code> not connected.</p>
{:else}
  <p class="source-note ok">✓ Live report from backend.</p>
{/if}

<div class="table-wrap">
  <table>
    <thead>
      <tr>
        <th>Component</th>
        <th>Status</th>
        <th>Detail</th>
      </tr>
    </thead>
    <tbody>
      {#each components as c}
        <tr>
          <td class="name">{c.name}</td>
          <td>
            <span class="badge {c.status}">
              {c.status === "ok" ? "✓ ok" : c.status === "warn" ? "⚠ warn" : "✗ err"}
            </span>
          </td>
          <td class="detail">{c.detail}</td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
  .page-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    margin-bottom: 14px;
  }

  .actions {
    display: flex;
    gap: 8px;
  }

  .notice {
    color: var(--warn);
    font-family: var(--font-mono);
    font-size: 12px;
  }

  .source-note {
    color: var(--text-faint);
    font-size: 13px;
  }

  .source-note.ok {
    color: var(--ok);
  }

  .table-wrap {
    border: 1px solid var(--border);
    border-radius: 10px;
    overflow: hidden;
    background: var(--bg-elevated);
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }

  th,
  td {
    text-align: left;
    padding: 10px 14px;
    border-bottom: 1px solid var(--border);
  }

  th {
    color: var(--text-faint);
    font-family: var(--font-mono);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    background: var(--bg-inset);
  }

  tr:last-child td {
    border-bottom: none;
  }

  .name {
    font-family: var(--font-mono);
    color: var(--text-strong);
  }

  .detail {
    color: var(--text);
  }

  .badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 999px;
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 600;
  }

  .badge.ok {
    background: color-mix(in srgb, var(--ok) 18%, transparent);
    color: var(--ok);
  }

  .badge.warn {
    background: color-mix(in srgb, var(--warn) 18%, transparent);
    color: var(--warn);
  }

  .badge.err {
    background: color-mix(in srgb, var(--err) 18%, transparent);
    color: var(--err);
  }
</style>
