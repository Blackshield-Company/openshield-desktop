<script lang="ts">
  /**
   * RichText — minimal markdown-ish renderer for assistant output.
   *
   * Supports fenced code blocks (```lang) and `inline code`. Deliberately
   * dependency-free: no {@html} anywhere, so streamed content can never
   * inject markup. Index-keyed each — segments only ever append, and DOM
   * nodes are reused across token updates.
   */
  export let text: string;

  interface Segment {
    kind: "text" | "code";
    content: string;
    lang: string;
  }

  function parse(src: string): Segment[] {
    const segs: Segment[] = [];
    const parts = src.split("```");
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (i % 2 === 1) {
        const nl = p.indexOf("\n");
        const lang = nl > 0 ? p.slice(0, nl).trim() : "";
        const content = (nl >= 0 ? p.slice(nl + 1) : p).replace(/\n$/, "");
        segs.push({ kind: "code", content, lang });
      } else if (p.trim()) {
        segs.push({ kind: "text", content: p, lang: "" });
      }
    }
    return segs;
  }

  function inlineParts(t: string): { code: boolean; text: string }[] {
    const out: { code: boolean; text: string }[] = [];
    const pieces = t.split("`");
    for (let i = 0; i < pieces.length; i++) {
      if (pieces[i] === "") continue;
      out.push({ code: i % 2 === 1, text: pieces[i] });
    }
    return out;
  }

  $: segments = parse(text);
</script>

{#each segments as seg, i (i)}
  {#if seg.kind === "code"}
    <div class="codeblock">
      {#if seg.lang}<span class="lang">{seg.lang}</span>{/if}
      <pre><code>{seg.content}</code></pre>
    </div>
  {:else}
    <span class="prose">
      {#each inlineParts(seg.content) as part, j (j)}
        {#if part.code}<code class="inline">{part.text}</code>{:else}{part.text}{/if}
      {/each}
    </span>
  {/if}
{/each}

<style>
  .prose {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .inline {
    background: var(--bg-inset);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 0 4px;
    font-size: 0.92em;
    color: var(--text-strong);
  }

  .codeblock {
    position: relative;
    margin: 6px 0;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--bg-inset);
  }

  .lang {
    position: absolute;
    top: 4px;
    right: 8px;
    font-family: var(--font-mono);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-faint);
  }

  .codeblock pre {
    margin: 0;
    padding: 10px 12px;
    overflow-x: auto;
    font-size: 12.5px;
    line-height: 1.45;
    color: var(--text-strong);
  }
</style>
