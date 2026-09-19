<script lang="ts">
  export let title: string;
  export let icon: string;
  export let blurb: string;
</script>

<section class="placeholder">
  <div class="glyph" aria-hidden="true">{icon}</div>
  <h1>{title}</h1>
  <p>{blurb}</p>
  <small>Milestone M1 shell — steel first, screens next.</small>
</section>

<style>
  .placeholder {
    max-width: 560px;
    margin: 8vh auto 0;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 32px;
    border: 1px dashed var(--border-strong);
    border-radius: 10px;
    background: var(--bg-elevated);
  }

  .glyph {
    font-size: 42px;
  }

  p {
    color: var(--text);
    margin: 0;
  }

  small {
    color: var(--text-faint);
    font-family: var(--font-mono);
  }
</style>
