"use client"

import { useState } from "react"
import { Download, Save, Trash2, X } from "lucide-react"
import { calculateItemRealWeight, inventoryTypeLabel, inventoryTypeOptions, inventoryUsageLabel, inventoryUsageOptions, itemAffinityOptions, isBondAbilityCategory } from "@runas/core/lib/inventoryCalculations"
import { calculateItemSizeModifier } from "@runas/core/lib/characterCalculations"
import type { CharacterAbility, CharacterInventoryItem, CharacterSpell } from "@runas/core/types/character"
import { resourceKindLabel, type BookResource, type BookResourceKind } from "../lib/book-model"
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
  const empty = value === null || value === undefined || value === ""
  return <div className="resource-field"><span>{label}</span><strong>{empty ? "—" : value}</strong></div>
}

function normalized(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("pt-BR")
}

function isEnchantment(spell: CharacterSpell): boolean {
  return spell.magicType === "enchantment" || normalized(spell.category) === "encantamento"
}

export function linkedName(id: string, kind: BookResourceKind, resources: BookResource[]): string {
  if (!id) return ""
  return resources.find((candidate) => candidate.kind === kind && (candidate.id === id || candidate.entity.id === id))?.entity.name ?? id
}

function resourceSelectionId(id: string, kind: BookResourceKind, resources: BookResource[]): string {
  return resources.find((candidate) => candidate.kind === kind && (candidate.id === id || candidate.entity.id === id))?.id ?? id
}

export function ResourceCard({ resource, resources = [], onExport, onEdit, editable }: { resource: BookResource; resources?: BookResource[]; onExport: () => void; onEdit?: () => void; editable?: boolean }) {
  return <article className={`resource-card kind-${resource.kind}`}>
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
  if (resource.kind === "item") {
    const item = resource.entity as CharacterInventoryItem
    return <div className="resource-grid-fields">
      <Field label="Uso" value={inventoryUsageLabel(item.usage)} />
      <Field label="Tipo" value={inventoryTypeLabel(item.type)} />
      <Field label="Afinidade" value={itemAffinityOptions[item.affinity]?.label ?? item.affinity} />
      <Field label="Pontos de vínculo" value={item.bondPoints} />
      <Field label="Tamanho" value={item.size > 0 ? `${item.size} cm` : "—"} />
      <Field label="MT" value={item.mt} />
      <Field label="Peso base" value={item.baseWeight > 0 ? `${item.baseWeight} kg` : 0} />
      <Field label="Peso real" value={`${calculateItemRealWeight(item, "1x")} kg`} />
      <Field label="Quantidade" value={item.quantity} />
      <Field label="Dano" value={item.damage} />
      <Field label="RDF" value={item.rdf} />
      <Field label="RDM" value={item.rdm} />
      <Field label="PR" value={item.prCurrent !== null || item.prMaximum !== null ? `${item.prCurrent ?? "—"} / ${item.prMaximum ?? "—"}` : "—"} />
      <Field label="Encantamento" value={linkedName(item.enchantmentSpellId, "spell", resources)} />
      <Field label="Vínculo" value={item.bondId} />
      <Field label="Habilidade de vínculo" value={linkedName(item.bondAbilityId, "ability", resources)} />
      <Field label="Perícia" value={item.skillId} />
    </div>
  }
  if (resource.kind === "spell") {
    const spell = resource.entity as CharacterSpell
    return <div className="resource-grid-fields">
      <Field label="Categoria" value={spell.category} />
      <Field label="Tipo de magia" value={magicTypeOptions.find((option) => option.value === spell.magicType)?.label} />
      <Field label="Tipo de alcance" value={rangeTypeOptions.find((option) => option.value === spell.rangeType)?.label} />
      <Field label="Alcance" value={spell.rangeText} />
      <Field label="Área" value={spell.area} />
      <Field label="Duração" value={spell.duration} />
      <Field label="Teste de conjuração" value={spell.castingSkill} />
      <Field label="Custo" value={costSummary(spell)} />
      <Field label="Aplicação" value={spell.costMode === "relative" ? "Relativo" : "Fixo"} />
      <Field label="Valor fixo" value={spell.costValue} />
    </div>
  }
  const ability = resource.entity as CharacterAbility
  return <div className="resource-grid-fields"><Field label="Categoria" value={ability.category} /><Field label="Modificadores permanentes" value={ability.permanentModifiers} /><Field label="Custo" value={costSummary(ability)} /></div>
}

export function ResourceEditorDialog({ resource, availableResources = [], onSave, onDelete, onClose }: { resource: BookResource; availableResources?: BookResource[]; onSave: (resource: BookResource) => void; onDelete: () => void; onClose: () => void }) {
  const [draft, setDraft] = useState<BookResource>(() => ({ ...resource, entity: { ...resource.entity } }))

  function set<T extends BookResourceKind>(patch: Partial<CharacterInventoryItem & CharacterAbility & CharacterSpell>) {
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
  const enchantments = resources.filter((resource): resource is BookResource & { entity: CharacterSpell } => resource.kind === "spell" && isEnchantment(resource.entity as CharacterSpell))
  const bondAbilities = resources.filter((resource): resource is BookResource & { entity: CharacterAbility } => resource.kind === "ability" && isBondAbilityCategory((resource.entity as CharacterAbility).category))
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
    <label>Encantamento<select className="form-input" value={resourceSelectionId(item.enchantmentSpellId, "spell", resources)} onChange={(event) => set({ enchantmentSpellId: event.target.value })}><option value="">Nenhum</option>{enchantments.map((resource) => <option key={resource.id} value={resource.id}>{resource.entity.name}</option>)}</select></label>
    <label>Vínculo<input className="form-input" value={item.bondId} onChange={(event) => set({ bondId: event.target.value })} placeholder="Nenhum" /></label>
    <label>Habilidade de vínculo<select className="form-input" value={resourceSelectionId(item.bondAbilityId, "ability", resources)} onChange={(event) => set({ bondAbilityId: event.target.value })}><option value="">Nenhuma</option>{bondAbilities.map((resource) => <option key={resource.id} value={resource.id}>{resource.entity.name}</option>)}</select></label>
    <label>Perícia<input className="form-input" value={item.skillId} onChange={(event) => set({ skillId: event.target.value })} placeholder="Nenhuma" /></label>
  </>
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
