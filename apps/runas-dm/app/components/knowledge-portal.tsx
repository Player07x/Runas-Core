"use client"

/* eslint-disable @next/next/no-html-link-for-pages, @next/next/no-location-assign-relative-destination -- Vinext beta's RSC router is not reliable in the Pages production bundle. */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Archive, BookMarked, CalendarDays, Check, ChevronRight, CircleAlert, Cloud, Filter, FolderPlus, KeyRound, LibraryBig, LockKeyhole, Network, Plus, RefreshCw, Search, Settings2, ShieldCheck, Swords, Trash2, WifiOff, X } from "lucide-react"
import { cloneCharacter, type BestiaryEntry, type EncounterActor } from "../lib/model"
import { loadLocalState, saveLocalState } from "../lib/storage"
import { CAMPAIGN_PAGE_KINDS, CAMPAIGN_STATUSES, WIKI_SECTIONS, createCampaign, createKnowledgeId, createKnowledgePage, mergeKnowledgeWorkspaces, normalizeKnowledgeWorkspace, plainTextFromHtml, wikiLinkTitles, type CampaignRecord, type KnowledgeCategory, type KnowledgePage, type KnowledgePageKind, type KnowledgeWorkspaceState } from "../lib/knowledge-model"
import { loadKnowledgeWorkspace, saveKnowledgeWorkspace } from "../lib/knowledge-storage"
import { readObsidianApiKey, readObsidianPreferences, ObsidianDialog, type ObsidianPreferences } from "./obsidian-dialog"
import { syncWorkspaceToObsidian, type VaultSyncResult } from "../lib/obsidian-sync"
import { syncWorkspaceToLocalVault } from "../lib/local-vault"
import { ExpandableTextarea } from "./expandable-textarea"
import { KnowledgeEditor } from "./knowledge-editor"
import { KnowledgeGraph } from "./knowledge-graph"
import { wikiTitlesFromRichText } from "./rich-text-editor"

type PortalArea = "campaigns" | "wiki"
type AuthState = "checking" | "locked" | "ready"
type SyncState = "loading" | "local" | "syncing" | "synced" | "error"

const AUTH_ACTIVITY_KEY = "runas-dm.knowledge-last-activity"
const AUTH_IDLE_MILLISECONDS = 10 * 60 * 1000
function lastAuthenticatedActivity(): number {
  if (typeof window === "undefined") return 0
  return Number(sessionStorage.getItem(AUTH_ACTIVITY_KEY)) || 0
}

function hasRecentAuthentication(): boolean {
  const lastActivity = lastAuthenticatedActivity()
  return lastActivity > 0 && Date.now() - lastActivity < AUTH_IDLE_MILLISECONDS
}

function rememberAuthenticatedActivity(): void {
  if (typeof window !== "undefined") sessionStorage.setItem(AUTH_ACTIVITY_KEY, String(Date.now()))
}

function kindLabel(kind: string): string {
  return WIKI_SECTIONS.find((item) => item.id === kind)?.label ?? CAMPAIGN_PAGE_KINDS.find((item) => item.id === kind)?.label ?? kind
}

