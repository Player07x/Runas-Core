"use client"

import { useState } from "react"
import { Dices, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { CharacterAttributes, CharacterElementSkill } from "@runas/core/types/character"
import { availableElementFusions, calculateElementTest, selectableElements } from "@runas/core/lib/elementSkills"
import { FUSION_ID_PREFIX } from "@runas/core/lib/characterTestSources"

/**
 * Elementos, no topo de Magias. É o recorte curto da perícia: nome, nível e
 * o teste (`Místico + Poder + nível`), sem pontos nem modificadores. Com dois
 * ou mais elementos de nível maior que zero, as fusões possíveis aparecem
 * sozinhas — elas não têm botão porque o próprio nome rola o teste.
 */

interface Props {
  attributes: CharacterAttributes
  elements: CharacterElementSkill[]
  onChange: (elements: CharacterElementSkill[]) => void
  onRoll: (sourceId: string) => void
}

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? `element-${crypto.randomUUID()}`
    : `element-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

export function CharacterElements({ attributes, elements, onChange, onRoll }: Props) {
  const [adding, setAdding] = useState(false)
  const [customName, setCustomName] = useState("")
  const fusions = availableElementFusions(elements)
  const used = new Set(elements.map((element) => element.elementId).filter(Boolean))

  function add(elementId: string, name: string) {
    onChange([...elements, { id: newId(), elementId, name, level: 1 }])
    setAdding(false)
    setCustomName("")
  }

  function update(id: string, patch: Partial<CharacterElementSkill>) {
    onChange(elements.map((element) => element.id === id ? { ...element, ...patch } : element))
  }

  return (
    <section aria-label="Elementos do personagem" className="rounded-[20px] border border-border bg-muted/25 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-foreground">Elementos</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">Teste: Místico + Poder + nível. Valem como perícia em itens e magias.</p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => setAdding((value) => !value)}><Plus /> Adicionar elemento</Button>
      </div>

      {adding && (
        <div className="mt-3 rounded-[16px] border border-border bg-background/60 p-3">
          <div className="flex flex-wrap gap-1.5">
            {selectableElements.filter((element) => !used.has(element.id)).map((element) => (
              <button key={element.id} type="button" onClick={() => add(element.id, element.name)} className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1.5 text-xs font-semibold text-foreground transition hover:border-primary/55 hover:bg-primary/8">
                <span aria-hidden="true" className="size-2 rounded-full" style={{ background: element.color }} />
                {element.name}
                <span className="text-[0.62rem] font-normal text-muted-foreground">{element.kind}</span>
              </button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <input value={customName} maxLength={40} placeholder="Ou digite um elemento" onChange={(event) => setCustomName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); if (customName.trim()) add("", customName.trim()) } }} className="h-10 min-w-0 flex-1 rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-ring" />
            <Button type="button" size="sm" disabled={!customName.trim()} onClick={() => add("", customName.trim())}><Plus /> Adicionar</Button>
          </div>
        </div>
      )}

      {elements.length === 0
        ? <p className="mt-3 text-xs text-muted-foreground">Nenhum elemento. Adicione um para liberar os testes e as fusões.</p>
        : <div className="mt-3 space-y-1.5">
            {elements.map((element) => (
              <div key={element.id} className="grid grid-cols-[minmax(0,1fr)_4.5rem_4rem_auto_auto] items-center gap-2 rounded-[14px] border border-border bg-background/60 px-3 py-2">
                <span className="min-w-0 truncate text-sm font-semibold text-foreground">{element.name}</span>
                <label className="flex items-center gap-1.5 text-[0.62rem] uppercase tracking-wide text-muted-foreground">
                  Nível
                  <input type="number" inputMode="numeric" min={0} step={1} value={element.level} aria-label={`Nível de ${element.name}`} onChange={(event) => update(element.id, { level: Math.max(0, Math.trunc(Number(event.target.value) || 0)) })} className="h-8 w-12 rounded-lg border border-input bg-background px-1.5 text-center text-xs font-bold tabular-nums text-foreground outline-none focus:border-ring" />
                </label>
                <span className="text-center text-sm font-bold tabular-nums text-primary" aria-label={`Teste de ${element.name}`}>{calculateElementTest(attributes, element.level)}</span>
                <Button type="button" size="sm" variant="secondary" onClick={() => onRoll(element.id)}><Dices /> Rolar</Button>
                <button type="button" onClick={() => onChange(elements.filter((candidate) => candidate.id !== element.id))} aria-label={`Remover ${element.name}`} className="inline-flex size-9 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-destructive"><Trash2 className="size-4" /></button>
              </div>
            ))}
          </div>}

      {fusions.length > 0 && (
        <div className="mt-3">
          <p className="text-[0.68rem] font-semibold uppercase tracking-wide text-muted-foreground">Fusões disponíveis</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {fusions.map((fusion) => (
              <button key={fusion.element.id} type="button" onClick={() => onRoll(`${FUSION_ID_PREFIX}${fusion.element.id}`)} title={`Rolar ${fusion.element.name} (${fusion.components.join(" + ")})`} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/60 px-2.5 py-1.5 text-xs font-semibold text-foreground transition hover:border-primary/55 hover:bg-primary/8">
                <span aria-hidden="true" className="size-2 rounded-full" style={{ background: fusion.element.color }} />
                {fusion.element.name}
                <span className="text-muted-foreground">Nível {fusion.level}</span>
                <span className="tabular-nums text-primary">{calculateElementTest(attributes, fusion.level)}</span>
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[0.68rem] text-muted-foreground">Clique no nome para rolar. O nível é a soma dos elementos que formam a fusão.</p>
        </div>
      )}
    </section>
  )
}
