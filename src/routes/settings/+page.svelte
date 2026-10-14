<script lang="ts">
  import { config, saveConfig, checkHealth, pairDevice, status } from "$lib/services/backend";
  import { mockMode, setMockMode } from "$lib/services/mock";
  import { parsePairingPayload, payloadToConnection } from "$lib/services/pairing";
  import { getAutostart, setAutostart, isTauriShell, type AutostartStatus } from "$lib/services/shell";
  import { theme, THEMES } from "$lib/themes";
  import { onMount } from "svelte";

  let host = $config.host;
  let port = String($config.port);
  let token = $config.token;
  let mockOn = $mockMode;

  let saving = false;
  let pairing = false;
  let feedback: { ok: boolean; text: string } | null = null;
  let pairPayload: string | null = null;

  function validate(): string | null {
    if (!host.trim()) return "Host is required.";
    if (!Number.isInteger(Number(port)) || Number(port) < 1 || Number(port) > 65535)
      return "Port must be an integer between 1 and 65535.";
    if (!token.trim()) return "A bearer token is required.";
    return null;
  }

  // ── Connection card ──────────────────────────────────────────────────────

  let payloadRaw = "";
  let applyingPayload = false;

  async function onSave() {
    feedback = null;
    const problem = validate();
    if (problem) {
      feedback = { ok: false, text: problem };
      return;
    }
    saving = true;
    try {
      const r = saveConfig({ host: host.trim(), port: Number(port), token });
      if (r.success) {
        const h = await checkHealth();
        feedback = h.success
          ? { ok: true, text: "Saved — backend reachable." }
          : { ok: false, text: `Saved, but backend unreachable: ${h.error}` };
      } else {
        feedback = { ok: false, text: r.error };
      }
    } finally {
      saving = false;
    }
  }

  /**
   * Paste-a-payload pairing (design doc §3.3). The desktop app issues
   * `POST /api/v1/pair` → `{host, port, token, expires}`; Pocket pastes that
   * JSON here instead of scanning a QR. QR scanning is DEFERRED — it needs a
   * camera plugin validated on-device before shipping — and when it lands
   * its decoded text feeds this exact same parser.
   */
  async function onApplyPayload() {
    feedback = null;
    applyingPayload = true;
    try {
      const parsed = parsePairingPayload(payloadRaw);
      if (!parsed.success) {
        feedback = { ok: false, text: parsed.error };
        return;
      }
      const p = parsed.data;
      host = p.host;
      port = String(p.port);
      token = p.token;
      const r = saveConfig(payloadToConnection(p));
      if (!r.success) {
        feedback = { ok: false, text: r.error };
        return;
      }
      const h = await checkHealth();
      feedback = h.success
        ? {
            ok: true,
            text: p.expires
              ? `Paired with ${p.host}:${p.port} — token expires ${p.expires}.`
              : `Paired with ${p.host}:${p.port}.`,
          }
        : { ok: false, text: `Saved, but backend unreachable: ${h.error}` };
    } finally {
      applyingPayload = false;
    }
  }

  async function onToggleMock() {
    // bind:checked has already updated mockOn by the time onchange fires.
    setMockMode(mockOn);
    // Re-run the health probe so the banner reflects the new backend.
    void checkHealth();
  }

  async function onPair() {    pairing = true;
    pairPayload = null;
    feedback = null;
    try {
      const r = await pairDevice();
      if (r.success) {
        pairPayload = JSON.stringify(r.data, null, 2);
      } else {
        feedback = { ok: false, text: `Pairing failed: ${r.error}` };
      }
    } finally {
      pairing = false;
    }
  }

  // ── Desktop card (M6: tray + autostart, design §8.1) ─────────────────────
  // Desktop-shell only: the card stays hidden in browser dev, on Pocket, and
  // on platforms where the shell reports autostart unsupported.

  let autostart: AutostartStatus | null = null;
  let autostartBusy = false;
  let autostartError: string | null = null;

  onMount(async () => {
    if (!isTauriShell()) return;
    const r = await getAutostart();
    if (r.success && r.data.supported) autostart = r.data;
  });

  async function onToggleAutostart() {
    if (!autostart) return;
    const want = !autostart.enabled;
    autostartBusy = true;
    autostartError = null;
    try {
      const r = await setAutostart(want);
      if (r.success) {
        autostart = r.data;
      } else {
        autostartError = r.error;
      }
    } finally {
      autostartBusy = false;
    }
  }
