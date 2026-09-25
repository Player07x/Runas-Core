import { describe, expect, it } from "vitest"
import { checkpointsToDrop, isShrink, parseSnapshotStats, shouldCheckpoint, CLOUD_CHECKPOINT_POLICY } from "./snapshot-policy"

describe("trava de encolhimento", () => {
  it("bloqueia esvaziar uma cópia que tinha conteúdo, mesmo pequena", () => {
    expect(isShrink({ total: 3 }, { total: 0 })).toBe(true)
    expect(isShrink({ total: 812 }, { total: 0 })).toBe(true)
  })

  it("bloqueia queda abaixo de 60 % quando a cópia atual já é relevante", () => {
    expect(isShrink({ total: 100 }, { total: 59 })).toBe(true)
    expect(isShrink({ total: 100 }, { total: 60 })).toBe(false)
    expect(isShrink({ total: 812 }, { total: 450 })).toBe(true)
  })

  it("não incomoda edições pequenas nem cópias muito pequenas", () => {
    expect(isShrink({ total: 9 }, { total: 4 })).toBe(false)
    expect(isShrink({ total: 100 }, { total: 100 })).toBe(false)
    expect(isShrink({ total: 100 }, { total: 500 })).toBe(false)
    expect(isShrink({ total: 0 }, { total: 0 })).toBe(false)
  })

  it("sem estatísticas de um dos lados não há como julgar e nunca bloqueia", () => {
    expect(isShrink(null, { total: 0 })).toBe(false)
    expect(isShrink({ total: 100 }, null)).toBe(false)
    expect(isShrink(undefined, undefined)).toBe(false)
  })
})

describe("checkpoints", () => {
  const hour = 60 * 60 * 1000
  const policy = CLOUD_CHECKPOINT_POLICY

  it("guarda sempre a versão substituída quando a gravação é forçada ou encolhe", () => {
    expect(shouldCheckpoint({ previousAt: 10, newestCheckpointAt: 9, forced: true, shrink: false, policy })).toBe(true)
    expect(shouldCheckpoint({ previousAt: 10, newestCheckpointAt: 9, forced: false, shrink: true, policy })).toBe(true)
  })

  it("guarda a primeira versão quando ainda não há nenhum checkpoint", () => {
    expect(shouldCheckpoint({ previousAt: 10, newestCheckpointAt: null, forced: false, shrink: false, policy })).toBe(true)
  })

  it("só guarda outra depois do intervalo, para não gastar o histórico em minutos de edição", () => {
    expect(shouldCheckpoint({ previousAt: 5 * hour, newestCheckpointAt: 0, forced: false, shrink: false, policy })).toBe(false)
    expect(shouldCheckpoint({ previousAt: 6 * hour, newestCheckpointAt: 0, forced: false, shrink: false, policy })).toBe(true)
  })

  it("descarta os mais antigos além do limite", () => {
    const items = [{ at: 5, id: "e" }, { at: 1, id: "a" }, { at: 3, id: "c" }, { at: 2, id: "b" }, { at: 4, id: "d" }]
    expect(checkpointsToDrop(items, 3).map((item) => item.id)).toEqual(["b", "a"])
    expect(checkpointsToDrop(items, 10)).toEqual([])
    expect(checkpointsToDrop(items, 0)).toHaveLength(5)
  })
})

describe("leitura de estatísticas vindas de fora", () => {
  it("aceita JSON em texto e ignora contagens inválidas", () => {
    expect(parseSnapshotStats('{"total":12,"pages":7,"campaigns":2.9,"bad":-1,"text":"x"}')).toEqual({ total: 12, pages: 7, campaigns: 2 })
  })

  it("rejeita o que não tem total válido", () => {
    expect(parseSnapshotStats("não é json")).toBeNull()
    expect(parseSnapshotStats('{"pages":3}')).toBeNull()
    expect(parseSnapshotStats('{"total":-1}')).toBeNull()
    expect(parseSnapshotStats(null)).toBeNull()
    expect(parseSnapshotStats(42)).toBeNull()
  })
})
