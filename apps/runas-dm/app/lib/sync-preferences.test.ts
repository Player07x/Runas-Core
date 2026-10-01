import { describe, expect, it, beforeEach, afterEach, vi } from "vitest"
import { LOCAL_ONLY_MODE_KEY, readLocalOnlyMode, writeLocalOnlyMode } from "./sync-preferences"

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

describe("modo local: interruptor persistente da sincronização com a nuvem", () => {
  beforeEach(() => { vi.stubGlobal("localStorage", fakeStorage()) })
  afterEach(() => vi.unstubAllGlobals())

  it("começa desligado, sem preferência gravada", () => {
    expect(readLocalOnlyMode()).toBe(false)
  })

  it("liga, persiste e sobrevive a uma nova leitura (simula reabrir o navegador)", () => {
    writeLocalOnlyMode(true)
    expect(localStorage.getItem(LOCAL_ONLY_MODE_KEY)).toBe("1")
    expect(readLocalOnlyMode()).toBe(true)
  })

  it("desligar remove a chave em vez de gravar um valor falso", () => {
    writeLocalOnlyMode(true)
    writeLocalOnlyMode(false)
    expect(localStorage.getItem(LOCAL_ONLY_MODE_KEY)).toBeNull()
    expect(readLocalOnlyMode()).toBe(false)
  })
})