</script>

<svelte:head>
  <title>Settings — OpenShield</title>
</svelte:head>

<header class="page-head">
  <h1>⚙ Settings</h1>
  <span class="conn {$status}">{$status}</span>
</header>

<div class="grid">
  <section class="card">
    <h2>Backend connection</h2>
    <p class="hint">
      Target <code>openshield serve</code> (default 127.0.0.1:9310). A bearer token is
      required on every host, including localhost — it is not optional on loopback.
      Desktop can load <code>~/.config/openshield/desktop.token</code>; Pocket must paste a
      pairing payload.
    </p>

    <label>
      Host
      <input bind:value={host} placeholder="127.0.0.1" autocomplete="off" spellcheck="false" />
    </label>

    <label>
      Port
      <input
        bind:value={port}
        inputmode="numeric"
        placeholder="9310"
        autocomplete="off"
        spellcheck="false"
      />
    </label>

    <label>
      Bearer token
      <input
        bind:value={token}
        type="password"
        placeholder="required"
        autocomplete="off"
        spellcheck="false"
      />
    </label>

    {#if feedback}
      <p class="feedback" class:ok={feedback.ok}>{feedback.text}</p>
    {/if}

    <div class="row">
      <button class="primary" onclick={() => void onSave()} disabled={saving}>
        {saving ? "Saving…" : "Save & connect"}
      </button>
      <button onclick={() => void checkHealth()} disabled={saving}>Retry connection</button>
    </div>

    <!--
      Paste-payload pairing (Pocket path, design doc §3.3). Manual entry is
      the guaranteed fallback; QR scanning is deferred until a camera plugin
      is validated on-device, and will feed parsePairingPayload() unchanged.
    -->
    <details class="pair-box">
      <summary>Paste pairing payload</summary>
      <p class="hint">
        Paste the JSON from <code>POST /api/v1/pair</code> — <code>{"{host, port, token, expires}"}</code> —
        to pair OpenShield Pocket in one step.
      </p>
      <textarea
        bind:value={payloadRaw}
        rows="4"
        placeholder={"{\"host\":\"192.168.1.60\",\"port\":9310,\"token\":\"…\",\"expires\":\"…\"}"}
        spellcheck="false"
        autocomplete="off"
      ></textarea>
      <button class="primary" onclick={() => void onApplyPayload()} disabled={applyingPayload}>
        {applyingPayload ? "Pairing…" : "Pair from payload"}
      </button>
    </details>
  </section>

  <section class="card">
    <h2>Theme</h2>
    <div class="themes">
      {#each THEMES as t}
        <button
          class="theme-card"
          class:selected={$theme === t.id}
          onclick={() => theme.set(t.id)}
        >
          <span class="swatches">
            {#each t.swatches as s}
              <span class="swatch" style:background={s}></span>
            {/each}
          </span>
          <span class="theme-name">{t.label}</span>
        </button>
      {/each}
    </div>
  </section>

  <section class="card">
    <h2>Demo mode</h2>
    <p class="hint">
      Emulate <code>openshield serve</code> in-memory — fake sessions plus a scripted streaming
      chat turn (tokens, a tool call, perf stats). Handy for UI work with no server running.
    </p>
    <label class="toggle">
      <input type="checkbox" bind:checked={mockOn} onchange={() => void onToggleMock()} />
      <span>Use mock backend</span>
    </label>
  </section>

  {#if autostart}
    <section class="card">
      <h2>Desktop</h2>
      <p class="hint">
        The window close button hides OpenShield to the system tray — use the tray menu →
        <strong>Quit</strong> to exit. Autostart launches the app at login via a systemd user
        unit (<code>{autostart.unit_path}</code>).
      </p>
      <label class="toggle">
        <input
          type="checkbox"
          checked={autostart.enabled}
          disabled={autostartBusy}
          onchange={() => void onToggleAutostart()}
        />
        <span>{autostartBusy ? "Applying…" : "Launch OpenShield Desktop at login"}</span>
      </label>
      {#if autostartError}
        <p class="feedback">{autostartError}</p>
      {/if}
    </section>
  {/if}

  <section class="card">
    <h2>Pair device</h2>
    <p class="hint">
      Issue a short-lived pairing token for OpenShield Pocket (mobile). Only the master
      token may call this; too many attempts must wait a minute. The payload below is what
      Pocket pastes into Settings → "Paste pairing payload"; QR rendering on this side is deferred
      until a scanner plugin is validated on-device.
    </p>
    <button class="primary" onclick={() => void onPair()} disabled={pairing}>
      {pairing ? "Requesting…" : "Generate pairing payload"}
    </button>
    {#if pairPayload}
      <pre class="pair">{pairPayload}</pre>
    {/if}
  </section>

</div>

<style>
  .page-head {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 14px;
  }

  .conn {
    font-family: var(--font-mono);
    font-size: 11px;
    text-transform: uppercase;
    padding: 2px 8px;
    border-radius: 999px;
    border: 1px solid var(--border-strong);
    color: var(--text-faint);
  }

  .conn.connected {
    color: var(--ok);
    border-color: var(--ok);
  }

  .conn.connecting {
    color: var(--warn);
    border-color: var(--warn);
  }

  .grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 14px;
    max-width: 720px;
  }

  @media (min-width: 760px) {
    .grid {
      grid-template-columns: 1fr 1fr;
    }
  }

  .card {
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .card h2 {
    font-size: 15px;
  }

  .hint {
    margin: 0;
    color: var(--text-faint);
    font-size: 12.5px;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 12px;
    color: var(--text);
    font-family: var(--font-mono);
  }

  .feedback {
    margin: 0;
    font-size: 12.5px;
    color: var(--err);
  }

  .feedback.ok {
    color: var(--ok);
  }

  .row {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .pair-box {
    border: 1px dashed var(--border-strong);
    border-radius: var(--radius);
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .pair-box summary {
    cursor: pointer;
    font-size: 13px;
    color: var(--text-strong);
    font-family: var(--font-ui);
  }

  .pair-box textarea {
    width: 100%;
    resize: vertical;
    font-family: var(--font-mono);
    font-size: 12px;
    background: var(--bg-inset) !important;
    color: var(--text-strong) !important;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius);
    padding: 8px;
    appearance: none;
    -webkit-appearance: none;
  }

  .toggle {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 8px;
    font-family: var(--font-ui);
    font-size: 13px;
    color: var(--text-strong);
    cursor: pointer;
  }

  .toggle input {
    width: 16px;
    height: 16px;
    accent-color: var(--accent);
    cursor: pointer;
  }

  .themes {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }

  .theme-card {
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: flex-start;
    padding: 12px;
    min-width: 130px;
  }

  .theme-card.selected {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--accent-soft);
  }

  .swatches {
    display: flex;
    gap: 4px;
  }

  .swatch {
    width: 20px;
    height: 20px;
    border-radius: 4px;
    border: 1px solid var(--border-strong);
  }

  .theme-name {
    font-size: 13px;
    color: var(--text-strong);
  }

  .pair {
    background: var(--bg-inset);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 10px;
    font-size: 12px;
    overflow-x: auto;
    color: var(--text-strong);
  }
</style>
