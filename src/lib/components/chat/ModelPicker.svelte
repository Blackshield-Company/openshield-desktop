<script lang="ts">
  import Icon from "$lib/components/Icon.svelte";
  /**
   * ModelPicker — compact per-session model override (M5).
   *
   * A native <select> grouped by provider, fed by GET /api/v1/models. The
   * pick is stored per session (store + localStorage) and travels as the
   * optional `model` field on the §4 inbound chat frame. "Default (server)"
   * clears the override — global config is never touched.
   *
   * Native select on purpose: mouse, touch, keyboard, and WebKitGTK all
   * behave, and app.css already forces the control colors there.
   */
  import { onMount } from "svelte";
  import { currentSessionId } from "$lib/services/chat";
  import {
    modelGroups,
    modelsLoading,
    modelsError,
    sessionModels,
    loadModels,
    selectModel,
  } from "$lib/services/models";

  let booted = false;

  onMount(() => {
    if (booted) return;
    booted = true;
    if ($modelGroups.length === 0) void loadModels();
  });

  $: sid = $currentSessionId;
  $: selected = sid ? ($sessionModels[sid] ?? "") : "";

  function onChange(e: Event) {
    const value = (e.currentTarget as HTMLSelectElement).value;
    selectModel(sid, value || null); // "" = back to the server's default
  }
</script>

<label class="model-picker">
  <span class="lbl">Model</span>
  <select
    aria-label="Model for this session"
    value={selected}
    onchange={onChange}
    disabled={$modelsLoading && $modelGroups.length === 0}
  >
    <option value="">Default (server)</option>
    {#each $modelGroups as group (group.provider)}
      <optgroup label={group.provider}>
        {#each group.models as model (model.id)}
          <option value={model.id}>{model.label}</option>
        {/each}
      </optgroup>
    {/each}
  </select>
  {#if $modelsError}
    <span class="pick-err" title={$modelsError} aria-label="Model list failed to load"><Icon name="alert" size={14} /></span>
  {/if}
</label>

<style>
  .model-picker {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .lbl {
    font-family: var(--font-mono);
    font-size: 10.5px;
    color: var(--text-faint);
    white-space: nowrap;
  }

  select {
    font-size: 12px;
    padding: 4px 8px;
    max-width: 200px;
    text-overflow: ellipsis;
  }

  .pick-err {
    color: var(--err);
    font-size: 12px;
  }
</style>
