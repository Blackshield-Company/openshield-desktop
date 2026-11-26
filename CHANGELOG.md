# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- New chat sessions are created with `POST /api/v1/sessions` so they persist on the server. Sessions can be closed from the list with `DELETE /api/v1/sessions/:id`.
- The doctor panel understands the live `/api/v1/doctor` report shape (`checks`, `healthy`/`warning`/`critical`) and shows `fixes_applied` after `POST /api/v1/doctor/fix`. Needs OpenShield with that endpoint (the companion core PR).

### Changed

- CI runs `svelte-check`, `cargo check` for the Tauri crate, and a Linux `.deb` Tauri build, in addition to the existing frontend test/build job.
- Safe dependency bumps: `@sveltejs/kit` 2.70.4, `@sveltejs/adapter-static` 3.0.11, Vite 6.4.6. Production (`npm audit --omit=dev`) is clean. Remaining npm advisories are dev-only and need breaking upgrades (SvelteKit 3, Vitest 5); those were left for a later call.

## [0.2.0] - 2026-10-16

### Changed

- **Black Steel look** — The app uses the shared OpenShield brand tokens: dark steel surfaces, warm off-white text and a crimson accent. SVG line icons replace emoji across navigation, headings, empty states, approvals and errors, and the shield mark sits in the side rail. The theme switch is labelled and native checkboxes are visible again.
- **Calmer disconnected state** — A quiet status strip with **Open settings**, plus a **Connect / Try Demo mode** card on the chat page, replaces the red banner. The re-pair banner on authentication errors is unchanged.
- **Animated knight** — The chat empty state shows the idle knight; while a reply streams the knight switches from thinking to working; the status strip shows thinking while connecting and error when disconnected. With reduced motion enabled in the OS, a still image is shown instead of the animation.
- **Brand assets** — App icons and favicon are regenerated from the Black Steel shield, and the README has a new hero image and badges.

## [0.1.0]

- Initial version: chat, sessions, approvals, memory browser, doctor and swarm views for a running `openshield serve` instance.
