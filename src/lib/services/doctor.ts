import type { DoctorComponent } from "./backend";

export type DoctorSource = "live" | "mock" | "unknown";

function mapStatus(status: string): DoctorComponent["status"] {
  if (status === "healthy" || status === "ok") return "ok";
  if (status === "warning" || status === "warn") return "warn";
  return "err";
}

/**
 * Parse a doctor payload from `openshield serve`.
 * `recognized` is false when the shape is unknown, so the UI can show an
 * unavailable state instead of mock rows labelled "live".
 */
export function normalizeDoctor(raw: unknown): {
  components: DoctorComponent[];
  recognized: boolean;
} {
  if (!raw || typeof raw !== "object") {
    return { components: [], recognized: false };
  }
  const obj = raw as Record<string, unknown>;
  if (Array.isArray(obj.components)) {
    return {
      components: (obj.components as Record<string, unknown>[]).map((c) => ({
        name: String(c.name ?? "check"),
        status: mapStatus(String(c.status ?? "")),
        detail: String(c.detail ?? c.message ?? ""),
      })),
      recognized: true,
    };
  }
  if (Array.isArray(obj.checks)) {
    return {
      components: (obj.checks as Record<string, unknown>[]).map((c) => ({
        name: String(c.component ?? c.name ?? "check"),
        status: mapStatus(String(c.status ?? "")),
        detail: String(c.message ?? c.detail ?? ""),
      })),
      recognized: true,
    };
  }
  return { components: [], recognized: false };
}
