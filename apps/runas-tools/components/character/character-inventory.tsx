"use client"

import { useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useRouter } from "next/navigation"
import { Dices, Download, Eye, Pencil, Plus, Save, Shield, Swords, Trash2, Upload, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { NumberInput } from "@/components/ui/number-input"
import { SegmentedToggle } from "@/components/ui/segmented-toggle"
import type {
  CharacterAbility,
  CharacterAttributes,
  CharacterBond,
  CharacterElementSkill,
  CharacterInfo,
  CharacterInventoryItem,
  CharacterSkill,
  CharacterSpell,
  CharacterStats,
  InventoryItemType,
  InventoryUsage,
} from "@runas/core/types/character"
import { calculateBondQuality, calculateBondTest, formatSigned } from "@runas/core/lib/bondCalculations"
import { calculateAttributeTest, calculateSkillLevel, calculateSkillModifier, normalizeSkillName } from "@runas/core/lib/skillCalculations"
import { calculateItemSizeModifier } from "@runas/core/lib/characterCalculations"
import { calculateItemDamageBonus, composeItemDamageExpression } from "@runas/core/lib/itemDamage"
import { listCharacterTestSources } from "@runas/core/lib/characterTestSources"
import { getAttributeDef } from "@runas/core/data/attributes"
import {
  calculateEquippedArmorDefense,
  calculateInventoryLoad,
  calculateItemRealWeight,
  formatWeight,
  inventoryTypeLabel,
  inventoryTypeOptions,
  inventoryUsageLabel,
  inventoryUsageOptions,
  normalizeInventoryUsage,
  isBondAbilityCategory,
  itemAffinityOptions,
  itemRarity,
  metersFromCentimeters,
  centimetersFromMeters,
  formatItemSize,
} from "@runas/core/lib/inventoryCalculations"
import { useCharacterPanel } from "./character-panel"
import { calculateCharacterStatSnapshot } from "@runas/core/lib/characterStatCalculations"
import { exportInventoryList, parseInventoryListFile, type ImportedInventoryItem } from "@/lib/inventoryTransfer"
import type { ImportedAbility } from "@runas/core/lib/abilityTransfer"
import type { ImportedSpell } from "@runas/core/lib/spellTransfer"
import { ItemAttachments, abilityAttachment, spellAttachment } from "./item-attachments"
import { createId, createPrefixedId } from "@runas/core/lib/ids"

interface Props {
  variant?: "runas-blue" | "cronos"
  characterName: string
  items: CharacterInventoryItem[]
  info: CharacterInfo
  attributes: CharacterAttributes
  stats: CharacterStats
  skills: CharacterSkill[]
  bonds: CharacterBond[]
  abilities: CharacterAbility[]
  elements: CharacterElementSkill[]
  spells: CharacterSpell[]
  onItemsChange: (items: CharacterInventoryItem[]) => void
  onImportItems: (items: ImportedInventoryItem[]) => void
  onLoadBonusChange: (value: number) => void
  /** Cria o registro na ficha e devolve o `id` para o item anexar. */
  onCreateAbility: (ability: ImportedAbility) => string
  onCreateSpell: (spell: ImportedSpell) => string
}

type ReferencePreview =
  | { type: "spell"; value: CharacterSpell }
  | { type: "bond"; value: CharacterBond }
  | { type: "ability"; value: CharacterAbility }
  | { type: "skill"; value: CharacterSkill }

function createInventoryItem(): CharacterInventoryItem {
  const id = createPrefixedId("item")
  return {
    id,
    usage: "stored",
    name: "Novo item",
    type: "other",
    affinity: 0,
    bondPoints: 0,
    baseWeight: 0,
    size: 0,
    mt: 0,
    quantity: 1,
    applyScaleWeight: false,
    damage: "",
    rdf: 0,
    rdm: 0,
    equippedAsArmor: false,
    prCurrent: null,
    prMaximum: null,
    abilityIds: [],
    spellIds: [],
    bondId: "",
    skillId: "",
    description: "",
  }
}

const EDITOR_MODE_KEY = "runas-tools:item-editor-mode"

function readEditorMode(): "simple" | "advanced" {
  if (typeof window === "undefined") return "simple"
  try { return window.localStorage.getItem(EDITOR_MODE_KEY) === "advanced" ? "advanced" : "simple" } catch { return "simple" }
}

function plainText(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim()
}

function spellTypeLabel(type: CharacterSpell["magicType"]): string {
  return { aura: "Aura", quick: "Rápida", spell: "Feitiço", ritual: "Ritual", enchantment: "Encantamento" }[type]
}

function spellRange(spell: CharacterSpell): string {
  const label = { touch: "Toque", personal: "Pessoal", projectile: "Projétil", targets: "Alvo(s)", area: "Área" }[spell.rangeType]
  return spell.rangeType === "touch" || spell.rangeType === "personal" || !spell.rangeText ? label : `${spell.rangeText}, ${label}`
}

function costSummary(source: Pick<CharacterAbility, "costType" | "costMode" | "costValue" | "costText">): string {
  if (source.costType === "none") return "Nenhum"
  if (source.costType === "other") return source.costText || "Outro"
  return source.costMode === "relative" ? `${source.costType} · Relativo` : `${source.costValue} ${source.costType}`
}

function sanitizeItem(item: CharacterInventoryItem, matchingBonds: CharacterBond[], abilities: CharacterAbility[], spells: CharacterSpell[]): CharacterInventoryItem {
  const affinity = Math.max(0, Math.min(4, Math.trunc(item.affinity))) as CharacterInventoryItem["affinity"]
  const prMaximum = item.prMaximum === null ? null : Math.max(0, Math.trunc(item.prMaximum))
  const prCurrent = item.prCurrent === null
    ? null
    : Math.min(prMaximum ?? Number.POSITIVE_INFINITY, Math.max(0, Math.trunc(item.prCurrent)))
  return {
    ...item,
    usage: normalizeInventoryUsage(item.type, item.usage),
    name: item.name.trim().slice(0, 80) || "Item sem nome",
    affinity,
    bondPoints: Math.max(0, Math.trunc(item.bondPoints)),
    baseWeight: Math.max(0, Number.isFinite(item.baseWeight) ? item.baseWeight : 0),
    size: Math.max(0, Number.isFinite(item.size) ? item.size : 0),
    mt: calculateItemSizeModifier(item.size),
    quantity: Math.max(1, Number.isFinite(item.quantity) ? Math.trunc(item.quantity) : 1),
    damage: item.damage.trim().slice(0, 160),
    rdf: Math.max(0, Math.trunc(item.rdf)),
    rdm: Math.max(0, Math.trunc(item.rdm)),
    equippedAsArmor: item.usage === "equipped" && Boolean(item.equippedAsArmor),
    prCurrent,
    prMaximum,
    abilityIds: item.abilityIds.filter((id) => abilities.some((ability) => ability.id === id)),
    spellIds: item.spellIds.filter((id) => spells.some((spell) => spell.id === id)),
    bondId: matchingBonds.some((bond) => bond.id === item.bondId) ? item.bondId : "",
    description: item.description.slice(0, 5000),
  }
}

export function CharacterInventory({ variant = "runas-blue", characterName, items, info, attributes, stats, skills, bonds, abilities, elements, spells, onItemsChange, onImportItems, onLoadBonusChange, onCreateAbility, onCreateSpell }: Props) {
  const router = useRouter()
  const { close } = useCharacterPanel()
  const [draft, setDraft] = useState<CharacterInventoryItem | null>(null)
  const [draftIsNew, setDraftIsNew] = useState(false)
  const [dialogMode, setDialogMode] = useState<"view" | "edit">("view")
  const [referencePreview, setReferencePreview] = useState<ReferencePreview | null>(null)
  const importFileRef = useRef<HTMLInputElement>(null)
  const [showImport, setShowImport] = useState(false)
  const [importedItems, setImportedItems] = useState<ImportedInventoryItem[]>([])
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set())
  const [importFilename, setImportFilename] = useState("")
  const [importError, setImportError] = useState<string | null>(null)
  // O modo escolhido acompanha o usuário entre itens e sessões: quem cria fichas
  // rápidas não quer reabrir o formulário completo a cada item.
  const [editorMode, setEditorMode] = useState<"simple" | "advanced">(readEditorMode)

  const currentLoad = calculateInventoryLoad(items, info.scaleMultiplier)
  const statSnapshot = useMemo(() => calculateCharacterStatSnapshot(attributes, info, { ...stats, currentLoad }, skills, abilities), [abilities, attributes, currentLoad, info, skills, stats])
  const defense = calculateEquippedArmorDefense(items)
  const equippedArmor = items.find((item) => item.usage === "equipped" && item.equippedAsArmor)
  const armorCandidates = items.filter((item) => item.usage === "equipped")
  const equippedCombatItems = items.filter((item) => item.usage === "equipped" && ["weapon", "armor", "shield"].includes(item.type))
  const selectableAbilities = variant === "cronos" ? abilities : abilities.filter((ability) => isBondAbilityCategory(ability.category))
  const enchantmentSpells = useMemo(() => spells.filter((spell) => spell.magicType === "enchantment"), [spells])
  const matchingBonds = useMemo(() => draft
    ? bonds.filter((bond) => normalizeSkillName(bond.name) === normalizeSkillName(draft.name))
    : [], [bonds, draft])
  const testSources = useMemo(() => listCharacterTestSources({ attributes, skills, elements }), [attributes, skills, elements])
  const advanced = editorMode === "advanced"
  // No modo simples, cada campo de combate aparece só para o tipo que o usa.
  const showDamage = advanced || draft?.type === "weapon"
  const showSkill = advanced || draft?.type === "weapon"
  const showDefense = advanced || draft?.type === "armor" || draft?.type === "shield"
  const showPr = advanced || draft?.type === "shield"
  const draftBonus = calculateItemDamageBonus(draft ?? { bondPoints: 0, mt: 0, applyScaleWeight: false }, info.sizeModifier)

  function changeEditorMode(mode: "simple" | "advanced") {
    setEditorMode(mode)
    try { window.localStorage.setItem(EDITOR_MODE_KEY, mode) } catch { /* preferência opcional */ }
  }

  function openItem(item: CharacterInventoryItem, mode: "view" | "edit" = "view") {
    setDraft({ ...item })
    setDraftIsNew(false)
    setDialogMode(mode)
  }

  function addItem() {
    setDraft(createInventoryItem())
    setDraftIsNew(true)
    setDialogMode("edit")
  }

  function openImport() {
    setImportedItems([])
    setSelectedItems(new Set())
    setImportFilename("")
    setImportError(null)
    setShowImport(true)
  }

  async function loadInventoryFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setImportError(null)
    try {
      const imported = parseInventoryListFile(await file.text())
      setImportedItems(imported)
      setSelectedItems(new Set(imported.map((_, index) => index)))
      setImportFilename(file.name)
    } catch (error) {
      setImportedItems([])
      setSelectedItems(new Set())
      setImportFilename("")
      setImportError(error instanceof Error ? error.message : "Não foi possível ler a lista de itens.")
    } finally {
      event.target.value = ""
    }
  }

  function toggleImportedItem(index: number) {
    setSelectedItems((current) => {
      const next = new Set(current)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  function confirmImport(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const selected = importedItems.filter((_, index) => selectedItems.has(index))
    if (selected.length === 0) return
    onImportItems(selected)
    setShowImport(false)
  }

  function commitItemSet(nextItem: CharacterInventoryItem, baseItems: CharacterInventoryItem[], closeEditor: boolean) {
    if (nextItem.usage !== "equipped") nextItem.equippedAsArmor = false
    onItemsChange(baseItems)
    if (closeEditor) {
      setDraft(null)
      setDraftIsNew(false)
    }
  }

  function applyItem(nextItem: CharacterInventoryItem) {
    const baseItems = draftIsNew ? [...items, nextItem] : items.map((item) => item.id === nextItem.id ? nextItem : item)
    commitItemSet(nextItem, baseItems, true)
  }

  function saveDraft(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!draft) return
    applyItem(sanitizeItem(draft, matchingBonds, abilities, spells))
  }

  function changeUsage(item: CharacterInventoryItem, usage: InventoryUsage) {
    const nextItem = { ...item, usage }
    commitItemSet(nextItem, items.map((candidate) => candidate.id === item.id ? nextItem : candidate), false)
  }

  function changeQuantity(item: CharacterInventoryItem, quantity: number) {
    const nextQuantity = Math.max(1, Number.isFinite(quantity) ? Math.trunc(quantity) : 1)
    onItemsChange(items.map((candidate) => candidate.id === item.id ? { ...candidate, quantity: nextQuantity } : candidate))
  }

  function selectArmor(itemId: string) {
    onItemsChange(items.map((item) => ({ ...item, equippedAsArmor: item.usage === "equipped" && item.id === itemId })))
  }

  function removeItem(item: CharacterInventoryItem) {
    if (!window.confirm(`Remover “${item.name}” do inventário?`)) return
    onItemsChange(items.filter((candidate) => candidate.id !== item.id))
    if (draft?.id === item.id) setDraft(null)
  }

  function rollSkill(skillId: string) {
    const skill = skills.find((candidate) => candidate.id === skillId)
    if (!skill?.attributeKey) return
    close()
    router.push(`/calculadora-testes?skill=${encodeURIComponent(skill.id)}&roll=${encodeURIComponent(createId())}`)
  }

  function rollBond(bondId: string) {
    const bond = bonds.find((candidate) => candidate.id === bondId)
    if (!bond) return
    close()
    router.push(`/calculadora-testes?bond=${encodeURIComponent(bond.id)}&roll=${encodeURIComponent(createId())}`)
  }

  /**
   * O bônus do item entra na própria expressão (`2D+2` com bônus 10 vira
   * `2D+12`). O MT não multiplica mais o dano: com `Usar MT?` ativo ele já
   * está somado ao bônus pela diferença para o MT do personagem.
   */
  function rollDamage(item: CharacterInventoryItem) {
    if (!item.damage.trim()) return
    close()
    const expression = composeItemDamageExpression(item.damage, calculateItemDamageBonus(item, info.sizeModifier).total)
    router.push(`/calculadora-dano?damage=${encodeURIComponent(expression)}&roll=${encodeURIComponent(createId())}`)
  }

  function updateShieldPr(itemId: string, value: number | null) {
    onItemsChange(items.map((item) => item.id === itemId
      ? { ...item, prCurrent: value === null ? null : Math.min(item.prMaximum ?? Number.POSITIVE_INFINITY, Math.max(0, Math.trunc(value))) }
      : item))
  }

  function itemSkill(item: CharacterInventoryItem): CharacterSkill | undefined {
    return skills.find((skill) => skill.id === item.skillId)
  }

  return (
    <section aria-label="Inventário do personagem" className="@container rounded-b-[22px] rounded-t-none border border-border bg-card p-3 shadow-sm sm:rounded-b-[27px] sm:p-7">
      <div className="grid gap-3 @min-[48rem]:grid-cols-[minmax(0,1fr)_minmax(17rem,.8fr)]">
        <article className="@container rounded-[20px] border border-border bg-muted/30 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Carga</p>
          <div className="mt-3 grid grid-cols-2 gap-2 @min-[32rem]:grid-cols-4">
            <div className="flex min-w-0 flex-col rounded-xl bg-background/55 p-3"><span className="flex min-h-8 items-start text-xs text-muted-foreground">Atual</span><strong className="flex h-11 items-center text-xl text-foreground">{formatWeight(currentLoad)} kg</strong></div>
            <div className="flex min-w-0 flex-col rounded-xl bg-background/55 p-3"><span className="flex min-h-8 items-start text-xs text-muted-foreground">Capacidade</span><strong className="flex h-11 items-center text-xl text-foreground">{formatWeight(statSnapshot.loadCapacity)} kg</strong></div>
            <div className="min-w-0 rounded-xl bg-background/55 p-3"><NumberInput label="Modificador de Carga" value={stats.loadBonus} onChange={(value) => onLoadBonusChange(Math.trunc(value))} className="[&>label]:min-h-8" /></div>
            <div className="flex min-w-0 flex-col rounded-xl bg-background/55 p-3"><span className="flex min-h-8 items-start text-xs text-muted-foreground">Total de Itens</span><strong className="flex h-11 items-center text-xl text-foreground">{items.filter((item) => item.usage !== "absent").reduce((total, item) => total + item.quantity, 0)}</strong></div>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">A carga soma automaticamente o peso real dos itens equipados e armazenados. Itens ausentes não contam.</p>
          {statSnapshot.overweightLevel > 0 && <div className="mt-3 rounded-xl border border-yellow-500/25 bg-yellow-500/10 p-3 text-sm italic"><p className="font-semibold text-yellow-foreground">Sobrepeso {statSnapshot.overweightLevel}: -{statSnapshot.physicalPenalty} Físico, -{statSnapshot.movementPenalty} Desloc.</p>{statSnapshot.overweightWarnings.length > 0 && <p className="mt-1 font-bold text-destructive">{statSnapshot.overweightWarnings.join(", ")}</p>}</div>}
        </article>

        <article className="rounded-[20px] border border-primary/25 bg-primary/5 p-4">
          <div className="flex items-center gap-2 text-primary"><Shield className="size-5" /><h3 className="font-bold">Armadura</h3></div>
          <label className="mt-3 block"><span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Item usado como armadura</span><select value={equippedArmor?.id ?? ""} onChange={(event) => selectArmor(event.target.value)} className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm font-semibold text-foreground outline-none focus:border-ring"><option value="">Nenhum</option>{armorCandidates.map((item) => <option key={item.id} value={item.id}>{item.name || "Item sem nome"}</option>)}</select></label>
          <div className="mt-3 grid grid-cols-2 gap-3"><div className="rounded-xl bg-background/70 p-3"><span className="text-xs text-muted-foreground">RDF</span><strong className="block text-xl">{defense.rdf}</strong></div><div className="rounded-xl bg-background/70 p-3"><span className="text-xs text-muted-foreground">RDM</span><strong className="block text-xl">{defense.rdm}</strong></div></div>
          <p className="mt-2 text-xs text-muted-foreground">Somente o RDF e RDM deste item são usados pela aplicação de dano. Outros itens podem continuar equipados.</p>
        </article>
      </div>

      {equippedCombatItems.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-2 text-sm font-bold text-foreground">Equipamentos em uso</h3>
          <div className="grid gap-3 @min-[48rem]:grid-cols-2">
            {equippedCombatItems.map((item) => {
              const skill = itemSkill(item)
              const canRollDamage = (item.type === "weapon" || item.type === "shield") && Boolean(item.damage.trim())
              return <article key={item.id} className="rounded-[18px] border border-border bg-background/55 p-4">
                <div className="flex items-start justify-between gap-3"><div className="min-w-0"><span className="text-xs font-semibold text-primary">{inventoryTypeLabel(item.type)}</span><button type="button" onClick={() => openItem(item)} className="mt-0.5 block max-w-full truncate text-left font-bold text-foreground hover:text-primary">{item.name}</button></div>{item.type === "weapon" ? <Swords className="size-5 text-muted-foreground" /> : <Shield className="size-5 text-muted-foreground" />}</div>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground"><span>Quantidade: <strong className="text-foreground">{item.quantity}</strong></span><span>Dano: <strong className="text-foreground">{item.damage || "—"}</strong></span>{(item.type === "armor" || item.type === "shield") && <><span>RDF: <strong className="text-foreground">{item.rdf}</strong></span><span>RDM: <strong className="text-foreground">{item.rdm}</strong></span></>}{item.type === "shield" && <label className="flex items-center gap-1.5"><span>PR:</span><input type="number" inputMode="numeric" min={0} max={item.prMaximum ?? undefined} value={item.prCurrent ?? ""} placeholder="—" onChange={(event) => updateShieldPr(item.id, event.target.value === "" ? null : Number(event.target.value))} aria-label={`PR atual de ${item.name}`} className="h-8 w-14 rounded-lg border border-input bg-background px-2 text-center text-xs font-bold text-foreground outline-none focus:border-ring" /><span>/ <strong className="text-foreground">{item.prMaximum ?? "—"}</strong></span></label>}</div>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {(item.type === "weapon" || item.type === "shield") && <Button type="button" size="sm" onClick={() => rollDamage(item)} disabled={!canRollDamage}><Swords /> Rolar dano</Button>}
                  <Button type="button" size="sm" variant="secondary" onClick={() => skill && rollSkill(skill.id)} disabled={!skill?.attributeKey}><Dices /> Rolar teste</Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => openItem(item)}><Eye /> Exibir</Button>
                </div>
              </article>
            })}
          </div>
        </div>
      )}

      <div className="mt-5 flex flex-col gap-4 border-t border-border pt-4 @min-[48rem]:flex-row @min-[48rem]:items-end @min-[48rem]:justify-between">
        <div className="min-w-0 @min-[48rem]:flex-1"><h3 className="font-bold text-foreground">Todos os itens</h3><p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted-foreground"><strong>Equipado</strong> está sendo usado agora; <strong>Armazenado</strong> está nos bolsos ou mochila; <strong>Ausente</strong> está em outro lugar, mas continua sob posse ou registrado pelo jogador.</p></div>
        <div className="grid w-full grid-cols-1 gap-2 @min-[32rem]:grid-cols-3 @min-[48rem]:w-auto @min-[48rem]:shrink-0">
          <Button type="button" variant="outline" className="w-full" onClick={() => exportInventoryList(items, characterName, spells, bonds, abilities, skills)} disabled={items.length === 0}><Download /> Exportar todos</Button>
          <Button type="button" variant="outline" className="w-full" onClick={openImport}><Upload /> Importar lista</Button>
          <Button type="button" className="w-full" onClick={addItem}><Plus /> Adicionar item</Button>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        <div className="hidden grid-cols-[6.5rem_minmax(0,1fr)_5.5rem_minmax(0,1.2fr)_4.75rem_5rem_2.75rem] gap-2 px-3 text-center text-[0.62rem] uppercase tracking-wide text-muted-foreground @min-[36rem]:grid"><span>Uso</span><span>Nome</span><span>Tipo</span><span>Descrição</span><span>Qtd.</span><span>Peso</span><span>Editar</span></div>
        {items.length === 0 && <p className="rounded-[18px] border border-dashed border-border bg-background/35 px-4 py-10 text-center text-sm text-muted-foreground">Nenhum item cadastrado.</p>}
        {items.map((item) => <article key={item.id} className="virtualized-list-item grid grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-[18px] border border-border bg-background/55 p-3 @min-[36rem]:grid-cols-[6.5rem_minmax(0,1fr)_5.5rem_minmax(0,1.2fr)_4.75rem_5rem_2.75rem] @min-[36rem]:items-center @min-[36rem]:p-2">
          <select value={item.usage} onChange={(event) => changeUsage(item, event.target.value as InventoryUsage)} aria-label={`Uso de ${item.name}`} className="col-start-1 row-start-1 h-10 rounded-xl border border-input bg-background px-2 text-xs font-semibold text-foreground outline-none focus:border-ring @min-[36rem]:col-start-auto @min-[36rem]:row-start-auto">{inventoryUsageOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
          <button type="button" onClick={() => openItem(item)} className="col-start-1 row-start-2 min-w-0 truncate text-left text-sm font-bold text-foreground hover:text-primary @min-[36rem]:col-start-auto @min-[36rem]:row-start-auto @min-[36rem]:px-2">{item.name}</button>
          <span className="col-start-2 row-start-1 text-right text-xs font-semibold text-muted-foreground @min-[36rem]:col-start-auto @min-[36rem]:row-start-auto @min-[36rem]:text-center">{inventoryTypeLabel(item.type)}</span>
          <p className="col-span-2 col-start-1 row-start-3 min-w-0 truncate text-xs text-muted-foreground @min-[36rem]:col-span-1 @min-[36rem]:col-start-auto @min-[36rem]:row-start-auto @min-[36rem]:px-2">{plainText(item.description) || "Sem descrição"}</p>
          <label className="col-start-1 row-start-4 flex min-w-0 items-center gap-2 text-xs font-semibold text-muted-foreground @min-[36rem]:col-start-auto @min-[36rem]:row-start-auto @min-[36rem]:justify-center"><span className="@min-[36rem]:sr-only">Quantidade</span><input type="number" inputMode="numeric" min={1} step={1} value={item.quantity} onChange={(event) => changeQuantity(item, Number(event.target.value))} aria-label={`Quantidade de ${item.name}`} className="h-9 w-16 min-w-0 rounded-lg border border-input bg-background px-2 text-center text-xs font-bold tabular-nums text-foreground outline-none focus:border-ring" /></label>
          <span className="col-start-2 row-start-4 text-right text-xs font-semibold tabular-nums text-foreground @min-[36rem]:col-start-auto @min-[36rem]:row-start-auto @min-[36rem]:text-center"><span className="@min-[36rem]:hidden">Peso: </span>{formatWeight(calculateItemRealWeight(item, info.scaleMultiplier))} kg</span>
          <button type="button" onClick={() => openItem(item, "edit")} aria-label={`Editar ${item.name}`} className="col-start-2 row-start-2 inline-flex size-10 items-center justify-center justify-self-end rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground @min-[36rem]:col-start-auto @min-[36rem]:row-start-auto"><Pencil className="size-4" /></button>
        </article>)}
      </div>

      {showImport && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-3 backdrop-blur-[2px]" onMouseDown={(event) => { if (event.currentTarget === event.target) setShowImport(false) }}>
          <form onSubmit={confirmImport} role="dialog" aria-modal="true" aria-labelledby="inventory-import-title" className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-4xl flex-col overflow-hidden rounded-[24px] border border-border bg-card shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-border p-4 sm:p-6"><div><h2 id="inventory-import-title" className="text-lg font-bold text-foreground">Importar itens</h2><p className="mt-1 text-sm text-muted-foreground">Escolha uma lista exportada e selecione os itens que deseja adicionar ao inventário.</p></div><button type="button" onClick={() => setShowImport(false)} aria-label="Fechar importação de itens" className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted"><X className="size-5" /></button></div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
              <input ref={importFileRef} type="file" accept="application/json,.json" onChange={loadInventoryFile} className="hidden" />
              <button type="button" onClick={() => importFileRef.current?.click()} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[18px] border border-dashed border-input bg-background/65 px-4 py-3 text-sm font-semibold text-muted-foreground transition hover:border-primary/55 hover:text-foreground"><Upload className="size-4" /> {importFilename ? "Escolher outro arquivo" : "Escolher arquivo de inventário"}</button>
              {importFilename && <p className="mt-2 truncate text-xs text-muted-foreground">Arquivo: <strong>{importFilename}</strong></p>}
              {importedItems.length > 0 && <div className="mt-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold text-foreground">{selectedItems.size} de {importedItems.length} selecionados</p><div className="flex flex-wrap gap-1"><button type="button" onClick={() => setSelectedItems(new Set(importedItems.map((_, index) => index)))} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10">Selecionar todos</button><button type="button" onClick={() => setSelectedItems(new Set())} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground">Limpar seleção</button></div></div><div className="mt-3 space-y-2">{importedItems.map((item, index) => { const selected = selectedItems.has(index); return <label key={`${item.name}-${index}`} className={`flex cursor-pointer items-center gap-3 rounded-[18px] border p-3 transition ${selected ? "border-primary/45 bg-primary/5" : "border-border bg-background/45"}`}><input type="checkbox" checked={selected} onChange={() => toggleImportedItem(index)} aria-label={`Selecionar ${item.name}`} className="size-5 shrink-0 accent-primary" /><span className="min-w-0 flex-1"><strong className="block truncate text-sm text-foreground">{item.name}</strong><span className="block truncate text-xs text-muted-foreground">{inventoryTypeLabel(item.type)} · {inventoryUsageLabel(item.usage)} · Qtd. {item.quantity} · {formatWeight(item.baseWeight)} kg cada{item.damage ? ` · ${item.damage}` : ""}{item.spells.length > 0 ? ` · ${item.spells.map((spell) => spell.name).join(", ")}` : ""}{item.abilities.length > 0 ? ` · ${item.abilities.map((ability) => ability.name).join(", ")}` : ""}</span></span></label> })}</div></div>}
              {importError && <div role="alert" className="mt-3 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{importError}</div>}
            </div>
            <div className="flex flex-col-reverse gap-2 border-t border-border p-4 sm:flex-row sm:justify-end sm:px-6"><Button type="button" variant="outline" onClick={() => setShowImport(false)}>Cancelar</Button><Button type="submit" disabled={selectedItems.size === 0}><Upload /> Importar {selectedItems.size || "selecionados"}</Button></div>
          </form>
        </div>,
        document.body,
      )}

      {draft && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-3 backdrop-blur-[2px]" onMouseDown={(event) => { if (event.currentTarget === event.target) setDraft(null) }}>
          {dialogMode === "view"
            ? <ItemView variant={variant} item={draft} info={info} skills={skills} bonds={bonds} abilities={abilities} spells={spells} attributes={attributes} stats={stats} onClose={() => setDraft(null)} onEdit={() => setDialogMode("edit")} onDelete={() => removeItem(draft)} onReference={setReferencePreview} onRollSkill={rollSkill} onRollBond={rollBond} onRollDamage={rollDamage} />
            : <form onSubmit={saveDraft} role="dialog" aria-modal="true" aria-labelledby="inventory-editor-title" className="max-h-[calc(100dvh-1.5rem)] w-full max-w-5xl overflow-y-auto rounded-[24px] border border-border bg-card p-4 shadow-2xl sm:p-6">
                <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Modo edição</p><h2 id="inventory-editor-title" className="mt-1 text-lg font-bold text-foreground">{draftIsNew ? "Novo item" : draft.name}</h2></div><div className="flex items-center gap-2"><div className="flex rounded-xl border border-border bg-muted/40 p-0.5" role="group" aria-label="Modo de criação do item">{([["simple", "Simples"], ["advanced", "Avançado"]] as const).map(([value, label]) => <button key={value} type="button" onClick={() => changeEditorMode(value)} aria-pressed={editorMode === value} className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${editorMode === value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>{label}</button>)}</div><button type="button" onClick={() => setDraft(null)} aria-label="Fechar item" className="inline-flex size-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted"><X className="size-5" /></button></div></div>
                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <label className="sm:col-span-2"><span className="mb-1.5 block text-sm font-medium text-muted-foreground">Nome</span><input required maxLength={80} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/25" /></label>
                  <Select label="Uso" value={draft.usage} options={draft.type === "innate" ? inventoryUsageOptions.filter((option) => option.value !== "stored") : inventoryUsageOptions} onChange={(value) => setDraft({ ...draft, usage: value as InventoryUsage })} />
                  <Select label="Tipo" value={draft.type} options={inventoryTypeOptions} onChange={(value) => { const type = value as InventoryItemType; setDraft({ ...draft, type, usage: normalizeInventoryUsage(type, draft.usage) }) }} />
                  {advanced && variant === "runas-blue" && <Select label="Afinidade" value={String(draft.affinity)} options={itemAffinityOptions.map((option) => ({ value: String(option.value), label: option.label }))} onChange={(value) => setDraft({ ...draft, affinity: Number(value) as CharacterInventoryItem["affinity"] })} />}
                  {advanced && variant === "runas-blue" && <label><span className="mb-1.5 block text-sm font-medium text-muted-foreground">Pontos de Vínculo</span><input type="number" min={0} step={1} value={draft.bondPoints} onChange={(event) => setDraft({ ...draft, bondPoints: Math.max(0, Math.trunc(Number(event.target.value) || 0)) })} className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-ring" /><span className="mt-1 block text-xs text-muted-foreground">Raridade: {itemRarity(draft.bondPoints)}</span></label>}
                  <NumberInput label="Peso Base (kg)" value={draft.baseWeight} min={0} step={0.001} onChange={(baseWeight) => setDraft({ ...draft, baseWeight: Math.max(0, baseWeight) })} />
                  <NumberInput label="Tamanho (m)" value={metersFromCentimeters(draft.size)} min={0} step={0.01} onChange={(meters) => { const size = centimetersFromMeters(meters); setDraft({ ...draft, size, mt: calculateItemSizeModifier(size) }) }} />
                  {advanced && <label><span className="mb-1.5 block text-sm font-medium text-muted-foreground">MT</span><output className="flex h-11 items-center rounded-xl border border-input bg-muted/65 px-3 text-sm font-semibold text-muted-foreground">{formatSigned(draft.mt)}</output></label>}
                  <NumberInput label="Quantidade" value={draft.quantity} min={1} step={1} onChange={(quantity) => setDraft({ ...draft, quantity: Math.max(1, Math.trunc(quantity || 1)) })} />
                  {advanced && <SegmentedToggle label="Usar MT?" value={draft.applyScaleWeight ? "yes" : "no"} onChange={(value) => setDraft({ ...draft, applyScaleWeight: value === "yes" })} options={[{ value: "yes", label: "Sim" }, { value: "no", label: "Não" }]} />}
                  {draft.baseWeight > 0 && <label><span className="mb-1.5 block text-sm font-medium text-muted-foreground">Peso verdadeiro</span><output className="flex h-11 items-center rounded-xl border border-input bg-muted/65 px-3 text-sm font-semibold text-muted-foreground">{formatWeight(calculateItemRealWeight(draft, info.scaleMultiplier))} kg</output></label>}
                  {showDamage && <label className="sm:col-span-2"><span className="mb-1.5 block text-sm font-medium text-muted-foreground">Dano</span><input maxLength={160} value={draft.damage} onChange={(event) => setDraft({ ...draft, damage: event.target.value })} placeholder="3D+2 queimadura (+poder)" className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-ring" /><span className="mt-1 block text-xs text-muted-foreground">Use o mesmo formato da Entrada rápida da Calculadora de Dano.</span></label>}
                  {showDamage && <label><span className="mb-1.5 block text-sm font-medium text-muted-foreground">Bônus</span><output className="flex h-11 items-center rounded-xl border border-input bg-muted/65 px-3 text-sm font-semibold text-muted-foreground">{formatSigned(draftBonus.total)}</output><span className="mt-1 block text-xs text-muted-foreground">Vínculo {formatSigned(draftBonus.bond)}{advanced && draft.applyScaleWeight ? ` \u00b7 MT ${formatSigned(draftBonus.mt)}` : ""}. A calculadora recebe {composeItemDamageExpression(draft.damage, draftBonus.total) || "\u2014"}.</span></label>}
                  {showDefense && <fieldset className="rounded-xl border border-border/80 bg-muted/15 p-3">
                    <legend className="px-1 text-sm font-medium text-muted-foreground">RDF/RDM</legend>
                    <div className="grid grid-cols-2 gap-2">
                      <NumberInput label="RDF" value={draft.rdf} min={0} onChange={(rdf) => setDraft({ ...draft, rdf: Math.max(0, Math.trunc(rdf)) })} />
                      <NumberInput label="RDM" value={draft.rdm} min={0} onChange={(rdm) => setDraft({ ...draft, rdm: Math.max(0, Math.trunc(rdm)) })} />
                    </div>
                  </fieldset>}
                  {showPr && <fieldset className="rounded-xl border border-border/80 bg-muted/15 p-3">
                    <legend className="px-1 text-sm font-medium text-muted-foreground">PR</legend>
                    <div className="grid grid-cols-2 gap-2">
                      <OptionalNumberInput label="Atual" value={draft.prCurrent} max={draft.prMaximum ?? undefined} onChange={(prCurrent) => setDraft({ ...draft, prCurrent })} />
                      <OptionalNumberInput label="Máximo" value={draft.prMaximum} onChange={(prMaximum) => setDraft({ ...draft, prMaximum, prCurrent: draft.prCurrent === null || prMaximum === null ? draft.prCurrent : Math.min(draft.prCurrent, prMaximum) })} />
                    </div>
                  </fieldset>}
                  <div className="grid gap-4 sm:col-span-2 lg:col-span-3 lg:grid-cols-2">
                    <ItemAttachments kind="ability" attached={draft.abilityIds.flatMap((id) => { const ability = abilities.find((candidate) => candidate.id === id); return ability ? [abilityAttachment(ability)] : [] })} available={selectableAbilities.map(abilityAttachment)} onAttach={(id) => setDraft((current) => !current || current.abilityIds.includes(id) ? current : { ...current, abilityIds: [...current.abilityIds, id] })} onDetach={(id) => setDraft((current) => current && { ...current, abilityIds: current.abilityIds.filter((entry) => entry !== id) })} onCreateAbility={onCreateAbility} />
                    <ItemAttachments kind="spell" attached={draft.spellIds.flatMap((id) => { const spell = spells.find((candidate) => candidate.id === id); return spell ? [spellAttachment(spell)] : [] })} available={spells.map(spellAttachment)} onAttach={(id) => setDraft((current) => !current || current.spellIds.includes(id) ? current : { ...current, spellIds: [...current.spellIds, id] })} onDetach={(id) => setDraft((current) => current && { ...current, spellIds: current.spellIds.filter((entry) => entry !== id) })} onCreateSpell={onCreateSpell} />
                  </div>
                  {advanced && variant === "runas-blue" && <Select label="Vínculo (opcional)" value={draft.bondId} options={[{ value: "", label: matchingBonds.length ? "Nenhum" : "Nenhum vínculo com este nome" }, ...matchingBonds.map((bond) => ({ value: bond.id, label: bond.name }))]} onChange={(value) => setDraft({ ...draft, bondId: value })} />}
                  {showSkill && <Select label="Perícia" value={draft.skillId} options={[{ value: "", label: "Nenhuma" }, ...testSources.map((source) => ({ value: source.id, label: source.kind === "skill" ? source.name : `${source.name} \u00b7 Elemento` }))]} onChange={(value) => setDraft({ ...draft, skillId: value })} />}
                </div>
                <label className="mt-4 block"><span className="mb-1.5 block text-sm font-medium text-muted-foreground">Descrição</span><textarea rows={6} maxLength={5000} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} className="w-full resize-y rounded-xl border border-input bg-background p-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/25" /></label>
                <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between"><Button type="button" variant="destructive" onClick={() => !draftIsNew && removeItem(draft)} disabled={draftIsNew}><Trash2 /> Remover</Button><div className="flex flex-col-reverse gap-2 sm:flex-row"><Button type="button" variant="outline" onClick={() => setDialogMode("view")}><Eye /> Exibir</Button><Button type="submit"><Save /> Salvar item</Button></div></div>
              </form>}
        </div>, document.body,
      )}

      {referencePreview && typeof document !== "undefined" && createPortal(<ReferenceDialog preview={referencePreview} attributes={attributes} stats={stats} onClose={() => setReferencePreview(null)} onRollSkill={rollSkill} onRollBond={rollBond} />, document.body)}

    </section>
  )
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: readonly { value: string; label: string }[]; onChange: (value: string) => void }) {
  return <label><span className="mb-1.5 block text-sm font-medium text-muted-foreground">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-ring">{options.map((option) => <option key={`${label}-${option.value}`} value={option.value}>{option.label}</option>)}</select></label>
}

