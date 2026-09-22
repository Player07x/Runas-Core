"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import dynamic from "next/dynamic"
import { Bolt, ChevronDown, Download, Eye, EyeOff, ListFilter, Plus, Save, Trash2, Upload, X } from "lucide-react"
import type { AbilityCostType, CharacterAbility, CharacterStats } from "@runas/core/types/character"
import { normalizeSkillName } from "@runas/core/lib/skillCalculations"
import { exportAbilityList, parseAbilityListFile, type ImportedAbility } from "@/lib/abilityTransfer"
import { createPrefixedId } from "@runas/core/lib/ids"

const RichTextEditor = dynamic(
  () => import("@/components/ui/rich-text-editor").then((module) => module.RichTextEditor),
  { ssr: false, loading: () => <div className="mt-4 min-h-52 animate-pulse rounded-[18px] border border-input bg-muted/45" aria-label="Carregando editor" /> },
)

interface Props {
  characterName: string
  abilities: CharacterAbility[]
  stats: CharacterStats
  onAddAbility: (ability: CharacterAbility) => void
  onImportAbilities: (abilities: ImportedAbility[]) => void
  onAbilityChange: (id: string, updates: Partial<CharacterAbility>) => void
  onRemoveAbility: (id: string) => void
  onApplyCost: (costType: Exclude<AbilityCostType, "none" | "other">, amount: number) => void
}

interface AbilityFilters {
  hiddenCategories: Set<string>
  showFilters: boolean
}

interface CostDialogState {
  ability: CharacterAbility
  amount: string
  step: "amount" | "confirm"
}

const ABILITY_FILTER_STORAGE_KEY = "runas-tools:ability-filters"
const abilityCollator = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" })

const costOptions: { value: AbilityCostType; label: string }[] = [
  { value: "none", label: "Nenhum" },
  { value: "other", label: "Outro" },
  { value: "pv", label: "PV Atual" },
  { value: "pa", label: "PA Atual" },
  { value: "pe", label: "PE Atual" },
  { value: "paExtra", label: "PA Extra" },
  { value: "peTemporary", label: "PE Temporário" },
]

function categoryKey(value: string): string {
  return normalizeSkillName(value) || "__without_category__"
}

function loadFilters(): AbilityFilters {
  if (typeof window === "undefined") return { hiddenCategories: new Set(), showFilters: false }
  try {
    const saved = JSON.parse(window.localStorage.getItem(ABILITY_FILTER_STORAGE_KEY) ?? "null") as {
      hiddenCategories?: string[]
      showFilters?: boolean
    } | null
    return {
      hiddenCategories: new Set(saved?.hiddenCategories ?? []),
      showFilters: saved?.showFilters ?? false,
    }
  } catch {
    return { hiddenCategories: new Set(), showFilters: false }
  }
}

function createAbility(): CharacterAbility {
  const id = createPrefixedId("ability")
  return {
    id,
    category: "",
    name: "Nova habilidade",
    description: "",
    permanentModifiers: "",
    costType: "none",
    costMode: "fixed",
    costValue: 0,
    costText: "",
  }
}

