"use client"

import { useEffect, useState } from "react"
import { ArrowDownUp, Check, Download, ListFilter, Plus, Search, Square, SquareCheck, Upload, X } from "lucide-react"

/**
 * Cabeçalho padrão das seções da ficha: busca, um botão que abre filtros e
 * organizadores, o `+` de adicionar e o botão de importar/exportar.
 *
 * As seis seções — Perícias, Vínculos, Habilidades, Inventário, Magias e
 * Anotações — usam este mesmo componente para que o comportamento seja
 * idêntico: mesma posição, mesmos atalhos, mesma memória entre sessões.
 */

export interface ToolbarCategory {
  key: string
  label: string
}

export interface ToolbarSort {
  value: string
  label: string
}

interface Props {
  /** Nome da coleção em minúsculas, para rótulos: "itens", "magias". */
  label: string
  query: string
  onQueryChange: (value: string) => void
  categories: ToolbarCategory[]
  hiddenCategories: Set<string>
  onHiddenCategoriesChange: (next: Set<string>) => void
  sorts: ToolbarSort[]
  sort: string
  onSortChange: (value: string) => void
  /** Ausente quando a seção não cria registros direto pela lista. */
  onAdd?: () => void
  addLabel?: string
  /** Ausente quando a seção não tem importação nem exportação. */
  onTransfer?: () => void
  transferLabel?: string
}

