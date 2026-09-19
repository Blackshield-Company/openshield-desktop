/*
 * M6 test — native shell bridge degradation.
 *
 * Outside the Tauri webview (jsdom has no __TAURI_INTERNALS__) every shell
 * call must fail soft with {success:false} — never throw, never break the
 * mock service layer.
 */
import { describe, expect, it } from "vitest";
import { getAutostart, setAutostart, isTauriShell } from "$lib/services/shell";

describe("M6 shell bridge (outside Tauri)", () => {
  it("detects the missing shell", () => {
    expect(isTauriShell()).toBe(false);
  });

  it("autostart calls fail soft, never throw", async () => {
    const status = await getAutostart();
    expect(status.success).toBe(false);
    if (!status.success) expect(status.error).toMatch(/desktop shell/i);

    const set = await setAutostart(true);
    expect(set.success).toBe(false);
  });
});
