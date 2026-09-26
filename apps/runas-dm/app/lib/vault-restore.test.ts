import { describe, expect, it } from "vitest"
import { normalizeKnowledgeWorkspace } from "./knowledge-model"
import { createEmptyCharacter, createInitialState, type BestiaryEntry, type RunasDmState } from "./model"
import { restoreBestiary, restoreKnowledge } from "./vault-restore"

const CAMPAIGN = "[O&C] Lion Heart pt. II"

const saved = normalizeKnowledgeWorkspace({
  campaigns: [{ id: "c1", title: CAMPAIGN, description: "", tags: [], createdAt: 1, updatedAt: 1, accentColor: "#9987a3", backgroundColor: "#100d0e", boxColor: "#1b1517", buttonColor: "#35242b", textColor: "#f5eeee", imageBlur: 12, backgroundImageDataUrl: "data:image/webp;base64,AAAA", organizer: { nodes: [{ id: "n1", title: "Chegada", body: "", x: 10, y: 20 }], edges: [] }, worldPageIds: ["p1"], storyIds: ["s1"] }],
  tags: [{ id: "t1", name: "Sessões", icon: "📜", color: "#c9a227", pinnedIn: ["campaign-notes:c1"] }],
  eras: [{ id: "estrelas", name: "Era das Estrelas", startYear: -6702, endYear: 0, calendar: "C.E.", note: "" }],
  pages: [{ id: "p1", scope: "wiki", kind: "chronology", title: "Era das Estrelas", eraStartYear: -6702, eraEndYear: 0, eraCalendar: "C.E.", icon: "🕰️", accentColor: "#c9a227", createdAt: 1, updatedAt: 1 }],
  deletedIds: ["page-apagada"],
  updatedAt: 500,
})

describe("restaurar Campanhas e Wiki do vault", () => {
  it("num dispositivo virgem, tudo volta: estilo, organizador, tags com ícone e cor, eras com datas e exclusões", () => {
    const restored = restoreKnowledge(normalizeKnowledgeWorkspace({}), JSON.parse(JSON.stringify(saved)), "pristine")
    const campaign = restored.campaigns[0]
    expect(campaign).toMatchObject({ title: CAMPAIGN, accentColor: "#9987a3", backgroundColor: "#100d0e", boxColor: "#1b1517", buttonColor: "#35242b", textColor: "#f5eeee", imageBlur: 12, backgroundImageDataUrl: "data:image/webp;base64,AAAA", worldPageIds: ["p1"], storyIds: ["s1"] })
    expect(campaign.organizer?.nodes).toHaveLength(1)
    expect(restored.tags.find((tag) => tag.name === "sessões")).toMatchObject({ icon: "📜", color: "#c9a227" })
    expect(restored.eras?.map((era) => era.id)).toEqual(["estrelas"])
    expect(restored.pages[0]).toMatchObject({ eraStartYear: -6702, eraEndYear: 0, eraCalendar: "C.E.", icon: "🕰️", accentColor: "#c9a227" })
    expect(restored.deletedIds).toEqual(["page-apagada"])
  })

  it("mesclar preserva o que só existe aqui e traz o que só existe no arquivo", () => {
    const local = normalizeKnowledgeWorkspace({ campaigns: [{ id: "c-local", title: "Só aqui", createdAt: 1, updatedAt: 1 }], updatedAt: 1 })
    const merged = restoreKnowledge(local, JSON.parse(JSON.stringify(saved)), "merge")
    expect(merged.campaigns.map((campaign) => campaign.title)).toHaveLength(2)
    expect(merged.campaigns.map((campaign) => campaign.title)).toEqual(expect.arrayContaining([CAMPAIGN, "Só aqui"]))
  })

  it("substituir descarta o que só existia aqui", () => {
    const local = normalizeKnowledgeWorkspace({ campaigns: [{ id: "c-local", title: "Só aqui", createdAt: 1, updatedAt: 1 }], updatedAt: 1 })
    expect(restoreKnowledge(local, JSON.parse(JSON.stringify(saved)), "replace").campaigns.map((campaign) => campaign.title)).toEqual([CAMPAIGN])
  })

  it("um arquivo vazio ou de outra forma não quebra nem inventa dados", () => {
    expect(restoreKnowledge(saved, {}, "merge").campaigns).toHaveLength(1)
    expect(restoreKnowledge(saved, null, "replace").campaigns).toEqual([])
  })
})

describe("restaurar o Bestiário do vault", () => {
  const entry = (id: string, name: string): BestiaryEntry => ({ id, character: createEmptyCharacter(name), masteryTableId: "custom", updatedAt: 1 })
  const fromVault = (): RunasDmState => ({ ...createInitialState(), entries: [entry("sheet-1", "Lobo Rúnico"), entry("sheet-2", "Golem")], masteryTables: [{ id: "default", name: "Padrão", multiplier: 1 }, { id: "custom", name: "Minha tabela", multiplier: 3 }], encounter: [], initiative: [], workspaceNotesHtml: "" })

  it("num dispositivo virgem, fichas e tabelas próprias voltam, e a Mesa daqui fica como está", () => {
    const local = { ...createInitialState(), workspaceNotesHtml: "<p>notas da mesa</p>" }
    const restored = restoreBestiary(local, JSON.parse(JSON.stringify(fromVault())), "pristine", 9)
    expect(restored.entries.map((item) => item.character.name)).toEqual(["Lobo Rúnico", "Golem"])
    expect(restored.masteryTables.map((table) => table.id)).toEqual(["default", "custom"])
    expect(restored.entries[0].masteryTableId).toBe("custom")
    expect(restored.workspaceNotesHtml).toBe("<p>notas da mesa</p>")
    expect(restored.updatedAt).toBe(9)
  })

  it("mesclar mantém as fichas locais e atualiza por nome, raça e elemento", () => {
    const local = { ...createInitialState(), entries: [entry("local-1", "Golem"), entry("local-2", "Só aqui")] }
    const merged = restoreBestiary(local, JSON.parse(JSON.stringify(fromVault())), "merge", 9)
    expect(merged.entries.map((item) => item.character.name).sort()).toEqual(["Golem", "Lobo Rúnico", "Só aqui"])
    expect(merged.entries.find((item) => item.character.name === "Golem")?.id).toBe("local-1")
  })

  it("aceita um arquivo sem Mesa e sem tabelas", () => {
    const slim = { version: 2, entries: [entry("sheet-9", "Fênix")], updatedAt: 1 }
    const restored = restoreBestiary(createInitialState(), slim, "replace", 9)
    expect(restored.entries.map((item) => item.character.name)).toEqual(["Fênix"])
    expect(restored.masteryTables.length).toBeGreaterThan(0)
  })
})
