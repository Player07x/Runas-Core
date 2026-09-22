"use client"

import { useMemo, useState } from "react"
import { ListFilter, Search } from "lucide-react"

/**
 * Cabeçalho das seções da ficha avançada: busca, filtros por categoria e
 * organizadores.
 *
 * Existe para manter a paridade com o Runas Tools, onde as seis seções da
 * ficha usam o mesmo cabeçalho. Aqui muda só o tema; a organização é a mesma.
 * Importar e exportar não aparecem: no Runas DM eles são do painel, não da
 * seção.
 */

export interface AdvancedCategory {
  key: string
  label: string
}

export interface AdvancedSort {
  value: string
  label: string
}

export const advancedCollator = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" })

function searchable(value: string): string {
  return (value ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("pt-BR")
}

/** A busca casa quando todos os termos aparecem em algum dos campos. */
export function advancedMatches(query: string, ...fields: (string | undefined | null)[]): boolean {
  const terms = searchable(query).split(/\s+/).filter(Boolean)
  if (terms.length === 0) return true
  const haystack = searchable(fields.filter(Boolean).join(" "))
  return terms.every((term) => haystack.includes(term))
}

/** Chave da categoria de um registro; vazio vira "sem categoria". */
export function advancedCategoryKey(value: string): string {
  const raw = (value ?? "").trim()
  return raw ? searchable(raw) : "__sem_categoria__"
}

/** Categorias únicas e ordenadas a partir do campo de cada registro. */
export function advancedCategories<T>(items: T[], categoryOf: (item: T) => string): AdvancedCategory[] {
  const byKey = new Map<string, string>()
  for (const item of items) {
    const raw = (categoryOf(item) ?? "").trim()
    byKey.set(advancedCategoryKey(raw), raw || "Sem categoria")
  }
  return [...byKey].map(([key, label]) => ({ key, label })).sort((left, right) => advancedCollator.compare(left.label, right.label))
}

export interface AdvancedToolbarState {
  query: string
  setQuery: (value: string) => void
  hidden: Set<string>
  setHidden: (next: Set<string>) => void
  sort: string
  setSort: (value: string) => void
}

export function useAdvancedToolbar(defaultSort: string): AdvancedToolbarState {
  const [query, setQuery] = useState("")
  const [hidden, setHidden] = useState<Set<string>>(() => new Set())
  const [sort, setSort] = useState(defaultSort)
  return { query, setQuery, hidden, setHidden, sort, setSort }
}

interface Props {
  label: string
  state: AdvancedToolbarState
  categories: AdvancedCategory[]
  sorts: AdvancedSort[]
}

export function AdvancedSectionToolbar({ label, state, categories, sorts }: Props) {
  const [open, setOpen] = useState(false)
  const marcado = useMemo(
    () => categories.some((category) => state.hidden.has(category.key)) || (sorts.length > 0 && state.sort !== sorts[0]?.value),
    [categories, sorts, state.hidden, state.sort],
  )

  function toggle(key: string) {
    const next = new Set(state.hidden)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    state.setHidden(next)
  }

  return (
    <div className="advanced-toolbar">
      <div className="advanced-toolbar-row">
        <label className="advanced-search">
          <Search size={15} aria-hidden="true" />
          <input
            type="search"
            value={state.query}
            onChange={(event) => state.setQuery(event.target.value)}
            placeholder={`Buscar em ${label}`}
            aria-label={`Buscar em ${label}`}
          />
        </label>
        <button
          type="button"
          className={`advanced-filter-button${open ? " active" : ""}${marcado ? " marked" : ""}`}
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-label={`Filtros e organizadores de ${label}`}
          title="Filtros e organizadores"
        >
          <ListFilter size={15} />
        </button>
      </div>

      {open && (
        <div className="advanced-filter-panel">
          {sorts.length > 0 && (
            <label>
              <span>Organizar por</span>
              <select value={state.sort} onChange={(event) => state.setSort(event.target.value)}>
                {sorts.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          )}
          <div className="advanced-filter-categories">
            <div className="advanced-filter-heading">
              <span>Categorias</span>
              {categories.length > 0 && (
                <div>
                  <button type="button" onClick={() => state.setHidden(new Set())}>Selecionar tudo</button>
                  <button type="button" onClick={() => state.setHidden(new Set(categories.map((category) => category.key)))}>Limpar</button>
                </div>
              )}
            </div>
            {categories.length === 0
              ? <small>Nada em {label} ainda para filtrar.</small>
              : <div className="advanced-filter-chips">
                  {categories.map((category) => (
                    <button
                      key={category.key}
                      type="button"
                      className={state.hidden.has(category.key) ? "" : "on"}
                      aria-pressed={!state.hidden.has(category.key)}
                      onClick={() => toggle(category.key)}
                    >
                      {category.label}
                    </button>
                  ))}
                </div>}
          </div>
        </div>
      )}
    </div>
  )
}
