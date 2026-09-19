<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { loadConnection } from "$lib/services/storage";

  /*
   * First-render routing (design doc §3.3 "Startup").
   *
   * Android / narrow-width devices with NO saved connection land on
   * /settings to pair — a phone opening straight into a disconnected chat
   * screen is a dead end. Desktop with defaults goes to /chat as before.
   *
   * Android detection is userAgent-based on purpose: the frontend must not
   * depend on Tauri IPC for platform logic (same code path on desktop,
   * Android, and browser dev), and the Android webview UA reliably carries
   * "Android". Narrow width covers every other pocket-sized viewport.
   */
  onMount(() => {
    const narrow = window.matchMedia("(max-width: 759px)").matches;
    const android = /android/i.test(navigator.userAgent);
    void loadConnection().then((saved) => {
      const target = (android || narrow) && !saved ? "/settings" : "/chat";
      void goto(target, { replaceState: true });
    });
  });
</script>

<p class="redirecting">Raising the shield…</p>

<style>
  .redirecting {
    color: var(--text-faint);
    font-family: var(--font-mono);
  }
</style>
