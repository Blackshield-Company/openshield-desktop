/*
 * Test bootstrap.
 *
 * Node 26 ships an experimental `localStorage` global (undefined unless a
 * --localstorage-file flag is passed). Vitest's jsdom population sees the key
 * already on globalThis and refuses to copy jsdom's real one — leaving every
 * `localStorage` access as undefined. Override it with a standards-shaped
 * in-memory Storage before any service module touches it.
 */
class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(key: string): string | null {
    return this.map.has(String(key)) ? (this.map.get(String(key)) ?? null) : null;
  }
  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.map.delete(String(key));
  }
  setItem(key: string, value: string): void {
    this.map.set(String(key), String(value));
  }
}

Object.defineProperty(globalThis, "localStorage", {
  value: new MemoryStorage(),
  configurable: true,
  writable: true,
});
