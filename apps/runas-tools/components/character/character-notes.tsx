"use client"

import { useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import dynamic from "next/dynamic"
import { Eye, EyeOff, ListFilter, Plus, Save, Trash2, X } from "lucide-react"
import type { CharacterNote } from "@runas/core/types/character"
import { normalizeSkillName } from "@runas/core/lib/skillCalculations"
import { createPrefixedId } from "@runas/core/lib/ids"

const RichTextEditor = dynamic(
  () => import("@/components/ui/rich-text-editor").then((module) => module.RichTextEditor),
  { ssr: false, loading: () => <div className="mt-4 min-h-52 animate-pulse rounded-[18px] border border-input bg-muted/45" aria-label="Carregando editor" /> },
)

interface Props {
  notes: CharacterNote[]
  onAddNote: (note: CharacterNote) => void
  onNoteChange: (id: string, updates: Partial<CharacterNote>) => void
  onRemoveNote: (id: string) => void
}

const NOTE_FILTER_STORAGE_KEY = "runas-tools:note-filters"
const noteCollator = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" })

function categoryKey(value: string): string {
  return normalizeSkillName(value) || "__without_category__"
}

function today(): string {
  const date = new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function createNote(): CharacterNote {
  const id = createPrefixedId("note")
  return { id, category: "", name: "Nova anotação", description: "", date: today() }
}

function plainText(value: string): string {
  return value.replace(/<br\s*\/?\s*>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim()
}

function formatDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "Sem data"
}

export function CharacterNotes({ notes, onAddNote, onNoteChange, onRemoveNote }: Props) {
  const [editingNote, setEditingNote] = useState<CharacterNote | null>(null)
  const [isNewNote, setIsNewNote] = useState(false)
  const [initialFilters] = useState(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(NOTE_FILTER_STORAGE_KEY) ?? "null") as { hiddenCategories?: string[]; showFilters?: boolean } | null
      return { hiddenCategories: new Set(saved?.hiddenCategories ?? []), showFilters: saved?.showFilters ?? false }
    } catch {
      return { hiddenCategories: new Set<string>(), showFilters: false }
    }
  })
  const [hiddenCategories, setHiddenCategories] = useState(initialFilters.hiddenCategories)
  const [showFilters, setShowFilters] = useState(initialFilters.showFilters)

  useEffect(() => {
    try {
      window.localStorage.setItem(NOTE_FILTER_STORAGE_KEY, JSON.stringify({ hiddenCategories: [...hiddenCategories], showFilters }))
    } catch {
      // Mantém os filtros durante a sessão quando o armazenamento falhar.
    }
  }, [hiddenCategories, showFilters])

  const categories = useMemo(() => {
    const byKey = new Map<string, string>()
    notes.forEach((note) => {
      const key = categoryKey(note.category)
      if (!byKey.has(key)) byKey.set(key, note.category.trim() || "Sem categoria")
    })
    return [...byKey].map(([key, label]) => ({ key, label }))
  }, [notes])

  const visibleNotes = useMemo(() => notes
    .filter((note) => !hiddenCategories.has(categoryKey(note.category)))
    .sort((left, right) => noteCollator.compare(left.category || "Sem categoria", right.category || "Sem categoria") || noteCollator.compare(left.name, right.name)), [notes, hiddenCategories])

  function toggleCategory(key: string) {
    setHiddenCategories((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function saveNote(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editingNote) return
    const normalized = {
      ...editingNote,
      category: editingNote.category.trim().slice(0, 40),
      name: editingNote.name.trim().slice(0, 80) || "Anotação sem nome",
      date: /^\d{4}-\d{2}-\d{2}$/.test(editingNote.date) ? editingNote.date : today(),
    }
    if (isNewNote) onAddNote(normalized)
    else onNoteChange(normalized.id, { name: normalized.name, description: normalized.description, date: normalized.date })
    setEditingNote(null)
    setIsNewNote(false)
  }

  return (
    <section aria-label="Anotações do personagem" className="rounded-b-[22px] rounded-t-none border border-border bg-card p-2 shadow-sm sm:rounded-b-[27px] sm:p-7">
      <datalist id="note-category-suggestions">{categories.filter((category) => category.key !== "__without_category__").map((category) => <option key={category.key} value={category.label} />)}</datalist>
      <div className="flex flex-col gap-3 border-b border-border px-0.5 pb-3 sm:flex-row sm:items-center sm:justify-end sm:px-0">
        <button type="button" onClick={() => setShowFilters((current) => !current)} aria-expanded={showFilters} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-input bg-background px-3 py-2 text-sm font-semibold text-muted-foreground transition hover:text-foreground"><ListFilter className="size-4" /> Categorias</button>
        <button type="button" onClick={() => { setEditingNote(createNote()); setIsNewNote(true) }} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-secondary px-3 py-2 text-sm font-semibold text-secondary-foreground transition hover:bg-accent"><Plus className="size-4" /> Adicionar anotação</button>
      </div>
      {showFilters && <div className="mt-3 flex flex-wrap gap-2 rounded-xl border border-border bg-background/45 p-2" aria-label="Filtrar categorias de anotações">
        {categories.length === 0 ? <span className="px-2 py-1 text-xs text-muted-foreground">Crie uma anotação para habilitar os filtros.</span> : categories.map((category) => {
          const visible = !hiddenCategories.has(category.key)
          return <button key={category.key} type="button" aria-pressed={visible} onClick={() => toggleCategory(category.key)} className={`inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition ${visible ? "border-primary/45 bg-primary/10 text-primary" : "border-border bg-muted text-muted-foreground"}`}>{visible ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}{category.label}</button>
        })}
        {hiddenCategories.size > 0 && <button type="button" onClick={() => setHiddenCategories(new Set())} className="h-9 rounded-xl px-3 text-xs font-semibold text-muted-foreground transition hover:text-foreground">Mostrar todas</button>}
      </div>}
      <div className="space-y-2 pt-3">
        <div className="hidden grid-cols-[minmax(6rem,.75fr)_minmax(7rem,1fr)_minmax(10rem,1.7fr)_6.5rem_2.75rem] gap-2 px-3 text-center text-[0.62rem] uppercase tracking-wide text-muted-foreground md:grid"><span>Categoria</span><span>Nome</span><span>Descrição</span><span>Data</span><span>Deletar</span></div>
        {visibleNotes.length === 0 && <p className="rounded-[18px] border border-dashed border-border bg-background/35 px-4 py-10 text-center text-sm text-muted-foreground">{notes.length === 0 ? "Nenhuma anotação cadastrada." : "Nenhuma anotação corresponde às categorias visíveis."}</p>}
        {visibleNotes.map((note) => <article key={note.id} className="virtualized-list-item grid grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-[18px] border border-border bg-background/55 p-2 md:grid-cols-[minmax(6rem,.75fr)_minmax(7rem,1fr)_minmax(10rem,1.7fr)_6.5rem_2.75rem] md:items-center">
          <span className="truncate text-xs font-semibold text-muted-foreground md:px-2">{note.category || "Sem categoria"}</span>
          <button type="button" onClick={() => { setEditingNote({ ...note }); setIsNewNote(false) }} className="col-start-1 max-w-full truncate text-left text-sm font-bold text-foreground underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring md:col-start-auto md:px-2">{note.name}</button>
          <p className="col-span-2 col-start-1 truncate text-xs text-muted-foreground md:col-span-1 md:col-start-auto md:px-2">{plainText(note.description) || "Sem descrição"}</p>
          <time dateTime={note.date} className="col-start-1 text-xs tabular-nums text-muted-foreground md:col-start-auto md:text-center">{formatDate(note.date)}</time>
          <button type="button" onClick={() => onRemoveNote(note.id)} aria-label={`Deletar ${note.name}`} className="col-start-2 row-start-1 inline-flex size-10 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive md:col-start-auto md:row-start-auto"><Trash2 className="size-4" /></button>
        </article>)}
      </div>
      {editingNote && createPortal(<div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-3 backdrop-blur-[2px]" onMouseDown={(event) => { if (event.currentTarget === event.target) setEditingNote(null) }}>
        <form onSubmit={saveNote} role="dialog" aria-modal="true" aria-labelledby="note-editor-title" className="max-h-[calc(100dvh-1.5rem)] w-full max-w-3xl overflow-y-auto rounded-[24px] border border-border bg-card p-4 shadow-2xl sm:p-6">
          <div className="flex items-start justify-between gap-3"><h2 id="note-editor-title" className="text-lg font-bold text-foreground">{isNewNote ? "Nova anotação" : "Editar anotação"}</h2><button type="button" onClick={() => setEditingNote(null)} aria-label="Fechar editor de anotação" className="inline-flex size-10 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-foreground"><X className="size-5" /></button></div>
          <div className={`mt-4 grid gap-3 ${isNewNote ? "sm:grid-cols-[.75fr_1.25fr]" : "sm:grid-cols-[1fr_auto]"}`}>
            {isNewNote && <label><span className="mb-1.5 block text-sm font-medium text-muted-foreground">Categoria</span><input value={editingNote.category} list="note-category-suggestions" maxLength={40} onChange={(event) => setEditingNote({ ...editingNote, category: event.target.value })} className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/25" /></label>}
            <label><span className="mb-1.5 block text-sm font-medium text-muted-foreground">Nome</span><input value={editingNote.name} required maxLength={80} onChange={(event) => setEditingNote({ ...editingNote, name: event.target.value })} className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/25" /></label>
            {!isNewNote && <label><span className="mb-1.5 block text-sm font-medium text-muted-foreground">Data</span><input type="date" value={editingNote.date} onChange={(event) => setEditingNote({ ...editingNote, date: event.target.value })} className="h-11 rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/25" /></label>}
          </div>
          <RichTextEditor label="Descrição" value={editingNote.description} onChange={(description) => setEditingNote((current) => current ? { ...current, description } : current)} maxLength={5000} className="mt-4" />
          {isNewNote && <label className="mt-4 block"><span className="mb-1.5 block text-sm font-medium text-muted-foreground">Data</span><input type="date" value={editingNote.date} onChange={(event) => setEditingNote({ ...editingNote, date: event.target.value })} className="h-11 rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/25" /></label>}
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={() => setEditingNote(null)} className="h-11 rounded-xl border border-input bg-background px-4 text-sm font-semibold text-muted-foreground">Cancelar</button><button type="submit" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"><Save className="size-4" /> Salvar anotação</button></div>
        </form>
      </div>, document.body)}
    </section>
  )
}