function statusClass(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").replace(/\s+/g, "-")
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;")
}

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`
}

export function KnowledgePortal({ area }: { area: PortalArea }) {
  // O valor inicial precisa ser idêntico no servidor e na primeira hidratação.
  // A sessão recente só é consultada no efeito. Enquanto isso, uma tela neutra
  // evita expor o formulário de login durante uma navegação autenticada.
  const [auth, setAuth] = useState<AuthState>("checking")
  const [state, setState] = useState<KnowledgeWorkspaceState>(() => ({ version: 2, campaigns: [], categories: [], pages: [], updatedAt: 0 }))
  const [syncState, setSyncState] = useState<SyncState>("loading")
  const [authError, setAuthError] = useState("")
  const [token, setToken] = useState("")
  const [password, setPassword] = useState("")
  const [isLocal, setIsLocal] = useState(false)
  const [bestiary, setBestiary] = useState<BestiaryEntry[]>([])
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null)
  const [selectedKind, setSelectedKind] = useState<KnowledgePageKind | "graph">(area === "wiki" ? "chronology" : "mission")
  const [hydrated, setHydrated] = useState(false)
  const [search, setSearch] = useState("")
  const [tagFilter, setTagFilter] = useState("all")
  const [categoryFilter, setCategoryFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [editing, setEditing] = useState<KnowledgePage | null>(null)
  const [categoryName, setCategoryName] = useState("")
  const [obsidianOpen, setObsidianOpen] = useState(false)
  const [obsidianPreferences, setObsidianPreferences] = useState<ObsidianPreferences>(() => readObsidianPreferences())
  const [notice, setNotice] = useState("")
  const hydratedOnce = useRef(false)
  const stateRef = useRef(state)

  const selectedCampaign = state.campaigns.find((campaign) => campaign.id === selectedCampaignId) ?? null

  useEffect(() => { stateRef.current = state }, [state])

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setSelectedKind(area === "wiki" ? "chronology" : "mission")
      setSearch("")
      setTagFilter("all")
      setCategoryFilter("all")
      setStatusFilter("all")
      setEditing(null)
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [area])

  const hydrate = useCallback(async () => {
    if (hydratedOnce.current) return
    hydratedOnce.current = true
    setSyncState("loading")
    const [local, dmState] = await Promise.all([loadKnowledgeWorkspace(), loadLocalState().catch(() => null)])
    if (dmState) setBestiary(dmState.entries)
    let next = local
    try {
      const response = await fetch("/api/campaign-data", { cache: "no-store" })
      if (response.ok) {
        const payload = await response.json() as { state: unknown; updatedAt: number | null }
        if (payload.state) next = mergeKnowledgeWorkspaces(local, normalizeKnowledgeWorkspace(payload.state))
        setSyncState("synced")
      } else setSyncState("local")
    } catch { setSyncState("local") }
    setState(next)
    setSelectedCampaignId((current) => current ?? next.campaigns[0]?.id ?? null)
    await saveKnowledgeWorkspace(next)
    setHydrated(true)
  }, [])

  useEffect(() => {
    const hostname = window.location.hostname
    const localTimeout = window.setTimeout(() => setIsLocal(hostname === "localhost" || hostname === "127.0.0.1"), 0)
    if (hasRecentAuthentication()) {
      const hydrateTimeout = window.setTimeout(() => {
        setAuth("ready")
        void hydrate()
      }, 0)
      return () => {
        window.clearTimeout(localTimeout)
        window.clearTimeout(hydrateTimeout)
      }
    }
    void fetch("/api/campaign-auth", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error()
      const payload = await response.json() as { authenticated?: boolean }
      if (payload.authenticated) { rememberAuthenticatedActivity(); setAuth("ready"); await hydrate() } else setAuth("locked")
    }).catch(() => setAuth("locked"))
    return () => window.clearTimeout(localTimeout)
  }, [hydrate])

  useEffect(() => {
    if (auth !== "ready") return
    let verificationRunning = false
    const registerActivity = () => {
      const idleFor = Date.now() - lastAuthenticatedActivity()
      rememberAuthenticatedActivity()
      if (idleFor < AUTH_IDLE_MILLISECONDS || verificationRunning) return
      verificationRunning = true
      void fetch("/api/campaign-auth", { cache: "no-store" }).then(async (response) => {
        if (!response.ok) return
        const payload = await response.json() as { authenticated?: boolean }
        if (!payload.authenticated) setAuth("locked")
      }).finally(() => { verificationRunning = false })
    }
    const events: (keyof WindowEventMap)[] = ["pointerdown", "keydown", "touchstart"]
    events.forEach((event) => window.addEventListener(event, registerActivity, { passive: true }))
    window.addEventListener("focus", registerActivity)
    return () => {
      events.forEach((event) => window.removeEventListener(event, registerActivity))
      window.removeEventListener("focus", registerActivity)
    }
  }, [auth])

  useEffect(() => {
    if (auth !== "ready" || !hydrated) return
    const timeout = window.setTimeout(() => {
      setSyncState((current) => current === "local" ? "local" : "syncing")
      void saveKnowledgeWorkspace(state).then(async () => {
        try {
          const response = await fetch("/api/campaign-data", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(state) })
          setSyncState(response.ok ? "synced" : "local")
        } catch { setSyncState("local") }
      }).catch(() => setSyncState("error"))
    }, 850)
    return () => window.clearTimeout(timeout)
  }, [auth, hydrated, state])

  useEffect(() => {
    if (!hydrated || !obsidianPreferences.enabled || !obsidianPreferences.automatic) return
    let stopped = false
    let running = false
    const syncVault = async () => {
      if (running || stopped || document.visibilityState === "hidden") return
      const apiKey = readObsidianApiKey()
      if (obsidianPreferences.mode === "api" && !apiKey) return
      running = true
      setSyncState("syncing")
      try {
        const result = obsidianPreferences.mode === "folder"
          ? await syncWorkspaceToLocalVault(stateRef.current, false)
          : await syncWorkspaceToObsidian(stateRef.current, { baseUrl: obsidianPreferences.baseUrl, rootFolder: obsidianPreferences.rootFolder, apiKey })
        if (stopped) return
        stateRef.current = result.state
        setState(result.state)
        await saveKnowledgeWorkspace(result.state)
        setSyncState("synced")
        if (result.imported) setNotice(`${result.imported} página${result.imported === 1 ? " importada" : "s importadas"} do vault.`)
      } catch {
        if (!stopped) setSyncState("local")
      } finally {
        running = false
      }
    }
    const refreshOnFocus = () => { if (document.visibilityState === "visible") void syncVault() }
    void syncVault()
    const interval = window.setInterval(() => void syncVault(), 30_000)
    window.addEventListener("focus", refreshOnFocus)
    document.addEventListener("visibilitychange", refreshOnFocus)
    return () => {
      stopped = true
      window.clearInterval(interval)
      window.removeEventListener("focus", refreshOnFocus)
      document.removeEventListener("visibilitychange", refreshOnFocus)
    }
  }, [hydrated, obsidianPreferences.automatic, obsidianPreferences.baseUrl, obsidianPreferences.enabled, obsidianPreferences.mode, obsidianPreferences.rootFolder])

  async function authenticate(localPreview = false) {
    setAuthError("")
    if (localPreview) {
      try {
        const response = await fetch("/api/campaign-auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ localPreview: true }) })
        if (!response.ok) throw new Error()
        rememberAuthenticatedActivity()
        setAuth("ready")
        await hydrate()
        return
      } catch {
        setAuthError("Não foi possível iniciar o modo local.")
        return
      }
    }
    try {
      const response = await fetch("/api/campaign-auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password }) })
      if (!response.ok) { setAuthError("Token ou senha incorretos."); return }
      setToken(""); setPassword(""); rememberAuthenticatedActivity(); setAuth("ready"); await hydrate()
    } catch { setAuthError("Não foi possível acessar o servidor.") }
  }

  function mutate(updater: (current: KnowledgeWorkspaceState) => KnowledgeWorkspaceState): KnowledgeWorkspaceState {
    const result = { ...updater(state), updatedAt: Date.now() }
    setState(result)
    return result
  }

  function addCampaign() {
    const campaign = createCampaign()
    mutate((current) => ({ ...current, campaigns: [campaign, ...current.campaigns] }))
    setSelectedCampaignId(campaign.id)
  }

  function updateCampaign(values: Partial<CampaignRecord>) {
    if (!selectedCampaign) return
    mutate((current) => ({ ...current, campaigns: current.campaigns.map((campaign) => campaign.id === selectedCampaign.id ? { ...campaign, ...values, updatedAt: Date.now() } : campaign) }))
  }

  function removeCampaign() {
    if (!selectedCampaign || !window.confirm(`Excluir a campanha “${selectedCampaign.title}” e todas as páginas dela?`)) return
    mutate((current) => ({ ...current, campaigns: current.campaigns.filter((campaign) => campaign.id !== selectedCampaign.id), categories: current.categories.filter((category) => category.campaignId !== selectedCampaign.id), pages: current.pages.filter((page) => page.campaignId !== selectedCampaign.id) }))
    setSelectedCampaignId(state.campaigns.find((campaign) => campaign.id !== selectedCampaign.id)?.id ?? null)
  }

  function addPage() {
    const campaignId = area === "campaigns" ? selectedCampaignId : null
    if (area === "campaigns" && !campaignId) { addCampaign(); return }
    if (selectedKind === "graph") return
    setEditing(createKnowledgePage(area === "wiki" ? "wiki" : "campaign", selectedKind, campaignId))
  }

  function savePage(page: KnowledgePage) {
    const typedLinks = [...wikiLinkTitles(plainTextFromHtml(page.contentHtml)), ...wikiTitlesFromRichText(page.contentHtml)]
    const automaticLinks = state.pages.filter((candidate) => candidate.id !== page.id && typedLinks.some((title) => title.toLocaleLowerCase("pt-BR") === candidate.title.toLocaleLowerCase("pt-BR"))).map((candidate) => candidate.id)
    const orderNumber = page.order?.trim()
    const orderLinks = orderNumber && page.scope === "campaign" && ["mission", "event"].includes(page.kind)
      ? state.pages.filter((candidate) => candidate.id !== page.id && candidate.scope === "campaign" && candidate.campaignId === page.campaignId && ["mission", "event"].includes(candidate.kind) && candidate.order && Number.parseInt(candidate.order, 10) === Number.parseInt(orderNumber, 10) - 1).map((candidate) => candidate.id)
      : []
    const readyPage = { ...page, linkedPageIds: [...new Set([...page.linkedPageIds, ...automaticLinks, ...orderLinks])] }
    const next = mutate((current) => ({ ...current, pages: current.pages.some((candidate) => candidate.id === readyPage.id) ? current.pages.map((candidate) => candidate.id === readyPage.id ? readyPage : candidate) : [readyPage, ...current.pages] }))
    setEditing(null)
    if (obsidianPreferences.enabled && obsidianPreferences.automatic) {
      const apiKey = readObsidianApiKey()
      const task: Promise<VaultSyncResult> | null = obsidianPreferences.mode === "folder"
        ? syncWorkspaceToLocalVault(next, false)
        : apiKey ? syncWorkspaceToObsidian(next, { baseUrl: obsidianPreferences.baseUrl, rootFolder: obsidianPreferences.rootFolder, apiKey }) : null
      if (task) void task.then(async (result) => { setState(result.state); await saveKnowledgeWorkspace(result.state); setNotice(`“${readyPage.title}” sincronizada com o vault.`) }).catch(() => setNotice("Página salva localmente. O vault será atualizado quando estiver disponível."))
    }
  }

  function removePage(id: string) {
    mutate((current) => ({ ...current, pages: current.pages.filter((page) => page.id !== id).map((page) => ({ ...page, linkedPageIds: page.linkedPageIds.filter((linkedId) => linkedId !== id) })) }))
    setEditing(null)
  }

  function addCategory() {
    const name = categoryName.trim()
    if (!name) return
    const category: KnowledgeCategory = { id: createKnowledgeId("category"), scope: area === "wiki" ? "wiki" : "campaign", campaignId: area === "campaigns" ? selectedCampaignId : null, name, parentId: null }
    mutate((current) => ({ ...current, categories: [...current.categories, category] }))
    setCategoryName("")
  }

  async function launchEncounter(page: KnowledgePage) {
    const dmState = await loadLocalState()
    if (!dmState) { setNotice("Abra ou crie o bestiário antes de iniciar o encontro."); return }
    const actors: EncounterActor[] = []
    for (const reference of page.encounterCreatures) {
      const entry = dmState.entries.find((candidate) => candidate.id === reference.entryId)
      if (!entry) continue
      for (let copyNumber = 1; copyNumber <= reference.quantity; copyNumber += 1) actors.push({ id: createKnowledgeId("actor"), sourceId: entry.id, copyNumber, character: cloneCharacter(entry.character), masteryTableId: entry.masteryTableId })
    }
    if (actors.length === 0) { setNotice("Nenhuma ficha válida do bestiário foi encontrada neste encontro."); return }
    const encounterNotes = [page.title, page.summary].filter(Boolean).map((value, index) => `<p>${index === 0 ? `<strong>${escapeHtml(value)}</strong>` : escapeHtml(value)}</p>`).join("")
    await saveLocalState({ ...dmState, encounter: actors, workspaceNotesHtml: encounterNotes, updatedAt: Date.now() })
    window.location.assign("/?view=encounter")
  }

  const scopedPages = useMemo(() => state.pages.filter((page) => area === "wiki" ? page.scope === "wiki" : page.scope === "campaign" && page.campaignId === selectedCampaignId), [area, selectedCampaignId, state.pages])
  const scopedCategories = useMemo(() => state.categories.filter((category) => area === "wiki" ? category.scope === "wiki" : category.scope === "campaign" && category.campaignId === selectedCampaignId), [area, selectedCampaignId, state.categories])
  const tags = useMemo(() => [...new Set(scopedPages.flatMap((page) => page.tags))].sort((a, b) => a.localeCompare(b, "pt-BR")), [scopedPages])
  const filteredPages = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR")
    return scopedPages.filter((page) => selectedKind === "graph" || page.kind === selectedKind)
      .filter((page) => !term || [page.title, page.summary, ...(page.kind === "encounter" ? [] : [plainTextFromHtml(page.contentHtml)]), ...page.tags].some((value) => value.toLocaleLowerCase("pt-BR").includes(term)))
      .filter((page) => tagFilter === "all" || page.tags.includes(tagFilter))
      .filter((page) => categoryFilter === "all" || page.categoryIds.includes(categoryFilter))
      .filter((page) => statusFilter === "all" || page.status === statusFilter)
      .sort((left, right) => (right.date || "").localeCompare(left.date || "") || right.updatedAt - left.updatedAt)
  }, [categoryFilter, scopedPages, search, selectedKind, statusFilter, tagFilter])

  if (auth === "checking") return <SessionCheckingScreen area={area} />
  if (auth === "locked") return <AccessScreen token={token} password={password} error={authError} isLocal={isLocal} onToken={setToken} onPassword={setPassword} onSubmit={() => void authenticate(false)} onLocal={() => void authenticate(true)} area={area} />

  const kinds = area === "wiki" ? [...WIKI_SECTIONS, { id: "graph", label: "Gráfico" } as const] : [...CAMPAIGN_PAGE_KINDS.filter((kind) => kind.id !== "session-note"), { id: "graph", label: "Gráfico" } as const]
  return <main className="knowledge-shell knowledge-app">
    <KnowledgeHeader area={area} syncState={syncState} onObsidian={() => setObsidianOpen(true)} />
    <div className={`knowledge-layout ${area === "wiki" ? "wiki-layout" : ""}`}>
      {area === "campaigns" && <aside className="campaign-sidebar"><header><span><BookMarked size={18} /> Campanhas</span><button onClick={addCampaign} aria-label="Criar campanha"><Plus size={17} /></button></header><div>{state.campaigns.map((campaign) => { const pageCount = state.pages.filter((page) => page.campaignId === campaign.id).length; return <button key={campaign.id} className={campaign.id === selectedCampaignId ? "active" : ""} onClick={() => setSelectedCampaignId(campaign.id)}><span>{campaign.title || "Campanha sem nome"}</span><small>{countLabel(pageCount, "registro", "registros")}</small><ChevronRight size={15} /></button> })}</div>{state.campaigns.length === 0 && <p>Crie sua primeira campanha para organizar missões e sessões.</p>}</aside>}
      <section className="knowledge-workspace">
        {area === "campaigns" && selectedCampaign ? <CampaignHeading campaign={selectedCampaign} onChange={updateCampaign} onDelete={removeCampaign} /> : <div className="knowledge-heading"><div><p className="eyebrow">Arquivo de Ordem x Caos</p><h1>{area === "wiki" ? "Wiki" : "Campanhas"}</h1><p>{area === "wiki" ? "Seu mundo interligado, pesquisável e compatível com Obsidian." : "Organize aventuras, sessões e encontros em um único lugar."}</p></div>{area === "campaigns" && !selectedCampaign && <button className="primary-button" onClick={addCampaign}><Plus size={17} /> Criar campanha</button>}</div>}
        {(area === "wiki" || selectedCampaign) && <>
          <nav className="knowledge-tabs" aria-label="Tipos de página">{kinds.map((kind) => <button key={kind.id} className={selectedKind === kind.id ? "active" : ""} onClick={() => setSelectedKind(kind.id as KnowledgePageKind | "graph")}>{kind.id === "graph" ? <><Network size={16} /> Gráfico</> : kind.label}</button>)}</nav>
          {selectedKind !== "graph" && <div className="knowledge-toolbar"><label className="knowledge-search"><Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar no título, texto, tag ou resumo…" /><kbd>{filteredPages.length}</kbd></label><div className="knowledge-filters"><label><Filter size={14} /><select value={tagFilter} onChange={(event) => setTagFilter(event.target.value)}><option value="all">Todas as tags</option>{tags.map((tag) => <option key={tag}>{tag}</option>)}</select></label><label><select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="all">Todas as categorias</option>{scopedCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>{area === "campaigns" && ["mission", "event"].includes(selectedKind) && <label><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">Todos os status</option>{CAMPAIGN_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></label>}<span className="date-sort-hint"><CalendarDays size={14} /> Mais novas primeiro</span><button className="filter-clear" title="Limpar filtros" onClick={() => { setSearch(""); setTagFilter("all"); setCategoryFilter("all"); setStatusFilter("all") }}><X size={15} /></button></div><div className="category-creator"><label><FolderPlus size={16} /><input value={categoryName} onChange={(event) => setCategoryName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") addCategory() }} placeholder="Nova categoria" /></label><button onClick={addCategory}>Adicionar</button><button className="primary-button" onClick={addPage}><Plus size={17} /> {selectedKind === "encounter" ? "Novo encontro" : "Nova página"}</button></div></div>}
          {selectedKind === "graph" ? <KnowledgeGraph pages={scopedPages.filter((page) => area === "wiki" ? true : ["mission", "event", "gm-note"].includes(page.kind))} onOpen={setEditing} /> : selectedKind === "chronology" ? <ChronologyTimeline pages={filteredPages} onOpen={setEditing} /> : <PageGrid pages={filteredPages} categories={scopedCategories} onOpen={setEditing} onCreate={addPage} />}
        </>}
      </section>
    </div>
    {notice && <button className="knowledge-toast" onClick={() => setNotice("")}><Check size={15} /> {notice}<X size={14} /></button>}
    {editing && <KnowledgeEditor page={editing} pages={scopedPages} categories={scopedCategories} bestiary={bestiary} backlinks={scopedPages.filter((page) => page.linkedPageIds.includes(editing.id) || [...wikiLinkTitles(plainTextFromHtml(page.contentHtml)), ...wikiTitlesFromRichText(page.contentHtml)].some((title) => title.toLocaleLowerCase("pt-BR") === editing.title.toLocaleLowerCase("pt-BR")))} onSave={savePage} onDelete={removePage} onClose={() => setEditing(null)} onLaunchEncounter={(page) => void launchEncounter(page)} />}
    {obsidianOpen && <ObsidianDialog state={state} onClose={() => setObsidianOpen(false)} onPreferencesChange={setObsidianPreferences} onStateChange={(next) => { setState(next); void saveKnowledgeWorkspace(next) }} />}
  </main>
}

function SessionCheckingScreen({ area }: { area: PortalArea }) {
  return <main className="knowledge-shell">
    <header className="topbar knowledge-appbar">
      <a className="brand" href="/"><span className="brand-rune">R</span><span><strong>Runas DM</strong><small>Arquivo do mestre</small></span></a>
      <KnowledgeNavigation area={area} />
      <span aria-hidden="true" />
    </header>
    <div className="loading-screen knowledge-session-loading"><span className="brand-rune">R</span><p>Reabrindo o arquivo do mestre…</p></div>
  </main>
}

function AccessScreen({ token, password, error, isLocal, onToken, onPassword, onSubmit, onLocal, area }: { token: string; password: string; error: string; isLocal: boolean; onToken: (value: string) => void; onPassword: (value: string) => void; onSubmit: () => void; onLocal: () => void; area: PortalArea }) {
  return <main className="knowledge-shell">
    <header className="topbar knowledge-appbar">
      <a className="brand" href="/"><span className="brand-rune">R</span><span><strong>Runas DM</strong><small>Arquivo do mestre</small></span></a>
      <KnowledgeNavigation area={area} />
      <span aria-hidden="true" />
    </header>
    <section className="knowledge-access-layout">
      <div className="knowledge-access-copy">
        <p className="eyebrow"><ShieldCheck size={15} /> Área privada</p>
        <h1>Seu mundo, organizado como uma biblioteca viva.</h1>
        <p>Campanhas, missões, encontros e toda a Wiki de Ordem x Caos ficam sincronizados em um único arquivo do mestre.</p>
        <div className="knowledge-access-features"><span><BookMarked size={18} /><strong>Campanhas conectadas</strong><small>Missões, eventos, sessões e encontros.</small></span><span><LibraryBig size={18} /><strong>Wiki com vínculos</strong><small>Categorias, backlinks e visualização em gráfico.</small></span></div>
      </div>
      <form className="knowledge-access-card" onSubmit={(event) => { event.preventDefault(); onSubmit() }}>
        <span className="knowledge-access-icon"><LockKeyhole size={25} /></span>
        <div><p className="eyebrow">Acesso do mestre</p><h2>Desbloquear arquivo</h2><p>As credenciais são verificadas no servidor e não ficam salvas neste dispositivo.</p></div>
        <>
          <label><span>Token privado</span><div><KeyRound size={17} /><input type="password" value={token} onChange={(event) => onToken(event.target.value)} autoComplete="off" placeholder="Cole o token do Runas DM" /></div></label>
          <label><span>Senha da campanha</span><div><LockKeyhole size={17} /><input type="password" value={password} onChange={(event) => onPassword(event.target.value)} autoComplete="current-password" placeholder="Digite sua senha" /></div></label>
          {error && <p className="auth-error"><CircleAlert size={15} /> {error}</p>}
          <button className="primary-button" type="submit" disabled={!token || !password}>Entrar e sincronizar</button>
          {isLocal && <button className="secondary-button" type="button" onClick={onLocal}>Abrir modo local de desenvolvimento</button>}
        </>
        <small>Protegido também pelo acesso privado do Cloudflare.</small>
      </form>
    </section>
  </main>
}

function KnowledgeHeader({ area, syncState, onObsidian }: { area: PortalArea; syncState: SyncState; onObsidian: () => void }) {
  const sync = syncState === "synced" ? { icon: Cloud, label: "Sincronizado" } : syncState === "syncing" || syncState === "loading" ? { icon: RefreshCw, label: "Sincronizando" } : syncState === "error" ? { icon: CircleAlert, label: "Falha ao salvar" } : { icon: WifiOff, label: "Salvo localmente" }
  const Icon = sync.icon
  return <header className="topbar knowledge-appbar">
    <a className="brand" href="/"><span className="brand-rune">R</span><span><strong>Runas DM</strong><small>Arquivo do mestre</small></span></a>
    <KnowledgeNavigation area={area} />
    <div className="top-actions knowledge-header-actions"><span className={`knowledge-sync ${syncState}`}><Icon className={syncState === "syncing" || syncState === "loading" ? "spin" : ""} size={14} /> {sync.label}</span><button className="secondary-button" onClick={onObsidian}><Settings2 size={16} /> Obsidian</button></div>
  </header>
}

function KnowledgeNavigation({ area }: { area: PortalArea }) {
  // Vinext beta currently breaks next/link RSC transitions after production
  // updates. Real anchors deliberately keep every destination independently
  // reloadable and make stale client-router state irrelevant.
  return <nav className="view-switch" aria-label="Áreas do Runas DM">
    <a href="/"><Archive size={17} /> Bestiário</a>
    <a href="/?view=encounter"><Swords size={17} /> Mesa</a>
    <a className={area === "campaigns" ? "active" : ""} href="/campaigns"><BookMarked size={17} /> Campanhas</a>
    <a className={area === "wiki" ? "active" : ""} href="/wiki"><LibraryBig size={17} /> Wiki</a>
  </nav>
}

function CampaignHeading({ campaign, onChange, onDelete }: { campaign: CampaignRecord; onChange: (values: Partial<CampaignRecord>) => void; onDelete: () => void }) {
  const style = { ...(campaign.backgroundColor ? { backgroundColor: campaign.backgroundColor } : {}), ...(campaign.textColor ? { color: campaign.textColor } : {}), ...(campaign.backgroundImageDataUrl ? { backgroundImage: `linear-gradient(#171316bb,#171316dd),url(${campaign.backgroundImageDataUrl})`, backgroundSize: "cover" } : {}) }
  return <div className="campaign-heading" style={style}><div><p className="eyebrow">Campanha ativa</p><input className="campaign-title-input" value={campaign.title} onChange={(event) => onChange({ title: event.target.value })} aria-label="Nome da campanha" /><ExpandableTextarea resizeKey={campaign.id} value={campaign.description} onChange={(event) => onChange({ description: event.target.value })} placeholder="Resumo da campanha, tom e objetivo central…" /><div className="visual-settings campaign-visual-settings"><label>Cor de destaque <input type="color" value={campaign.accentColor || "#58a667"} onChange={(event) => onChange({ accentColor: event.target.value })} /></label><label>Cor do fundo <input type="color" value={campaign.backgroundColor || "#171316"} onChange={(event) => onChange({ backgroundColor: event.target.value })} /></label><label>Cor do texto <input type="color" value={campaign.textColor || "#f5eeee"} onChange={(event) => onChange({ textColor: event.target.value })} /></label><label>Imagem <input type="file" accept="image/*" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => onChange({ backgroundImageDataUrl: String(reader.result) }); reader.readAsDataURL(file) }} /></label>{campaign.backgroundImageDataUrl && <button className="secondary-button" onClick={() => onChange({ backgroundImageDataUrl: "" })}>Remover imagem</button>}</div></div><button className="icon-button danger-icon" title="Excluir campanha" onClick={onDelete}><Trash2 size={17} /></button></div>
}

