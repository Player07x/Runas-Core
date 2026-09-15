"use client"

import { useEffect, useMemo, useState } from "react"
import { BookOpen, BookPlus, Check, ChevronRight, Download, ExternalLink, FileText, KeyRound, Library, LockKeyhole, Menu, Plus, Search, Settings2, ShieldCheck, Sparkles, Upload, WandSparkles, X } from "lucide-react"
import { kindLabel, createEntity, createSeedWorkspace, normalizeWorkspace, slugify, type BookChapter, type BookEntry, type BookEntryKind, type BookRecord, type BookWorkspace } from "../lib/book-model"

const STORAGE_KEY = "runas-book.workspace.v1"
const AUTH_KEY = "runas-book.authenticated"
type Mode = "public" | "dm"

function downloadJson(filename: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url)
}

export function BookApp({ mode }: { mode: Mode }) {
  const [workspace, setWorkspace] = useState<BookWorkspace>(() => createSeedWorkspace())
  const [hydrated, setHydrated] = useState(false)
  const [authenticated, setAuthenticated] = useState(mode === "public")
  const [authChecking, setAuthChecking] = useState(mode === "dm")
  const [authError, setAuthError] = useState("")
  const [token, setToken] = useState("")
  const [password, setPassword] = useState("")
  const [bookId, setBookId] = useState<string | null>(null)
  const [chapterId, setChapterId] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [selectedEntry, setSelectedEntry] = useState<BookEntry | null>(null)
  const [showBooks, setShowBooks] = useState(false)
  const [showEditor, setShowEditor] = useState(false)
  const [showChapterEditor, setShowChapterEditor] = useState(false)
  const [newBookTitle, setNewBookTitle] = useState("")
  const [newChapterTitle, setNewChapterTitle] = useState("")
  const [newEntry, setNewEntry] = useState<{ title: string; kind: BookEntryKind; summary: string; content: string }>({ title: "", kind: "rule", summary: "", content: "" })
  const [notice, setNotice] = useState("")

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) setWorkspace(normalizeWorkspace(JSON.parse(saved)))
    } catch { /* dados corrompidos voltam ao catálogo inicial */ }
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace))
  }, [hydrated, workspace])

  useEffect(() => {
    if (mode !== "dm") return
    const recent = sessionStorage.getItem(AUTH_KEY) === "yes"
    const timer = window.setTimeout(() => { setAuthenticated(recent); setAuthChecking(false) }, 0)
    return () => window.clearTimeout(timer)
  }, [mode])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!bookId && workspace.selectedBookId && workspace.books.some((book) => book.id === workspace.selectedBookId)) setBookId(workspace.selectedBookId)
      else if (!bookId && workspace.books[0]) setBookId(workspace.books[0].id)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [bookId, workspace.books, workspace.selectedBookId])

  const book = workspace.books.find((item) => item.id === bookId) ?? workspace.books[0]
  const chapter = book?.chapters.find((item) => item.id === chapterId) ?? book?.chapters[0]
  const entries = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("pt-BR")
    if (!chapter) return []
    return chapter.entries.filter((entry) => !term || [entry.title, entry.summary, entry.content, ...entry.tags].join(" ").toLocaleLowerCase("pt-BR").includes(term))
  }, [chapter, query])

  function selectBook(nextId: string) {
    setBookId(nextId); setChapterId(null); setSelectedEntry(null); setShowBooks(false)
    setWorkspace((current) => ({ ...current, selectedBookId: nextId, updatedAt: Date.now() }))
  }

  function addBook() {
    const title = newBookTitle.trim()
    if (!title) return
    const id = `book-${slugify(title)}-${Date.now().toString(36)}`
    const next: BookRecord = { id, title, subtitle: "Livro personalizado", accent: "#d8b45a", sourceFile: "", chapters: [] }
    setWorkspace((current) => ({ ...current, books: [...current.books, next], selectedBookId: id, updatedAt: Date.now() }))
    setBookId(id); setNewBookTitle(""); setShowEditor(false); setNotice("Livro criado")
  }

  function addChapter() {
    if (!book) return
    const title = newChapterTitle.trim()
    if (!title) return
    const id = `${book.id}-chapter-${Date.now().toString(36)}`
    const next: BookChapter = { id, title, summary: "", bookId: book.id, order: book.chapters.length + 1, entries: [] }
    setWorkspace((current) => ({ ...current, books: current.books.map((item) => item.id === book.id ? { ...item, chapters: [...item.chapters, next] } : item), updatedAt: Date.now() }))
    setChapterId(id); setNewChapterTitle(""); setShowChapterEditor(false); setNotice("Capítulo criado")
  }

  function addEntry() {
    if (!book || !chapter || !newEntry.title.trim()) return
    const next: BookEntry = { id: `${chapter.id}-entry-${Date.now().toString(36)}`, chapterId: chapter.id, title: newEntry.title.trim(), kind: newEntry.kind, summary: newEntry.summary.trim(), content: newEntry.content.trim(), tags: [], entity: createEntity(newEntry.kind, newEntry.title.trim()), updatedAt: Date.now() }
    setWorkspace((current) => ({ ...current, books: current.books.map((item) => item.id === book.id ? { ...item, chapters: item.chapters.map((currentChapter) => currentChapter.id === chapter.id ? { ...currentChapter, entries: [...currentChapter.entries, next] } : currentChapter) } : item), updatedAt: Date.now() }))
    setNewEntry({ title: "", kind: "rule", summary: "", content: "" }); setShowEditor(false); setSelectedEntry(next); setNotice("Página cadastrada")
  }

  function exportEntry(entry: BookEntry) {
    if (entry.kind === "character" && entry.entity) downloadJson(`${slugify(entry.title)}.json`, { version: 20, character: entry.entity })
    else downloadJson(`${slugify(entry.title)}.runas.json`, { version: 1, source: "Runas Book", kind: entry.kind, record: entry.entity, title: entry.title, summary: entry.summary, content: entry.content })
    setNotice("Arquivo exportado")
  }

  async function syncToObsidian() {
    if (!window.showDirectoryPicker) { setNotice("Use Chrome ou Edge para conectar uma pasta do Obsidian."); return }
    try {
      const root = await window.showDirectoryPicker({ id: "runas-book-vault", mode: "readwrite" })
      for (const currentBook of workspace.books) for (const currentChapter of currentBook.chapters) for (const entry of currentChapter.entries) {
        const folder = await directoryAt(root, ["Runas Book", currentBook.title, currentChapter.title])
        const file = await folder.getFileHandle(`${slugify(entry.title)}.md`, { create: true })
        const writable = await file.createWritable()
        await writable.write(`---\nrunas_book: true\nrunas_book_id: ${entry.id}\nrunas_kind: ${entry.kind}\n---\n\n# ${entry.title}\n\n${entry.summary}\n\n${entry.content || "Página pronta para receber o texto completo do livro."}\n`)
        await writable.close()
      }
      setNotice("Wiki sincronizada no vault do Obsidian")
    } catch (error) { setNotice(error instanceof Error ? `Obsidian: ${error.message}` : "Não foi possível sincronizar o vault.") }
  }

  if (mode === "dm" && (authChecking || !authenticated)) return <AuthScreen checking={authChecking} token={token} password={password} error={authError} onToken={setToken} onPassword={setPassword} onSubmit={async () => {
    setAuthError("")
    try {
      const response = await fetch("/api/book-auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password }) })
      if (!response.ok) throw new Error("Token ou senha incorretos.")
      sessionStorage.setItem(AUTH_KEY, "yes"); setAuthenticated(true); setToken(""); setPassword("")
    } catch (error) {
      // O bundle estático continua utilizável em preview local; em produção a
      // Pages Function e o Cloudflare Access fazem a validação real.
      if ((location.hostname === "localhost" || location.hostname === "127.0.0.1") && token && password) { sessionStorage.setItem(AUTH_KEY, "yes"); setAuthenticated(true) }
      else setAuthError(error instanceof Error ? error.message : "Não foi possível validar o acesso.")
    }
  }} />

  if (!book) return <div className="book-empty">Nenhum livro cadastrado.</div>
  return <main className="book-shell" style={{ "--book-accent": book.accent } as React.CSSProperties}>
    <header className="book-topbar">
      <a className="book-brand" href="/"><span className="brand-mark"><BookOpen size={20} /></span><span><strong>Runas Book</strong><small>Biblioteca de regras</small></span></a>
      <button className="book-switcher" onClick={() => setShowBooks(true)}><Library size={16} /> {book.title}<ChevronRight size={15} /></button>
      <div className="top-actions"><a href={mode === "dm" ? "/" : "/dm"} className="ghost-link">{mode === "dm" ? "Abrir leitura" : "Área DM"}</a>{mode === "dm" && <button className="icon-link" onClick={syncToObsidian} title="Sincronizar com Obsidian"><Upload size={18} /></button>}<a className="icon-link" href="https://runas-tools.pages.dev" title="Runas Tools"><ExternalLink size={18} /></a></div>
    </header>
    <div className="book-layout">
      <aside className="book-sidebar">
        <div className="sidebar-heading"><span>Capítulos</span>{mode === "dm" && <button className="mini-action" onClick={() => setShowChapterEditor(true)} title="Novo capítulo"><Plus size={15} /></button>}</div>
        <nav>{book.chapters.map((item) => <button key={item.id} className={item.id === chapter?.id ? "active" : ""} onClick={() => { setChapterId(item.id); setSelectedEntry(null); setQuery("") }}><span>{String(item.order).padStart(2, "0")}</span>{item.title}</button>)}</nav>
        {mode === "dm" && <button className="sidebar-add" onClick={() => setShowEditor(true)}><BookPlus size={16} /> Nova página</button>}
      </aside>
      <section className="book-content">
        <div className="content-intro"><div><p className="eyebrow"><Sparkles size={14} /> {book.subtitle}</p><h1>{chapter?.title ?? "Escolha um capítulo"}</h1><p>{chapter?.summary || "Uma estrutura viva para consultar o sistema e transformar regras em registros prontos para a ficha."}</p></div><button className="outline-action" onClick={() => downloadJson(`${slugify(book.title)}.json`, book)}><Download size={16} /> Exportar livro</button></div>
        <label className="book-search"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar nesta seção…" /><kbd>{entries.length}</kbd></label>
        <div className="entry-grid">{entries.map((entry) => <button key={entry.id} className="entry-card" onClick={() => setSelectedEntry(entry)}><span className={`entry-type type-${entry.kind}`}>{kindLabel(entry.kind)}</span><h2>{entry.title}</h2><p>{entry.summary || "Registro pronto para receber detalhes e referências."}</p><footer><span>{entry.sourcePage ? `p. ${entry.sourcePage}` : "Runas Book"}</span><ChevronRight size={16} /></footer></button>)}</div>
        {entries.length === 0 && <div className="empty-state"><FileText size={30} /><strong>Nenhum registro nesta busca</strong><p>Limpe o termo ou crie uma nova página no modo DM.</p></div>}
      </section>
    </div>
    <footer className="book-footer"><span>Runas Book · conteúdo estruturado e exportável</span><span>{book.chapters.length} capítulos · {book.chapters.reduce((count, item) => count + item.entries.length, 0)} registros</span></footer>
    {showBooks && <div className="modal-backdrop" onMouseDown={() => setShowBooks(false)}><section className="modal-card book-picker" onMouseDown={(event) => event.stopPropagation()}><header><div><p className="eyebrow">Biblioteca</p><h2>Escolha um livro</h2></div><button className="icon-link" onClick={() => setShowBooks(false)}><X size={18} /></button></header><div className="book-list">{workspace.books.map((item) => <button key={item.id} onClick={() => selectBook(item.id)}><span className="book-dot" style={{ background: item.accent }} /><span><strong>{item.title}</strong><small>{item.subtitle} · {item.chapters.length} capítulos</small></span><ChevronRight size={17} /></button>)}</div>{mode === "dm" && <div className="new-book-row"><input value={newBookTitle} onChange={(event) => setNewBookTitle(event.target.value)} placeholder="Nome de um novo livro" /><button className="primary-action" onClick={addBook}><Plus size={16} /> Cadastrar</button></div>}</section></div>}
    {showChapterEditor && <div className="modal-backdrop" onMouseDown={() => setShowChapterEditor(false)}><section className="modal-card" onMouseDown={(event) => event.stopPropagation()}><header><div><p className="eyebrow">Estrutura</p><h2>Novo capítulo</h2></div><button className="icon-link" onClick={() => setShowChapterEditor(false)}><X size={18} /></button></header><input className="form-input" value={newChapterTitle} onChange={(event) => setNewChapterTitle(event.target.value)} placeholder="Ex.: Regras de combate" autoFocus /><button className="primary-action full" onClick={addChapter}><Plus size={16} /> Criar capítulo</button></section></div>}
    {showEditor && <div className="modal-backdrop" onMouseDown={() => setShowEditor(false)}><section className="modal-card editor-modal" onMouseDown={(event) => event.stopPropagation()}><header><div><p className="eyebrow">{chapter?.title}</p><h2>Nova página</h2></div><button className="icon-link" onClick={() => setShowEditor(false)}><X size={18} /></button></header><label>Título<input className="form-input" value={newEntry.title} onChange={(event) => setNewEntry((current) => ({ ...current, title: event.target.value }))} autoFocus /></label><label>Tipo<select className="form-input" value={newEntry.kind} onChange={(event) => setNewEntry((current) => ({ ...current, kind: event.target.value as BookEntryKind }))}><option value="rule">Regra</option><option value="item">Item exportável</option><option value="ability">Habilidade exportável</option><option value="spell">Magia exportável</option><option value="character">Ficha exportável</option></select></label><label>Resumo<input className="form-input" value={newEntry.summary} onChange={(event) => setNewEntry((current) => ({ ...current, summary: event.target.value }))} placeholder="Uma linha para a grade" /></label><label>Conteúdo<textarea className="form-input" rows={6} value={newEntry.content} onChange={(event) => setNewEntry((current) => ({ ...current, content: event.target.value }))} placeholder="Texto da regra, referência ou descrição…" /></label><button className="primary-action full" onClick={addEntry}><Check size={16} /> Salvar página</button></section></div>}
    {selectedEntry && <div className="modal-backdrop" onMouseDown={() => setSelectedEntry(null)}><article className="modal-card entry-detail" onMouseDown={(event) => event.stopPropagation()}><header><div><span className={`entry-type type-${selectedEntry.kind}`}>{kindLabel(selectedEntry.kind)}</span><h2>{selectedEntry.title}</h2><p>{selectedEntry.summary}</p></div><button className="icon-link" onClick={() => setSelectedEntry(null)}><X size={18} /></button></header><div className="detail-copy">{selectedEntry.content ? selectedEntry.content.split(/\n+/).map((line, index) => <p key={index}>{line}</p>) : <p>Este registro foi criado com a estrutura do <code>@runas/core</code> e está pronto para receber os detalhes do livro.</p>}</div><footer><span>{selectedEntry.sourceFile || "Registro local"}{selectedEntry.sourcePage ? ` · página ${selectedEntry.sourcePage}` : ""}</span>{selectedEntry.kind !== "rule" && <button className="primary-action" onClick={() => exportEntry(selectedEntry)}><Download size={16} /> Baixar para ficha</button>}</footer></article></div>}
    {notice && <button className="toast" onClick={() => setNotice("")}><Check size={15} /> {notice}</button>}
  </main>
}

