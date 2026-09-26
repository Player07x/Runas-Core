import { describe, expect, it } from "vitest"
import { eraRangeLines, sortErasByStart, calendarLines } from "./chronology"
import { normalizeKnowledgeWorkspace } from "./knowledge-model"
import { canonicalizeTags, emojiForTag, isNoiseTag, tagStem } from "./tag-normalization"
import { pageObsidianFingerprint } from "./obsidian-sync"

const page = (id: string, tags: string[], extra: object = {}) => ({ id, scope: "wiki", kind: "geography", title: id, tags, createdAt: 1, updatedAt: 1, ...extra })

describe("tags: minúsculas, sem duplicatas e com emoji", () => {
  it("une a caixa e o plural (assentamento/Assentamentos, regiao/Regiões) e deixa tudo minúsculo", () => {
    const state = normalizeKnowledgeWorkspace({ pages: [page("a", ["assentamento", "Assentamentos", "regiao"]), page("b", ["Assentamentos", "Regiões"])], updatedAt: 1 })
    expect(state.pages[0].tags).toEqual(["assentamentos", "regiões"])
    expect(state.pages[1].tags).toEqual(["assentamentos", "regiões"])
    expect(state.tags.map((tag) => tag.name).sort()).toEqual(["assentamentos", "regiões"])
    expect(state.tags.every((tag) => tag.name === tag.name.toLocaleLowerCase("pt-BR"))).toBe(true)
  })

  it("dá um emoji relacionado a cada tag, sem trocar o que o mestre escolheu", () => {
    expect(emojiForTag("assentamentos")).toBe("🏘️")
    expect(emojiForTag("regiões")).toBe("🏞️")
    expect(emojiForTag("era das runas")).toBe("🔮")
    expect(emojiForTag("qualquer coisa")).toBe("🏷️")
    const state = normalizeKnowledgeWorkspace({ pages: [page("a", ["Territórios", "Lion Heart"])], tags: [{ id: "t1", name: "Lion Heart", icon: "🐯", color: "#123456", pinnedIn: [] }], updatedAt: 1 })
    expect(state.tags.find((tag) => tag.name === "territórios")?.icon).toBe("🚩")
    expect(state.tags.find((tag) => tag.name === "lion heart")).toMatchObject({ icon: "🐯", color: "#123456" })
  })

  it("remove só o ruído do erro dos colchetes, nunca um nome bem formado", () => {
    expect(["] Lion Heart pt. II", "O&C] Lion Heart pt. II", 'Eventos e Missões"] Lion Heart pt. II', "Sem Tag"].every(isNoiseTag)).toBe(true)
    expect(["[O&C] Lion Heart pt. II", "Lion Heart", "runilita"].some(isNoiseTag)).toBe(false)
    const state = normalizeKnowledgeWorkspace({ pages: [page("a", ["] Lion Heart pt. II", "importante", "Sem Tag"])], updatedAt: 1 })
    expect(state.pages[0].tags).toEqual(["importante"])
  })

  it("é idempotente e o stem ignora acento, caixa e plural", () => {
    const once = normalizeKnowledgeWorkspace({ pages: [page("a", ["Sessões", "sessoes"])], updatedAt: 1 })
    expect(canonicalizeTags(once)).toEqual(once)
    expect(tagStem("Regiões")).toBe(tagStem("regiao"))
  })

  it("a assinatura de sincronização ignora a caixa e a união de variantes: o vault não é regravado à toa", () => {
    const state = normalizeKnowledgeWorkspace({ pages: [page("a", ["assentamentos"])], updatedAt: 1 })
    const original = { ...state.pages[0], tags: ["Assentamentos", "assentamento"] }
    expect(pageObsidianFingerprint(original, state)).toBe(pageObsidianFingerprint(state.pages[0], state))
  })
})

