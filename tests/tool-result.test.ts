/*
 * tool_result envelopes: the server sends the tool output as data.output
 * (openshield src/api/ws.rs). The chat card must show it.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { get } from "svelte/store";

beforeEach(() => {
  localStorage.setItem("openshield.mock", "1");
});

async function runTool(data: Record<string, unknown>) {
  const { handleEnvelope, messages, abortTurn } = await import("$lib/services/chat");
  abortTurn();
  messages.set([]);
  handleEnvelope({ type: "tool_start", data: { name: "read_file", args: {} } } as never);
  handleEnvelope({ type: "tool_result", data } as never);
  const msg = get(messages).at(-1)!;
  const block = msg.blocks.find((b) => b.kind === "tool");
  if (!block || block.kind !== "tool") throw new Error("no tool block");
  return block.tool;
}

describe("tool_result output", () => {
  it("shows data.output from the server", async () => {
    const tool = await runTool({ id: "1", name: "read_file", ok: true, output: "file body" });
    expect(tool.ok).toBe(true);
    expect(tool.result).toBe("file body");
  });

  it("still accepts the older data.result field", async () => {
    const tool = await runTool({ name: "read_file", ok: true, result: "legacy body" });
    expect(tool.result).toBe("legacy body");
  });

  it("renders non-string output as JSON", async () => {
    const tool = await runTool({ name: "list", ok: true, output: { files: ["a"] } });
    expect(tool.result).toContain('"files"');
  });
});
