<script lang="ts">
  // Line icons (24px grid, 1.6 stroke, currentColor). Black Steel set.
  export let name: string;
  export let size = 18;
  export let label: string | undefined = undefined;

  const PATHS: Record<string, string> = {
    chat: "M4 5h16v11H9l-5 4z",
    sessions: "M4 6h16M4 12h16M4 18h10",
    approvals: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z M9 12l2 2 4-4",
    swarm: "M5 5h5v5H5z M14 5h5v5h-5z M9.5 14h5v5h-5z M7.5 10v2h9v-2 M12 12v2",
    memory: "M6 7h12v10H6z M9 7V4 M15 7V4 M9 20v-3 M15 20v-3 M6 10H3 M6 14H3 M21 10h-3 M21 14h-3",
    doctor: "M3 12h4l2-5 4 10 2-5h6",
    settings: "M12 9a3 3 0 100 6 3 3 0 000-6z M12 2v3 M12 19v3 M2 12h3 M19 12h3 M4.9 4.9l2.1 2.1 M17 17l2.1 2.1 M4.9 19.1L7 17 M17 7l2.1-2.1",
    alert: "M12 3l9.5 17h-19z M12 10v4 M12 17v.5",
    refresh: "M20 11a8 8 0 10-2.3 5.7 M20 4v7h-7",
    tool: "M14.5 5.5a4 4 0 00-5 5L4 16l4 4 5.5-5.5a4 4 0 005-5l-2.5 2.5-2.5-.5-.5-2.5z",
    reasoning: "M9 18h6 M10 21h4 M12 3a6 6 0 00-3.5 10.9V16h7v-2.1A6 6 0 0012 3z",
    plug: "M9 3v5 M15 3v5 M7 8h10v4a5 5 0 01-10 0z M12 17v4",
    play: "M7 4l13 8-13 8z",
  };
</script>

<svg
  class="icon"
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.6"
  stroke-linecap="round"
  stroke-linejoin="round"
  role={label ? "img" : undefined}
  aria-label={label}
  aria-hidden={label ? undefined : "true"}
><path d={PATHS[name] ?? ""} /></svg>

<style>
  .icon {
    flex: none;
    display: inline-block;
    vertical-align: -0.2em;
  }
</style>
