"use client"

import { useState } from "react"
import { Download, Save, Trash2, X } from "lucide-react"
import { calculateItemRealWeight, inventoryTypeLabel, inventoryTypeOptions, inventoryUsageLabel, inventoryUsageOptions, itemAffinityOptions, isBondAbilityCategory } from "@runas/core/lib/inventoryCalculations"
import { calculateItemSizeModifier } from "@runas/core/lib/characterCalculations"
import type { CharacterAbility, CharacterInventoryItem, CharacterSpell } from "@runas/core/types/character"
import { resourceKindLabel, type BookResource } from "../lib/book-model"
import { resourceFields } from "../lib/resource-fields"
import { sanitizeRichTextCached } from "../lib/rich-text"
import { RichTextEditor } from "./rich-text-editor"

const costOptions: { value: CharacterAbility["costType"]; label: string }[] = [
  { value: "none", label: "Nenhum" },
  { value: "other", label: "Outro" },
  { value: "pv", label: "PV Atual" },
  { value: "pa", label: "PA Atual" },
  { value: "pe", label: "PE Atual" },
  { value: "paExtra", label: "PA Extra" },
  { value: "peTemporary", label: "PE Temporário" },
]

const magicTypeOptions: { value: CharacterSpell["magicType"]; label: string }[] = [
  { value: "aura", label: "Aura" },
  { value: "quick", label: "Rápida" },
  { value: "spell", label: "Feitiço" },
  { value: "ritual", label: "Ritual" },
  { value: "enchantment", label: "Encantamento" },
]
const rangeTypeOptions: { value: CharacterSpell["rangeType"]; label: string }[] = [
  { value: "touch", label: "Toque" },
  { value: "personal", label: "Pessoal" },
  { value: "projectile", label: "Projétil" },
  { value: "targets", label: "Alvo(s)" },
  { value: "area", label: "Área" },
]


export { costSummary, linkedName, magicTypeLabel, rangeTypeLabel } from "../lib/resource-fields"

function downloadJson(filename: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url)
}

export function exportResource(resource: BookResource, slug: (value: string) => string) {
  downloadJson(`${slug(resource.entity.name)}.runas-${resource.kind}.json`, { version: 1, source: "Runas Book", kind: resource.kind, record: resource.entity })
}

export function exportPageResources(pageTitle: string, resources: BookResource[], slug: (value: string) => string) {
  downloadJson(`${slug(pageTitle)}.runas-pagina.json`, { version: 1, source: "Runas Book", page: pageTitle, resources: resources.map((resource) => ({ kind: resource.kind, record: resource.entity })) })
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="resource-field"><span>{label}</span><strong>{value}</strong></div>
}

function normalized(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("pt-BR")
}

function isEnchantment(spell: CharacterSpell): boolean {
  return spell.magicType === "enchantment" || normalized(spell.category) === "encantamento"
}



export function ResourceCard({ resource, resources = [], color, onExport, onEdit, editable }: { resource: BookResource; resources?: BookResource[]; color?: string; onExport: () => void; onEdit?: () => void; editable?: boolean }) {
  // A cor da categoria só entra como token; o desenho do cartão é o mesmo.
  return <article className={`resource-card kind-${resource.kind}${color ? " tinted" : ""}`} style={color ? { ["--resource-accent" as string]: color } : undefined}>
    <header><span className={`entry-type type-${resource.kind}`}>{resourceKindLabel(resource.kind)}</span><h3>{resource.entity.name}</h3></header>
    <ResourceFields resource={resource} resources={resources} />
    {resource.entity.description && <div className="resource-description rich-text-content" dangerouslySetInnerHTML={{ __html: sanitizeRichTextCached(resource.entity.description) }} />}
    <footer>
      <button className="outline-action" onClick={onExport}><Download size={15} /> Exportar</button>
      {editable && onEdit && <button className="ghost-link resource-edit-link" onClick={onEdit}>Editar</button>}
    </footer>
  </article>
}

function ResourceFields({ resource, resources }: { resource: BookResource; resources: BookResource[] }) {
  const fields = resourceFields(resource, resources)
  if (fields.length === 0) return null
  return <div className="resource-grid-fields">{fields.map((field) => <Field key={field.label} label={field.label} value={field.value} />)}</div>
}

