import { describe, expect, it } from "vitest"
import { createEmptyCharacter, normalizeCharacter, normalizeTokenSize, parseCharacterFile } from "../src/lib/characterStorage"
import { CHARACTER_VERSION } from "../src/types/character"

const PNG = "data:image/png;base64,iVBORw0KGgo="
const WEBP = "data:image/webp;base64,UklGRg=="

describe("token da ficha (versão 21)", () => {
  it("migra fichas da versão 20: tamanho 1, sem token, retrato preservado", () => {
    const old = { version: 20, character: { ...createEmptyCharacter(), version: 20, tokenSize: undefined, portraitDataUrl: "data:image/jpeg;base64,AAAA" } }
    const migrated = parseCharacterFile(JSON.stringify(old))
    expect(CHARACTER_VERSION).toBe(21)
    expect(migrated.version).toBe(21)
    expect(migrated.tokenSize).toBe(1)
    expect(migrated.tokenImageDataUrl).toBeUndefined()
    expect(migrated.portraitDataUrl).toBe("data:image/jpeg;base64,AAAA")
  })

  it("aceita só PNG e WebP como token, por causa da transparência", () => {
    expect(normalizeCharacter({ tokenImageDataUrl: PNG }).tokenImageDataUrl).toBe(PNG)
    expect(normalizeCharacter({ tokenImageDataUrl: WEBP }).tokenImageDataUrl).toBe(WEBP)
    expect(normalizeCharacter({ tokenImageDataUrl: "data:image/jpeg;base64,AAAA" }).tokenImageDataUrl).toBeUndefined()
    expect(normalizeCharacter({ tokenImageDataUrl: "https://exemplo.com/x.png" }).tokenImageDataUrl).toBeUndefined()
  })

  it("limita o tamanho a 0,5–10 células em passos de 0,5", () => {
    expect(normalizeTokenSize(2)).toBe(2)
    expect(normalizeTokenSize(1.3)).toBe(1.5)
    expect(normalizeTokenSize(0)).toBe(0.5)
    expect(normalizeTokenSize(40)).toBe(10)
    expect(normalizeTokenSize("2")).toBe(1)
    expect(createEmptyCharacter().tokenSize).toBe(1)
  })
})
