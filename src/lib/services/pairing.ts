/*
 * OpenShield Pocket — pairing payload handling (design doc §3.3).
 *
 * The desktop app issues `POST /api/v1/pair` → `{host, port, token, expires}`
 * and shows it as a QR. Pocket accepts the same payload either by scanning
 * that QR or by pasting the JSON manually — manual entry is the guaranteed
 * fallback and the ONLY path in v0.1.
 *
 * QR scanning is DEFERRED (M4 ships manual paste): it needs a camera plugin
 * validated on-device before shipping, per the design doc §3.3 "QR via a
 * scanner plugin validated on-device before shipping". When it lands, its
 * output feeds straight into `parsePairingPayload` — nothing else changes.
 *
 * Part of the Blackshield Company.
 */

import type { Result } from "./backend";
import type { StoredConnection } from "./storage";

export interface PairingPayload {
  host: string;
  port: number;
  token: string;
  /** RFC 3339 expiry from the issuing server (pair_ttl_secs §3.1). */
  expires?: string;
}

/**
 * Parse + validate a pasted pairing payload. Strict on the three fields
 * that matter (a half-valid token would just 401 forever), lenient on
 * everything else — unknown keys are ignored, expires is optional.
 */
export function parsePairingPayload(raw: string): Result<PairingPayload> {
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return { success: false, error: "Not valid JSON — paste the whole {host, port, token} payload." };
  }
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
    return { success: false, error: "Payload must be a JSON object." };
  }
  const o = obj as Record<string, unknown>;

  if (typeof o.host !== "string" || !o.host.trim()) {
    return { success: false, error: "Payload is missing a host." };
  }
  const host = o.host.trim();
  if (!/^[a-zA-Z0-9.\-]+$/.test(host) && !/^\[[0-9a-fA-F:]+\]$/.test(host)) {
    return { success: false, error: "Payload host looks invalid (expected an IP or hostname)." };
  }

  const port = typeof o.port === "string" ? Number(o.port) : o.port;
  if (typeof port !== "number" || !Number.isInteger(port) || port < 1 || port > 65535) {
    return { success: false, error: "Payload is missing a valid port (1–65535)." };
  }

  if (typeof o.token !== "string" || !o.token.trim()) {
    return { success: false, error: "Payload is missing a bearer token." };
  }

  const payload: PairingPayload = { host, port, token: o.token.trim() };
  if (typeof o.expires === "string" && o.expires) payload.expires = o.expires;
  return { success: true, data: payload };
}

/** Shape the payload down to what the backend config store keeps. */
export function payloadToConnection(p: PairingPayload): StoredConnection {
  return { host: p.host, port: p.port, token: p.token };
}