export function ResourceEditorDialog({ resource, availableResources = [], onSave, onDelete, onClose }: { resource: BookResource; availableResources?: BookResource[]; onSave: (resource: BookResource) => void; onDelete: () => void; onClose: () => void }) {
  const [draft, setDraft] = useState<BookResource>(() => ({ ...resource, entity: { ...resource.entity } }))

  function set(patch: Partial<CharacterInventoryItem & CharacterAbility & CharacterSpell>) {
    setDraft((current) => {
      const entity = { ...current.entity, ...patch } as typeof current.entity
      if (current.kind === "item" && "size" in patch) (entity as CharacterInventoryItem).mt = calculateItemSizeModifier((entity as CharacterInventoryItem).size)
      return { ...current, entity }
    })
  }

  return <div className="modal-backdrop" onMouseDown={onClose}>
    <section className="modal-card editor-modal resource-editor" onMouseDown={(event) => event.stopPropagation()}>
      <header><div><p className="eyebrow">{resourceKindLabel(draft.kind)}</p><h2>{draft.entity.name || "Novo recurso"}</h2></div><button className="icon-link" onClick={onClose}><X size={18} /></button></header>
      <label>Nome<input className="form-input" value={draft.entity.name} onChange={(event) => set({ name: event.target.value })} autoFocus /></label>

      {draft.kind === "item" && <ItemFields item={draft.entity as CharacterInventoryItem} resources={availableResources} set={set} />}
      {draft.kind === "ability" && <AbilityFields ability={draft.entity as CharacterAbility} set={set} />}
      {draft.kind === "spell" && <SpellFields spell={draft.entity as CharacterSpell} set={set} />}

      <RichTextEditor label="Descrição" value={draft.entity.description} onChange={(description) => set({ description })} className="resource-rich-text" />
      <div className="editor-actions">
        <button className="danger-action" onClick={onDelete}><Trash2 size={15} /> Remover</button>
        <button className="primary-action" onClick={() => onSave(draft)}><Save size={15} /> Salvar recurso</button>
      </div>
    </section>
  </div>
}