describe("eras: datas do documento, ordem e exibição", () => {
  it("a migração única corrige inclusive a Era das Migrações, e roda uma vez só", () => {
    const era = { id: "era-migracoes", scope: "wiki", kind: "chronology", title: "Era das Migrações", eraStartYear: 0, eraEndYear: 5, eraCalendar: "Logi", createdAt: 1, updatedAt: 1 }
    const first = normalizeKnowledgeWorkspace({ pages: [era], updatedAt: 1 })
    expect(first.pages[0]).toMatchObject({ eraStartYear: 3888, eraEndYear: 4027, eraCalendar: "C.E." })
    expect(first.migrations).toContain("eras-documento-2026-09")
    // Depois de migrada, uma edição do mestre não é mais sobrescrita.
    const edited = normalizeKnowledgeWorkspace({ ...first, pages: [{ ...first.pages[0], eraStartYear: 3900 }] })
    expect(edited.pages[0].eraStartYear).toBe(3900)
  })

  it("ordena pela data C.E. da menor para a maior, com a Pré-Runas primeiro e sem datas por último", () => {
    const eras = [
      { id: "era-cacadores", eraStartYear: 4027, eraEndYear: null }, { id: "era-nova", eraStartYear: null, eraEndYear: null },
      { id: "era-monges", eraStartYear: 0, eraEndYear: 1489 }, { id: "era-runas", eraStartYear: null, eraEndYear: -100180789 },
      { id: "era-pre-runas", eraStartYear: null, eraEndYear: null }, { id: "era-titas", eraStartYear: -100180789, eraEndYear: -15396 },
    ]
    expect(sortErasByStart(eras).map((era) => era.id)).toEqual(["era-pre-runas", "era-runas", "era-titas", "era-monges", "era-cacadores", "era-nova"])
  })

  it("data em C.E. mostra só C.E.; data marcada em Logi mostra Logi e C.E., uma por linha", () => {
    expect(calendarLines(1200, "C.E.")).toEqual(["1.200 C.E."])
    expect(calendarLines(4027, "Logi")).toEqual(["0 Logi", "4.027 C.E."])
    expect(eraRangeLines(0, 1489, "C.E.")).toEqual(["0 C.E. → 1.489 C.E."])
    expect(eraRangeLines(3888, 4027, "Logi")).toEqual(["-139 Logi → 0 Logi", "3.888 C.E. → 4.027 C.E."])
    expect(eraRangeLines(4027, null, "C.E.")).toEqual(["4.027 C.E. → Não definido"])
  })
})

import { conflictCopies, isConflictCopy, removePagesById } from "./conflict-copies"

describe("cópias em conflito", () => {
  const state = normalizeKnowledgeWorkspace({
    campaigns: [{ id: "c1", title: "C", worldPageIds: ["dup"], storyIds: ["dup"], createdAt: 1, updatedAt: 1 }],
    pages: [
      page("orig", ["sessões"], { title: "Nota", linkedPageIds: ["dup"] }),
      page("page-conflict-1", ["sessões"], { title: "Nota (cópia local em conflito)" }),
      page("dup", ["sessões"], { title: "Outra (cópia local em conflito)" }),
      page("solta", ["sessões"], { title: "Cópia local em conflito é só um assunto" }),
    ],
    updatedAt: 1,
  })

  it("reconhece só as cópias geradas pelo site", () => {
    expect(conflictCopies(state.pages).map((p) => p.id).sort()).toEqual(["dup", "page-conflict-1"])
    expect(isConflictCopy({ id: "x", title: "Cópia local em conflito é só um assunto" })).toBe(false)
  })

  it("remove as cópias, limpa referências e grava a lápide", () => {
    const next = removePagesById(state, conflictCopies(state.pages).map((p) => p.id))
    expect(next.pages.map((p) => p.id).sort()).toEqual(["orig", "solta"])
    expect(next.pages.find((p) => p.id === "orig")?.linkedPageIds).toEqual([])
    expect(next.campaigns[0].worldPageIds).toEqual([])
    expect(next.deletedIds).toEqual(expect.arrayContaining(["dup", "page-conflict-1"]))
    expect(removePagesById(next, [])).toBe(next)
  })
})