function plainText(value: string): string {
  return value
    .replace(/<br\s*\/?\s*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()
}

function currentResource(stats: CharacterStats, costType: AbilityCostType): number {
  if (costType === "pv") return stats.pv
  if (costType === "pa") return stats.pa
  if (costType === "pe") return stats.pe
  if (costType === "paExtra") return stats.paExtra
  if (costType === "peTemporary") return stats.peTemporary
  return 0
}

function costLabel(costType: AbilityCostType): string {
  return costOptions.find((option) => option.value === costType)?.label ?? "Custo"
}

export function CharacterAbilities({ characterName, abilities, stats, onAddAbility, onImportAbilities, onAbilityChange, onRemoveAbility, onApplyCost }: Props) {
  const [initialFilters] = useState(loadFilters)
  const [hiddenCategories, setHiddenCategories] = useState(initialFilters.hiddenCategories)
  const [showFilters, setShowFilters] = useState(initialFilters.showFilters)
  const [editingAbility, setEditingAbility] = useState<CharacterAbility | null>(null)
  const [isNewAbility, setIsNewAbility] = useState(false)
  const [costDialog, setCostDialog] = useState<CostDialogState | null>(null)
  const [showImport, setShowImport] = useState(false)
  const [importedAbilities, setImportedAbilities] = useState<ImportedAbility[]>([])
  const [selectedAbilities, setSelectedAbilities] = useState<Set<number>>(() => new Set())
  const [previewAbility, setPreviewAbility] = useState<ImportedAbility | null>(null)
  const [importFilename, setImportFilename] = useState("")
  const [importError, setImportError] = useState<string | null>(null)
  const abilityFileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    try {
      window.localStorage.setItem(ABILITY_FILTER_STORAGE_KEY, JSON.stringify({
        hiddenCategories: [...hiddenCategories],
        showFilters,
      }))
    } catch {
      // Mantém os filtros durante a sessão quando o armazenamento falhar.
    }
  }, [hiddenCategories, showFilters])

  const categories = useMemo(() => {
    const byKey = new Map<string, string>()
    abilities.forEach((ability) => {
      const key = categoryKey(ability.category)
      if (!byKey.has(key)) byKey.set(key, ability.category.trim() || "Sem categoria")
    })
    return [...byKey].map(([key, label]) => ({ key, label }))
  }, [abilities])

  const visibleAbilities = useMemo(() => abilities
    .filter((ability) => !hiddenCategories.has(categoryKey(ability.category)))
    .sort((left, right) => (
      abilityCollator.compare(left.category || "Sem categoria", right.category || "Sem categoria") ||
      abilityCollator.compare(left.name, right.name)
    )), [abilities, hiddenCategories])

  function toggleCategory(key: string) {
    setHiddenCategories((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function openNewAbility() {
    setEditingAbility(createAbility())
    setIsNewAbility(true)
  }

  function openImport() {
    setImportedAbilities([])
    setSelectedAbilities(new Set())
    setPreviewAbility(null)
    setImportFilename("")
    setImportError(null)
    setShowImport(true)
  }

  async function loadAbilityFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setImportError(null)
    try {
      const imported = parseAbilityListFile(await file.text())
      setImportedAbilities(imported)
      setSelectedAbilities(new Set(imported.map((_, index) => index)))
      setImportFilename(file.name)
    } catch (error) {
      setImportedAbilities([])
      setSelectedAbilities(new Set())
      setImportFilename("")
      setImportError(error instanceof Error ? error.message : "Não foi possível ler a lista de habilidades.")
    } finally {
      event.target.value = ""
    }
  }

  function toggleImportedAbility(index: number) {
    setSelectedAbilities((current) => {
      const next = new Set(current)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  function confirmImport(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const selected = importedAbilities.filter((_, index) => selectedAbilities.has(index))
    if (selected.length === 0) return
    onImportAbilities(selected)
    setShowImport(false)
  }

  function saveAbility(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editingAbility) return
    const normalized = {
      ...editingAbility,
      category: editingAbility.category.trim().slice(0, 40),
      name: editingAbility.name.trim().slice(0, 80) || "Habilidade sem nome",
      costValue: Math.max(0, Math.trunc(editingAbility.costValue || 0)),
      costText: editingAbility.costText.slice(0, 50),
    }
    if (isNewAbility) onAddAbility(normalized)
    else onAbilityChange(normalized.id, normalized)
    setEditingAbility(null)
    setIsNewAbility(false)
  }

  function beginApplyCost(ability: CharacterAbility) {
    if (ability.costType === "none" || ability.costType === "other") return
    if (ability.costMode === "relative") {
      setCostDialog({ ability, amount: "", step: "amount" })
      return
    }
    const amount = Math.max(0, Math.trunc(ability.costValue))
    if (amount > currentResource(stats, ability.costType)) {
      setCostDialog({ ability, amount: String(amount), step: "confirm" })
      return
    }
    onApplyCost(ability.costType, amount)
  }

  function continueCost() {
    if (!costDialog || costDialog.ability.costType === "none" || costDialog.ability.costType === "other") return
    const amount = Math.max(0, Math.trunc(Number(costDialog.amount) || 0))
    if (costDialog.step === "amount" && amount > currentResource(stats, costDialog.ability.costType)) {
      setCostDialog({ ...costDialog, amount: String(amount), step: "confirm" })
      return
    }
    onApplyCost(costDialog.ability.costType, amount)
    setCostDialog(null)
  }

  return (
    <section aria-label="Habilidades do personagem" className="rounded-b-[22px] rounded-t-none border border-border bg-card p-2 shadow-sm sm:rounded-b-[27px] sm:p-7">
      <datalist id="ability-category-suggestions">
        {categories.filter((category) => category.key !== "__without_category__").map((category) => <option key={category.key} value={category.label} />)}
      </datalist>

      <div className="flex flex-col gap-3 border-b border-border px-0.5 pb-3 sm:flex-row sm:items-center sm:justify-end sm:px-0">
        <button type="button" onClick={() => exportAbilityList(abilities, characterName)} disabled={abilities.length === 0} title={abilities.length === 0 ? "Adicione uma habilidade antes de exportar" : "Exportar todas as habilidades"} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-input bg-background px-3 py-2 text-sm font-semibold text-muted-foreground transition hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40">
          <Download className="size-4" /> Exportar todas
        </button>
        <button type="button" onClick={openImport} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-input bg-background px-3 py-2 text-sm font-semibold text-muted-foreground transition hover:text-foreground">
          <Upload className="size-4" /> Importar lista
        </button>
        <button type="button" onClick={() => setShowFilters((current) => !current)} aria-expanded={showFilters} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-input bg-background px-3 py-2 text-sm font-semibold text-muted-foreground transition hover:text-foreground">
          <ListFilter className="size-4" /> Categorias
        </button>
        <button type="button" onClick={openNewAbility} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-secondary px-3 py-2 text-sm font-semibold text-secondary-foreground transition hover:bg-accent">
          <Plus className="size-4" /> Adicionar habilidade
        </button>
      </div>

      {showImport && createPortal((
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-3 backdrop-blur-[2px]" onMouseDown={(event) => { if (event.currentTarget === event.target) setShowImport(false) }}>
          <form onSubmit={confirmImport} role="dialog" aria-modal="true" aria-labelledby="ability-import-title" className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-4xl flex-col overflow-hidden rounded-[24px] border border-border bg-card shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-border p-4 sm:p-6">
              <div>
                <h2 id="ability-import-title" className="text-lg font-bold text-foreground">Importar habilidades</h2>
                <p className="mt-1 text-sm text-muted-foreground">Escolha uma lista e selecione somente as habilidades que deseja adicionar à ficha.</p>
              </div>
              <button type="button" onClick={() => setShowImport(false)} aria-label="Fechar importação de habilidades" className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-foreground"><X className="size-5" /></button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
              <input ref={abilityFileRef} type="file" accept="application/json,.json" onChange={loadAbilityFile} className="hidden" />
              <button type="button" onClick={() => abilityFileRef.current?.click()} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[18px] border border-dashed border-input bg-background/65 px-4 py-3 text-sm font-semibold text-muted-foreground transition hover:border-primary/55 hover:text-foreground">
                <Upload className="size-4" /> {importFilename ? "Escolher outro arquivo" : "Escolher arquivo de habilidades"}
              </button>
              {importFilename && <p className="mt-2 truncate text-xs text-muted-foreground">Arquivo: <strong>{importFilename}</strong></p>}

              {importedAbilities.length > 0 && (
                <div className="mt-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-foreground">{selectedAbilities.size} de {importedAbilities.length} selecionadas</p>
                    <div className="flex flex-wrap gap-1">
                      <button type="button" onClick={() => setSelectedAbilities(new Set(importedAbilities.map((_, index) => index)))} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-primary transition hover:bg-primary/10">Selecionar todas</button>
                      <button type="button" onClick={() => setSelectedAbilities(new Set())} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground">Limpar seleção</button>
                    </div>
                  </div>
                  <div className="mt-3 space-y-2">
                    {importedAbilities.map((ability, index) => {
                      const selected = selectedAbilities.has(index)
                      return (
                        <article key={`${ability.category}-${ability.name}-${index}`} className={`flex items-center gap-3 rounded-[18px] border p-3 transition ${selected ? "border-primary/45 bg-primary/5" : "border-border bg-background/45"}`}>
                          <input type="checkbox" checked={selected} onChange={() => toggleImportedAbility(index)} aria-label={`Selecionar ${ability.name}`} className="size-5 shrink-0 accent-primary" />
                          <div className="min-w-0 flex-1 text-left">
                            <button type="button" onClick={() => setPreviewAbility(ability)} className="block max-w-full truncate text-sm font-semibold text-foreground underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">{ability.name}</button>
                            <span className="block truncate text-xs text-muted-foreground">{ability.category || "Sem categoria"} · {plainText(ability.description) || "Sem descrição"}</span>
                          </div>
                        </article>
                      )
                    })}
                  </div>
                </div>
              )}

              {importError && <div role="alert" className="mt-3 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{importError}</div>}
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-border p-4 sm:flex-row sm:justify-end sm:px-6">
              <button type="button" onClick={() => setShowImport(false)} className="h-11 rounded-xl border border-input bg-background px-4 text-sm font-semibold text-muted-foreground">Cancelar</button>
              <button type="submit" disabled={selectedAbilities.size === 0} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40"><Upload className="size-4" /> Importar {selectedAbilities.size > 0 ? selectedAbilities.size : "selecionadas"}</button>
            </div>
          </form>
        </div>
      ), document.body)}

      {previewAbility && createPortal((
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/65 p-3 backdrop-blur-[2px]" onMouseDown={(event) => { if (event.currentTarget === event.target) setPreviewAbility(null) }}>
          <div role="dialog" aria-modal="true" aria-labelledby="ability-preview-title" className="max-h-[calc(100dvh-1.5rem)] w-full max-w-3xl overflow-y-auto rounded-[24px] border border-border bg-card p-4 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Visualização somente leitura</p><h2 id="ability-preview-title" className="mt-1 text-lg font-bold text-foreground">{previewAbility.name}</h2></div>
              <button type="button" onClick={() => setPreviewAbility(null)} aria-label="Fechar visualização da habilidade" className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-foreground"><X className="size-5" /></button>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-input bg-background/65 px-3 py-2"><span className="text-xs font-medium text-muted-foreground">Categoria</span><p className="mt-0.5 text-sm font-semibold text-foreground">{previewAbility.category || "Sem categoria"}</p></div>
              <div className="rounded-xl border border-input bg-background/65 px-3 py-2"><span className="text-xs font-medium text-muted-foreground">Nome</span><p className="mt-0.5 text-sm font-semibold text-foreground">{previewAbility.name}</p></div>
            </div>
            <RichTextEditor label="Descrição" value={previewAbility.description} onChange={() => undefined} maxLength={5000} readOnly className="mt-4" />
            <div className="mt-4 rounded-xl border border-input bg-background/65 px-3 py-2"><span className="text-xs font-medium text-muted-foreground">Modificadores permanentes</span><p className="mt-0.5 whitespace-pre-wrap text-sm text-foreground">{previewAbility.permanentModifiers || "Nenhum"}</p></div>
            <div className="mt-3 rounded-xl border border-input bg-background/65 px-3 py-2"><span className="text-xs font-medium text-muted-foreground">Custo</span><p className="mt-0.5 text-sm text-foreground">{previewAbility.costType === "none" ? "Nenhum" : previewAbility.costType === "other" ? previewAbility.costText || "Outro" : `${costLabel(previewAbility.costType)} · ${previewAbility.costMode === "fixed" ? `Fixo (${previewAbility.costValue})` : "Relativo"}`}</p></div>
            <div className="mt-5 flex justify-end"><button type="button" onClick={() => setPreviewAbility(null)} className="h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground">Voltar à seleção</button></div>
          </div>
        </div>
      ), document.body)}

      {showFilters && (
        <div className="mt-3 flex flex-wrap gap-2 rounded-xl border border-border bg-background/45 p-2" aria-label="Filtrar categorias de habilidades">
          {categories.length === 0
            ? <span className="px-2 py-1 text-xs text-muted-foreground">Crie uma habilidade para habilitar os filtros.</span>
            : categories.map((category) => {
                const visible = !hiddenCategories.has(category.key)
                return (
                  <button key={category.key} type="button" aria-pressed={visible} onClick={() => toggleCategory(category.key)} className={`inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition ${visible ? "border-primary/45 bg-primary/10 text-primary" : "border-border bg-muted text-muted-foreground"}`}>
                    {visible ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}{category.label}
                  </button>
                )
              })}
          {hiddenCategories.size > 0 && <button type="button" onClick={() => setHiddenCategories(new Set())} className="h-9 rounded-xl px-3 text-xs font-semibold text-muted-foreground transition hover:text-foreground">Mostrar todas</button>}
        </div>
      )}

      <div className="space-y-2 pt-3">
        <div className="hidden grid-cols-[minmax(6rem,.75fr)_minmax(7rem,1fr)_minmax(10rem,1.8fr)_2.75rem_2.75rem] gap-2 px-3 text-center text-[0.62rem] uppercase tracking-wide text-muted-foreground md:grid">
          <span>Categoria</span><span>Nome</span><span>Descrição</span><span>Custo</span><span />
        </div>
        {visibleAbilities.length === 0 && (
          <p className="rounded-[18px] border border-dashed border-border bg-background/35 px-4 py-10 text-center text-sm text-muted-foreground">
            {abilities.length === 0 ? "Nenhuma habilidade cadastrada." : "Nenhuma habilidade corresponde às categorias visíveis."}
          </p>
        )}
        {visibleAbilities.map((ability) => {
          const canApplyCost = ability.costType !== "none" && ability.costType !== "other"
          return (
            <article key={ability.id} className="virtualized-list-item grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2 rounded-[18px] border border-border bg-background/55 p-2 md:grid-cols-[minmax(6rem,.75fr)_minmax(7rem,1fr)_minmax(10rem,1.8fr)_2.75rem_2.75rem] md:items-center">
              <span className="truncate text-xs font-semibold text-muted-foreground md:px-2">{ability.category || "Sem categoria"}</span>
              <button type="button" onClick={() => { setEditingAbility({ ...ability }); setIsNewAbility(false) }} className="col-start-1 max-w-full truncate text-left text-sm font-bold text-foreground underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring md:col-start-auto md:px-2">{ability.name}</button>
              <p className="col-span-3 col-start-1 truncate text-xs text-muted-foreground md:col-span-1 md:col-start-auto md:px-2">{plainText(ability.description) || "Sem descrição"}</p>
              {canApplyCost
                ? <button type="button" onClick={() => beginApplyCost(ability)} title={`Aplicar custo: ${costLabel(ability.costType)}`} aria-label={`Aplicar custo de ${ability.name}`} className="col-start-2 row-start-1 inline-flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground transition hover:brightness-110 md:col-start-auto md:row-start-auto"><Bolt className="size-4" /></button>
                : <span className="hidden md:block" />}
              <button type="button" onClick={() => onRemoveAbility(ability.id)} aria-label={`Remover ${ability.name}`} className="col-start-3 row-start-1 inline-flex size-10 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive md:col-start-auto md:row-start-auto"><Trash2 className="size-4" /></button>
            </article>
          )
        })}
      </div>

      {editingAbility && createPortal((
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-3 backdrop-blur-[2px]" onMouseDown={(event) => { if (event.currentTarget === event.target) setEditingAbility(null) }}>
          <form onSubmit={saveAbility} role="dialog" aria-modal="true" aria-labelledby="ability-editor-title" className="max-h-[calc(100dvh-1.5rem)] w-full max-w-3xl overflow-y-auto rounded-[24px] border border-border bg-card p-4 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <h2 id="ability-editor-title" className="text-lg font-bold text-foreground">{isNewAbility ? "Nova habilidade" : "Editar habilidade"}</h2>
              <button type="button" onClick={() => setEditingAbility(null)} aria-label="Fechar editor de habilidade" className="inline-flex size-10 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-foreground"><X className="size-5" /></button>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-[.75fr_1.25fr]">
              <label><span className="mb-1.5 block text-sm font-medium text-muted-foreground">Categoria</span><input value={editingAbility.category} list="ability-category-suggestions" maxLength={40} onChange={(event) => setEditingAbility({ ...editingAbility, category: event.target.value })} className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/25" /></label>
              <label><span className="mb-1.5 block text-sm font-medium text-muted-foreground">Nome</span><input value={editingAbility.name} required maxLength={80} onChange={(event) => setEditingAbility({ ...editingAbility, name: event.target.value })} className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/25" /></label>
            </div>
            <RichTextEditor label="Descrição" value={editingAbility.description} onChange={(description) => setEditingAbility((current) => current ? { ...current, description } : current)} maxLength={5000} className="mt-4" />
            <label className="mt-4 block"><span className="mb-1.5 block text-sm font-medium text-muted-foreground">Modificadores Permanentes</span><input value={editingAbility.permanentModifiers} maxLength={500} onChange={(event) => setEditingAbility({ ...editingAbility, permanentModifiers: event.target.value })} placeholder="PV +2, Aura +2" className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/25" /><span className="mt-1.5 block text-xs leading-relaxed text-muted-foreground">Separe por vírgulas. Reconhece Vida/PV, Foco, Aura/PA, Energia/PE, PA Extra, PE Temporário, Deslocamento, Primeiras Impressões, Determinação, Casualidade e Carga.</span></label>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <label className="relative"><span className="mb-1.5 block text-sm font-medium text-muted-foreground">Custo</span><select value={editingAbility.costType} onChange={(event) => setEditingAbility({ ...editingAbility, costType: event.target.value as AbilityCostType })} className="h-11 w-full appearance-none rounded-xl border border-input bg-background px-3 pr-9 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/25">{costOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><ChevronDown className="pointer-events-none absolute bottom-3.5 right-3 size-4 text-muted-foreground" /></label>
              {editingAbility.costType === "other" && <label className="sm:col-span-2"><span className="mb-1.5 block text-sm font-medium text-muted-foreground">Descrição do custo</span><input value={editingAbility.costText} maxLength={50} onChange={(event) => setEditingAbility({ ...editingAbility, costText: event.target.value })} className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/25" /></label>}
              {editingAbility.costType !== "none" && editingAbility.costType !== "other" && <><label className="relative"><span className="mb-1.5 block text-sm font-medium text-muted-foreground">Aplicação</span><select value={editingAbility.costMode} onChange={(event) => setEditingAbility({ ...editingAbility, costMode: event.target.value as "fixed" | "relative" })} className="h-11 w-full appearance-none rounded-xl border border-input bg-background px-3 pr-9 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/25"><option value="fixed">Fixo</option><option value="relative">Relativo</option></select><ChevronDown className="pointer-events-none absolute bottom-3.5 right-3 size-4 text-muted-foreground" /></label>{editingAbility.costMode === "fixed" && <label><span className="mb-1.5 block text-sm font-medium text-muted-foreground">Valor fixo</span><input type="number" min={0} step={1} value={editingAbility.costValue} onChange={(event) => setEditingAbility({ ...editingAbility, costValue: Math.max(0, Math.trunc(Number(event.target.value) || 0)) })} className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/25" /></label>}</>}
            </div>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={() => setEditingAbility(null)} className="h-11 rounded-xl border border-input bg-background px-4 text-sm font-semibold text-muted-foreground">Cancelar</button><button type="submit" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"><Save className="size-4" /> Salvar habilidade</button></div>
          </form>
        </div>
      ), document.body)}

      {costDialog && createPortal((
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-3 backdrop-blur-[2px]">
          <div role="dialog" aria-modal="true" aria-labelledby="ability-cost-title" className="w-full max-w-md rounded-[24px] border border-border bg-card p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3"><div><h2 id="ability-cost-title" className="font-bold text-foreground">{costDialog.step === "amount" ? "Aplicar custo relativo" : "Confirmar custo"}</h2><p className="mt-1 text-sm text-muted-foreground">{costDialog.ability.name} · {costLabel(costDialog.ability.costType)}</p></div><button type="button" onClick={() => setCostDialog(null)} aria-label="Fechar aplicação de custo" className="inline-flex size-9 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted"><X className="size-5" /></button></div>
            {costDialog.step === "amount" ? <label className="mt-4 block"><span className="mb-1.5 block text-sm font-medium text-muted-foreground">Valor a descontar</span><input autoFocus type="number" min={0} step={1} value={costDialog.amount} onChange={(event) => setCostDialog({ ...costDialog, amount: event.target.value })} className="h-12 w-full rounded-xl border border-input bg-background px-3 text-base outline-none focus:border-ring focus:ring-2 focus:ring-ring/25" /></label> : <p className="mt-4 rounded-xl border border-destructive/35 bg-destructive/10 p-3 text-sm leading-relaxed text-destructive">O custo de {Math.max(0, Math.trunc(Number(costDialog.amount) || 0))} é maior que o valor atual ({currentResource(stats, costDialog.ability.costType)}). Tem certeza de que deseja continuar?</p>}
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={() => setCostDialog(null)} className="h-11 rounded-xl border border-input bg-background px-4 text-sm font-semibold text-muted-foreground">Cancelar</button><button type="button" onClick={continueCost} disabled={costDialog.step === "amount" && !(Number(costDialog.amount) >= 0)} className="h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-40">{costDialog.step === "amount" ? "Aplicar custo" : "Sim, continuar"}</button></div>
          </div>
        </div>
      ), document.body)}
    </section>
  )
}
