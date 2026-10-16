<script lang="ts">
  import Icon from "$lib/components/Icon.svelte";
  /**
   * MessageBubble — one chat message (user or assistant), a column of text
   * and tool-call blocks. Blocks render with stable index keys: a streaming
   * turn only appends blocks, so Svelte patches instead of rebuilding.
   */
  import type { ChatMessage } from "$lib/services/chat";
  import RichText from "./RichText.svelte";
  import ToolCard from "./ToolCard.svelte";
  import ApprovalInline from "$lib/components/approvals/ApprovalInline.svelte";

  export let message: ChatMessage;
  /** True while this message is the live streaming target. */
  export let streaming = false;
</script>

<article class="msg {message.role}">
  <div class="role">{message.role === "user" ? "you" : "openshield"}</div>
  <div class="bubble">
    {#each message.blocks as block, i (i)}
      {#if block.kind === "tool"}
        <ToolCard tool={block.tool} />
      {:else if block.kind === "approval"}
        <ApprovalInline approvalId={block.approvalId} />
      {:else}
        <div class="text-block" class:reasoning={block.reasoning === true}>
          {#if block.reasoning === true}<span class="think-tag"><Icon name="reasoning" size={12} /> reasoning</span>{/if}
          <RichText text={block.text} />
          {#if streaming && message.role === "assistant" && i === message.blocks.length - 1}
            <span class="cursor" aria-hidden="true">▍</span>
          {/if}
        </div>
      {/if}
    {/each}
  </div>
</article>

<style>
  .msg {
    display: flex;
    flex-direction: column;
    max-width: 82%;
  }

  .msg.user {
    align-self: flex-end;
    align-items: flex-end;
  }

  .msg.assistant {
    align-self: flex-start;
    align-items: flex-start;
  }

  .role {
    font-family: var(--font-mono);
    font-size: 10.5px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-faint);
    margin-bottom: 3px;
    padding: 0 4px;
  }

  .bubble {
    border-radius: 10px;
    padding: 9px 12px;
    font-size: 13.5px;
    line-height: 1.55;
  }

  .user .bubble {
    background: var(--accent-soft);
    border: 1px solid var(--accent);
    border-bottom-right-radius: 3px;
    color: var(--text-strong);
  }

  .assistant .bubble {
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-bottom-left-radius: 3px;
  }

  .text-block {
    min-width: 0;
  }

  .text-block.reasoning {
    color: var(--text-faint);
    font-style: italic;
    font-size: 12.5px;
    border-left: 2px solid var(--border-strong);
    padding-left: 9px;
    margin: 4px 0;
  }

  .think-tag {
    display: block;
    font-family: var(--font-mono);
    font-style: normal;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-faint);
    opacity: 0.8;
    margin-bottom: 2px;
  }

  .cursor {
    display: inline-block;
    color: var(--accent);
    animation: blink 0.9s steps(2) infinite;
  }

  @keyframes blink {
    50% {
      opacity: 0;
    }
  }
</style>