function ChronologyTimeline({ pages, onOpen }: { pages: KnowledgePage[]; onOpen: (page: KnowledgePage) => void }) {
  const ordered = [...pages].sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999") || a.createdAt - b.createdAt)
  if (!ordered.length) return <div className="knowledge-empty"><CalendarDays size={32} /><strong>Nenhum evento cronológico.</strong><p>Adicione páginas com data para formar a linha do tempo do universo.</p></div>
  return <div className="chronology-timeline">{ordered.map((page) => <button className="chronology-event" key={page.id} onClick={() => onOpen(page)}><time>{page.date ? new Date(`${page.date}T12:00:00`).toLocaleDateString("pt-BR") : "Sem data"}</time><span className="chronology-dot" /><div><small>{page.tags.slice(0, 2).map((tag) => `#${tag}`).join(" ")}</small><h2>{page.title}</h2><p>{page.summary || plainTextFromHtml(page.contentHtml).slice(0, 220) || "Sem descrição."}</p></div></button>)}</div>
}

function PageGrid({ pages, categories, onOpen, onCreate }: { pages: KnowledgePage[]; categories: KnowledgeCategory[]; onOpen: (page: KnowledgePage) => void; onCreate: () => void }) {
  if (pages.length === 0) return <div className="knowledge-empty"><BookMarked size={32} /><strong>Nenhum registro encontrado.</strong><p>Crie o primeiro registro ou ajuste os filtros desta seção.</p><button className="primary-button" onClick={onCreate}><Plus size={16} /> Criar</button></div>
  return <div className="knowledge-grid">{pages.map((page) => { const creatureCount = page.encounterCreatures.reduce((sum, item) => sum + item.quantity, 0); const style = { ...(page.accentColor ? { borderColor: page.accentColor } : {}), ...(page.backgroundColor ? { backgroundColor: page.backgroundColor } : {}), ...(page.textColor ? { color: page.textColor } : {}), ...(page.backgroundImageDataUrl ? { backgroundImage: `linear-gradient(#171316bb,#171316dd),url(${page.backgroundImageDataUrl})`, backgroundSize: "cover" } : {}) }; return <button key={page.id} className="knowledge-card" style={style} onClick={() => onOpen(page)}><header><span>{page.order ? `${page.order} · ` : ""}{kindLabel(page.kind)}</span>{["mission", "event"].includes(page.kind) && <b className={statusClass(page.status)}>{page.status}</b>}</header><h2>{page.title || (page.kind === "encounter" ? "Encontro sem nome" : "Página sem nome")}</h2><p>{page.summary || (page.kind === "encounter" ? "Sem notas do mestre." : plainTextFromHtml(page.contentHtml).slice(0, 180) || "Sem resumo.")}</p><div className="knowledge-card-meta">{page.date && <span><CalendarDays size={13} /> {new Date(`${page.date}T12:00:00`).toLocaleDateString("pt-BR")}</span>}{page.kind !== "encounter" && page.linkedPageIds.length > 0 && <span><Network size={13} /> {countLabel(page.linkedPageIds.length, "vínculo", "vínculos")}</span>}{creatureCount > 0 && <span><Swords size={13} /> {countLabel(creatureCount, "inimigo", "inimigos")}</span>}</div><footer>{categories.filter((category) => page.categoryIds.includes(category.id)).slice(0, 2).map((category) => <span key={category.id}>{category.name}</span>)}{page.tags.slice(0, 3).map((tag) => <i key={tag}>#{tag}</i>)}</footer></button> })}</div>
}
