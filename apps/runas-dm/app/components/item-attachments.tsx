"use client"

import { useRef, useState } from "react"
import { Plus, Upload, X } from "lucide-react"
import type { CharacterAbility, CharacterSpell } from "@runas/core/types/character"
import { parseAbilityListFile, parseImportedAbility, type ImportedAbility } from "@runas/core/lib/abilityTransfer"
import { parseImportedSpell, parseSpellListFile, type ImportedSpell } from "@runas/core/lib/spellTransfer"

/**
 * Habilidades e magias anexadas a um item, com o tema do Runas DM. O item
 * guarda só os `id`; os registros continuam nas coleções `abilities` e
 * `spells` da mesma instância de `Character`. Anexar aceita usar o que já
 * está na ficha, criar aqui mesmo ou importar um arquivo externo.
 */

interface Attachment {
  id: string
  name: string
  description: string
  detail: string
}

interface Props {
  kind: "ability" | "spell"
  attached: Attachment[]
  available: Attachment[]
  onAttach: (id: string) => void
  onDetach: (id: string) => void
  /**
   * Cria os registros na ficha **e** anexa ao item, numa única alteração.
   * `AdvancedSheetEditor.update` parte sempre do `character` recebido por
   * prop, então criar e anexar em duas chamadas faria a segunda descartar a
   * primeira — o registro nasceria e sumiria no mesmo clique.
   */
  onCreate: (records: Array<ImportedAbility | ImportedSpell>) => void
}

const magicTypeLabels: Record<CharacterSpell["magicType"], string> = {
  enchantment: "Encantamento", aura: "Aura", quick: "Rápida", spell: "Feitiço", ritual: "Ritual",
}

function plainText(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim()
}

function emptyAbility(): ImportedAbility {
  return { category: "", name: "", description: "", permanentModifiers: "", costType: "none", costMode: "fixed", costValue: 0, costText: "" }
}

function emptySpell(): ImportedSpell {
  return { category: "", name: "", description: "", costType: "none", costMode: "fixed", costValue: 0, costText: "", magicType: "enchantment", rangeType: "touch", rangeText: "", area: "", duration: "", castingSkill: "" }
}

export function ItemAttachments({ kind, attached, available, onAttach, onDetach, onCreate }: Props) {
  const isAbility = kind === "ability"
  const [panel, setPanel] = useState<"closed" | "sheet" | "create" | "import">("closed")
  const [draft, setDraft] = useState<ImportedAbility | ImportedSpell>(isAbility ? emptyAbility : emptySpell)
  const [error, setError] = useState("")
  const fileRef = useRef<HTMLInputElement>(null)
  const attachedIds = new Set(attached.map((entry) => entry.id))
  const selectable = available.filter((entry) => !attachedIds.has(entry.id))

  function close() {
    setPanel("closed")
    setError("")
    setDraft(isAbility ? emptyAbility() : emptySpell())
  }

  function create() {
    const name = draft.name.trim()
    if (!name) { setError(`Dê um nome ${isAbility ? "à habilidade" : "à magia"} antes de anexar.`); return }
    onCreate([{ ...draft, name }])
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
      const entries: Array<ImportedAbility | ImportedSpell> = isAbility
        ? (record ? [parseImportedAbility(record)] : parseAbilityListFile(text))
        : (record ? [parseImportedSpell(record)] : parseSpellListFile(text))
      onCreate(entries)
      close()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível ler o arquivo.")
    }
  }

  return <section className="item-attachments">
    <header><h4>{isAbility ? "Habilidades" : "Encantamentos e magias"}</h4></header>
    {attached.length === 0 && <p className="item-attachments-empty">Nenhuma {isAbility ? "habilidade" : "magia"} anexada.</p>}
    {attached.map((entry) => <article key={entry.id} className="item-attachment">
      <div><strong>{entry.name}</strong>{entry.detail && <small>{entry.detail}</small>}</div>
      <button className="row-remove" aria-label={`Remover ${entry.name}`} onClick={() => onDetach(entry.id)}><X size={14} /></button>
      <p>{plainText(entry.description) || "Sem texto."}</p>
    </article>)}

    {panel === "closed"
      ? <button className="secondary-button" onClick={() => setPanel("sheet")}><Plus size={14} /> Adicionar {isAbility ? "Habilidade" : "Encantamento"}</button>
      : <div className="item-attachment-panel">
          <div className="item-attachment-tabs">
            {([["sheet", "Da ficha"], ["create", "Criar nova"], ["import", "Importar"]] as const).map(([value, label]) => (
              <button key={value} className={panel === value ? "active" : ""} onClick={() => { setPanel(value); setError("") }}>{label}</button>
            ))}
            <button className="icon-button" aria-label="Fechar" onClick={close}><X size={15} /></button>
          </div>

          {panel === "sheet" && <div className="item-attachment-options">
            {selectable.length === 0 && <p className="item-attachments-empty">Nada disponível na ficha. Use <strong>Criar nova</strong> ou <strong>Importar</strong>.</p>}
            {selectable.map((entry) => <button key={entry.id} onClick={() => { onAttach(entry.id); close() }}>
              <strong>{entry.name}</strong><small>{entry.detail || plainText(entry.description) || "Sem texto."}</small>
            </button>)}
          </div>}

          {panel === "create" && <div className="item-attachment-create">
            <label className="field"><span>Nome</span><input value={draft.name} maxLength={80} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
            <label className="field"><span>Categoria</span><input value={draft.category} maxLength={40} onChange={(event) => setDraft({ ...draft, category: event.target.value })} /></label>
            {!isAbility && <label className="field"><span>Tipo de magia</span><select value={(draft as ImportedSpell).magicType} onChange={(event) => setDraft({ ...(draft as ImportedSpell), magicType: event.target.value as CharacterSpell["magicType"] })}>{Object.entries(magicTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
            <label className="field span-2"><span>Texto</span><textarea rows={4} maxLength={5000} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
            <button className="primary-button" onClick={create}><Plus size={14} /> Criar e anexar</button>
          </div>}

          {panel === "import" && <div className="item-attachment-create">
            <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(event) => { void importFile(event.target.files?.[0]); event.currentTarget.value = "" }} />
            <button className="secondary-button" onClick={() => fileRef.current?.click()}><Upload size={14} /> Escolher arquivo</button>
            <p className="item-attachments-empty">Aceita a lista exportada pelo Runas Tools e o recurso avulso do Runas Book.</p>
          </div>}

          {error && <p className="item-attachment-error" role="alert">{error}</p>}
        </div>}
  </section>
}

export function abilityAttachment(ability: CharacterAbility): Attachment {
  return { id: ability.id, name: ability.name, description: ability.description, detail: ability.category }
}

export function spellAttachment(spell: CharacterSpell): Attachment {
  return { id: spell.id, name: spell.name, description: spell.description, detail: [magicTypeLabels[spell.magicType], spell.category].filter(Boolean).join(" · ") }
}
