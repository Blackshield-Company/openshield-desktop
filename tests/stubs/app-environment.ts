// Hermetic unit-test environment for the SvelteKit frontend.
//
// `$app/*` modules are stubbed (kit's real ones need the full SvelteKit
// runtime) so services and pages can mount in plain jsdom. `browser` is true
// — the services gate their bootstrap on it, and jsdom provides localStorage.

export const browser = true;
export const building = false;
export const dev = true;
export const version = "test";
