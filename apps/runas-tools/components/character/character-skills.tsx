"use client"

import { useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { useRouter } from "next/navigation"
import { ArrowDown, ArrowUp, ChevronDown, ChevronsUpDown, Dices, ListPlus, Plus, Search, Trash2, X } from "lucide-react"
import type { CharacterAttributes, CharacterSkill, SecondaryAttributeKey } from "@runas/core/types/character"
import { damageAttributes } from "@runas/core/data/attributes"
import { systemSkills } from "@runas/core/data/skills"
import { calculateAttributeTest, calculateSkillLevel, normalizeSkillName } from "@runas/core/lib/skillCalculations"
import { parseSkillImport, type ImportedSkill } from "@/lib/skillImport"
import { SkillIntegerInput } from "@/components/skill-test/skill-integer-input"
import { useCharacterPanel } from "./character-panel"

interface Props {
  attributes: CharacterAttributes
  skills: CharacterSkill[]
  onSkillChange: (id: string, updates: Partial<CharacterSkill>) => void
  onAddSkill: (skill: CharacterSkill) => void
  onImportSkills: (skills: ImportedSkill[]) => void
  onRemoveSkill: (id: string) => void
}

type SkillSortKey = "name" | "test" | "level" | "attribute" | "points" | "modifier"
type SkillSortState = { key: SkillSortKey; direction: "asc" | "desc" } | null

const sortFields: { key: SkillSortKey; label: string }[] = [
  { key: "name", label: "Nome" },
  { key: "test", label: "Teste" },
  { key: "level", label: "Nível" },
  { key: "attribute", label: "Atributo" },
  { key: "points", label: "Pontos" },
  { key: "modifier", label: "Mod." },
]

const skillCollator = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" })
const SKILL_SORT_STORAGE_KEY = "runas-tools:skill-sort"

function loadSkillSort(): SkillSortState {
  if (typeof window === "undefined") return null
  try {
    return JSON.parse(window.localStorage.getItem(SKILL_SORT_STORAGE_KEY) ?? "null") as SkillSortState
  } catch {
    return null
  }
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="mb-1 block text-[0.62rem] font-medium uppercase tracking-wide text-muted-foreground">{children}</span>
}

function SortButton({
  field,
  sortState,
  onSort,
  compact = false,
}: {
  field: { key: SkillSortKey; label: string }
  sortState: SkillSortState
  onSort: (key: SkillSortKey) => void
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
        ? `inline-flex h-8 items-center justify-center gap-1 rounded-lg border px-2 text-[0.68rem] font-semibold transition ${isActive ? "border-primary/50 bg-primary/10 text-primary" : "border-border bg-background/55 text-muted-foreground hover:text-foreground"}`
        : `inline-flex w-full items-center justify-center gap-1 rounded-md px-1 py-1 transition hover:bg-background/70 hover:text-foreground ${isActive ? "text-primary" : ""}`}
    >
      <span>{field.label}</span>
      <Icon className="size-3" aria-hidden="true" />
    </button>
  )
}

