import { describe, expect, it } from "vitest";
import { normalizeDoctor } from "$lib/services/doctor";

describe("normalizeDoctor", () => {
  it("maps the live checks payload from openshield serve", () => {
    const result = normalizeDoctor({
      checks: [
        {
          component: "Config",
          status: "healthy",
          message: "Valid TOML",
          fixable: false,
        },
        { component: "Providers", status: "warning", message: "no keys" },
        { name: "Cache", status: "critical", detail: "missing" },
      ],
    });
    expect(result.recognized).toBe(true);
    expect(result.components).toEqual([
      { name: "Config", status: "ok", detail: "Valid TOML" },
      { name: "Providers", status: "warn", detail: "no keys" },
      { name: "Cache", status: "err", detail: "missing" },
    ]);
  });

  it("maps a components array without treating it as unknown", () => {
    const result = normalizeDoctor({
      components: [{ name: "config", status: "ok", detail: "found" }],
    });
    expect(result.recognized).toBe(true);
    expect(result.components).toEqual([
      { name: "config", status: "ok", detail: "found" },
    ]);
  });

  it("does not invent mock rows for an unknown shape", () => {
    for (const raw of [null, undefined, "oops", 1, {}, { report: [] }, { checks: "nope" }]) {
      const result = normalizeDoctor(raw);
      expect(result.recognized).toBe(false);
      expect(result.components).toEqual([]);
    }
  });
});
