import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { OBSIDIAN_PREFERENCES_KEY, readObsidianPreferences } from "./obsidian-preferences"

function fakeStorage(): Storage {
  const map = new Map<string, string>()
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => { map.set(key, String(value)) },
    removeItem: (key) => { map.delete(key) },
    clear: () => map.clear(),
    key: (index) => [...map.keys()][index] ?? null,
    get length() { return map.size },
  }
}

describe("readObsidianPreferences: estável para useSyncExternalStore", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {})
    vi.stubGlobal("localStorage", fakeStorage())
  })
  afterEach(() => vi.unstubAllGlobals())

  it("devolve o mesmo objeto (===) entre chamadas quando nada mudou, para não entrar em laço no useSyncExternalStore", () => {
    const first = readObsidianPreferences()
    const second = readObsidianPreferences()
    expect(second).toBe(first)
  })

  it("devolve um objeto novo só quando o valor salvo muda de verdade", () => {
    const before = readObsidianPreferences()
    localStorage.setItem(OBSIDIAN_PREFERENCES_KEY, JSON.stringify({ enabled: false, automatic: true }))
    const after = readObsidianPreferences()
    expect(after).not.toBe(before)
    expect(after.enabled).toBe(false)
    expect(readObsidianPreferences()).toBe(after)
  })
})
