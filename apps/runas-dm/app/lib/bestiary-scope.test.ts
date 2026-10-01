import { describe, expect, it } from "vitest"
import { bestiarySignature } from "./bestiary-scope"
import { createEmptyCharacter, createEmptyRunasDmState, type BestiaryEntry } from "./model"

function entry(name: string): BestiaryEntry {
  return { id: `sheet-${name}`, character: createEmptyCharacter(name), masteryTableId: "default", updatedAt: 1 }
}

describe("bestiarySignature", () => {
  it("ignora o timestamp: regravar sem mudar o conteúdo mantém a mesma assinatura", () => {
    const base = { ...createEmptyRunasDmState("bestiario-1"), entries: [entry("Lobo")] }
    expect(bestiarySignature(base)).toBe(bestiarySignature({ ...base, updatedAt: base.updatedAt + 1000 }))
  })

  it("muda quando uma ficha muda", () => {
    const base = { ...createEmptyRunasDmState("bestiario-1"), entries: [entry("Lobo")] }
    const signature = bestiarySignature(base)
    expect(bestiarySignature({ ...base, entries: [entry("Urso")] })).not.toBe(signature)
  })

  it("nunca inclui a Mesa (encontro, iniciativa, notas): mudar só a Mesa não muda a assinatura", () => {
    const base = { ...createEmptyRunasDmState("bestiario-1"), entries: [entry("Lobo")] }
    const withEncounterChange = { ...base, workspaceNotesHtml: "<p>nota da mesa</p>" }
    expect(bestiarySignature(withEncounterChange)).toBe(bestiarySignature(base))
  })
})
