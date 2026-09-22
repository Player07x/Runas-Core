"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import { Bolt, ChevronDown, Download, Eye, EyeOff, ListFilter, Plus, Save, Sparkles, Trash2, Upload, X } from "lucide-react"
import type { AbilityCostType, CharacterAttributes, CharacterElementSkill, CharacterSkill, CharacterSpell, CharacterStats, SpellMagicType, SpellRangeType } from "@runas/core/types/character"
import { findCharacterTestSource } from "@runas/core/lib/characterTestSources"
import { normalizeSkillName } from "@runas/core/lib/skillCalculations"
import { exportSpellList, parseSpellListFile, type ImportedSpell } from "@/lib/spellTransfer"
import { useCharacterPanel } from "@/components/character/character-panel"
import { CharacterElements } from "@/components/character/character-elements"
import { createId, createPrefixedId } from "@runas/core/lib/ids"

const RichTextEditor = dynamic(
  () => import("@/components/ui/rich-text-editor").then((module) => module.RichTextEditor),
  { ssr: false, loading: () => <div className="mt-4 min-h-52 animate-pulse rounded-[18px] border border-input bg-muted/45" aria-label="Carregando editor" /> },
)

interface Props {
  variant?: "runas-blue" | "cronos"
  characterName: string
  spells: CharacterSpell[]
  skills: CharacterSkill[]
  attributes: CharacterAttributes
  elements: CharacterElementSkill[]
  onElementsChange: (elements: CharacterElementSkill[]) => void
  stats: CharacterStats
  onAddSpell: (spell: CharacterSpell) => void
  onImportSpells: (spells: ImportedSpell[]) => void
  onSpellChange: (id: string, updates: Partial<CharacterSpell>) => void
  onRemoveSpell: (id: string) => void
  onApplyCost: (costType: Exclude<AbilityCostType, "none" | "other">, amount: number) => void
}

interface CostDialogState {
  spell: CharacterSpell
  amount: string
  step: "amount" | "confirm"
  shouldCast: boolean
}

const FILTER_STORAGE_KEY = "runas-tools:spell-filters"
const collator = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" })
const costOptions: { value: AbilityCostType; label: string }[] = [
  { value: "none", label: "Nenhum" },
  { value: "other", label: "Outro" },
  { value: "pv", label: "PV Atual" },
  { value: "pa", label: "PA Atual" },
  { value: "pe", label: "PE Atual" },
  { value: "paExtra", label: "PA Extra" },
  { value: "peTemporary", label: "PE Temporário" },
]
const cronosCostOptions: { value: AbilityCostType; label: string }[] = [
  { value: "none", label: "Nenhum" },
  { value: "other", label: "Outro" },
  { value: "pv", label: "Vida" },
  { value: "pa", label: "Aura" },
  { value: "pe", label: "Mana" },
]
const magicTypeOptions: { value: SpellMagicType; label: string }[] = [
  { value: "aura", label: "Aura" },
  { value: "quick", label: "Rápida" },
  { value: "spell", label: "Feitiço" },
  { value: "ritual", label: "Ritual" },
  { value: "enchantment", label: "Encantamento" },
]
const rangeTypeOptions: { value: SpellRangeType; label: string }[] = [
  { value: "touch", label: "Toque" },
  { value: "personal", label: "Pessoal" },
  { value: "projectile", label: "Projétil" },
  { value: "targets", label: "Alvo(s)" },
  { value: "area", label: "Área" },
]

function categoryKey(value: string): string {
  return normalizeSkillName(value) || "__without_category__"
}

function createSpell(): CharacterSpell {
  const id = createPrefixedId("spell")
  return {
    id,
    category: "",
    name: "Nova magia",
    description: "",
    costType: "none",
    costMode: "fixed",
    costValue: 0,
    costText: "",
    magicType: "spell",
    rangeType: "personal",
    rangeText: "",
    area: "",
    duration: "",
    castingSkill: "",
  }
}

function currentResource(stats: CharacterStats, costType: AbilityCostType): number {
  if (costType === "pv") return stats.pv
  if (costType === "pa") return stats.pa
  if (costType === "pe") return stats.pe
  if (costType === "paExtra") return stats.paExtra
  if (costType === "peTemporary") return stats.peTemporary
  return 0
}

function costLabel(type: AbilityCostType, options = costOptions): string {
  return options.find((option) => option.value === type)?.label ?? "Custo"
}

