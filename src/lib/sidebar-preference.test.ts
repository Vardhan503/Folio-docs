import { describe, expect, it } from "vitest";
import {
  SIDEBAR_STORAGE_KEY,
  readSidebarCollapsed,
  writeSidebarCollapsed,
} from "@/lib/sidebar-preference";

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    values,
  };
}

describe("sidebar preference", () => {
  it("defaults to expanded", () => {
    expect(readSidebarCollapsed(memoryStorage())).toBe(false);
    expect(readSidebarCollapsed(null)).toBe(false);
  });

  it("only treats the exact value 'collapsed' as collapsed", () => {
    expect(readSidebarCollapsed(memoryStorage({ [SIDEBAR_STORAGE_KEY]: "collapsed" }))).toBe(true);
    expect(readSidebarCollapsed(memoryStorage({ [SIDEBAR_STORAGE_KEY]: "true" }))).toBe(false);
    expect(readSidebarCollapsed(memoryStorage({ [SIDEBAR_STORAGE_KEY]: "expanded" }))).toBe(false);
  });

  it("round-trips a written preference", () => {
    const storage = memoryStorage();
    writeSidebarCollapsed(true, storage);
    expect(readSidebarCollapsed(storage)).toBe(true);
    writeSidebarCollapsed(false, storage);
    expect(readSidebarCollapsed(storage)).toBe(false);
  });

  it("falls back to expanded when storage throws", () => {
    const broken = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    expect(readSidebarCollapsed(broken)).toBe(false);
    expect(() => writeSidebarCollapsed(true, broken)).not.toThrow();
  });
});
