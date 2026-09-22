import { afterEach, describe, expect, it, vi } from "vitest"
import { createId, createPrefixedId } from "../src/lib/ids"

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

const original = globalThis.crypto

afterEach(() => { Object.defineProperty(globalThis, "crypto", { value: original, configurable: true, writable: true }) })

function usarCrypto(value: unknown) {
  Object.defineProperty(globalThis, "crypto", { value, configurable: true, writable: true })
}

/**
 * O Runas Tools servido pelo RunasVTT roda em `http://IP:porta`, que não é
 * contexto seguro: ali `crypto.randomUUID` não existe, mas `getRandomValues`
 * sim. Chamar `randomUUID` direto quebrava importar e criar ficha.
 */
describe("identificadores da suíte", () => {
  it("usa a implementação nativa quando ela existe", () => {
    const randomUUID = vi.fn(() => "11111111-2222-4333-8444-555555555555")
    usarCrypto({ randomUUID, getRandomValues: original.getRandomValues.bind(original) })
    expect(createId()).toBe("11111111-2222-4333-8444-555555555555")
    expect(randomUUID).toHaveBeenCalledOnce()
  })

  it("gera um UUID v4 válido sem randomUUID, fora de contexto seguro", () => {
    usarCrypto({ getRandomValues: original.getRandomValues.bind(original) })
    const ids = Array.from({ length: 50 }, () => createId())
    for (const id of ids) expect(id).toMatch(UUID_V4)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("ainda devolve um id no formato certo sem crypto algum", () => {
    usarCrypto(undefined)
    const ids = Array.from({ length: 50 }, () => createId())
    for (const id of ids) expect(id).toMatch(UUID_V4)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("prefixa mantendo o UUID legível", () => {
    usarCrypto({ getRandomValues: original.getRandomValues.bind(original) })
    const id = createPrefixedId("item")
    expect(id.startsWith("item-")).toBe(true)
    expect(id.slice("item-".length)).toMatch(UUID_V4)
  })
})
