# OpenShield Desktop — Agent Brief

You are building **OpenShield Desktop** — the GUI companion for the OpenShield
AI coding harness (Rust CLI, sibling repo), plus **OpenShield
Pocket**, the Android remote (same codebase, `src-tauri/gen/android`).

Read `docs/openshield-desktop-design.md` FIRST. It is the source of truth:
architecture, API surface, WS event envelope, milestones M0–M5, theming,
security model. Decisions in §8 are locked: separate monorepo, Pocket is
strictly a remote (no offline provider chat), stack is **Tauri 2 + SvelteKit 2
(adapter-static) + TypeScript + Rust src-tauri/**.

**Reference implementation:** OpenClaw Pincers (vendored configs at
`docs/reference/pincers/`). Port patterns (themes, WS client structure,
approvals inbox), don't copy branding. Do NOT read files outside this repo —
sandboxed sessions will die on cross-repo reads.

## Hard rules

- Credit: "Part of the Blackshield Company" — never sole-author anything.
- App IDs: `com.openshield.desktop` (desktop), `com.openshield.pocket` (mobile).
- `npx svelte-check` zero errors/warnings and `npm run build` clean before any
  commit; `cargo check` clean in src-tauri.
- Frontend talks to `openshield serve` (REST + native WebSocket) over plain
  fetch/ws — NOT Tauri IPC. Same code path must work on desktop, Android, and
  browser dev.
- Backend connection starts in the background and NEVER blocks first render;
  disconnected = tappable banner opening connection settings; no LAN subnet
  scanning; fast-fail localhost instantly.
- All backend calls wrapped in try/catch returning `{success, error}` — a dead
  server shows an error banner, never a silent dead button. Buttons get
  loading states and always re-enable in `finally`.
- Themes: CSS variables + Svelte store. Flagship **Blackshield** (#101014
  matte black bg, #8F959C steel text, #C1121F blood accent, #D8D3C8 bone
  surfaces), second **Synthwave '84** (#240037, #8F00FF, #FF7EDB, #FF00FF,
  #F3E70F).
- All UI mouse-clickable on desktop; bottom nav on narrow widths (same routes).
- Commit generated assets (icons/splash) to git.

## Tauri/WebKit pitfalls (non-negotiable)

- Icons must be RGBA PNGs — generate with PIL `.convert('RGBA')`. `icon` goes
  ONLY under `bundle.icon` in tauri.conf.json.
- System dep: `webkit2gtk-4.1` (NOT plain webkit2gtk).
- No inline `onclick`/`onsubmit` — Svelte event directives / delegation only.
- No inline `<script>` in HTML — external scripts only (Tauri's `csp: null`
  still defaults to `default-src 'self'`).
- Vite build must strip `crossorigin` from built index.html via a
  transformIndexHtml plugin or the webview white-screens.
- CSP must include `connect-src 'self' http://127.0.0.1:* ws://127.0.0.1:*
  http://* ws://*` or serve calls die silently.
- Svelte 5: beware `onchange` handlers silently failing — verify every handler
  in the real webview.
- WebKit form elements: force `background`/`color` with `!important` and
  `-webkit-appearance: none` on ALL inputs/selects/textareas.
- If the release binary shows stale UI after frontend changes:
  `cargo clean && cargo build --release` (build script caches embedded dist/).

## Repo layout

```
openshield-desktop/
├── AGENTS.md
├── docs/openshield-desktop-design.md   # the contract
├── docs/reference/pincers/             # vendored reference configs
├── src/                                # SvelteKit frontend
│   ├── lib/services/backend.ts         # REST+WS client
│   ├── lib/themes.ts                   # CSS-variable theme system
│   └── routes/                         # chat, sessions, approvals, swarm,
│                                       # memory, doctor, settings
├── static/
├── src-tauri/                          # Rust shell (window, tray, tokens)
└── package.json
```

The backend is NOT here: the app talks to `openshield serve` (axum REST + WS,
default 127.0.0.1:9310) from the openshield repo (main branch, M0 merged).
API contract: design doc §3.1/§4. Keep the mock service layer working so the
UI is usable with no server configured.
