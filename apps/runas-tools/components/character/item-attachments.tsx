"use client"

import { useRef, useState } from "react"
import { Plus, Upload, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { CharacterAbility, CharacterSpell } from "@runas/core/types/character"
import { parseAbilityListFile, parseImportedAbility, type ImportedAbility } from "@runas/core/lib/abilityTransfer"
import { parseImportedSpell, parseSpellListFile, type ImportedSpell } from "@runas/core/lib/spellTransfer"

/**
 * Habilidades e magias anexadas a um item. O item guarda só os `id`; os
 * registros continuam vivendo nas seções Habilidades e Magias da ficha.
 * Anexar aceita três caminhos: usar o que já existe na ficha, criar aqui
 * mesmo ou importar um arquivo externo. A leitura é curta de propósito —
 * nome e texto — porque a ficha completa está a uma aba de distância.
 */

type AttachmentKind = "ability" | "spell"

interface Attachment {
  id: string
  name: string
  description: string
  /** Linha curta de apoio (tipo da magia, categoria da habilidade). */
  detail: string
}

interface Props {
  kind: AttachmentKind
  attached: Attachment[]
  available: Attachment[]
  onAttach: (id: string) => void
  onDetach: (id: string) => void
  onCreateAbility?: (ability: ImportedAbility) => string
  onCreateSpell?: (spell: ImportedSpell) => string
}

const magicTypeOptions: { value: CharacterSpell["magicType"]; label: string }[] = [
  { value: "enchantment", label: "Encantamento" },
  { value: "aura", label: "Aura" },
  { value: "quick", label: "Rápida" },
  { value: "spell", label: "Feitiço" },
  { value: "ritual", label: "Ritual" },
]

function plainText(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim()
}

function emptyAbility(): ImportedAbility {
  return { category: "", name: "", description: "", permanentModifiers: "", costType: "none", costMode: "fixed", costValue: 0, costText: "" }
}

function emptySpell(): ImportedSpell {
  return { category: "", name: "", description: "", costType: "none", costMode: "fixed", costValue: 0, costText: "", magicType: "enchantment", rangeType: "touch", rangeText: "", area: "", duration: "", castingSkill: "" }
}

export function ItemAttachments({ kind, attached, available, onAttach, onDetach, onCreateAbility, onCreateSpell }: Props) {
  const [panel, setPanel] = useState<"closed" | "sheet" | "create" | "import">("closed")
  const [abilityDraft, setAbilityDraft] = useState<ImportedAbility>(emptyAbility)
  const [spellDraft, setSpellDraft] = useState<ImportedSpell>(emptySpell)
  const [error, setError] = useState("")
  const fileRef = useRef<HTMLInputElement>(null)

  const isAbility = kind === "ability"
  const title = isAbility ? "Habilidade" : "Encantamento"
  const attachedIds = new Set(attached.map((entry) => entry.id))
  const selectable = available.filter((entry) => !attachedIds.has(entry.id))

  function close() {
    setPanel("closed")
    setError("")
    setAbilityDraft(emptyAbility())
    setSpellDraft(emptySpell())
  }

  function createRecord() {
    setError("")
    const name = (isAbility ? abilityDraft.name : spellDraft.name).trim()
    if (!name) { setError(`Dê um nome ${isAbility ? "à habilidade" : "à magia"} antes de anexar.`); return }
    const id = isAbility
      ? onCreateAbility?.({ ...abilityDraft, name })
      : onCreateSpell?.({ ...spellDraft, name })
    if (id) onAttach(id)
    close()
  }

  async function importFile(file: File | undefined) {
    if (!file) return
    setError("")
    try {
      const text = await file.text()
      const parsed: unknown = JSON.parse(text)
      // Aceita a lista exportada pelo Runas Tools e o recurso avulso do Runas Book.
      const record = (parsed as { record?: unknown }).record
      if (isAbility) {
        const abilities = record ? [parseImportedAbility(record)] : parseAbilityListFile(text)
        for (const ability of abilities) {
          const id = onCreateAbility?.(ability)
          if (id) onAttach(id)
        }
      } else {
        const spells = record ? [parseImportedSpell(record)] : parseSpellListFile(text)
        for (const spell of spells) {
          const id = onCreateSpell?.(spell)
          if (id) onAttach(id)
        }
      }
      close()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível ler o arquivo.")
    }
  }

  return (
    <fieldset className="rounded-xl border border-border/80 bg-muted/15 p-3">
      <legend className="px-1 text-sm font-medium text-muted-foreground">{isAbility ? "Habilidades" : "Encantamentos e magias"}</legend>

      <div className="space-y-2">
        {attached.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma {isAbility ? "habilidade" : "magia"} anexada.</p>}
        {attached.map((entry) => (
          <article key={entry.id} className="rounded-[14px] border border-border bg-background/60 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <strong className="block truncate text-sm text-foreground">{entry.name}</strong>
                {entry.detail && <span className="text-[0.68rem] text-muted-foreground">{entry.detail}</span>}
              </div>
              <button type="button" onClick={() => onDetach(entry.id)} aria-label={`Remover ${entry.name}`} className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"><X className="size-4" /></button>
            </div>
            <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{plainText(entry.description) || "Sem texto."}</p>
          </article>
        ))}
      </div>

      {panel === "closed"
        ? <Button type="button" size="sm" variant="outline" className="mt-3 w-full" onClick={() => setPanel("sheet")}><Plus /> Adicionar {title}</Button>
        : <div className="mt-3 rounded-[14px] border border-border bg-background/60 p-3">
            <div className="flex flex-wrap items-center gap-1">
              {([["sheet", "Da ficha"], ["create", "Criar nova"], ["import", "Importar"]] as const).map(([value, label]) => (
                <button key={value} type="button" onClick={() => { setPanel(value); setError("") }} className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${panel === value ? "bg-primary/12 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>{label}</button>
              ))}
              <button type="button" onClick={close} aria-label="Fechar" className="ml-auto inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"><X className="size-4" /></button>
            </div>

            {panel === "sheet" && <div className="mt-2 space-y-1">
              {selectable.length === 0 && <p className="text-xs text-muted-foreground">Nada disponível na ficha. Use <strong>Criar nova</strong> ou <strong>Importar</strong>.</p>}
              {selectable.map((entry) => (
                <button key={entry.id} type="button" onClick={() => { onAttach(entry.id); close() }} className="block w-full rounded-lg px-2.5 py-2 text-left hover:bg-muted">
                  <strong className="block truncate text-sm text-foreground">{entry.name}</strong>
                  <span className="block truncate text-[0.68rem] text-muted-foreground">{entry.detail || plainText(entry.description) || "Sem texto."}</span>
                </button>
              ))}
            </div>}

            {panel === "create" && <div className="mt-2 grid gap-2">
              <label className="block"><span className="mb-1 block text-xs text-muted-foreground">Nome</span><input value={isAbility ? abilityDraft.name : spellDraft.name} onChange={(event) => isAbility ? setAbilityDraft({ ...abilityDraft, name: event.target.value }) : setSpellDraft({ ...spellDraft, name: event.target.value })} maxLength={80} className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-ring" /></label>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="block"><span className="mb-1 block text-xs text-muted-foreground">Categoria</span><input value={isAbility ? abilityDraft.category : spellDraft.category} onChange={(event) => isAbility ? setAbilityDraft({ ...abilityDraft, category: event.target.value }) : setSpellDraft({ ...spellDraft, category: event.target.value })} maxLength={40} className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-ring" /></label>
                {!isAbility && <label className="block"><span className="mb-1 block text-xs text-muted-foreground">Tipo de magia</span><select value={spellDraft.magicType} onChange={(event) => setSpellDraft({ ...spellDraft, magicType: event.target.value as CharacterSpell["magicType"] })} className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-ring">{magicTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>}
              </div>
              <label className="block"><span className="mb-1 block text-xs text-muted-foreground">Texto</span><textarea rows={4} maxLength={5000} value={isAbility ? abilityDraft.description : spellDraft.description} onChange={(event) => isAbility ? setAbilityDraft({ ...abilityDraft, description: event.target.value }) : setSpellDraft({ ...spellDraft, description: event.target.value })} className="w-full resize-y rounded-xl border border-input bg-background p-2.5 text-sm outline-none focus:border-ring" /></label>
              <Button type="button" size="sm" onClick={createRecord}><Plus /> Criar e anexar</Button>
              <p className="text-[0.68rem] leading-relaxed text-muted-foreground">O registro entra em {isAbility ? "Habilidades" : "Magias"} e pode ser detalhado lá.</p>
            </div>}

            {panel === "import" && <div className="mt-2 grid gap-2">
              <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(event) => { void importFile(event.target.files?.[0]); event.currentTarget.value = "" }} />
              <Button type="button" size="sm" variant="outline" onClick={() => fileRef.current?.click()}><Upload /> Escolher arquivo</Button>
              <p className="text-[0.68rem] leading-relaxed text-muted-foreground">Aceita a lista exportada pelo Runas Tools e o recurso avulso exportado pelo Runas Book.</p>
            </div>}

            {error && <p role="alert" className="mt-2 rounded-lg border border-destructive/40 bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">{error}</p>}
          </div>}
    </fieldset>
  )
}

export function abilityAttachment(ability: CharacterAbility): Attachment {
  return { id: ability.id, name: ability.name, description: ability.description, detail: ability.category }
}

export function spellAttachment(spell: CharacterSpell): Attachment {
  return { id: spell.id, name: spell.name, description: spell.description, detail: [magicTypeOptions.find((option) => option.value === spell.magicType)?.label, spell.category].filter(Boolean).join(" · ") }
}
