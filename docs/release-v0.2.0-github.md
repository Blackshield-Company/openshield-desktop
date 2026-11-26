# Draft GitHub release body for v0.2.0

This text is a proposed replacement for the GitHub release notes at
https://github.com/Blackshield-Company/openshield-desktop/releases/tag/v0.2.0
The current body still says no prebuilt binaries are attached, but an
amd64 AppImage, a .deb, and SHA256SUMS were uploaded on 10 November 2026
(7:45 PM ET). This file is a draft only — do not publish it without
synth's yes. It does not change the GitHub release by itself.

---

OpenShield Desktop 0.2.0 restyles the app in Black Steel, the shared OpenShield look, and adds an animated knight.

## Highlights

### Black Steel look
The app uses the shared OpenShield brand tokens: dark steel surfaces, warm off-white text and a crimson accent. SVG line icons replace emoji across navigation, headings, empty states, approvals and errors, and the shield mark sits in the side rail. App icons and the favicon are regenerated from the Black Steel shield. The theme switch is now labelled, and native checkboxes are visible again.

### Calmer disconnected state
When the app can't reach `openshield serve`, a quiet status strip with **Open settings** and a **Connect / Try Demo mode** card on the chat page replace the old red banner. The re-pair banner for authentication errors is unchanged.

### Animated knight
- The chat empty state shows the idle knight.
- While a reply streams, the knight moves from thinking to working.
- The status strip shows thinking while connecting and error when disconnected.

The animations respect your system's reduced-motion setting and show a still image instead.

### The knight in the terminal
OpenShield 1.2.0 opens on the Black Steel shield by default. Run `/sprite blackshield-mercenary` in the TUI to switch to the knight.

## Requirements
- `openshield serve` 1.1.1 or newer (token required on every request). OpenShield 1.2.0 is recommended.

## Downloads (Linux amd64)
Unsigned build artifacts were attached on 10 November 2026 (7:45 PM ET):

- `openshield-desktop_0.2.0_amd64.AppImage`
- `openshield-desktop_0.2.0_amd64.deb`
- `SHA256SUMS`

These are not code-signed. Verify the checksums in `SHA256SUMS` before installing. macOS and Windows builds are not attached; those platforms can still be built from source (`npm ci` and `npm run tauri build`) after installing the Tauri prerequisites.

**Full changelog:** https://github.com/Blackshield-Company/openshield-desktop/commits/v0.2.0