function ItemFields({ item, resources, set }: { item: CharacterInventoryItem; resources: BookResource[]; set: (patch: Partial<CharacterInventoryItem>) => void }) {
  // Qualquer magia e qualquer habilidade podem ser anexadas ao item, não só encantamentos e habilidades de vínculo.
  const spellOptions = resources.filter((resource) => resource.kind === "spell").map((resource) => ({ id: resource.id, name: resource.entity.name, highlighted: isEnchantment(resource.entity as CharacterSpell) }))
  const abilityOptions = resources.filter((resource) => resource.kind === "ability").map((resource) => ({ id: resource.id, name: resource.entity.name, highlighted: isBondAbilityCategory((resource.entity as CharacterAbility).category) }))
  return <>
    <div className="field-row">
      <label>Uso<select className="form-input" value={item.usage} onChange={(event) => set({ usage: event.target.value as CharacterInventoryItem["usage"] })}>{inventoryUsageOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
      <label>Tipo<select className="form-input" value={item.type} onChange={(event) => set({ type: event.target.value as CharacterInventoryItem["type"] })}>{inventoryTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
      <label>Afinidade<select className="form-input" value={String(item.affinity)} onChange={(event) => set({ affinity: Number(event.target.value) as CharacterInventoryItem["affinity"] })}>{itemAffinityOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
    </div>
    <div className="field-row">
      <label>Pontos de vínculo<input className="form-input" type="number" min={0} value={item.bondPoints} onChange={(event) => set({ bondPoints: Math.max(0, Math.trunc(Number(event.target.value) || 0)) })} /></label>
      <label>Tamanho (cm)<input className="form-input" type="number" min={0} step={0.1} value={item.size} onChange={(event) => set({ size: Math.max(0, Number(event.target.value) || 0) })} /></label>
      <label>MT<output className="form-input">{item.mt}</output></label>
    </div>
    <div className="field-row">
      <label>Quantidade<input className="form-input" type="number" min={1} value={item.quantity} onChange={(event) => set({ quantity: Math.max(1, Math.trunc(Number(event.target.value) || 1)) })} /></label>
      <label>Peso base (kg)<input className="form-input" type="number" min={0} step={0.001} value={item.baseWeight} onChange={(event) => set({ baseWeight: Math.max(0, Number(event.target.value) || 0) })} /></label>
    </div>
    <label>Dano (opcional)<input className="form-input" value={item.damage} onChange={(event) => set({ damage: event.target.value })} placeholder="3D+2 corte" /></label>
    <div className="field-row">
      <label>RDF<input className="form-input" type="number" min={0} value={item.rdf} onChange={(event) => set({ rdf: Math.max(0, Math.trunc(Number(event.target.value) || 0)) })} /></label>
      <label>RDM<input className="form-input" type="number" min={0} value={item.rdm} onChange={(event) => set({ rdm: Math.max(0, Math.trunc(Number(event.target.value) || 0)) })} /></label>
      <label>PR atual<input className="form-input" type="number" min={0} value={item.prCurrent ?? ""} onChange={(event) => set({ prCurrent: event.target.value === "" ? null : Math.max(0, Math.trunc(Number(event.target.value) || 0)) })} /></label>
      <label>PR máximo<input className="form-input" type="number" min={0} value={item.prMaximum ?? ""} onChange={(event) => set({ prMaximum: event.target.value === "" ? null : Math.max(0, Math.trunc(Number(event.target.value) || 0)) })} /></label>
    </div>
    <ResourceLinkList label="Magias anexadas" value={item.spellIds} options={spellOptions} onChange={(spellIds) => set({ spellIds })} />
    <label>Vínculo<input className="form-input" value={item.bondId} onChange={(event) => set({ bondId: event.target.value })} placeholder="Nenhum" /></label>
    <ResourceLinkList label="Habilidades anexadas" value={item.abilityIds} options={abilityOptions} onChange={(abilityIds) => set({ abilityIds })} />
    <label>Perícia<input className="form-input" value={item.skillId} onChange={(event) => set({ skillId: event.target.value })} placeholder="Nenhuma" /></label>
  </>
}

/** Lista de ids anexados ao item, com o nome do recurso e um botão para remover. */
function ResourceLinkList({ label, value, options, onChange }: { label: string; value: string[]; options: { id: string; name: string; highlighted: boolean }[]; onChange: (value: string[]) => void }) {
  const available = options.filter((option) => !value.includes(option.id))
  return <div className="resource-link-list">
    <span>{label}</span>
    {value.length === 0 && <small>Nenhum recurso anexado.</small>}
    {value.map((id) => <span key={id} className="resource-link-chip">{options.find((option) => option.id === id)?.name ?? id}<button type="button" aria-label={`Remover ${id}`} onClick={() => onChange(value.filter((candidate) => candidate !== id))}><X size={13} /></button></span>)}
    {available.length > 0 && <select className="form-input" value="" onChange={(event) => { if (event.target.value) onChange([...value, event.target.value]) }}>
      <option value="">Anexar…</option>
      {available.map((option) => <option key={option.id} value={option.id}>{option.highlighted ? `★ ${option.name}` : option.name}</option>)}
    </select>}
  </div>
}

function AbilityFields({ ability, set }: { ability: CharacterAbility; set: (patch: Partial<CharacterAbility>) => void }) {
  return <>
    <label>Categoria<input className="form-input" value={ability.category} onChange={(event) => set({ category: event.target.value })} /></label>
    <label>Modificadores permanentes<textarea className="form-input" rows={3} value={ability.permanentModifiers} onChange={(event) => set({ permanentModifiers: event.target.value })} /></label>
    <CostFields source={ability} set={set} />
  </>
}

function SpellFields({ spell, set }: { spell: CharacterSpell; set: (patch: Partial<CharacterSpell>) => void }) {
  return <>
    <label>Categoria<input className="form-input" value={spell.category} onChange={(event) => set({ category: event.target.value })} /></label>
    <div className="field-row">
      <label>Tipo de magia<select className="form-input" value={spell.magicType} onChange={(event) => set({ magicType: event.target.value as CharacterSpell["magicType"] })}>{magicTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
      <label>Tipo de alcance<select className="form-input" value={spell.rangeType} onChange={(event) => set({ rangeType: event.target.value as CharacterSpell["rangeType"] })}>{rangeTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
    </div>
    <div className="field-row"><label>Alcance<input className="form-input" value={spell.rangeText} onChange={(event) => set({ rangeText: event.target.value })} /></label><label>Área<input className="form-input" value={spell.area} onChange={(event) => set({ area: event.target.value })} /></label></div>
    <label>Duração<input className="form-input" value={spell.duration} onChange={(event) => set({ duration: event.target.value })} /></label>
    <label>Teste de conjuração<input className="form-input" value={spell.castingSkill} onChange={(event) => set({ castingSkill: event.target.value })} /></label>
    <CostFields source={spell} set={set} />
  </>
}

function CostFields<T extends Pick<CharacterAbility, "costType" | "costMode" | "costValue" | "costText">>({ source, set }: { source: T; set: (patch: Partial<T>) => void }) {
  return <div className="field-row">
    <label>Custo<select className="form-input" value={source.costType} onChange={(event) => set({ costType: event.target.value } as Partial<T>)}>{costOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
    <label>Aplicação<select className="form-input" value={source.costMode} onChange={(event) => set({ costMode: event.target.value } as Partial<T>)}><option value="fixed">Fixo</option><option value="relative">Relativo</option></select></label>
    {source.costType === "other" && <label>Texto do custo<input className="form-input" value={source.costText} onChange={(event) => set({ costText: event.target.value } as Partial<T>)} /></label>}
    <label>Valor fixo<input className="form-input" type="number" min={0} value={source.costValue} onChange={(event) => set({ costValue: Math.max(0, Number(event.target.value) || 0) } as Partial<T>)} /></label>
  </div>
}
