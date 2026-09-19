<script lang="ts">
  /**
   * ToolCard — collapsible card for one tool call, rendered inline in the
   * message stream at the position it occurred. Shows name, ok/fail badge,
   * duration, and (expanded) pretty-printed args + result.
   */
  import type { ToolCallInfo } from "$lib/services/chat";

  export let tool: ToolCallInfo;

  let open = false;

  $: state = tool.ok === undefined ? "running" : tool.ok ? "ok" : "fail";
  $: argsPretty = JSON.stringify(tool.args ?? {}, null, 2);

  function toggle() {
    open = !open;
  }
</script>

<div class="tool-card" class:running={state === "running"}>
  <button type="button" class="head" onclick={toggle} aria-expanded={open}>
    <span class="chev" aria-hidden="true">{open ? "▾" : "▸"}</span>
    <span class="tname">⚒ {tool.name}</span>
    {#if tool.ms !== undefined}<span class="ms">{tool.ms} ms</span>{/if}
    <span class="badge {state}">
      {state === "running" ? "running…" : state === "ok" ? "ok" : "fail"}
    </span>
  </button>

  {#if open}
    <div class="body">
      <h4>Args</h4>
      <pre>{argsPretty}</pre>
      {#if tool.result !== undefined}
        <h4>Result</h4>
        <pre>{tool.result}</pre>
      {/if}
    </div>
  {/if}
</div>

<style>
  .tool-card {
    border: 1px solid var(--border);
    border-left: 3px solid var(--border-strong);
    border-radius: var(--radius);
    background: var(--bg-elevated);
    margin: 6px 0;
    overflow: hidden;
  }

  .tool-card.running {
    border-left-color: var(--warn);
  }

  .head {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 7px 10px;
    border: none;
    border-radius: 0;
    background: transparent;
    text-align: left;
    font-family: var(--font-mono);
    font-size: 12.5px;
  }

  .chev {
    color: var(--text-faint);
  }

  .tname {
    color: var(--text-strong);
    font-weight: 600;
  }

  .ms {
    color: var(--text-faint);
    font-size: 11px;
  }

  .badge {
    margin-left: auto;
    font-size: 10.5px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 1px 7px;
    border-radius: 999px;
    border: 1px solid var(--border-strong);
    color: var(--text-faint);
  }

  .badge.ok {
    color: var(--ok);
    border-color: var(--ok);
  }

  .badge.fail {
    color: var(--err);
    border-color: var(--err);
  }

  .badge.running {
    color: var(--warn);
    border-color: var(--warn);
    animation: pulse 1.2s ease-in-out infinite;
  }

  @keyframes pulse {
    50% {
      opacity: 0.45;
    }
  }

  .body {
    padding: 8px 12px 10px;
    border-top: 1px solid var(--border);
  }

  .body h4 {
    margin: 6px 0 4px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-faint);
    font-family: var(--font-mono);
  }

  .body pre {
    margin: 0;
    padding: 8px 10px;
    background: var(--bg-inset);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    font-size: 12px;
    line-height: 1.45;
    overflow-x: auto;
    color: var(--text);
  }
</style>