function OptionalNumberInput({ label, value, max, onChange }: { label: string; value: number | null; max?: number; onChange: (value: number | null) => void }) {
  return <label className="min-w-0"><span className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</span><input type="number" inputMode="numeric" min={0} max={max} value={value ?? ""} placeholder="—" onChange={(event) => { const raw = event.target.value; onChange(raw === "" ? null : Math.min(max ?? Number.POSITIVE_INFINITY, Math.max(0, Math.trunc(Number(raw) || 0)))) }} className="h-11 w-full min-w-0 rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/25" /></label>
}

interface ItemViewProps {
  variant: "runas-blue" | "cronos"
  item: CharacterInventoryItem
  info: CharacterInfo
  skills: CharacterSkill[]
  bonds: CharacterBond[]
  abilities: CharacterAbility[]
  spells: CharacterSpell[]
  attributes: CharacterAttributes
  stats: CharacterStats
  onClose: () => void
  onEdit: () => void
  onDelete: () => void
  onReference: (preview: ReferencePreview) => void
  onRollSkill: (id: string) => void
  onRollBond: (id: string) => void
  onRollDamage: (item: CharacterInventoryItem) => void
}

function ItemView({ variant, item, info, skills, bonds, abilities, spells, attributes, stats, onClose, onEdit, onDelete, onReference, onRollSkill, onRollBond, onRollDamage }: ItemViewProps) {
  const attachedSpells = item.spellIds.flatMap((id) => spells.filter((candidate) => candidate.id === id))
  const bond = bonds.find((candidate) => candidate.id === item.bondId)
  const attachedAbilities = item.abilityIds.flatMap((id) => abilities.filter((candidate) => candidate.id === id))
  const skill = skills.find((candidate) => candidate.id === item.skillId)
  const skillTest = skill?.attributeKey ? calculateAttributeTest(attributes, skill.attributeKey) + calculateSkillModifier(skill) : null
  return <div role="dialog" aria-modal="true" aria-labelledby="inventory-view-title" className="max-h-[calc(100dvh-1.5rem)] w-full max-w-4xl overflow-y-auto rounded-[24px] border border-border bg-card p-4 shadow-2xl sm:p-6">
    <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Visualização do item</p><h2 id="inventory-view-title" className="mt-1 text-xl font-bold text-foreground">{item.name}</h2><p className="mt-1 text-sm text-muted-foreground">{inventoryTypeLabel(item.type)} · {inventoryUsageLabel(item.usage)}</p></div><button type="button" onClick={onClose} aria-label="Fechar item" className="inline-flex size-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted"><X className="size-5" /></button></div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{variant === "runas-blue" && <><Info label="Afinidade" value={itemAffinityOptions[item.affinity]?.label ?? "Ordinário (0)"} /><Info label="Raridade" value={itemRarity(item.bondPoints)} /></>}<Info label="Tamanho" value={formatItemSize(item.size)} /><Info label="MT" value={String(item.mt)} /><Info label="Quantidade" value={String(item.quantity)} /><Info label="Peso Base (unidade)" value={`${formatWeight(item.baseWeight)} kg`} /><Info label="Peso Total" value={`${formatWeight(calculateItemRealWeight(item, info.scaleMultiplier))} kg`} />{item.damage && <Info label="Dano" value={item.damage} />}{(item.rdf > 0 || item.rdm > 0) && <><Info label="RDF" value={String(item.rdf)} /><Info label="RDM" value={String(item.rdm)} /></>}{(item.prCurrent !== null || item.prMaximum !== null) && <Info label="PR atual/máximo" value={`${item.prCurrent ?? "—"} / ${item.prMaximum ?? "—"}`} />}</div>
    {item.description && <div className="mt-4 rounded-xl border border-border bg-background/55 p-4"><span className="text-xs font-medium text-muted-foreground">Descrição</span><p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground">{item.description}</p></div>}
    <div className="mt-4 grid gap-3 lg:grid-cols-2">
      {attachedSpells.map((spell) => <ReferenceCard key={spell.id} title={spell.magicType === "enchantment" ? "Encantamento" : "Magia"} name={spell.name} details={plainText(spell.description) || `${spellTypeLabel(spell.magicType)} · ${spellRange(spell)}`} onOpen={() => onReference({ type: "spell", value: spell })} />)}
      {variant === "runas-blue" && bond && <ReferenceCard title="Vínculo" name={bond.name} details={`Teste ${calculateBondTest(attributes, stats, bond)} · ${calculateBondQuality(bond.points).name}`} onOpen={() => onReference({ type: "bond", value: bond })} action={<Button type="button" size="sm" onClick={() => onRollBond(bond.id)}><Dices /> Rolar Impressão</Button>} />}
      {attachedAbilities.map((ability) => <ReferenceCard key={ability.id} title="Habilidade" name={ability.name} details={plainText(ability.description) || `Custo: ${costSummary(ability)}`} onOpen={() => onReference({ type: "ability", value: ability })} />)}
      {skill && <ReferenceCard title="Perícia" name={skill.name} details={`Teste ${skillTest ?? "—"} · Nível ${calculateSkillLevel(skill.points)} · ${skill.attributeKey ? getAttributeDef(skill.attributeKey)?.name ?? "Sem atributo" : "Sem atributo"} · Mod. ${formatSigned(skill.modifier)}`} onOpen={() => onReference({ type: "skill", value: skill })} action={<Button type="button" size="sm" onClick={() => onRollSkill(skill.id)} disabled={!skill.attributeKey}><Dices /> Rolar teste</Button>} />}
    </div>
    <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between"><Button type="button" variant="destructive" onClick={onDelete}><Trash2 /> Remover</Button><div className="flex flex-col gap-2 sm:flex-row">{(item.type === "weapon" || item.type === "shield") && <Button type="button" variant="secondary" onClick={() => onRollDamage(item)} disabled={!item.damage}><Swords /> Rolar dano</Button>}<Button type="button" onClick={onEdit}><Pencil /> Editar</Button></div></div>
  </div>
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-border bg-background/55 p-3"><span className="text-xs text-muted-foreground">{label}</span><strong className="mt-1 block text-sm text-foreground">{value}</strong></div>
}

function ReferenceCard({ title, name, details, onOpen, action }: { title: string; name: string; details: string; onOpen: () => void; action?: React.ReactNode }) {
  return <article className="rounded-[18px] border border-border bg-muted/30 p-4"><span className="text-xs font-semibold text-muted-foreground">{title}</span><button type="button" onClick={onOpen} className="mt-1 block text-left font-bold text-foreground hover:text-primary">{name}</button><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{details}</p>{action && <div className="mt-3">{action}</div>}</article>
}

function ReferenceDialog({ preview, attributes, stats, onClose, onRollSkill, onRollBond }: { preview: ReferencePreview; attributes: CharacterAttributes; stats: CharacterStats; onClose: () => void; onRollSkill: (id: string) => void; onRollBond: (id: string) => void }) {
  let title = ""
  let content: React.ReactNode
  if (preview.type === "spell") {
    const spell = preview.value
    title = spell.name
    content = <><div className="grid gap-3 sm:grid-cols-2"><Info label="Tipo" value={spellTypeLabel(spell.magicType)} /><Info label="Alcance" value={spellRange(spell)} /><Info label="Duração" value={spell.duration || "—"} /><Info label="Custo" value={costSummary(spell)} /><Info label="Conjuração" value={spell.castingSkill || "—"} /></div><p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed">{plainText(spell.description) || "Sem descrição."}</p></>
  } else if (preview.type === "bond") {
    const bond = preview.value
    const quality = calculateBondQuality(bond.points)
    title = bond.name
    content = <><div className="grid gap-3 sm:grid-cols-3"><Info label="Teste" value={String(calculateBondTest(attributes, stats, bond))} /><Info label="Qualidade" value={quality.name} /><Info label="Nível" value={formatSigned(quality.level)} /></div><Button type="button" className="mt-4" onClick={() => onRollBond(bond.id)}><Dices /> Rolar Impressão</Button></>
  } else if (preview.type === "ability") {
    const ability = preview.value
    title = ability.name
    content = <><Info label="Custo" value={costSummary(ability)} /><p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed">{plainText(ability.description) || "Sem descrição."}</p></>
  } else {
    const skill = preview.value
    const test = skill.attributeKey ? calculateAttributeTest(attributes, skill.attributeKey) + calculateSkillModifier(skill) : null
    title = skill.name
    content = <><div className="grid gap-3 sm:grid-cols-4"><Info label="Teste" value={test === null ? "—" : String(test)} /><Info label="Nível" value={String(calculateSkillLevel(skill.points))} /><Info label="Atributo" value={skill.attributeKey ? getAttributeDef(skill.attributeKey)?.name ?? "—" : "—"} /><Info label="Mod." value={formatSigned(skill.modifier)} /></div><Button type="button" className="mt-4" onClick={() => onRollSkill(skill.id)} disabled={!skill.attributeKey}><Dices /> Rolar teste</Button></>
  }
  return <div className="fixed inset-0 z-[105] flex items-center justify-center bg-black/65 p-3"><div role="dialog" aria-modal="true" className="max-h-[calc(100dvh-1.5rem)] w-full max-w-2xl overflow-y-auto rounded-[22px] border border-border bg-card p-5 shadow-2xl"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Visualização somente leitura</p><h2 className="mt-1 text-lg font-bold text-foreground">{title}</h2></div><button type="button" onClick={onClose} aria-label="Fechar visualização" className="inline-flex size-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted"><X className="size-5" /></button></div><div className="mt-4">{content}</div></div></div>
}
