"use client"

import { useState } from "react"
import { Download, Save, Trash2, X } from "lucide-react"
import { inventoryTypeLabel, inventoryTypeOptions, inventoryUsageLabel, inventoryUsageOptions } from "@runas/core/lib/inventoryCalculations"
import type { CharacterAbility, CharacterInventoryItem, CharacterSpell } from "@runas/core/types/character"
import { resourceKindLabel, type BookResource, type BookResourceKind } from "../lib/book-model"

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

export function magicTypeLabel(value: CharacterSpell["magicType"]): string {
  return magicTypeOptions.find((option) => option.value === value)?.label ?? value
}

export function rangeTypeLabel(value: CharacterSpell["rangeType"]): string {
  return rangeTypeOptions.find((option) => option.value === value)?.label ?? value
}

export function costSummary(source: Pick<CharacterAbility, "costType" | "costMode" | "costValue" | "costText">): string {
  if (source.costType === "none") return "Nenhum"
  if (source.costType === "other") return source.costText || "Outro"
  const label = costOptions.find((option) => option.value === source.costType)?.label ?? source.costType
  return source.costMode === "relative" ? `${label} · Relativo` : `${source.costValue} ${label}`
}

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
  return <div className="resource-field"><span>{label}</span><strong>{value || "—"}</strong></div>
}

export function ResourceCard({ resource, onExport, onEdit, editable }: { resource: BookResource; onExport: () => void; onEdit?: () => void; editable?: boolean }) {
  return <article className={`resource-card kind-${resource.kind}`}>
    <header><span className={`entry-type type-${resource.kind}`}>{resourceKindLabel(resource.kind)}</span><h3>{resource.entity.name}</h3></header>
    <ResourceFields resource={resource} />
    {resource.entity.description && <p className="resource-description">{resource.entity.description}</p>}
    <footer>
      <button className="outline-action" onClick={onExport}><Download size={15} /> Exportar</button>
      {editable && onEdit && <button className="ghost-link resource-edit-link" onClick={onEdit}>Editar</button>}
    </footer>
  </article>
}

function ResourceFields({ resource }: { resource: BookResource }) {
  if (resource.kind === "item") {
    const item = resource.entity as CharacterInventoryItem
    return <div className="resource-grid-fields">
      <Field label="Uso" value={inventoryUsageLabel(item.usage)} />
      <Field label="Tipo" value={inventoryTypeLabel(item.type)} />
      <Field label="Quantidade" value={item.quantity} />
      {item.damage && <Field label="Dano" value={item.damage} />}
      {(item.rdf > 0 || item.rdm > 0) && <><Field label="RDF" value={item.rdf} /><Field label="RDM" value={item.rdm} /></>}
    </div>
  }
  if (resource.kind === "spell") {
    const spell = resource.entity as CharacterSpell
    return <div className="resource-grid-fields">
      <Field label="Tipo" value={magicTypeOptions.find((option) => option.value === spell.magicType)?.label} />
      <Field label="Alcance" value={rangeTypeOptions.find((option) => option.value === spell.rangeType)?.label} />
      <Field label="Duração" value={spell.duration} />
      <Field label="Custo" value={costSummary(spell)} />
    </div>
  }
  const ability = resource.entity as CharacterAbility
  return <div className="resource-grid-fields"><Field label="Categoria" value={ability.category} /><Field label="Custo" value={costSummary(ability)} /></div>
}

export function ResourceEditorDialog({ resource, onSave, onDelete, onClose }: { resource: BookResource; onSave: (resource: BookResource) => void; onDelete: () => void; onClose: () => void }) {
  const [draft, setDraft] = useState<BookResource>(() => ({ ...resource, entity: { ...resource.entity } }))

  function set<T extends BookResourceKind>(patch: Partial<CharacterInventoryItem & CharacterAbility & CharacterSpell>) {
    setDraft((current) => ({ ...current, entity: { ...current.entity, ...patch } as typeof current.entity }))
  }

  return <div className="modal-backdrop" onMouseDown={onClose}>
    <section className="modal-card editor-modal resource-editor" onMouseDown={(event) => event.stopPropagation()}>
      <header><div><p className="eyebrow">{resourceKindLabel(draft.kind)}</p><h2>{draft.entity.name || "Novo recurso"}</h2></div><button className="icon-link" onClick={onClose}><X size={18} /></button></header>
      <label>Nome<input className="form-input" value={draft.entity.name} onChange={(event) => set({ name: event.target.value })} autoFocus /></label>

      {draft.kind === "item" && <ItemFields item={draft.entity as CharacterInventoryItem} set={set} />}
      {draft.kind === "ability" && <AbilityFields ability={draft.entity as CharacterAbility} set={set} />}
      {draft.kind === "spell" && <SpellFields spell={draft.entity as CharacterSpell} set={set} />}

      <label>Descrição<textarea className="form-input" rows={5} value={draft.entity.description} onChange={(event) => set({ description: event.target.value })} /></label>
      <div className="editor-actions">
        <button className="danger-action" onClick={onDelete}><Trash2 size={15} /> Remover</button>
        <button className="primary-action" onClick={() => onSave(draft)}><Save size={15} /> Salvar recurso</button>
      </div>
    </section>
  </div>
}