function AuthScreen({ checking, token, password, error, onToken, onPassword, onSubmit }: { checking: boolean; token: string; password: string; error: string; onToken: (value: string) => void; onPassword: (value: string) => void; onSubmit: () => void }) {
  if (checking) return <main className="auth-shell"><div className="auth-loading"><span className="brand-mark"><BookOpen size={20} /></span><p>Reabrindo o arquivo DM…</p></div></main>
  return <main className="auth-shell"><div className="auth-card"><span className="auth-icon"><LockKeyhole size={24} /></span><p className="eyebrow"><ShieldCheck size={14} /> Runas Book DM</p><h1>Desbloquear biblioteca</h1><p className="auth-copy">Capítulos, páginas e registros exportáveis ficam protegidos pela mesma camada privada do Runas DM.</p><form onSubmit={(event) => { event.preventDefault(); onSubmit() }}><label><span>Token privado</span><div><KeyRound size={16} /><input type="password" value={token} onChange={(event) => onToken(event.target.value)} autoComplete="off" placeholder="Cole o token do Runas DM" /></div></label><label><span>Senha</span><div><LockKeyhole size={16} /><input type="password" value={password} onChange={(event) => onPassword(event.target.value)} autoComplete="current-password" placeholder="Digite sua senha" /></div></label>{error && <p className="auth-error">{error}</p>}<button className="primary-action full" disabled={!token || !password}><WandSparkles size={16} /> Entrar e editar</button></form><small>Cloudflare Access continua sendo a primeira barreira em produção.</small></div></main>
}

async function directoryAt(root: FileSystemDirectoryHandle, parts: string[]) {
  let current = root
  for (const part of parts) current = await current.getDirectoryHandle(part, { create: true })
  return current
}

declare global {
  interface Window { showDirectoryPicker?: (options?: { id?: string; mode?: "read" | "readwrite" }) => Promise<FileSystemDirectoryHandle> }
}
