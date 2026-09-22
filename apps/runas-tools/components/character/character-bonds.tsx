"use client"

import { useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { useRouter } from "next/navigation"
import { ArrowDown, ArrowUp, ChevronsUpDown, Eye, EyeOff, Handshake, ListFilter, ListPlus, Plus, Trash2, X } from "lucide-react"
import type { CharacterAttributes, CharacterBond, CharacterStats } from "@runas/core/types/character"
import { calculateBondQuality, calculateBondTest, formatSigned } from "@runas/core/lib/bondCalculations"
import { parseBondImport, type ImportedBond } from "@/lib/bondImport"
import { normalizeSkillName } from "@runas/core/lib/skillCalculations"
import { SkillIntegerInput } from "@/components/skill-test/skill-integer-input"
import { useCharacterPanel } from "./character-panel"
import { createId, createPrefixedId } from "@runas/core/lib/ids"

interface Props {
  attributes: CharacterAttributes
  stats: CharacterStats
  bonds: CharacterBond[]
  onBondChange: (id: string, updates: Partial<CharacterBond>) => void
  onAddBond: (bond: CharacterBond) => void
  onImportBonds: (bonds: ImportedBond[]) => void
  onRemoveBond: (id: string) => void
}

type BondSortKey = "category" | "name" | "test" | "quality" | "level" | "points" | "modifier"
type BondSortState = { key: BondSortKey; direction: "asc" | "desc" } | null

const sortFields: { key: BondSortKey; label: string }[] = [
  { key: "category", label: "Categoria" },
  { key: "name", label: "Nome" },
  { key: "test", label: "Teste" },
  { key: "quality", label: "Qualidade" },
  { key: "level", label: "Nível" },
  { key: "points", label: "Pontos" },
  { key: "modifier", label: "Mod." },
]

const bondCollator = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" })
const BOND_FILTER_STORAGE_KEY = "runas-tools:bond-filters"

function loadBondFilters(): { sortState: BondSortState; hiddenCategories: Set<string>; showFilters: boolean } {
  if (typeof window === "undefined") return { sortState: null, hiddenCategories: new Set(), showFilters: false }
  try {
    const saved = JSON.parse(window.localStorage.getItem(BOND_FILTER_STORAGE_KEY) ?? "null") as {
      sortState?: BondSortState
      hiddenCategories?: string[]
      showFilters?: boolean
    } | null
    return {
      sortState: saved?.sortState ?? null,
      hiddenCategories: new Set(saved?.hiddenCategories ?? []),
      showFilters: saved?.showFilters ?? false,
    }
  } catch {
    return { sortState: null, hiddenCategories: new Set(), showFilters: false }
  }
}

function categoryKey(value: string): string {
  return normalizeSkillName(value) || "__without_category__"
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="mb-1 block text-[0.6rem] font-medium uppercase tracking-normal text-muted-foreground md:text-[0.62rem] md:tracking-wide">{children}</span>
}

function SortButton({
  field,
  sortState,
  onSort,
  compact = false,
}: {
  field: { key: BondSortKey; label: string }
  sortState: BondSortState
  onSort: (key: BondSortKey) => void
  compact?: boolean
}) {
  const isActive = sortState?.key === field.key
  const nextAction = !isActive
    ? "ordem crescente"
    : sortState.direction === "asc"
      ? "ordem decrescente"
      : "ordem padrão"
  const Icon = !isActive ? ChevronsUpDown : sortState.direction === "asc" ? ArrowUp : ArrowDown

  return (
    <button
      type="button"
      onClick={() => onSort(field.key)}
      title={`${field.label}: ${nextAction}`}
      aria-label={`Organizar por ${field.label}; próximo clique: ${nextAction}`}
      className={compact
        ? `inline-flex h-8 shrink-0 items-center justify-center gap-1 rounded-lg border px-2 text-[0.68rem] font-semibold transition ${isActive ? "border-primary/50 bg-primary/10 text-primary" : "border-border bg-background/55 text-muted-foreground hover:text-foreground"}`
        : `inline-flex w-full items-center justify-center gap-1 rounded-md px-1 py-1 transition hover:bg-background/70 hover:text-foreground ${isActive ? "text-primary" : ""}`}
    >
      <span>{field.label}</span>
      <Icon className="size-3 shrink-0" aria-hidden="true" />
    </button>
  )
}

export function CharacterBonds({ attributes, stats, bonds, onBondChange, onAddBond, onImportBonds, onRemoveBond }: Props) {
  const router = useRouter()
  const { close } = useCharacterPanel()
  const [initialFilters] = useState(loadBondFilters)
  const [sortState, setSortState] = useState<BondSortState>(initialFilters.sortState)
  const [hiddenCategories, setHiddenCategories] = useState<Set<string>>(initialFilters.hiddenCategories)
  const [showFilters, setShowFilters] = useState(initialFilters.showFilters)
  const [showImport, setShowImport] = useState(false)
  const [importText, setImportText] = useState("")
  const [importErrors, setImportErrors] = useState<string[]>([])

  useEffect(() => {
    try {
      window.localStorage.setItem(BOND_FILTER_STORAGE_KEY, JSON.stringify({
        sortState,
        hiddenCategories: [...hiddenCategories],
        showFilters,
      }))
    } catch {
      // Os filtros continuam funcionando durante a sessão se o armazenamento falhar.
    }
  }, [hiddenCategories, showFilters, sortState])

  const categories = useMemo(() => {
    const byKey = new Map<string, string>()
    bonds.forEach((bond) => {
      const key = categoryKey(bond.category)
      if (!byKey.has(key)) byKey.set(key, bond.category.trim() || "Sem categoria")
    })
    return [...byKey].map(([key, label]) => ({ key, label }))
  }, [bonds])

  const visibleBonds = useMemo(() => {
    const filtered = bonds.filter((bond) => !hiddenCategories.has(categoryKey(bond.category)))
    if (!sortState) return filtered
    const valueFor = (bond: CharacterBond): string | number => {
      const quality = calculateBondQuality(bond.points)
      if (sortState.key === "category") return bond.category || "Sem categoria"
      if (sortState.key === "name") return bond.name
      if (sortState.key === "test") return calculateBondTest(attributes, stats, bond)
      if (sortState.key === "quality") return quality.level
      if (sortState.key === "level") return quality.level
      if (sortState.key === "points") return bond.points
      return bond.modifier
    }
    const direction = sortState.direction === "asc" ? 1 : -1
    return [...filtered].sort((left, right) => {
      const leftValue = valueFor(left)
      const rightValue = valueFor(right)
      const comparison = typeof leftValue === "string" && typeof rightValue === "string"
        ? bondCollator.compare(leftValue, rightValue)
        : Number(leftValue) - Number(rightValue)
      return comparison * direction
    })
  }, [attributes, bonds, hiddenCategories, sortState, stats])

  function toggleSort(key: BondSortKey) {
    setSortState((current) => {
      if (!current || current.key !== key) return { key, direction: "asc" }
      if (current.direction === "asc") return { key, direction: "desc" }
      return null
    })
  }

  function toggleCategory(key: string) {
    setHiddenCategories((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function addBond() {
    const id = createPrefixedId("bond")
    onAddBond({ id, category: "", name: "Novo vínculo", points: 0, modifier: 0 })
  }

  function openBondCalculator(bond: CharacterBond) {
    close()
    const rollToken = createId()
    router.push(`/calculadora-testes?bond=${encodeURIComponent(bond.id)}&roll=${encodeURIComponent(rollToken)}`)
  }

  function importBondList(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const result = parseBondImport(importText)
    if (result.errors.length > 0) {
      setImportErrors(result.errors)
      return
    }
    if (result.bonds.length === 0) {
      setImportErrors(["Informe ao menos um vínculo para importar."])
      return
    }
    onImportBonds(result.bonds)
    setImportText("")
    setImportErrors([])
    setShowImport(false)
  }

  return (
    <section aria-label="Vínculos do personagem" className="rounded-b-[22px] rounded-t-none border border-border bg-card p-2 shadow-sm sm:rounded-b-[27px] sm:p-7">
      <datalist id="bond-category-suggestions">
        {categories.filter((category) => category.key !== "__without_category__").map((category) => <option key={category.key} value={category.label} />)}
      </datalist>

        <div className="flex flex-col gap-3 border-b border-border px-0.5 pb-3 sm:px-0">
          <div className="flex flex-col gap-2 min-[520px]:flex-row min-[520px]:items-center min-[520px]:justify-between">
            <div className="grid grid-cols-3 gap-1.5 sm:ml-auto sm:gap-2">
              <button type="button" onClick={() => setShowFilters((current) => !current)} aria-expanded={showFilters} className="inline-flex min-h-10 min-w-0 items-center justify-center gap-1.5 rounded-xl border border-input bg-background px-1.5 py-2 text-xs font-semibold text-muted-foreground transition hover:text-foreground sm:gap-2 sm:px-3 sm:text-sm">
                <ListFilter className="size-4" /> Categorias
              </button>
              <button type="button" onClick={() => setShowImport(true)} aria-label="Adicionar lista de vínculos" className="inline-flex min-h-10 min-w-0 items-center justify-center gap-1.5 rounded-xl border border-input bg-background px-1.5 py-2 text-xs font-semibold text-muted-foreground transition hover:text-foreground sm:gap-2 sm:px-3 sm:text-sm">
                <ListPlus className="size-4" /> <span className="sm:hidden">Importar</span><span className="hidden sm:inline">Adicionar lista</span>
              </button>
              <button type="button" onClick={addBond} aria-label="Adicionar vínculo" className="inline-flex min-h-10 min-w-0 items-center justify-center gap-1.5 rounded-xl bg-secondary px-1.5 py-2 text-xs font-semibold text-secondary-foreground transition hover:bg-accent sm:gap-2 sm:px-3 sm:text-sm">
                <Plus className="size-4" /> <span className="sm:hidden">Novo</span><span className="hidden sm:inline">Adicionar vínculo</span>
              </button>
            </div>
          </div>

          {showFilters && (
            <div className="flex flex-wrap gap-2 rounded-xl border border-border bg-background/45 p-2" aria-label="Filtrar categorias de vínculos">
              {categories.length === 0
                ? <span className="px-2 py-1 text-xs text-muted-foreground">Crie uma categoria para habilitar os filtros.</span>
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
        </div>

        <div className="space-y-2 pt-3">
          <div className="flex flex-wrap gap-1 rounded-xl border border-border bg-muted/30 p-1.5 md:hidden" aria-label="Organizar vínculos">
            {sortFields.map((field) => <SortButton key={field.key} field={field} sortState={sortState} onSort={toggleSort} compact />)}
          </div>
          <div className="hidden grid-cols-[2.5rem_minmax(7.5rem,.9fr)_minmax(5.5rem,1fr)_3.5rem_minmax(6.5rem,.9fr)_3.25rem_3.5rem_3.5rem_2.25rem] gap-1.5 px-2 text-center text-[0.62rem] uppercase tracking-wide text-muted-foreground md:grid">
            <span>Ação</span>
            {sortFields.map((field) => (
              <span key={field.key} role="columnheader" aria-sort={sortState?.key === field.key ? (sortState.direction === "asc" ? "ascending" : "descending") : "none"}>
                <SortButton field={field} sortState={sortState} onSort={toggleSort} />
              </span>
            ))}
            <span />
          </div>

          {visibleBonds.length === 0 && (
            <p className="rounded-[18px] border border-dashed border-border bg-background/35 px-4 py-8 text-center text-sm text-muted-foreground">
              {bonds.length === 0 ? "Nenhum vínculo cadastrado." : "Nenhum vínculo corresponde às categorias visíveis."}
            </p>
          )}

          {visibleBonds.map((bond) => {
            const quality = calculateBondQuality(bond.points)
            const test = calculateBondTest(attributes, stats, bond)
            return (
              <div key={bond.id} className="virtualized-list-item grid grid-cols-12 items-end gap-x-1.5 gap-y-2 rounded-[16px] border border-border bg-background/55 p-2 md:grid-cols-[2.5rem_minmax(7.5rem,.9fr)_minmax(5.5rem,1fr)_3.5rem_minmax(6.5rem,.9fr)_3.25rem_3.5rem_3.5rem_2.25rem] md:items-center md:gap-1.5 md:rounded-[18px]">
                <button type="button" onClick={() => openBondCalculator(bond)} aria-label={`Testar Primeiras Impressões com ${bond.name}`} title={`Testar vínculo com ${bond.name}`} className="col-span-2 inline-flex size-9 items-center justify-center self-end justify-self-start rounded-xl bg-primary text-primary-foreground transition hover:brightness-110 md:col-auto md:size-10">
                  <Handshake className="size-4.5" />
                </button>
                <label className="col-span-4 min-w-0 md:col-auto">
                  <FieldLabel>Categoria</FieldLabel>
                  <input type="text" value={bond.category} list="bond-category-suggestions" maxLength={30} onChange={(event) => onBondChange(bond.id, { category: event.target.value.slice(0, 30) })} aria-label={`Categoria de ${bond.name}`} className="h-9 w-full min-w-0 rounded-xl border border-input bg-background/65 px-2 text-xs text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/25 md:h-10 md:text-[0.8rem]" />
                </label>
                <label className="col-span-4 min-w-0 md:col-auto">
                  <FieldLabel>Nome</FieldLabel>
                  <input type="text" value={bond.name} maxLength={50} onChange={(event) => onBondChange(bond.id, { name: event.target.value.slice(0, 50) })} aria-label="Nome do vínculo" className="h-9 w-full min-w-0 rounded-xl border border-input bg-background/65 px-2 text-xs text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/25 md:h-10 md:px-3 md:text-sm" />
                </label>
                <button type="button" onClick={() => onRemoveBond(bond.id)} aria-label={`Remover vínculo ${bond.name}`} className="col-span-2 inline-flex size-9 items-center justify-center self-end justify-self-end rounded-xl text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive md:col-auto md:col-start-9 md:row-start-1 md:size-10">
                  <Trash2 className="size-4" />
                </button>
                <label className="col-span-2 min-w-0 text-center md:col-auto md:col-start-4">
                  <FieldLabel>Teste</FieldLabel>
                  <SkillIntegerInput value={test} label={`Teste de vínculo com ${bond.name}`} readOnly className="h-9 w-full px-1 font-semibold md:h-10" />
                </label>
                <label className="col-span-4 min-w-0 text-center md:col-auto">
                  <FieldLabel>Qualidade</FieldLabel>
                  <output aria-label={`Qualidade do vínculo com ${bond.name}: ${quality.name}`} title={quality.name} className="flex h-9 w-full min-w-0 items-center justify-center truncate rounded-xl border border-input bg-background/65 px-1 text-[0.7rem] font-semibold text-muted-foreground min-[360px]:text-xs md:h-10 md:px-2 md:text-sm">{quality.name}</output>
                </label>
                <label className="col-span-2 min-w-0 text-center md:col-auto">
                  <FieldLabel>Nível</FieldLabel>
                  <output aria-label={`Nível do vínculo com ${bond.name}: ${formatSigned(quality.level)}`} className="flex h-9 w-full items-center justify-center rounded-xl border border-input bg-background/65 text-sm font-semibold text-muted-foreground md:h-10">{formatSigned(quality.level)}</output>
                </label>
                <label className="col-span-2 min-w-0 text-center md:col-auto">
                  <FieldLabel>Pontos</FieldLabel>
                  <SkillIntegerInput value={bond.points} onChange={(points) => onBondChange(bond.id, { points })} label={`Pontos do vínculo com ${bond.name}`} className="h-9 w-full px-1 md:h-10" />
                </label>
                <label className="col-span-2 min-w-0 text-center md:col-auto">
                  <FieldLabel>Mod.</FieldLabel>
                  <SkillIntegerInput value={bond.modifier} onChange={(modifier) => onBondChange(bond.id, { modifier })} label={`Modificador do vínculo com ${bond.name}`} className="h-9 w-full px-1 md:h-10" />
                </label>
              </div>
            )
          })}
        </div>

      {showImport && createPortal((
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-3 backdrop-blur-[2px]" onMouseDown={(event) => {
          if (event.currentTarget === event.target) setShowImport(false)
        }}>
          <form onSubmit={importBondList} role="dialog" aria-modal="true" aria-labelledby="bond-import-title" className="max-h-[min(46rem,calc(100dvh-1.5rem))] w-full max-w-2xl overflow-y-auto rounded-[24px] border border-border bg-card p-4 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="bond-import-title" className="text-base font-bold text-foreground">Adicionar lista de vínculos</h2>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">Uma linha por vínculo. Qualidade e Nível são recalculados pelos pontos.</p>
              </div>
              <button type="button" onClick={() => setShowImport(false)} aria-label="Fechar importação de vínculos" className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-foreground"><X className="size-5" /></button>
            </div>
            <label className="mt-4 block">
              <span className="mb-1.5 block text-sm font-medium text-muted-foreground">Lista de vínculos</span>
              <textarea value={importText} onChange={(event) => { setImportText(event.target.value); if (importErrors.length > 0) setImportErrors([]) }} rows={10} autoFocus placeholder={"Void | Apreço | +2 | 12\nDrakur | Indiferença | +0 | 3\nVox | Desconfiança | -1 | -3"} className="min-h-56 w-full resize-y rounded-[18px] border border-input bg-background p-3 font-mono text-sm leading-relaxed text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/25" />
            </label>
            <div className="mt-3 rounded-xl bg-muted/45 px-3 py-2 text-xs leading-relaxed text-muted-foreground">Aceita colunas separadas por <strong>|</strong>, tabulação ou espaços. Vínculos existentes são atualizados pelo nome, sem duplicação.</div>
            {importErrors.length > 0 && <div role="alert" className="mt-3 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{importErrors.map((error) => <p key={error}>{error}</p>)}</div>}
            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setShowImport(false)} className="inline-flex h-11 items-center justify-center rounded-xl border border-input bg-background px-4 text-sm font-semibold text-muted-foreground transition hover:text-foreground">Cancelar</button>
              <button type="submit" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:brightness-110"><ListPlus className="size-4" /> Importar lista</button>
            </div>
          </form>
        </div>
      ), document.body)}
    </section>
  )
}