export function CharacterSkills({ attributes, skills, onSkillChange, onAddSkill, onImportSkills, onRemoveSkill }: Props) {
  const router = useRouter()
  const { close } = useCharacterPanel()
  const [sortState, setSortState] = useState<SkillSortState>(loadSkillSort)
  const [showImport, setShowImport] = useState(false)
  const [importText, setImportText] = useState("")
  const [importErrors, setImportErrors] = useState<string[]>([])
  const [skillSearch, setSkillSearch] = useState("")
  const [skillAttribute, setSkillAttribute] = useState<SecondaryAttributeKey | "all">("all")

  useEffect(() => {
    try {
      window.localStorage.setItem(SKILL_SORT_STORAGE_KEY, JSON.stringify(sortState))
    } catch {
      // Mantém a ordenação durante a sessão quando o armazenamento falhar.
    }
  }, [sortState])
  const visibleSkills = useMemo(() => {
    const normalizedSearch = skillSearch.trim().toLocaleLowerCase("pt-BR")
    const filteredSkills = skills.filter((skill) => {
      const matchesName = !normalizedSearch || skill.name.toLocaleLowerCase("pt-BR").includes(normalizedSearch)
      const matchesAttribute = skillAttribute === "all" || skill.attributeKey === skillAttribute
      return matchesName && matchesAttribute
    })
    const fixedSkills = filteredSkills.filter((skill) => skill.locked)
    const customSkills = filteredSkills.filter((skill) => !skill.locked)
    if (!sortState) return [...fixedSkills, ...customSkills]

    const valueFor = (skill: CharacterSkill): string | number | null => {
      const level = calculateSkillLevel(skill.points)
      if (sortState.key === "name") return skill.name
      if (sortState.key === "test") {
        return skill.attributeKey
          ? calculateAttributeTest(attributes, skill.attributeKey) + level + skill.modifier
          : null
      }
      if (sortState.key === "level") return level
      if (sortState.key === "attribute") {
        return damageAttributes.find((attribute) => attribute.key === skill.attributeKey)?.name ?? null
      }
      if (sortState.key === "points") return skill.points
      return skill.modifier
    }

    const direction = sortState.direction === "asc" ? 1 : -1
    const sortedCustomSkills = [...customSkills].sort((left, right) => {
      const leftValue = valueFor(left)
      const rightValue = valueFor(right)
      if (leftValue === null && rightValue === null) return 0
      if (leftValue === null) return 1
      if (rightValue === null) return -1
      const comparison = typeof leftValue === "string" && typeof rightValue === "string"
        ? skillCollator.compare(leftValue, rightValue)
        : Number(leftValue) - Number(rightValue)
      return comparison * direction
    })
    return [...fixedSkills, ...sortedCustomSkills]
  }, [attributes, skillAttribute, skillSearch, skills, sortState])

  function toggleSort(key: SkillSortKey) {
    setSortState((current) => {
      if (!current || current.key !== key) return { key, direction: "asc" }
      if (current.direction === "asc") return { key, direction: "desc" }
      return null
    })
  }

  function openSkillCalculator(skill: CharacterSkill) {
    if (!skill.attributeKey) return
    close()
    const rollToken = crypto.randomUUID()
    router.push(`/calculadora-testes?skill=${encodeURIComponent(skill.id)}&roll=${encodeURIComponent(rollToken)}`)
  }

  function addSkill() {
    const id = typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `skill-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    onAddSkill({ id, name: "Nova perícia", attributeKey: "", points: 0, modifier: 0, locked: false })
  }

  function changeSkillName(skill: CharacterSkill, name: string) {
    const trimmedName = name.slice(0, 30)
    const normalizedName = normalizeSkillName(trimmedName)
    const systemSkill = systemSkills.find((definition) => (
      [definition.name, ...(definition.aliases ?? [])]
        .some((candidate) => normalizeSkillName(candidate) === normalizedName)
    ))
    onSkillChange(skill.id, systemSkill
      ? { name: systemSkill.name, attributeKey: systemSkill.attributeKey }
      : { name: trimmedName })
  }

  function importSkillList(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const result = parseSkillImport(importText, damageAttributes)
    if (result.errors.length > 0) {
      setImportErrors(result.errors)
      return
    }
    if (result.skills.length === 0) {
      setImportErrors(["Informe ao menos uma perícia para importar."])
      return
    }
    onImportSkills(result.skills)
    setImportText("")
    setImportErrors([])
    setShowImport(false)
  }

  return (
    <section aria-label="Perícias do personagem" className="rounded-b-[27px] rounded-t-none border border-border bg-card p-4 shadow-sm sm:p-7">
      <datalist id="system-skill-suggestions">
        {systemSkills.map((skill) => <option key={skill.name} value={skill.name} />)}
      </datalist>
        <div className="flex flex-wrap flex-col gap-2 border-b border-border px-0.5 pb-3 min-[430px]:flex-row min-[430px]:items-center min-[430px]:justify-between sm:px-0">
          <div className="flex min-w-0 flex-1 flex-wrap flex-col gap-2 min-[430px]:flex-row">
            <label className="relative min-w-[160px] flex-1">
              <span className="sr-only">Pesquisar perícia</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <input
                type="search"
                value={skillSearch}
                onChange={(event) => setSkillSearch(event.target.value)}
                placeholder="Pesquisar perícia…"
                aria-label="Pesquisar perícia pelo nome"
                className="h-10 w-full rounded-xl border border-input bg-background/65 pl-9 pr-3 text-sm text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/25"
              />
            </label>
            <label className="relative min-[430px]:w-52">
              <span className="sr-only">Exibir perícias do atributo</span>
              <select
                value={skillAttribute}
                onChange={(event) => setSkillAttribute(event.target.value as SecondaryAttributeKey | "all")}
                aria-label="Exibir perícias baseadas em atributo"
                className="h-10 w-full appearance-none rounded-xl border border-input bg-background/65 px-3 pr-8 text-sm text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/25"
              >
                <option value="all">Todos os atributos</option>
                {damageAttributes.map((attribute) => <option key={attribute.key} value={attribute.key}>{attribute.name}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute bottom-3 right-2 size-4 text-muted-foreground" aria-hidden="true" />
            </label>
          </div>
          <div className="grid gap-2 min-[430px]:ml-auto min-[430px]:grid-cols-2">
            <button type="button" onClick={() => setShowImport(true)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-input bg-background px-3 py-2 text-sm font-semibold text-muted-foreground transition hover:text-foreground">
              <ListPlus className="size-4" /> Adicionar lista de perícias
            </button>
            <button type="button" onClick={addSkill} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-secondary px-3 py-2 text-sm font-semibold text-secondary-foreground transition hover:bg-accent">
              <Plus className="size-4" /> Adicionar perícia
            </button>
          </div>
        </div>

        <div className="space-y-2 pt-3">
          <div className="flex flex-wrap gap-1.5 rounded-xl border border-border bg-muted/30 p-2 md:hidden" aria-label="Organizar perícias">
            {sortFields.map((field) => <SortButton key={field.key} field={field} sortState={sortState} onSort={toggleSort} compact />)}
          </div>
          <div className="hidden grid-cols-[2.75rem_minmax(7rem,1.2fr)_3.75rem_3.5rem_minmax(7rem,1fr)_3.75rem_3.75rem_2.5rem] gap-2 px-2 text-center text-[0.62rem] uppercase tracking-wide text-muted-foreground md:grid">
            <span>Rolar</span>
            {sortFields.map((field) => (
              <span key={field.key} role="columnheader" aria-sort={sortState?.key === field.key ? (sortState.direction === "asc" ? "ascending" : "descending") : "none"}>
                <SortButton field={field} sortState={sortState} onSort={toggleSort} />
              </span>
            ))}
            <span />
          </div>
          {visibleSkills.map((skill) => {
            const level = calculateSkillLevel(skill.points)
            const test = skill.attributeKey
              ? calculateAttributeTest(attributes, skill.attributeKey) + level + skill.modifier
              : null
            return (
              <div key={skill.id} className="virtualized-list-item grid grid-cols-6 items-end gap-2 rounded-[18px] border border-border bg-background/55 p-2 md:grid-cols-[2.75rem_minmax(7rem,1.2fr)_3.75rem_3.5rem_minmax(7rem,1fr)_3.75rem_3.75rem_2.5rem] md:items-center">
                <button
                  type="button"
                  onClick={() => openSkillCalculator(skill)}
                  disabled={!skill.attributeKey}
                  aria-label={`Abrir Calculadora de Testes e rolar ${skill.name}`}
                  title={skill.attributeKey ? `Abrir calculadora e rolar ${skill.name}` : "Selecione um atributo para rolar"}
                  className="col-span-1 inline-flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-35 md:col-auto"
                >
                  <Dices className="size-4.5" />
                </button>
                <label className="col-span-4 min-w-0 md:col-auto">
                  <FieldLabel>Nome</FieldLabel>
                  <input
                    type="text"
                    value={skill.name}
                    maxLength={30}
                    readOnly={skill.locked}
                    list={skill.locked ? undefined : "system-skill-suggestions"}
                    onChange={(event) => changeSkillName(skill, event.target.value)}
                    aria-label="Nome da perícia"
                    className="h-10 w-full min-w-0 rounded-xl border border-input bg-background/65 px-3 text-sm text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/25 read-only:cursor-default read-only:border-transparent read-only:bg-transparent read-only:font-semibold"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => onRemoveSkill(skill.id)}
                  disabled={skill.locked}
                  aria-label={`Remover ${skill.name}`}
                  title={skill.locked ? "Esta perícia padrão não pode ser removida" : `Remover ${skill.name}`}
                  className="col-span-1 inline-flex size-10 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-25 md:col-auto md:col-start-8 md:row-start-1"
                >
                  <Trash2 className="size-4" />
                </button>
                <label className="col-span-1 md:col-auto md:col-start-3">
                  <FieldLabel>Teste</FieldLabel>
                  {test === null
                    ? <output aria-label={`Teste de ${skill.name} indisponível`} className="flex h-10 w-full items-center justify-center rounded-xl border border-input bg-background/65 text-sm font-semibold text-muted-foreground">—</output>
                    : <SkillIntegerInput value={test} label={`Teste de ${skill.name}`} readOnly className="w-full font-semibold" />}
                </label>
                <label className="col-span-1 md:col-auto">
                  <FieldLabel>Nível</FieldLabel>
                  <SkillIntegerInput value={level} label={`Nível de ${skill.name}`} readOnly className="w-full" />
                </label>
                <label className="relative col-span-2 md:col-auto">
                  <FieldLabel>Atributo</FieldLabel>
                  <select
                    value={skill.attributeKey}
                    onChange={(event) => onSkillChange(skill.id, { attributeKey: event.target.value as SecondaryAttributeKey | "" })}
                    aria-label={`Atributo de ${skill.name}`}
                    className="h-10 w-full appearance-none rounded-xl border border-input bg-background/65 px-2 pr-7 text-sm text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/25"
                  >
                    <option value="">Selecione</option>
                    {damageAttributes.map((attribute) => <option key={attribute.key} value={attribute.key}>{attribute.name}</option>)}
                  </select>
                  <ChevronDown className="pointer-events-none absolute bottom-3 right-2 size-4 text-muted-foreground" />
                </label>
                <label className="col-span-1 md:col-auto">
                  <FieldLabel>Pontos</FieldLabel>
                  <SkillIntegerInput value={skill.points} min={0} onChange={(points) => onSkillChange(skill.id, { points })} label={`Pontos de ${skill.name}`} className="w-full" />
                </label>
                <label className="col-span-1 md:col-auto">
                  <FieldLabel>Mod.</FieldLabel>
                  <SkillIntegerInput value={skill.modifier} onChange={(modifier) => onSkillChange(skill.id, { modifier })} label={`Modificador de ${skill.name}`} className="w-full" />
                </label>
              </div>
            )
          })}
          {visibleSkills.length === 0 && <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">Nenhuma perícia encontrada com esses filtros.</p>}
        </div>

      {showImport && createPortal((
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-3 backdrop-blur-[2px]" onMouseDown={(event) => {
          if (event.currentTarget === event.target) setShowImport(false)
        }}>
          <form
            onSubmit={importSkillList}
            role="dialog"
            aria-modal="true"
            aria-labelledby="skill-import-title"
            className="max-h-[min(46rem,calc(100dvh-1.5rem))] w-full max-w-2xl overflow-y-auto rounded-[24px] border border-border bg-card p-4 shadow-2xl sm:p-6"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="skill-import-title" className="text-base font-bold text-foreground">Adicionar lista de perícias</h2>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">Uma perícia por linha. Teste e Nível são ignorados quando estiverem presentes.</p>
              </div>
              <button type="button" onClick={() => setShowImport(false)} aria-label="Fechar importação" className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-foreground">
                <X className="size-5" />
              </button>
            </div>

            <label className="mt-4 block">
              <span className="mb-1.5 block text-sm font-medium text-muted-foreground">Lista de perícias</span>
              <textarea
                value={importText}
                onChange={(event) => {
                  setImportText(event.target.value)
                  if (importErrors.length > 0) setImportErrors([])
                }}
                rows={10}
                autoFocus
                placeholder={"Nome | Atributo | Ponto\nElementarismo | POD | 6\n\nNome | Teste | Nível | Atributo | Ponto\nIntuição | 16 | +1 | SOR | 3"}
                className="min-h-56 w-full resize-y rounded-[18px] border border-input bg-background p-3 font-mono text-sm leading-relaxed text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/25"
              />
            </label>

            <div className="mt-3 rounded-xl bg-muted/45 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
              Aceita colunas separadas por <strong>|</strong>, tabulação ou espaços. Se a perícia já existir, seus pontos e atributo serão atualizados, sem criar duplicata.
            </div>

            {importErrors.length > 0 && (
              <div role="alert" className="mt-3 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {importErrors.map((error) => <p key={error}>{error}</p>)}
              </div>
            )}

            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setShowImport(false)} className="inline-flex h-11 items-center justify-center rounded-xl border border-input bg-background px-4 text-sm font-semibold text-muted-foreground transition hover:text-foreground">Cancelar</button>
              <button type="submit" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:brightness-110">
                <ListPlus className="size-4" /> Importar lista
              </button>
            </div>
          </form>
        </div>
      ), document.body)}
    </section>
  )
}