function costSummary(spell: CharacterSpell, options = costOptions): string {
  if (spell.costType === "none") return "Nenhum"
  if (spell.costType === "other") return spell.costText || "Outro"
  return spell.costMode === "relative"
    ? `${costLabel(spell.costType, options)} · Relativo`
    : `${spell.costValue} ${costLabel(spell.costType, options)}`
}

function magicTypeLabel(type: SpellMagicType): string {
  return magicTypeOptions.find((option) => option.value === type)?.label ?? "Feitiço"
}

function rangeLabel(spell: CharacterSpell): string {
  const type = rangeTypeOptions.find((option) => option.value === spell.rangeType)?.label ?? "Pessoal"
  if (spell.rangeType === "touch" || spell.rangeType === "personal") return type
  return spell.rangeText ? `${spell.rangeText}, ${type}` : type
}

function loadFilters(): { hiddenCategories: Set<string>; showFilters: boolean } {
  if (typeof window === "undefined") return { hiddenCategories: new Set(), showFilters: false }
  try {
    const saved = JSON.parse(window.localStorage.getItem(FILTER_STORAGE_KEY) ?? "null") as { hiddenCategories?: string[]; showFilters?: boolean } | null
    return { hiddenCategories: new Set(saved?.hiddenCategories ?? []), showFilters: saved?.showFilters ?? false }
  } catch {
    return { hiddenCategories: new Set(), showFilters: false }
  }
}