export function SectionToolbar({ label, query, onQueryChange, categories, hiddenCategories, onHiddenCategoriesChange, sorts, sort, onSortChange, onAdd, addLabel, onTransfer, transferLabel }: Props) {
  const [open, setOpen] = useState(false)
  const activeFilters = categories.filter((category) => hiddenCategories.has(category.key)).length
  const nonDefaultSort = sorts.length > 0 && sort !== sorts[0]?.value
  const marked = activeFilters > 0 || nonDefaultSort

  function toggle(key: string) {
    const next = new Set(hiddenCategories)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    onHiddenCategoriesChange(next)
  }

  return (
    <div className="border-b border-border pb-3">
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={`Buscar em ${label}`}
            aria-label={`Buscar em ${label}`}
            className="h-10 w-full rounded-xl border border-input bg-background pl-9 pr-3 text-sm text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/25"
          />
        </div>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-label={`Filtros e organizadores de ${label}`}
          title="Filtros e organizadores"
          className={`relative grid size-10 shrink-0 place-items-center rounded-xl border transition ${open ? "border-ring bg-accent text-foreground" : "border-input bg-background text-muted-foreground hover:text-foreground"}`}
        >
          <ListFilter className="size-4" />
          {marked && <span aria-hidden="true" className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-primary" />}
        </button>
        {onAdd && (
          <button
            type="button"
            onClick={onAdd}
            aria-label={addLabel ?? `Adicionar em ${label}`}
            title={addLabel ?? `Adicionar em ${label}`}
            className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-secondary-foreground transition hover:bg-accent"
          >
            <Plus className="size-4" />
          </button>
        )}
        {onTransfer && (
          <button
            type="button"
            onClick={onTransfer}
            aria-label={transferLabel ?? `Importar ou exportar ${label}`}
            title={transferLabel ?? `Importar ou exportar ${label}`}
            className="grid size-10 shrink-0 place-items-center rounded-xl border border-input bg-background text-muted-foreground transition hover:text-foreground"
          >
            <ArrowDownUp className="size-4" />
          </button>
        )}
      </div>

      {open && (
        <div className="mt-3 grid gap-3 rounded-[18px] border border-border bg-background/45 p-3">
          {sorts.length > 0 && (
            <label className="grid gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Organizar por</span>
              <select
                value={sort}
                onChange={(event) => onSortChange(event.target.value)}
                className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm font-medium text-foreground outline-none focus:border-ring"
              >
                {sorts.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          )}

          <div className="grid gap-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Categorias</span>
              {categories.length > 0 && (
                <div className="flex gap-1">
                  <button type="button" onClick={() => onHiddenCategoriesChange(new Set())} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-primary transition hover:bg-primary/10">
                    <SquareCheck className="size-3.5" /> Selecionar tudo
                  </button>
                  <button type="button" onClick={() => onHiddenCategoriesChange(new Set(categories.map((category) => category.key)))} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground">
                    <Square className="size-3.5" /> Limpar
                  </button>
                </div>
              )}
            </div>
            {categories.length === 0
              ? <span className="text-xs text-muted-foreground">Nada em {label} ainda para filtrar.</span>
              : <div className="flex flex-wrap gap-1.5">
                  {categories.map((category) => {
                    const visible = !hiddenCategories.has(category.key)
                    return (
                      <button
                        key={category.key}
                        type="button"
                        onClick={() => toggle(category.key)}
                        aria-pressed={visible}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-semibold transition ${visible ? "border-primary/45 bg-primary/10 text-foreground" : "border-border bg-background text-muted-foreground"}`}
                      >
                        {visible ? <Check className="size-3" /> : <X className="size-3" />}
                        {category.label}
                      </button>
                    )
                  })}
                </div>}
          </div>
        </div>
      )}
    </div>
  )
}

interface ToolbarState {
  query: string
  setQuery: (value: string) => void
  hiddenCategories: Set<string>
  setHiddenCategories: (next: Set<string>) => void
  sort: string
  setSort: (value: string) => void
}

/**
 * Estado do cabeçalho, lembrado entre sessões. A busca não é guardada de
 * propósito: abrir a ficha com um filtro de texto ativo esconderia registros
 * sem explicação.
 */
export function useSectionToolbar(storageKey: string, defaultSort: string): ToolbarState {
  const [query, setQuery] = useState("")
  const [initial] = useState(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(storageKey) ?? "null") as { hiddenCategories?: string[]; sort?: string } | null
      return { hiddenCategories: new Set(saved?.hiddenCategories ?? []), sort: saved?.sort ?? defaultSort }
    } catch {
      return { hiddenCategories: new Set<string>(), sort: defaultSort }
    }
  })
  const [hiddenCategories, setHiddenCategories] = useState(initial.hiddenCategories)
  const [sort, setSort] = useState(initial.sort)

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({ hiddenCategories: [...hiddenCategories], sort }))
    } catch {
      // Sem armazenamento, os filtros valem só para esta sessão.
    }
  }, [storageKey, hiddenCategories, sort])

  return { query, setQuery, hiddenCategories, setHiddenCategories, sort, setSort }
}

/** Comparador de texto em português, reaproveitado pelos organizadores A-Z. */
export const toolbarCollator = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" })

/** Normaliza para busca: sem acento, sem caixa. */
export function searchable(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("pt-BR")
}

/** A busca casa quando todos os termos aparecem em algum dos campos. */
export function matchesQuery(query: string, ...fields: (string | undefined | null)[]): boolean {
  const terms = searchable(query).split(/\s+/).filter(Boolean)
  if (terms.length === 0) return true
  const haystack = searchable(fields.filter(Boolean).join(" "))
  return terms.every((term) => haystack.includes(term))
}

/** Lista de categorias única e ordenada, a partir do campo de cada registro. */
export function toolbarCategories<T>(items: T[], categoryOf: (item: T) => string, emptyLabel = "Sem categoria"): ToolbarCategory[] {
  const byKey = new Map<string, string>()
  for (const item of items) {
    const raw = (categoryOf(item) ?? "").trim()
    const key = raw ? searchable(raw) : "__sem_categoria__"
    if (!byKey.has(key)) byKey.set(key, raw || emptyLabel)
  }
  return [...byKey].map(([key, label]) => ({ key, label })).sort((left, right) => toolbarCollator.compare(left.label, right.label))
}

/** Chave da categoria de um registro, na mesma convenção de `toolbarCategories`. */
export function categoryKeyOf(value: string): string {
  const raw = (value ?? "").trim()
  return raw ? searchable(raw) : "__sem_categoria__"
}

/**
 * Janela do botão de importar/exportar. As seções deixaram de espalhar esses
 * comandos pelo corpo da página: eles moram aqui, atrás de um único botão.
 */
export function SectionTransferDialog({ label, onClose, onExport, exportDisabled, exportHint, onImport, importHint }: {
  label: string
  onClose: () => void
  onExport?: () => void
  exportDisabled?: boolean
  exportHint?: string
  onImport?: () => void
  importHint?: string
}) {
  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-black/55 p-4" role="presentation" onMouseDown={onClose}>
      <section role="dialog" aria-modal="true" aria-label={`Importar ou exportar ${label}`} onMouseDown={(event) => event.stopPropagation()} className="w-full max-w-md rounded-[22px] border border-border bg-card p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-foreground">Importar ou exportar</h2>
            <p className="mt-1 text-sm text-muted-foreground">Mova {label} entre fichas por arquivo.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="grid size-9 place-items-center rounded-xl text-muted-foreground hover:bg-muted"><X className="size-5" /></button>
        </div>
        <div className="mt-4 grid gap-2">
          {onExport && (
            <button type="button" onClick={() => { onExport(); onClose() }} disabled={exportDisabled} className="flex items-center gap-3 rounded-[16px] border border-border bg-background/55 p-3 text-left transition hover:border-primary/45 disabled:opacity-40">
              <Download className="size-5 shrink-0 text-muted-foreground" />
              <span className="min-w-0"><strong className="block text-sm text-foreground">Exportar {label}</strong><span className="block text-xs text-muted-foreground">{exportHint ?? "Baixa a lista desta ficha."}</span></span>
            </button>
          )}
          {onImport && (
            <button type="button" onClick={() => { onImport(); onClose() }} className="flex items-center gap-3 rounded-[16px] border border-border bg-background/55 p-3 text-left transition hover:border-primary/45">
              <Upload className="size-5 shrink-0 text-muted-foreground" />
              <span className="min-w-0"><strong className="block text-sm text-foreground">Importar {label}</strong><span className="block text-xs text-muted-foreground">{importHint ?? "Escolhe uma lista e seleciona o que entra."}</span></span>
            </button>
          )}
        </div>
      </section>
    </div>
  )
}
