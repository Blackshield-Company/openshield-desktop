# Milestones

OpenShield Desktop + Pocket build record. Design source of truth:
`docs/openshield-desktop-design.md`.

| Milestone | Status | Result |
|---|---|---|
| **M0 — serve hardening** | DONE | `openshield serve` on 127.0.0.1:9310, token auth in LAN mode only, refuses wildcard binds without `lan_mode=true`. Endpoints: `/api/v1/{health,models,doctor,pair,…}`, `/ws/v1/chat` typed envelope. 551/551 tests green. |
| **M1 — desktop shell** | DONE | Tauri 2 scaffold, SvelteKit 2 (adapter-static) + TypeScript. svelte-check clean, cargo check clean, RGBA icons. |
| **M2 — chat streaming** | DONE | WS envelope client, tool cards, session list/resume, perf footer, mock backend (14/14 mock + 9/9 live). Surfaced backend gaps: no CORS, sessions 405, inbound frame shape. |
| **M2.5 + M3 — backend + approvals** | DONE | CORS layer, `GET /api/v1/sessions/:id`, WS `approval_req/res` gate with 120s deny timeout, `/api/v1/approvals` REST, approvals inbox + nav badges in the GUI. 561/561 lib tests; end-to-end approve/deny demo. |
| **M4 — Pocket pairing** | CODE DONE | Android project tracked (`com.openshield.pocket`), manual paste-payload pairing, app-private token storage, first-run routes to Settings. LAN serve correctly returns 401 without Bearer. Next pass: on-device install + screencap. |
| **M5 — extras** | DONE | Swarm monitor/control endpoints + UI, memory search alias + browser, per-session chat model picker. Backend 568 passed / 3 ignored; GUI Vitest 10/10. |
| **M6 — desktop polish** | DONE | OpenShield crest logo (adaptive fg/bg + monochrome), window title + in-app credit cleaned, brand glyph is a real shield. Tray: SNI icon, Show/Hide/Quit, close hides-to-tray. Autostart: systemd user unit, toggled from Settings (Linux). Release hardening: `custom-protocol` feature (release binaries load the embedded frontend, not the dev server). Integration script installs hicolor crest icons + `.desktop` entries. |

## Remaining

- Pocket device pass — install + screencap on the Android target
- v0.1 release packaging

---

The shield holds. ⚫🛡