export function CharacterSpells({ variant = "runas-blue", characterName, spells, skills, attributes, elements, onElementsChange, stats, onAddSpell, onImportSpells, onSpellChange, onRemoveSpell, onApplyCost }: Props) {
  const router = useRouter()
  const { close } = useCharacterPanel()
  const [initialFilters] = useState(loadFilters)
  const [hiddenCategories, setHiddenCategories] = useState(initialFilters.hiddenCategories)
  const [showFilters, setShowFilters] = useState(initialFilters.showFilters)
  const [editingSpell, setEditingSpell] = useState<CharacterSpell | null>(null)
  const [isNewSpell, setIsNewSpell] = useState(false)
  const [costDialog, setCostDialog] = useState<CostDialogState | null>(null)
  const [showImport, setShowImport] = useState(false)
  const [importedSpells, setImportedSpells] = useState<ImportedSpell[]>([])
  const [selectedSpells, setSelectedSpells] = useState<Set<number>>(() => new Set())
  const [importFilename, setImportFilename] = useState("")
  const [importError, setImportError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const availableCostOptions = variant === "cronos" ? cronosCostOptions : costOptions

  useEffect(() => {
    try {
      window.localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify({ hiddenCategories: [...hiddenCategories], showFilters }))
    } catch {
      // Preserva os filtros na sessão quando o armazenamento estiver indisponível.
    }
  }, [hiddenCategories, showFilters])

  const categories = useMemo(() => {
    const values = new Map<string, string>()
    spells.forEach((spell) => {
      const key = categoryKey(spell.category)
      if (!values.has(key)) values.set(key, spell.category.trim() || "Sem categoria")
    })
    return [...values].map(([key, label]) => ({ key, label }))
  }, [spells])

  const visibleSpells = useMemo(() => spells
    .filter((spell) => !hiddenCategories.has(categoryKey(spell.category)))
    .sort((left, right) => collator.compare(left.name, right.name)), [hiddenCategories, spells])

  function toggleCategory(key: string) {
    setHiddenCategories((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function saveSpell(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editingSpell) return
    const blocksRangeText = editingSpell.rangeType === "touch" || editingSpell.rangeType === "personal"
    const normalized: CharacterSpell = {
      ...editingSpell,
      category: editingSpell.category.trim().slice(0, 40),
      name: editingSpell.name.trim().slice(0, 80) || "Magia sem nome",
      costValue: Math.max(0, Math.trunc(editingSpell.costValue || 0)),
      costText: editingSpell.costText.slice(0, 50),
      rangeText: blocksRangeText ? "" : editingSpell.rangeText.trim().slice(0, 100),
      area: editingSpell.area.trim().slice(0, 100),
      duration: editingSpell.duration.trim().slice(0, 100),
      castingSkill: editingSpell.castingSkill.trim().slice(0, 80),
    }
    if (isNewSpell) onAddSpell(normalized)
    else onSpellChange(normalized.id, normalized)
    setEditingSpell(null)
    setIsNewSpell(false)
  }

  function findCastingSkill(spell: CharacterSpell): CharacterSkill | undefined {
    const requested = normalizeSkillName(spell.castingSkill)
    return requested ? skills.find((skill) => normalizeSkillName(skill.name) === requested) : undefined
  }

  function castSpell(spell: CharacterSpell) {
    // A conjuração aceita uma perícia, um elemento ou uma fusão.
    const source = findCharacterTestSource({ attributes, skills, elements }, spell.castingSkill)
    if (!source) {
      setActionError(`“${spell.castingSkill}” não foi encontrado entre as perícias e os elementos da ficha.`)
      return
    }
    if (!source.attributeKey) {
      setActionError(`A perícia “${source.name}” precisa ter um atributo antes da conjuração.`)
      return
    }
    setActionError(null)
    rollTestSource(source.id)
  }

  /** Leva o teste da perícia, do elemento ou da fusão para a calculadora. */
  function rollTestSource(sourceId: string) {
    close()
    const parameter = sourceId.startsWith("fusion:") || elements.some((element) => element.id === sourceId) ? "element" : "skill"
    router.push(`/calculadora-testes?${parameter}=${encodeURIComponent(sourceId)}&roll=${encodeURIComponent(createId())}`)
  }

  function completeAction(spell: CharacterSpell, amount: number, shouldCast: boolean) {
    if (spell.costType !== "none" && spell.costType !== "other") onApplyCost(spell.costType, amount)
    setCostDialog(null)
    if (shouldCast) castSpell(spell)
  }

  function beginAction(spell: CharacterSpell) {
    const shouldCast = Boolean(spell.castingSkill.trim())
    const castingSkill = shouldCast ? findCastingSkill(spell) : undefined
    if (shouldCast && !castingSkill) {
      setActionError(`A perícia “${spell.castingSkill}” não foi encontrada na ficha.`)
      return
    }
    if (castingSkill && !castingSkill.attributeKey) {
      setActionError(`A perícia “${castingSkill.name}” precisa ter um atributo antes da conjuração.`)
      return
    }
    setActionError(null)
    if (spell.costType === "none" || spell.costType === "other") {
      if (shouldCast) castSpell(spell)
      return
    }
    if (spell.costMode === "relative") {
      setCostDialog({ spell, amount: "", step: "amount", shouldCast })
      return
    }
    const amount = Math.max(0, Math.trunc(spell.costValue))
    if (amount > currentResource(stats, spell.costType)) {
      setCostDialog({ spell, amount: String(amount), step: "confirm", shouldCast })
      return
    }
    completeAction(spell, amount, shouldCast)
  }

  function continueAction() {
    if (!costDialog || costDialog.spell.costType === "none" || costDialog.spell.costType === "other") return
    const amount = Math.max(0, Math.trunc(Number(costDialog.amount) || 0))
    if (costDialog.step === "amount" && amount > currentResource(stats, costDialog.spell.costType)) {
      setCostDialog({ ...costDialog, amount: String(amount), step: "confirm" })
      return
    }
    completeAction(costDialog.spell, amount, costDialog.shouldCast)
  }

  async function loadSpellFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const imported = parseSpellListFile(await file.text())
      setImportedSpells(imported)
      setSelectedSpells(new Set(imported.map((_, index) => index)))
      setImportFilename(file.name)
      setImportError(null)
    } catch (error) {
      setImportedSpells([])
      setSelectedSpells(new Set())
      setImportFilename("")
      setImportError(error instanceof Error ? error.message : "Não foi possível ler a lista de magias.")
    } finally {
      event.target.value = ""
    }
  }

  function confirmImport(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const selected = importedSpells.filter((_, index) => selectedSpells.has(index))
    if (selected.length === 0) return
    onImportSpells(selected)
    setShowImport(false)
  }

  return (
    <section aria-label="Magias do personagem" className="rounded-b-[22px] rounded-t-none border border-border bg-card p-2 shadow-sm sm:rounded-b-[27px] sm:p-7">
      <datalist id="spell-category-suggestions">{categories.filter((category) => category.key !== "__without_category__").map((category) => <option key={category.key} value={category.label} />)}</datalist>
      <datalist id="spell-skill-suggestions">{skills.map((skill) => <option key={skill.id} value={skill.name} />)}{elements.map((element) => <option key={element.id} value={element.name} />)}</datalist>

      <CharacterElements attributes={attributes} elements={elements} onChange={onElementsChange} onRoll={rollTestSource} />

      <div className="flex flex-col gap-3 border-b border-border px-0.5 pb-3 sm:flex-row sm:items-center sm:justify-end sm:px-0">
        <button type="button" onClick={() => exportSpellList(spells, characterName)} disabled={spells.length === 0} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-input bg-background px-3 py-2 text-sm font-semibold text-muted-foreground transition hover:text-foreground disabled:opacity-40"><Download className="size-4" /> Exportar todas</button>
        <button type="button" onClick={() => { setShowImport(true); setImportedSpells([]); setSelectedSpells(new Set()); setImportFilename(""); setImportError(null) }} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-input bg-background px-3 py-2 text-sm font-semibold text-muted-foreground transition hover:text-foreground"><Upload className="size-4" /> Importar lista</button>
        <button type="button" onClick={() => setShowFilters((current) => !current)} aria-expanded={showFilters} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-input bg-background px-3 py-2 text-sm font-semibold text-muted-foreground transition hover:text-foreground"><ListFilter className="size-4" /> Categorias</button>
        <button type="button" onClick={() => { setEditingSpell(createSpell()); setIsNewSpell(true) }} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-secondary px-3 py-2 text-sm font-semibold text-secondary-foreground transition hover:bg-accent"><Plus className="size-4" /> Adicionar magia</button>
      </div>

      {showFilters && <div className="mt-3 flex flex-wrap gap-2 rounded-xl border border-border bg-background/45 p-2" aria-label="Filtrar categorias de magias">
        {categories.length === 0 ? <span className="px-2 py-1 text-xs text-muted-foreground">Crie uma magia para habilitar os filtros.</span> : categories.map((category) => {
          const visible = !hiddenCategories.has(category.key)
          return <button key={category.key} type="button" aria-pressed={visible} onClick={() => toggleCategory(category.key)} className={`inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition ${visible ? "border-primary/45 bg-primary/10 text-primary" : "border-border bg-muted text-muted-foreground"}`}>{visible ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}{category.label}</button>
        })}
        {hiddenCategories.size > 0 && <button type="button" onClick={() => setHiddenCategories(new Set())} className="h-9 rounded-xl px-3 text-xs font-semibold text-muted-foreground hover:text-foreground">Mostrar todas</button>}
      </div>}

      {actionError && <p role="alert" className="mt-3 rounded-xl border border-destructive/35 bg-destructive/10 p-3 text-sm font-medium text-destructive">{actionError}</p>}

      <div className="space-y-2 pt-3">
        <div className="hidden grid-cols-[minmax(0,1.2fr)_minmax(0,.7fr)_minmax(0,1.1fr)_minmax(0,.8fr)_minmax(0,1fr)_6.5rem_2.75rem] gap-2 px-3 text-center text-[0.62rem] uppercase tracking-wide text-muted-foreground md:grid">
          <span>Nome</span><span>Tipo</span><span>Alcance</span><span>Duração</span><span>Custo</span><span>Conjuração</span><span />
        </div>
        {visibleSpells.length === 0 && <p className="rounded-[18px] border border-dashed border-border bg-background/35 px-4 py-10 text-center text-sm text-muted-foreground">{spells.length === 0 ? "Nenhuma magia cadastrada." : "Nenhuma magia corresponde às categorias visíveis."}</p>}
        {visibleSpells.map((spell) => {
          const canApplyCost = spell.costType !== "none" && spell.costType !== "other"
          const canCast = Boolean(spell.castingSkill.trim())
          return <article key={spell.id} className="virtualized-list-item grid grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-[18px] border border-border bg-background/55 p-3 md:grid-cols-[minmax(0,1.2fr)_minmax(0,.7fr)_minmax(0,1.1fr)_minmax(0,.8fr)_minmax(0,1fr)_6.5rem_2.75rem] md:items-center md:p-2">
            <button type="button" onClick={() => { setEditingSpell({ ...spell }); setIsNewSpell(false) }} className="col-start-1 row-start-1 min-w-0 truncate text-left text-sm font-bold text-foreground hover:text-primary md:col-start-auto md:row-start-auto md:px-2">{spell.name}</button>
            <span className="col-start-1 row-start-2 min-w-0 truncate text-xs font-semibold text-muted-foreground md:col-start-auto md:row-start-auto md:text-center"><span className="md:hidden">Tipo: </span>{magicTypeLabel(spell.magicType)}</span>
            <span className="col-span-2 col-start-1 row-start-3 min-w-0 truncate text-xs text-muted-foreground md:col-span-1 md:col-start-auto md:row-start-auto md:text-center"><span className="md:hidden">Alcance: </span>{rangeLabel(spell)}</span>
            <span className="col-start-1 row-start-4 min-w-0 truncate text-xs text-muted-foreground md:col-start-auto md:row-start-auto md:text-center"><span className="md:hidden">Duração: </span>{spell.duration || "—"}</span>
            <span className="col-start-2 row-start-4 min-w-0 truncate text-right text-xs text-muted-foreground md:col-start-auto md:row-start-auto md:text-center"><span className="md:hidden">Custo: </span>{costSummary(spell, availableCostOptions)}</span>
            {(canCast || canApplyCost) ? <button type="button" onClick={() => beginAction(spell)} title={canCast ? `Conjurar com ${spell.castingSkill}` : `Aplicar custo: ${costLabel(spell.costType)}`} className="col-span-2 col-start-1 row-start-5 inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-primary px-3 text-xs font-bold text-primary-foreground transition hover:brightness-110 md:col-span-1 md:col-start-auto md:row-start-auto">{canCast ? <><Sparkles className="size-4" /> Conjurar</> : <><Bolt className="size-4" /><span className="sr-only">Aplicar custo</span></>}</button> : <span className="hidden md:block" />}
            <button type="button" onClick={() => onRemoveSpell(spell.id)} aria-label={`Remover ${spell.name}`} className="col-start-2 row-start-1 inline-flex size-10 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive md:col-start-auto md:row-start-auto"><Trash2 className="size-4" /></button>
          </article>
        })}
      </div>

      {editingSpell && createPortal(<div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-3 backdrop-blur-[2px]" onMouseDown={(event) => { if (event.currentTarget === event.target) setEditingSpell(null) }}>
        <form onSubmit={saveSpell} role="dialog" aria-modal="true" aria-labelledby="spell-editor-title" className="max-h-[calc(100dvh-1.5rem)] w-full max-w-4xl overflow-y-auto rounded-[24px] border border-border bg-card p-4 shadow-2xl sm:p-6">
          <div className="flex items-start justify-between gap-3"><h2 id="spell-editor-title" className="text-lg font-bold text-foreground">{isNewSpell ? "Nova magia" : "Editar magia"}</h2><button type="button" onClick={() => setEditingSpell(null)} aria-label="Fechar editor de magia" className="inline-flex size-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted"><X className="size-5" /></button></div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <label><span className="mb-1.5 block text-sm font-medium text-muted-foreground">Categoria</span><input value={editingSpell.category} list="spell-category-suggestions" maxLength={40} onChange={(event) => setEditingSpell({ ...editingSpell, category: event.target.value })} className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/25" /></label>
            <label className="sm:col-span-2"><span className="mb-1.5 block text-sm font-medium text-muted-foreground">Nome</span><input value={editingSpell.name} required maxLength={80} onChange={(event) => setEditingSpell({ ...editingSpell, name: event.target.value })} className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/25" /></label>
            <label className="relative"><span className="mb-1.5 block text-sm font-medium text-muted-foreground">Tipo de Magia</span><select value={editingSpell.magicType} onChange={(event) => setEditingSpell({ ...editingSpell, magicType: event.target.value as SpellMagicType })} className="h-11 w-full appearance-none rounded-xl border border-input bg-background px-3 pr-9 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/25">{magicTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><ChevronDown className="pointer-events-none absolute bottom-3.5 right-3 size-4 text-muted-foreground" /></label>
            <label className="relative"><span className="mb-1.5 block text-sm font-medium text-muted-foreground">Tipo de Alcance</span><select value={editingSpell.rangeType} onChange={(event) => { const rangeType = event.target.value as SpellRangeType; setEditingSpell({ ...editingSpell, rangeType, rangeText: rangeType === "touch" || rangeType === "personal" ? "" : editingSpell.rangeText }) }} className="h-11 w-full appearance-none rounded-xl border border-input bg-background px-3 pr-9 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/25">{rangeTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><ChevronDown className="pointer-events-none absolute bottom-3.5 right-3 size-4 text-muted-foreground" /></label>
            <label><span className="mb-1.5 block text-sm font-medium text-muted-foreground">Alcance (opcional)</span><input value={editingSpell.rangeText} disabled={editingSpell.rangeType === "touch" || editingSpell.rangeType === "personal"} maxLength={100} placeholder={editingSpell.rangeType === "touch" || editingSpell.rangeType === "personal" ? "Não se aplica" : "10 metros"} onChange={(event) => setEditingSpell({ ...editingSpell, rangeText: event.target.value })} className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/25" /></label>
            <label><span className="mb-1.5 block text-sm font-medium text-muted-foreground">Área (opcional)</span><input value={editingSpell.area} maxLength={100} onChange={(event) => setEditingSpell({ ...editingSpell, area: event.target.value })} placeholder="16 metros de raio" className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/25" /></label>
            <label><span className="mb-1.5 block text-sm font-medium text-muted-foreground">Duração (opcional)</span><input value={editingSpell.duration} maxLength={100} onChange={(event) => setEditingSpell({ ...editingSpell, duration: event.target.value })} placeholder="3 rodadas" className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/25" /></label>
            <label><span className="mb-1.5 block text-sm font-medium text-muted-foreground">Teste de Conjuração</span><input value={editingSpell.castingSkill} list="spell-skill-suggestions" maxLength={80} onChange={(event) => setEditingSpell({ ...editingSpell, castingSkill: event.target.value })} placeholder="Escolha uma perícia da ficha" className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/25" /></label>
          </div>
          <RichTextEditor label="Descrição" value={editingSpell.description} onChange={(description) => setEditingSpell((current) => current ? { ...current, description } : current)} maxLength={5000} className="mt-4" />
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <label className="relative"><span className="mb-1.5 block text-sm font-medium text-muted-foreground">Custo</span><select value={editingSpell.costType} onChange={(event) => setEditingSpell({ ...editingSpell, costType: event.target.value as AbilityCostType })} className="h-11 w-full appearance-none rounded-xl border border-input bg-background px-3 pr-9 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/25">{availableCostOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><ChevronDown className="pointer-events-none absolute bottom-3.5 right-3 size-4 text-muted-foreground" /></label>
            {editingSpell.costType === "other" && <label className="sm:col-span-2"><span className="mb-1.5 block text-sm font-medium text-muted-foreground">Descrição do custo</span><input value={editingSpell.costText} maxLength={50} onChange={(event) => setEditingSpell({ ...editingSpell, costText: event.target.value })} className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/25" /></label>}
            {editingSpell.costType !== "none" && editingSpell.costType !== "other" && <><label className="relative"><span className="mb-1.5 block text-sm font-medium text-muted-foreground">Aplicação</span><select value={editingSpell.costMode} onChange={(event) => setEditingSpell({ ...editingSpell, costMode: event.target.value as "fixed" | "relative" })} className="h-11 w-full appearance-none rounded-xl border border-input bg-background px-3 pr-9 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/25"><option value="fixed">Fixo</option><option value="relative">Relativo</option></select><ChevronDown className="pointer-events-none absolute bottom-3.5 right-3 size-4 text-muted-foreground" /></label>{editingSpell.costMode === "fixed" && <label><span className="mb-1.5 block text-sm font-medium text-muted-foreground">Valor fixo</span><input type="number" min={0} step={1} value={editingSpell.costValue} onChange={(event) => setEditingSpell({ ...editingSpell, costValue: Math.max(0, Math.trunc(Number(event.target.value) || 0)) })} className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/25" /></label>}</>}
          </div>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={() => setEditingSpell(null)} className="h-11 rounded-xl border border-input bg-background px-4 text-sm font-semibold text-muted-foreground">Cancelar</button><button type="submit" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"><Save className="size-4" /> Salvar magia</button></div>
        </form>
      </div>, document.body)}

      {costDialog && createPortal(<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-3 backdrop-blur-[2px]"><div role="dialog" aria-modal="true" aria-labelledby="spell-cost-title" className="w-full max-w-md rounded-[24px] border border-border bg-card p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3"><div><h2 id="spell-cost-title" className="font-bold text-foreground">{costDialog.step === "amount" ? "Aplicar custo relativo" : "Confirmar custo"}</h2><p className="mt-1 text-sm text-muted-foreground">{costDialog.spell.name} · {costLabel(costDialog.spell.costType)}</p></div><button type="button" onClick={() => setCostDialog(null)} aria-label="Fechar aplicação de custo" className="inline-flex size-9 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted"><X className="size-5" /></button></div>
        {costDialog.step === "amount" ? <label className="mt-4 block"><span className="mb-1.5 block text-sm font-medium text-muted-foreground">Valor a descontar</span><input autoFocus type="number" min={0} step={1} value={costDialog.amount} onChange={(event) => setCostDialog({ ...costDialog, amount: event.target.value })} className="h-12 w-full rounded-xl border border-input bg-background px-3 text-base outline-none focus:border-ring focus:ring-2 focus:ring-ring/25" /></label> : <p className="mt-4 rounded-xl border border-destructive/35 bg-destructive/10 p-3 text-sm leading-relaxed text-destructive">O custo de {Math.max(0, Math.trunc(Number(costDialog.amount) || 0))} é maior que o valor atual ({currentResource(stats, costDialog.spell.costType)}). Tem certeza de que deseja continuar?</p>}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={() => setCostDialog(null)} className="h-11 rounded-xl border border-input bg-background px-4 text-sm font-semibold text-muted-foreground">Cancelar</button><button type="button" onClick={continueAction} disabled={costDialog.step === "amount" && !(Number(costDialog.amount) >= 0)} className="h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-40">{costDialog.step === "amount" ? (costDialog.shouldCast ? "Aplicar e conjurar" : "Aplicar custo") : "Sim, continuar"}</button></div>
      </div></div>, document.body)}

      {showImport && createPortal(<div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-3 backdrop-blur-[2px]" onMouseDown={(event) => { if (event.currentTarget === event.target) setShowImport(false) }}><form onSubmit={confirmImport} role="dialog" aria-modal="true" aria-labelledby="spell-import-title" className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-3xl flex-col overflow-hidden rounded-[24px] border border-border bg-card shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-border p-4 sm:p-6"><div><h2 id="spell-import-title" className="text-lg font-bold text-foreground">Importar magias</h2><p className="mt-1 text-sm text-muted-foreground">Escolha uma lista exportada e selecione as magias desejadas.</p></div><button type="button" onClick={() => setShowImport(false)} aria-label="Fechar importação de magias" className="inline-flex size-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted"><X className="size-5" /></button></div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6"><input ref={fileRef} type="file" accept="application/json,.json" onChange={loadSpellFile} className="hidden" /><button type="button" onClick={() => fileRef.current?.click()} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[18px] border border-dashed border-input bg-background/65 px-4 py-3 text-sm font-semibold text-muted-foreground"><Upload className="size-4" /> {importFilename ? "Escolher outro arquivo" : "Escolher arquivo de magias"}</button>{importFilename && <p className="mt-2 truncate text-xs text-muted-foreground">Arquivo: <strong>{importFilename}</strong></p>}
          {importedSpells.length > 0 && <div className="mt-4 space-y-2">{importedSpells.map((spell, index) => <label key={`${spell.name}-${index}`} className={`flex items-center gap-3 rounded-[18px] border p-3 ${selectedSpells.has(index) ? "border-primary/45 bg-primary/5" : "border-border"}`}><input type="checkbox" checked={selectedSpells.has(index)} onChange={() => setSelectedSpells((current) => { const next = new Set(current); if (next.has(index)) next.delete(index); else next.add(index); return next })} className="size-5 accent-primary" /><span className="min-w-0"><strong className="block truncate text-sm text-foreground">{spell.name}</strong><span className="block text-xs text-muted-foreground">{magicTypeLabel(spell.magicType)} · {rangeLabel({ ...spell, id: "preview" })}</span></span></label>)}</div>}
          {importError && <p role="alert" className="mt-3 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{importError}</p>}
        </div>
        <div className="flex flex-col-reverse gap-2 border-t border-border p-4 sm:flex-row sm:justify-end"><button type="button" onClick={() => setShowImport(false)} className="h-11 rounded-xl border border-input bg-background px-4 text-sm font-semibold text-muted-foreground">Cancelar</button><button type="submit" disabled={selectedSpells.size === 0} className="h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-40">Importar {selectedSpells.size || "selecionadas"}</button></div>
      </form></div>, document.body)}
    </section>
  )
}