function ItemFields({ item, set }: { item: CharacterInventoryItem; set: (patch: Partial<CharacterInventoryItem>) => void }) {
  return <>
    <div className="field-row">
      <label>Uso<select className="form-input" value={item.usage} onChange={(event) => set({ usage: event.target.value as CharacterInventoryItem["usage"] })}>{inventoryUsageOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
      <label>Tipo<select className="form-input" value={item.type} onChange={(event) => set({ type: event.target.value as CharacterInventoryItem["type"] })}>{inventoryTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
    </div>
    <div className="field-row">
      <label>Quantidade<input className="form-input" type="number" min={1} value={item.quantity} onChange={(event) => set({ quantity: Math.max(1, Math.trunc(Number(event.target.value) || 1)) })} /></label>
      <label>Peso base (kg)<input className="form-input" type="number" min={0} step={0.001} value={item.baseWeight} onChange={(event) => set({ baseWeight: Math.max(0, Number(event.target.value) || 0) })} /></label>
    </div>
    <label>Dano (opcional)<input className="form-input" value={item.damage} onChange={(event) => set({ damage: event.target.value })} placeholder="3D+2 corte" /></label>
    <div className="field-row">
      <label>RDF<input className="form-input" type="number" min={0} value={item.rdf} onChange={(event) => set({ rdf: Math.max(0, Math.trunc(Number(event.target.value) || 0)) })} /></label>
      <label>RDM<input className="form-input" type="number" min={0} value={item.rdm} onChange={(event) => set({ rdm: Math.max(0, Math.trunc(Number(event.target.value) || 0)) })} /></label>
    </div>
  </>
}

function AbilityFields({ ability, set }: { ability: CharacterAbility; set: (patch: Partial<CharacterAbility>) => void }) {
  return <>
    <label>Categoria<input className="form-input" value={ability.category} onChange={(event) => set({ category: event.target.value })} /></label>
    <CostFields source={ability} set={set} />
  </>
}

function SpellFields({ spell, set }: { spell: CharacterSpell; set: (patch: Partial<CharacterSpell>) => void }) {
  return <>
    <div className="field-row">
      <label>Tipo<select className="form-input" value={spell.magicType} onChange={(event) => set({ magicType: event.target.value as CharacterSpell["magicType"] })}>{magicTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
      <label>Alcance<select className="form-input" value={spell.rangeType} onChange={(event) => set({ rangeType: event.target.value as CharacterSpell["rangeType"] })}>{rangeTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
    </div>
    <label>Duração<input className="form-input" value={spell.duration} onChange={(event) => set({ duration: event.target.value })} /></label>
    <CostFields source={spell} set={set} />
  </>
}

function CostFields<T extends Pick<CharacterAbility, "costType" | "costMode" | "costValue" | "costText">>({ source, set }: { source: T; set: (patch: Partial<T>) => void }) {
  return <div className="field-row">
    <label>Custo<select className="form-input" value={source.costType} onChange={(event) => set({ costType: event.target.value } as Partial<T>)}>{costOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
    {source.costType === "other" ? <label>Texto do custo<input className="form-input" value={source.costText} onChange={(event) => set({ costText: event.target.value } as Partial<T>)} /></label>
      : source.costType !== "none" && <label>Valor<input className="form-input" type="number" min={0} value={source.costValue} onChange={(event) => set({ costValue: Math.max(0, Number(event.target.value) || 0) } as Partial<T>)} /></label>}
  </div>
}
