"use client"

/* eslint-disable @next/next/no-html-link-for-pages, @next/next/no-location-assign-relative-destination -- Vinext beta's RSC router is not reliable in the Pages production bundle. */

import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Archive, BookMarked, BookOpen, CalendarDays, Check, CloudDownload, CloudUpload, Filter, LibraryBig, Network, Plus, Search, Settings2, Swords, Trash2, X } from "lucide-react"
import { getRunasVtt, toVttCharacter, VTT_MAX_IMPORT_BATCH } from "@runas/vtt-bridge"
import { cloneCharacter, type BestiaryEntry, type EncounterActor } from "../lib/model"
import { loadLocalState, saveLocalState } from "../lib/storage"
import { applyCloudBackup, CAMPAIGN_MAIN_SECTIONS, CAMPAIGN_STATUSES, WIKI_SECTIONS, chronologyEraPages, createCampaign, createKnowledgeId, createKnowledgePage, mergeKnowledgeWorkspaces, effectivePageLinks, isChronologyPage, pageKindLabel, sortKnowledgePages, storyEventsOf, withRefreshedStories, withStoryEvents, type CampaignMainSection, type CloudImportMode, type PageSort, plainTextFromHtml, wikiLinkTitles, type CampaignRecord, type KnowledgeCategory, type KnowledgePage, type KnowledgePageKind, type KnowledgeTag, type KnowledgeWorkspaceState } from "../lib/knowledge-model"
import { loadKnowledgeWorkspace, saveKnowledgeWorkspace } from "../lib/knowledge-storage"
import { readObsidianPreferences, ObsidianDialog, type ObsidianPreferences } from "./obsidian-dialog"
import { CloudImportDialog } from "./cloud-import-dialog"
import { BackupTokenDialog } from "./backup-token-dialog"
import { deleteCampaignHubNotesFromLocalVault, deletePageFromLocalVault, localVaultName, syncWorkspaceToLocalVault } from "../lib/local-vault"
import { ExpandableTextarea } from "./expandable-textarea"
import { KnowledgeEditor } from "./knowledge-editor"
import { CampaignAppearance, campaignTheme } from "./campaign-appearance"
import { formatFictionalYear, normalizeUniverseEras, resolveEra, withEraTags, type UniverseEra } from "../lib/chronology"
import { KnowledgeCardImage } from "./knowledge-card-image"
import { KnowledgeGraph } from "./knowledge-graph"
import { StoryDocument } from "./story-document"
import { wikiTitlesFromRichText } from "./rich-text-editor"
import { ThemeToggle } from "./theme-toggle"
import { TopbarMenu } from "./topbar-menu"
import { useKnowledgeRoute } from "../lib/knowledge-route"
import { ensureTagsForPage, normalizedTagName, pagesForTag, removeTagFromSection, renameTag, tagsForSection } from "../lib/knowledge-tags"
import { TagEditor } from "./tag-editor"
import { TagGrid } from "./tag-grid"
import { TagPage } from "./tag-page"
import { ChronologyEraPage } from "./chronology-era-page"
import { pagesOutsideAllowedFolders } from "../lib/obsidian-sync"
import { CampaignPortal } from "./campaign-portal"
import { CampaignStory } from "./campaign-story"
import { CampaignWorld, type CampaignWorldSection } from "./campaign-world"
import { CampaignAdventure, type CampaignAdventureSection } from "./campaign-adventure"
import { WikiPortal } from "./wiki-portal"

type PortalArea = "campaigns" | "wiki"
type PortalKind = KnowledgePageKind | CampaignMainSection
type SyncState = "loading" | "local" | "syncing" | "synced" | "error"
type CloudAction = "backup" | "import"

// Campanhas e Wiki são locais e abrem sem login. O token só ativa o backup na
// nuvem e é o mesmo do Bestiário: fica apenas na sessão desta aba.
const BACKUP_TOKEN_KEY = "runas-dm.backup-token"

function readBackupToken(): string {
  if (typeof window === "undefined") return ""
  return sessionStorage.getItem(BACKUP_TOKEN_KEY) ?? ""
}

function statusClass(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").replace(/\s+/g, "-")
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;")
}

/** Uma História é datada pelo calendário fictício dos seus acontecimentos, nunca pela criação do arquivo. */
function storyYearRange(story: KnowledgePage, pages: KnowledgePage[], eras: UniverseEra[]): string {
  const dated = story.storyEventIds.flatMap((id) => {
    const event = pages.find((candidate) => candidate.id === id)
    return event && event.eventYear != null ? [event] : []
  })
  if (dated.length === 0) return ""
  const calendar = resolveEra(dated[0].eventYear, eras, dated[0].eraId)?.calendar
  const years = dated.map((event) => event.eventYear as number)
  const first = Math.min(...years)
  const last = Math.max(...years)
  return first === last ? formatFictionalYear(first, calendar) : `${first.toLocaleString("pt-BR")} – ${formatFictionalYear(last, calendar)}`
}

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`
}

export function KnowledgePortal({ area }: { area: PortalArea }) {
  const [state, setState] = useState<KnowledgeWorkspaceState>(() => ({ version: 3, campaigns: [], categories: [], tags: [], pages: [], deletedIds: [], updatedAt: 0 }))
  const [syncState, setSyncState] = useState<SyncState>("loading")
  const [pendingCloudAction, setPendingCloudAction] = useState<CloudAction | null>(null)
  const [cloudBackupRequest, setCloudBackupRequest] = useState(0)
  const [bestiary, setBestiary] = useState<BestiaryEntry[]>([])
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null)
  const [selectedKind, setSelectedKind] = useState<PortalKind>(area === "wiki" ? "chronology" : "adventure")
  const [hydrated, setHydrated] = useState(false)
  const [search, setSearch] = useState("")
  const [tagFilter, setTagFilter] = useState("all")
  const [categoryFilter, setCategoryFilter] = useState("all")
  const [dateSort, setDateSort] = useState<PageSort>(area === "campaigns" ? "order" : "recent")
  const [eraFilter] = useState("estrelas")
  const [statusFilter, setStatusFilter] = useState("all")
  const [editing, setEditing] = useState<KnowledgePage | null>(null)
  const [openStoryId, setOpenStoryId] = useState<string | null>(null)
  const [obsidianOpen, setObsidianOpen] = useState(false)
  const [obsidianPreferences, setObsidianPreferences] = useState<ObsidianPreferences>(() => readObsidianPreferences())
  const [cloudImportOpen, setCloudImportOpen] = useState(false)
  const [notice, setNotice] = useState("")
  const [tagEditor, setTagEditor] = useState<{ tag?: KnowledgeTag; section: string } | null>(null)
  const [route, navigateRoute] = useKnowledgeRoute(area === "wiki" ? "/wiki" : "/campaigns")
  const hydratedOnce = useRef(false)
  const stateRef = useRef(state)
  // Serializa qualquer operação que leia ou grave o vault: sem isso, apagar
  // uma campanha/página corre com a sincronização automática (a cada 30s ou
  // ao focar a aba), que pode ler o arquivo ainda não apagado no meio da
  // exclusão e reimportá-lo com um id novo, ressuscitando o registro.
  const vaultLockRef = useRef<Promise<unknown>>(Promise.resolve())
  const withVaultLock = useCallback(<T,>(task: () => Promise<T>): Promise<T> => {
    const run = vaultLockRef.current.catch(() => undefined).then(task)
    vaultLockRef.current = run.catch(() => undefined)
    return run
  }, [])

  const selectedCampaign = state.campaigns.find((campaign) => campaign.id === selectedCampaignId) ?? null
  const outsidePages = useMemo(() => pagesOutsideAllowedFolders(state), [state])

  useEffect(() => { stateRef.current = state }, [state])

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setSelectedKind(area === "wiki" ? "chronology" : "adventure")
      setOpenStoryId(null)
      setSearch("")
      setTagFilter("all")
      setCategoryFilter("all")
      setStatusFilter("all")
      setEditing(null)
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [area])

  useEffect(() => {
    if (area !== "wiki") return
    const section = route.campaignId
    if (section && WIKI_SECTIONS.some((item) => item.id === section)) {
      const timeout = window.setTimeout(() => setSelectedKind(section as PortalKind), 0)
      return () => window.clearTimeout(timeout)
    }
  }, [area, route.campaignId])

  useEffect(() => {
    if (area !== "campaigns") return
    const timeout = window.setTimeout(() => {
      if (route.campaignId && state.campaigns.some((campaign) => campaign.id === route.campaignId)) setSelectedCampaignId(route.campaignId)
      const legacyPage = route.page as string | null
      const mappedPage = legacyPage === "mission" || legacyPage === "event" || legacyPage === "encounter" ? "adventure" : legacyPage === "gm-note" ? "campaign-notes" : legacyPage
      if (mappedPage && ([...CAMPAIGN_MAIN_SECTIONS.map((item) => item.id), "mission", "event", "gm-note", "encounter"] as string[]).includes(mappedPage)) setSelectedKind(mappedPage as PortalKind)
      if (route.campaignId && route.section == null && ["mission", "event", "encounter", "gm-note"].includes(legacyPage ?? "")) navigateRoute({ campaignId: route.campaignId, page: legacyPage === "gm-note" ? "campaign-notes" : "adventure", section: legacyPage === "gm-note" ? undefined : legacyPage ?? undefined }, true)
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [area, navigateRoute, route.campaignId, route.page, route.section, state.campaigns])

  const hydrate = useCallback(async () => {
    if (hydratedOnce.current) return
    hydratedOnce.current = true
    setSyncState("loading")
    const [local, dmState] = await Promise.all([loadKnowledgeWorkspace(), loadLocalState().catch(() => null)])
    if (dmState) setBestiary(dmState.entries)
    // A nuvem nunca é consultada sozinha: o estado local é sempre a fonte de
    // verdade ao abrir. O backup remoto só entra quando o usuário pede pela
    // ação "Importar da nuvem".
    setState(local)
    setSelectedCampaignId((current) => current ?? local.campaigns[0]?.id ?? null)
    setSyncState("local")
    setHydrated(true)
  }, [])

  useEffect(() => {
    const timeout = window.setTimeout(() => void hydrate(), 0)
    return () => window.clearTimeout(timeout)
  }, [hydrate])

  useEffect(() => {
    if (!hydrated) return
    const timeout = window.setTimeout(() => {
      setSyncState("syncing")
      void (async () => {
        try {
          await saveKnowledgeWorkspace(stateRef.current)
          // Sem token, o backup na nuvem fica desativado e tudo continua local.
          const token = readBackupToken()
          if (!token) { setSyncState("local"); return }
          // A nuvem é só backup: manda o estado local exatamente como está,
          // sem buscar nem mesclar o remoto antes. Isso também elimina o
          // custo de um GET a cada edição.
          const putResponse = await fetch("/api/campaign-data", { method: "PUT", headers: { "Content-Type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(stateRef.current) })
          if (putResponse.status === 401) sessionStorage.removeItem(BACKUP_TOKEN_KEY)
          setSyncState(putResponse.ok ? "synced" : "local")
        } catch { setSyncState("local") }
      })()
    }, 850)
    return () => window.clearTimeout(timeout)
  }, [hydrated, state, cloudBackupRequest])

  useEffect(() => {
    if (!hydrated || !obsidianPreferences.enabled || !obsidianPreferences.automatic) return
    let stopped = false
    let running = false
    const syncVault = async () => {
      if (running || stopped || document.visibilityState === "hidden") return
      if (!await localVaultName()) return
      running = true
      setSyncState("syncing")
      try {
        const result = await withVaultLock(() => syncWorkspaceToLocalVault(stateRef.current, false))
        if (stopped) return
        // A sincronização lê o vault em segundos; edições feitas nesse meio
        // tempo (como trocar a imagem da campanha em Estilo) já avançaram
        // `stateRef.current` e não podem ser descartadas por um resultado
        // calculado a partir de um instantâneo mais antigo.
        const merged = mergeKnowledgeWorkspaces(stateRef.current, result.state)
        stateRef.current = merged
        setState(merged)
        await saveKnowledgeWorkspace(merged)
        setSyncState("synced")
        if (result.imported) setNotice(`${result.imported} página${result.imported === 1 ? " importada" : "s importadas"} do vault.`)
      } catch (error) {
        if (!stopped) {
          setSyncState("local")
          setNotice(error instanceof Error ? `Obsidian: ${error.message}` : "Obsidian indisponível; alterações mantidas localmente.")
        }
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
  }, [hydrated, obsidianPreferences.automatic, obsidianPreferences.enabled, withVaultLock])

  function requestCloudAction(action: CloudAction) {
    if (!readBackupToken()) { setPendingCloudAction(action); return }
    if (action === "backup") setCloudBackupRequest((count) => count + 1)
    else setCloudImportOpen(true)
  }

  function submitBackupToken(token: string) {
    const action = pendingCloudAction
    sessionStorage.setItem(BACKUP_TOKEN_KEY, token)
    setPendingCloudAction(null)
    if (action === "backup") setCloudBackupRequest((count) => count + 1)
    if (action === "import") setCloudImportOpen(true)
  }

  async function importFromCloud(mode: CloudImportMode) {
    setCloudImportOpen(false)
    try {
      const response = await fetch("/api/campaign-data", { cache: "no-store", headers: { authorization: `Bearer ${readBackupToken()}` } })
      if (response.status === 401) { sessionStorage.removeItem(BACKUP_TOKEN_KEY); setNotice("Token de backup inválido."); return }
      if (!response.ok) throw new Error()
      const payload = await response.json() as { state: unknown; updatedAt: number | null }
      if (!payload.state) { setNotice("Ainda não existe backup na nuvem."); return }
      const imported = applyCloudBackup(stateRef.current, payload.state, mode)
      stateRef.current = imported
      setState(imported)
      await saveKnowledgeWorkspace(imported)
      setNotice(mode === "replace" ? "Dados substituídos pelo backup da nuvem." : "Dados sincronizados com o backup da nuvem.")
    } catch { setNotice("Não foi possível ler o backup da nuvem.") }
  }

  function mutate(updater: (current: KnowledgeWorkspaceState) => KnowledgeWorkspaceState): KnowledgeWorkspaceState {
    // eslint-disable-next-line react-hooks/purity -- mutate() only ever runs from event handlers, never during render; this rule misattributes an unrelated call in removeCampaign's async cleanup (deleteCampaignHubNotesFromLocalVault) to this line instead of its own.
    const result = { ...updater(state), updatedAt: Date.now() }
    setState(result)
    return result
  }

  function addCampaign() {
    const campaign = createCampaign()
    mutate((current) => ({ ...current, campaigns: [campaign, ...current.campaigns] }))
    setSelectedCampaignId(campaign.id)
    navigateRoute({ campaignId: campaign.id, page: "adventure" })
  }

  function reorderCampaigns(fromId: string, toId: string) {
    mutate((current) => {
      const campaigns = [...current.campaigns]
      const from = campaigns.findIndex((campaign) => campaign.id === fromId)
      const to = campaigns.findIndex((campaign) => campaign.id === toId)
      if (from < 0 || to < 0 || from === to) return current
      campaigns.splice(to, 0, ...campaigns.splice(from, 1))
      return { ...current, campaigns }
    })
  }

  function updateCampaign(values: Partial<CampaignRecord>) {
    if (!selectedCampaign) return
    mutate((current) => ({ ...current, campaigns: current.campaigns.map((campaign) => campaign.id === selectedCampaign.id ? { ...campaign, ...values, updatedAt: Date.now() } : campaign) }))
  }

  function linkStory(storyId: string) {
    if (!selectedCampaign) return
    mutate((current) => ({ ...current, campaigns: current.campaigns.map((campaign) => campaign.id === selectedCampaign.id ? { ...campaign, storyIds: [...new Set([...(campaign.storyIds ?? []), storyId])] } : campaign) }))
  }

  function unlinkStory(storyId: string) {
    if (!selectedCampaign) return
    mutate((current) => ({ ...current, campaigns: current.campaigns.map((campaign) => campaign.id === selectedCampaign.id ? { ...campaign, storyIds: (campaign.storyIds ?? []).filter((id) => id !== storyId) } : campaign) }))
  }

  function linkWorldPage(pageId: string) {
    if (!selectedCampaign) return
    mutate((current) => ({ ...current, campaigns: current.campaigns.map((campaign) => campaign.id === selectedCampaign.id ? { ...campaign, worldPageIds: [...new Set([...(campaign.worldPageIds ?? []), pageId])], updatedAt: Date.now() } : campaign) }))
  }

  function unlinkWorldPage(pageId: string) {
    if (!selectedCampaign) return
    mutate((current) => ({ ...current, campaigns: current.campaigns.map((campaign) => campaign.id === selectedCampaign.id ? { ...campaign, worldPageIds: (campaign.worldPageIds ?? []).filter((id) => id !== pageId), updatedAt: Date.now() } : campaign) }))
  }

  function createWorldPage(kind: KnowledgePageKind, sectionLabel: string) {
    if (!selectedCampaign) return
    const singular = ({ Locais: "local", Organizações: "organização", Itens: "item", Personagens: "personagem" } as Record<string, string>)[sectionLabel] ?? sectionLabel.toLocaleLowerCase("pt-BR")
    const page = { ...createKnowledgePage("wiki", kind, null), title: `Novo ${singular}`, tags: [sectionLabel], date: "" }
    const next = mutate((current) => ({ ...current, pages: [page, ...current.pages], campaigns: current.campaigns.map((campaign) => campaign.id === selectedCampaign.id ? { ...campaign, worldPageIds: [...new Set([...(campaign.worldPageIds ?? []), page.id])], updatedAt: Date.now() } : campaign) }))
    setEditing(page)
    syncSavedState(next, page.title)
  }

  function updateOrganizer(nodes: NonNullable<CampaignRecord["organizer"]>["nodes"], edges: NonNullable<CampaignRecord["organizer"]>["edges"]) {
    if (!selectedCampaign) return
    updateCampaign({ organizer: { nodes, edges } })
  }

  function createCampaignStory() {
    if (!selectedCampaign) return
    createStory(selectedCampaign.id)
  }

  function removeCampaign() {
    if (!selectedCampaign || !window.confirm(`Excluir a campanha “${selectedCampaign.title}” e todas as páginas dela?`)) return
    const removedPages = state.pages.filter((page) => page.campaignId === selectedCampaign.id)
    mutate((current) => ({ ...current, campaigns: current.campaigns.filter((campaign) => campaign.id !== selectedCampaign.id), categories: current.categories.filter((category) => category.campaignId !== selectedCampaign.id), tags: current.tags.filter((tag) => !tag.pinnedIn.includes(`campaign-notes:${selectedCampaign.id}`)), pages: current.pages.filter((page) => page.campaignId !== selectedCampaign.id), deletedIds: [...new Set([...current.deletedIds, selectedCampaign.id, ...removedPages.map((page) => page.id)])] }))
    setSelectedCampaignId(state.campaigns.find((campaign) => campaign.id !== selectedCampaign.id)?.id ?? null)
    // Mesmo motivo do removePage: sem apagar as notas no vault, a próxima
    // sincronização as encontra intactas e ressuscita a campanha inteira. A
    // nota-hub "<Nome> (Campanha)" entra à parte porque pode nunca ter sido
    // rastreada como página vinculada — seu título sozinho já bastaria para
    // recriar a campanha na sincronização seguinte.
    const syncedPages = removedPages.filter((page) => page.obsidianPath)
    if (obsidianPreferences.enabled) {
      // Sequencial de propósito: pedir permissão de escrita concorrentemente
      // em várias chamadas arrisca disparar mais de um prompt do navegador
      // ao mesmo tempo.
      void withVaultLock(async () => {
        let failed = 0
        for (const page of syncedPages) {
          try { await deletePageFromLocalVault(page, true) } catch { failed += 1 }
        }
        let hubNotes = 0
        try { hubNotes = await deleteCampaignHubNotesFromLocalVault(selectedCampaign.title, true) } catch { failed += 1 }
        const totalNotes = syncedPages.length + hubNotes
        const message = failed
          ? `Campanha excluída do site. ${Math.max(0, totalNotes - failed)} de ${totalNotes} notas excluídas do vault.`
          : `Campanha e ${totalNotes} nota${totalNotes === 1 ? "" : "s"} excluídas também do vault.`
        if (totalNotes || failed) setNotice(message)
      })
    }
  }

  function addPage() {
    const campaignId = area === "campaigns" ? selectedCampaignId : null
    if (area === "campaigns" && !campaignId) { addCampaign(); return }
    if (selectedKind === "graph" || selectedKind === "appearance" || selectedKind === "campaign-stories" || selectedKind === "world" || selectedKind === "adventure" || selectedKind === "campaign-notes") return
    // Uma História não é escrita num formulário: ela abre como documento e é
    // preenchida criando acontecimentos.
    if (selectedKind === "story") { createStory(); return }
    const today = new Date().toISOString().slice(0, 10)
    const campaignKind = area === "campaigns" && ["mission", "event", "gm-note", "encounter"].includes(route.section ?? "") ? route.section as KnowledgePageKind : selectedKind
    if (area === "campaigns" && !["mission", "event", "gm-note", "encounter"].includes(campaignKind)) return
    const page = { ...createKnowledgePage(area === "wiki" ? "wiki" : "campaign", campaignKind, campaignId), date: today, eraId: "" }
    if (area === "wiki" && selectedKind === "chronology") Object.assign(page, { title: "Nova era", summary: "", eraStartYear: null, eraEndYear: null, eraCalendar: "C.E.", icon: "🕰️", tags: ["Nova era"] })
    setEditing(page)
  }

  function syncSavedState(next: KnowledgeWorkspaceState, label: string) {
    if (!obsidianPreferences.enabled || !obsidianPreferences.automatic) return
    // `true` permite renovar a permissão da pasta aqui: este código roda a
    // partir do clique em "Salvar", então ainda está dentro da janela de
    // ativação do usuário que a File System Access API exige para pedir
    // permissão sem interação explícita adicional.
    void withVaultLock(() => syncWorkspaceToLocalVault(next, true, undefined, "site"))
      .then(async (result) => {
        const merged = mergeKnowledgeWorkspaces(stateRef.current, result.state)
        stateRef.current = merged
        setState(merged)
        await saveKnowledgeWorkspace(merged)
        setNotice(`“${label}” sincronizada com o vault.`)
      })
      .catch((error: unknown) => setNotice(error instanceof Error ? `Página salva localmente. ${error.message}` : "Página salva localmente. O vault será atualizado quando estiver disponível."))
  }

  function savePage(page: KnowledgePage) {
    const typedLinks = [...wikiLinkTitles(plainTextFromHtml(page.contentHtml)), ...wikiTitlesFromRichText(page.contentHtml)]
    const automaticLinks = state.pages.filter((candidate) => candidate.id !== page.id && typedLinks.some((title) => title.toLocaleLowerCase("pt-BR") === candidate.title.toLocaleLowerCase("pt-BR"))).map((candidate) => candidate.id)
    const readyPage = { ...page, linkedPageIds: [...new Set([...page.linkedPageIds, ...automaticLinks])], tags: page.kind === "chronology" && page.scope === "wiki" ? [...new Set([...page.tags, page.title])] : page.tags }
    const next = mutate((current) => {
      let pages = current.pages.some((candidate) => candidate.id === readyPage.id)
        ? current.pages.map((candidate) => candidate.id === readyPage.id ? readyPage : candidate)
        : [readyPage, ...current.pages]
      pages = withEraTags(pages, pages.filter((candidate) => candidate.scope === "wiki" && candidate.kind === "chronology" && (candidate.eraStartYear != null || candidate.eraEndYear != null)))
      return ensureTagsForPage({ ...current, pages: withRefreshedStories(pages, readyPage.id) }, readyPage)
    })
    setEditing(null)
    syncSavedState(next, readyPage.title)
  }

  /** Apaga as notas correspondentes no vault; sem isso a sincronização seguinte as reimporta intactas. */
  function deleteVaultNotesFor(pages: KnowledgePage[]) {
    const synced = pages.filter((page) => page.obsidianPath)
    if (!obsidianPreferences.enabled || synced.length === 0) return
    // Sequencial de propósito: pedir permissão de escrita concorrentemente
    // arrisca disparar mais de um prompt do navegador ao mesmo tempo.
    void withVaultLock(async () => {
      let failed = 0
      for (const page of synced) {
        try { await deletePageFromLocalVault(page, true) } catch { failed += 1 }
      }
      setNotice(failed
        ? `Registro excluído do site. ${synced.length - failed} de ${synced.length} notas excluídas do vault.`
        : `${synced.length === 1 ? "Nota excluída também" : `${synced.length} notas excluídas também`} do vault.`)
    })
  }

  function createStory(campaignId: string | null = null) {
    const story = { ...createKnowledgePage("wiki", "story", null), date: new Date().toISOString().slice(0, 10) }
    const next = mutate((current) => ({ ...current, pages: [story, ...current.pages], campaigns: campaignId ? current.campaigns.map((campaign) => campaign.id === campaignId ? { ...campaign, storyIds: [...new Set([...(campaign.storyIds ?? []), story.id])], updatedAt: Date.now() } : campaign) : current.campaigns }))
    setSelectedKind(campaignId ? "campaign-stories" : "story")
    setOpenStoryId(story.id)
    if (campaignId) navigateRoute({ campaignId, page: "campaign-stories" })
    syncSavedState(next, story.title)
  }

  useEffect(() => {
    if (area !== "wiki" || !hydrated || typeof window === "undefined") return
    if (new URLSearchParams(window.location.search).get("new") !== "story") return
    window.history.replaceState({}, "", window.location.pathname)
    createStory()
  // A URL `?new=story` é consumida uma única vez; incluir a função de criação
  // recriada por cada edição faria o efeito reavaliar sem necessidade.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [area, hydrated])

  function changeStory(storyId: string, values: Partial<KnowledgePage>) {
    mutate((current) => ({ ...current, pages: current.pages.map((page) => page.id === storyId ? { ...page, ...values, updatedAt: Date.now() } : page) }))
  }

  /** O acontecimento é um registro próprio; a história guarda apenas a ordem dos ids. */
  function saveStoryEvent(storyId: string, event: KnowledgePage) {
    const next = mutate((current) => {
      const story = current.pages.find((page) => page.id === storyId)
      if (!story) return current
      const pages = current.pages.some((page) => page.id === event.id)
        ? current.pages.map((page) => page.id === event.id ? event : page)
        : [...current.pages, event]
      return { ...current, pages: pages.map((page) => page.id === storyId ? withStoryEvents(story, [...story.storyEventIds, event.id], pages) : page) }
    })
    syncSavedState(next, event.title || "Evento")
  }

  function deleteStoryEvent(storyId: string, eventId: string) {
    const removed = state.pages.find((page) => page.id === eventId)
    const next = mutate((current) => {
      const pages = current.pages.filter((page) => page.id !== eventId)
      const story = pages.find((page) => page.id === storyId)
      return {
        ...current,
        pages: pages.map((page) => page.id === storyId && story ? withStoryEvents(story, story.storyEventIds.filter((id) => id !== eventId), pages) : { ...page, linkedPageIds: page.linkedPageIds.filter((id) => id !== eventId) }),
        deletedIds: [...new Set([...current.deletedIds, eventId])],
      }
    })
    syncSavedState(next, state.pages.find((page) => page.id === storyId)?.title ?? "História")
    if (removed) deleteVaultNotesFor([removed])
  }

  function moveStoryEvent(storyId: string, eventId: string, offset: -1 | 1) {
    const next = mutate((current) => ({
      ...current,
      pages: current.pages.map((page) => {
        if (page.id !== storyId) return page
        const order = [...page.storyEventIds]
        const from = order.indexOf(eventId)
        const to = from + offset
        if (from < 0 || to < 0 || to >= order.length) return page
        order.splice(to, 0, ...order.splice(from, 1))
        return withStoryEvents(page, order, current.pages)
      }),
    }))
    syncSavedState(next, state.pages.find((page) => page.id === storyId)?.title ?? "História")
  }

  function removeStory(storyId: string) {
    const story = state.pages.find((page) => page.id === storyId)
    if (!story) return
    const events = storyEventsOf(story, state.pages)
    if (!window.confirm(events.length
      ? `Excluir a história “${story.title || "sem nome"}” e seus ${events.length} acontecimento${events.length === 1 ? "" : "s"}?`
      : `Excluir a história “${story.title || "sem nome"}”?`)) return
    const removedIds = new Set([storyId, ...events.map((event) => event.id)])
    mutate((current) => ({
      ...current,
      pages: current.pages.filter((page) => !removedIds.has(page.id)).map((page) => ({ ...page, linkedPageIds: page.linkedPageIds.filter((id) => !removedIds.has(id)) })),
      campaigns: current.campaigns.map((campaign) => ({ ...campaign, storyIds: campaign.storyIds?.filter((id) => !removedIds.has(id)) })),
      deletedIds: [...new Set([...current.deletedIds, ...removedIds])],
    }))
    setOpenStoryId(null)
    deleteVaultNotesFor([story, ...events])
  }

  function openPage(page: KnowledgePage) {
    if (page.kind === "story") { setOpenStoryId(page.id); return }
    // Um acontecimento pertence a uma História e é editado dentro dela;
    // abri-lo pela linha do tempo leva ao documento, não a um formulário solto.
    const story = state.pages.find((candidate) => candidate.kind === "story" && candidate.storyEventIds.includes(page.id))
    if (story) { setSelectedKind("story"); setOpenStoryId(story.id); return }
    setEditing(page)
  }

  function removePage(id: string) {
    const removed = state.pages.find((page) => page.id === id)
    mutate((current) => {
      let pages = current.pages.filter((page) => page.id !== id).map((page) => ({ ...page, linkedPageIds: page.linkedPageIds.filter((linkedId) => linkedId !== id) }))
      pages = withEraTags(pages, pages.filter((page) => page.scope === "wiki" && page.kind === "chronology" && (page.eraStartYear != null || page.eraEndYear != null)))
      return { ...current, pages, campaigns: current.campaigns.map((campaign) => ({ ...campaign, worldPageIds: campaign.worldPageIds.filter((pageId) => pageId !== id), storyIds: campaign.storyIds?.filter((storyId) => storyId !== id) })), tags: current.tags.filter((tag) => tag.name !== removed?.title), deletedIds: [...new Set([...current.deletedIds, id])] }
    })
    setEditing(null)
    // Sem apagar a nota no vault, a próxima sincronização a encontra intacta
    // e a reimporta como se fosse nova, revivendo a página excluída.
    if (removed?.obsidianPath && obsidianPreferences.enabled) {
      void withVaultLock(() => deletePageFromLocalVault(removed, true))
        .then(() => setNotice(`“${removed.title}” excluída também do vault.`))
        .catch((error: unknown) => setNotice(error instanceof Error ? `Página excluída do site. ${error.message}` : "Página excluída do site; o vault será atualizado quando estiver disponível."))
    }
  }

  function openTag(section: string, tag?: KnowledgeTag) { setTagEditor({ section, tag }) }

  function saveTag(values: Pick<KnowledgeTag, "name" | "icon" | "color">) {
    if (!tagEditor || !values.name.trim()) return
    const section = tagEditor.section
    let next: KnowledgeWorkspaceState | null = null
    if (tagEditor.tag) {
      const original = tagEditor.tag
      next = mutate((current) => current.tags.some((tag) => tag.id === original.id)
        ? renameTag(current, original.id, values.name, values.icon, values.color)
        : { ...current, tags: [...current.tags, { id: createKnowledgeId("tag"), ...values, pinnedIn: [section] }], pages: current.pages.map((page) => section.startsWith("campaign-notes:") && page.campaignId === section.slice("campaign-notes:".length) && page.kind === "gm-note" ? { ...page, tags: page.tags.map((tag) => normalizedTagName(tag) === normalizedTagName(original.name) ? values.name : tag) } : page) })
    } else {
      const id = createKnowledgeId("tag")
      next = mutate((current) => current.tags.some((tag) => normalizedTagName(tag.name) === normalizedTagName(values.name) && (section.startsWith("campaign-notes:") ? tag.pinnedIn.includes(section) : true))
        ? { ...current, tags: current.tags.map((tag) => normalizedTagName(tag.name) === normalizedTagName(values.name) && (section.startsWith("campaign-notes:") ? tag.pinnedIn.includes(section) : true) ? { ...tag, pinnedIn: [...new Set([...tag.pinnedIn, section])] } : tag) }
        : { ...current, tags: [...current.tags, { id, name: values.name.trim(), icon: values.icon, color: values.color, pinnedIn: [section] }] })
    }
    // Renomear sem gravar no vault deixava o `.md` com o nome antigo,
    // que a sincronização seguinte trazia de volta como tag separada.
    if (next) syncSavedState(next, values.name)
    setTagEditor(null)
  }

  function removeTag(tag: KnowledgeTag, section: string) {
    if (tag.id === "__no-category__" || !window.confirm(`Remover a tag “${tag.name}” desta categoria? Ela sai também dos registros que a usam.`)) return
    const next = mutate((current) => tag.id.startsWith("legacy-") && section.startsWith("campaign-notes:")
      ? { ...current, pages: current.pages.map((page) => page.campaignId === section.slice("campaign-notes:".length) && page.kind === "gm-note" ? { ...page, tags: page.tags.filter((name) => normalizedTagName(name) !== normalizedTagName(tag.name)) } : page) }
      : removeTagFromSection(current, tag.id, section))
    // Sem isto, o `.md` no vault continua com a tag no frontmatter e a
    // próxima sincronização a recria — o sintoma de "a tag volta".
    syncSavedState(next, tag.name)
    if (route.tag && normalizedTagName(route.tag) === normalizedTagName(tag.name)) navigateRoute({ campaignId: section })
  }

  function removeOutsidePage(id: string) {
    mutate((current) => ({ ...current, pages: current.pages.filter((page) => page.id !== id) }))
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
    // Dentro do RunasVTT, a Mesa são os tokens da cena: o encontro vira tokens
    // na cena aberta, e a Mesa local não é substituída.
    const vtt = getRunasVtt(window)
    if (vtt) {
      try {
        for (let offset = 0; offset < actors.length; offset += VTT_MAX_IMPORT_BATCH) {
          await vtt.importCharacters(actors.slice(offset, offset + VTT_MAX_IMPORT_BATCH).map((actor) => toVttCharacter(actor.character, "dm", { runasDm: { masteryTableId: actor.masteryTableId } })))
        }
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "O RunasVTT recusou o encontro.")
        return
      }
      await saveLocalState({ ...dmState, workspaceNotesHtml: encounterNotes, updatedAt: Date.now() })
      window.location.assign("/?view=encounter")
      return
    }
    await saveLocalState({ ...dmState, encounter: actors, workspaceNotesHtml: encounterNotes, updatedAt: Date.now() })
    window.location.assign("/?view=encounter")
  }

  const scopedPages = useMemo(() => state.pages.filter((page) => area === "wiki" ? page.scope === "wiki" : page.scope === "campaign" && page.campaignId === selectedCampaignId), [area, selectedCampaignId, state.pages])
  const scopedCategories = useMemo(() => state.categories.filter((category) => area === "wiki" ? category.scope === "wiki" : category.scope === "campaign" && category.campaignId === selectedCampaignId), [area, selectedCampaignId, state.categories])
  // Uma categoria é uma pasta física dentro da seção (Personagens tem
  // Runilitas/Divindades; Fauna ainda não tem nenhuma subpasta), mas o
  // registro de categorias não guarda a qual seção ela pertence. Restrito à
  // aba aberta, o filtro só deve listar categorias que alguma página desse
  // tipo realmente usa — do contrário, uma categoria de Personagens também
  // aparece ao filtrar Fauna.
  const campaignPageKind = area === "campaigns" && ["mission", "event", "gm-note", "encounter"].includes(route.section ?? "") ? route.section as KnowledgePageKind : null
  const tags = useMemo(() => [...new Set(scopedPages.flatMap((page) => page.tags))].sort((a, b) => a.localeCompare(b, "pt-BR")), [scopedPages])
  const visibleEraPages = useMemo(() => chronologyEraPages(state), [state])
  const eras = useMemo<UniverseEra[]>(() => {
    const presetIds = new Set(normalizeUniverseEras(state.eras).map((era) => era.id))
    return visibleEraPages.map((page) => ({
      id: page.id.startsWith("era-") && presetIds.has(page.id.slice(4)) ? page.id.slice(4) : page.id,
      name: page.title, startYear: page.eraStartYear ?? null, endYear: page.eraEndYear ?? null,
      calendar: page.eraCalendar ?? "C.E.", note: page.summary,
    }))
  }, [visibleEraPages, state.eras])
  const wikiSection = area === "wiki" && WIKI_SECTIONS.some((item) => item.id === selectedKind) ? selectedKind : null
  const selectedTagName = area === "wiki" && route.campaignId === selectedKind ? route.tag : null
  const filteredPages = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR")
    // A Cronologia é a linha do tempo inteira: páginas de Cronologia e os
    // acontecimentos das Histórias, que compartilham era e ano fictício.
    const kind = campaignPageKind ?? selectedKind
    return sortKnowledgePages(scopedPages.filter((page) => kind === "graph" || page.kind === kind || (kind === "chronology" && isChronologyPage(page)))
      .filter((page) => !term || [page.title, page.summary, ...(page.kind === "encounter" ? [] : [plainTextFromHtml(page.contentHtml)]), ...page.tags].some((value) => value.toLocaleLowerCase("pt-BR").includes(term)))
      .filter((page) => tagFilter === "all" || page.tags.includes(tagFilter))
      .filter((page) => categoryFilter === "all" || page.categoryIds.includes(categoryFilter))
      .filter((page) => statusFilter === "all" || page.status === statusFilter)
      // A era de uma página é derivada do ano a cada leitura: corrigir os
      // limites de uma era reclassifica o acervo sem reeditar registro algum.
      .filter((page) => selectedKind !== "chronology" || (eraFilter === "unassigned" ? !resolveEra(page.eventYear, eras, page.eraId) : resolveEra(page.eventYear, eras, page.eraId)?.id === eraFilter)), dateSort)
  }, [campaignPageKind, categoryFilter, scopedPages, search, selectedKind, statusFilter, tagFilter, dateSort, eraFilter, eras])

  const kinds = area === "wiki" ? [...WIKI_SECTIONS, { id: "graph", label: "Gráfico" } as const] : CAMPAIGN_MAIN_SECTIONS
  const openStory = (area === "wiki" && selectedKind === "story") || (area === "campaigns" && selectedKind === "campaign-stories") ? state.pages.find((page) => page.id === openStoryId) ?? null : null
  const campaignStories = selectedCampaign ? state.pages.filter((page) => page.scope === "wiki" && page.kind === "story" && (selectedCampaign.storyIds ?? []).includes(page.id)) : []
  const campaignWorldPages = selectedCampaign ? state.pages.filter((page) => page.scope === "wiki" && (selectedCampaign.worldPageIds ?? []).includes(page.id)) : []
  const campaignGraphPages = selectedCampaign ? [...new Map([...state.pages.filter((page) => page.scope === "campaign" && page.campaignId === selectedCampaign.id && page.kind !== "gm-note"), ...campaignWorldPages, ...campaignStories].map((page) => [page.id, page])).values()] : []
  const campaignWorldSection = area === "campaigns" && selectedKind === "world" && ["geography", "organizations", "items", "characters"].includes(route.section ?? "") ? route.section as CampaignWorldSection : undefined
  const campaignAdventureSection = area === "campaigns" && selectedKind === "adventure" && ["mission", "event", "encounter", "organizer"].includes(route.section ?? "") ? route.section as CampaignAdventureSection : undefined
  const campaignNotesTag = area === "campaigns" && selectedKind === "campaign-notes" ? route.tag : null
  const campaignNotesSection = `campaign-notes:${selectedCampaignId ?? ""}`
  const campaignTags = useMemo(() => tagsForSection(state, campaignNotesSection), [state, campaignNotesSection])
  const selectedEraPage = selectedKind === "chronology" && selectedTagName ? visibleEraPages.find((page) => page.id === selectedTagName || page.id === `era-${selectedTagName}`) : undefined
  const selectedLegacyEra = selectedKind === "chronology" && selectedTagName ? eras.find((era) => era.id === selectedTagName) : undefined
  const campaignPageCounts = useMemo(() => new Map(state.campaigns.map((campaign) => [campaign.id, state.pages.filter((page) => page.campaignId === campaign.id || campaign.worldPageIds.includes(page.id) || campaign.storyIds?.includes(page.id)).length])), [state.campaigns, state.pages])
  return <main className={`knowledge-shell knowledge-app ${area === "campaigns" ? "campaign-themed" : ""}`} style={area === "campaigns" ? campaignTheme(selectedCampaign) : undefined}>
    <KnowledgeHeader area={area} syncState={syncState} onObsidian={() => setObsidianOpen(true)} onCloudBackup={() => requestCloudAction("backup")} onCloudImport={() => requestCloudAction("import")} />
    {area === "campaigns" ? <CampaignPortal campaigns={state.campaigns} selectedCampaignId={selectedCampaignId} pageCounts={campaignPageCounts} onCreate={addCampaign} onReorder={reorderCampaigns} onSelect={(id) => { setSelectedCampaignId(id); navigateRoute({ campaignId: id, page: String(selectedKind) }) }}><>
      {selectedCampaign ? <CampaignHeading campaign={selectedCampaign} onChange={updateCampaign} onDelete={removeCampaign} /> : <div className="knowledge-heading"><div><p className="eyebrow">Arquivo de Ordem x Caos</p><h1>Campanhas</h1><p>Organize aventuras, sessões e encontros em um único lugar.</p></div><button className="primary-button" onClick={addCampaign}><Plus size={17} /> Criar campanha</button></div>}
      {selectedCampaign && <nav className="knowledge-tabs" aria-label="Seções da campanha">{kinds.map((kind) => <button key={kind.id} className={selectedKind === kind.id ? "active" : ""} onClick={() => { setSelectedKind(kind.id as PortalKind); setOpenStoryId(null); navigateRoute({ campaignId: selectedCampaign.id, page: String(kind.id) }); setStatusFilter("all"); setCategoryFilter("all"); setSearch(""); setTagFilter("all") }}>{kind.id === "graph" ? <><Network size={16} /> Gráfico</> : kind.label}</button>)}</nav>}
      {selectedCampaign && openStory ? <StoryDocument key={openStory.id} story={openStory} pages={state.pages} categories={state.categories.filter((category) => category.scope === "wiki")} eras={eras} bestiary={bestiary} onChangeStory={(values) => changeStory(openStory.id, values)} onDeleteStory={() => removeStory(openStory.id)} onSaveEvent={(event) => saveStoryEvent(openStory.id, event)} onDeleteEvent={(id) => deleteStoryEvent(openStory.id, id)} onMoveEvent={(id, offset) => moveStoryEvent(openStory.id, id, offset)} onBack={() => setOpenStoryId(null)} /> : selectedCampaign && selectedKind === "campaign-stories" ? <CampaignStory stories={campaignStories} allStories={state.pages.filter((page) => page.scope === "wiki" && page.kind === "story")} pages={state.pages} eras={eras} onCreate={createCampaignStory} onLink={linkStory} onUnlink={unlinkStory} onOpenStory={(story) => setOpenStoryId(story.id)} /> : selectedCampaign && selectedKind === "world" ? <CampaignWorld pages={campaignWorldPages} allWikiPages={state.pages.filter((page) => page.scope === "wiki")} linkedIds={selectedCampaign.worldPageIds} section={campaignWorldSection} onSection={(section) => navigateRoute({ campaignId: selectedCampaign.id, page: "world", section })} onCreate={createWorldPage} onLink={linkWorldPage} onOpen={openPage} onUnlink={unlinkWorldPage} onBack={() => navigateRoute({ campaignId: selectedCampaign.id, page: "world" })} /> : selectedCampaign && selectedKind === "adventure" ? <CampaignAdventure section={campaignAdventureSection} onSection={(section) => navigateRoute({ campaignId: selectedCampaign.id, page: "adventure", section })} onBack={() => navigateRoute({ campaignId: selectedCampaign.id, page: "adventure" })} organizer={selectedCampaign.organizer} onOrganizerChange={updateOrganizer}>{campaignAdventureSection && campaignAdventureSection !== "organizer" && <div className="campaign-page-content"><div className="knowledge-toolbar"><label className="knowledge-search"><Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar no título, texto, tag ou resumo…" /><kbd>{filteredPages.length}</kbd></label><div className="knowledge-filters"><label><Filter size={14} /><select value={tagFilter} onChange={(event) => setTagFilter(event.target.value)}><option value="all">Todas as tags</option>{tags.map((tag) => <option key={tag}>{tag}</option>)}</select></label><label><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">Todos os status</option>{CAMPAIGN_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></label><label><CalendarDays size={14} /><select aria-label="Organizar por data" value={dateSort} onChange={(event) => setDateSort(event.target.value as PageSort)}><option value="recent">Mais Recentes</option><option value="oldest">Mais Antigas</option>{campaignAdventureSection === "mission" && <option value="order">Ordem das missões</option>}</select></label><button className="filter-clear" title="Limpar filtros" onClick={() => { setSearch(""); setTagFilter("all"); setStatusFilter("all"); setDateSort("recent") }}><X size={15} /></button></div><div className="category-creator"><button className="primary-button" onClick={addPage}><Plus size={17} /> {campaignAdventureSection === "encounter" ? "Novo encontro" : campaignAdventureSection === "mission" ? "Nova missão" : "Novo evento"}</button></div></div><PageGrid pages={filteredPages} allPages={scopedPages} categories={scopedCategories} eras={eras} onOpen={openPage} onCreate={addPage} /></div>}</CampaignAdventure> : selectedCampaign && selectedKind === "campaign-notes" ? campaignNotesTag ? <TagPage pages={state.pages} section={campaignNotesSection} tag={campaignNotesTag} onBack={() => navigateRoute({ campaignId: selectedCampaign.id, page: "campaign-notes" })} onOpen={openPage} onCreate={() => { const created = createKnowledgePage("campaign", "gm-note", selectedCampaign.id); setEditing({ ...created, tags: [campaignNotesTag] }) }} /> : <TagGrid tags={campaignTags} counts={Object.fromEntries(campaignTags.map((tag) => [tag.id, pagesForTag(state.pages, campaignNotesSection, tag.name).length]))} onSelect={(tag) => navigateRoute({ campaignId: selectedCampaign.id, page: "campaign-notes", tag: tag.name })} onCreate={() => openTag(campaignNotesSection)} onEdit={(tag) => openTag(campaignNotesSection, tag)} onRemove={(tag) => removeTag(tag, campaignNotesSection)} /> : selectedCampaign && selectedKind === "appearance" ? <CampaignAppearance key={selectedCampaign.id} campaign={selectedCampaign} onChange={updateCampaign} /> : selectedCampaign && selectedKind === "graph" ? <KnowledgeGraph pages={campaignGraphPages} scope="campaign" onOpen={openPage} /> : null}
    </></CampaignPortal> : <div className="knowledge-layout wiki-layout"><section className="knowledge-workspace"><div className="knowledge-heading"><div><p className="eyebrow">Arquivo de Ordem x Caos</p><h1>Wiki</h1><p>Seu mundo interligado, pesquisável e compatível com Obsidian.</p></div></div>{outsidePages.length > 0 && <OutsidePagesNotice pages={outsidePages} onRemove={removeOutsidePage} />}<nav className="knowledge-tabs" aria-label="Tipos de página">{kinds.map((kind) => <button key={kind.id} className={selectedKind === kind.id ? "active" : ""} onClick={() => { setSelectedKind(kind.id as PortalKind); setOpenStoryId(null); navigateRoute({ campaignId: String(kind.id) }); setStatusFilter("all"); setCategoryFilter("all") }}>{kind.id === "graph" ? <><Network size={16} /> Gráfico</> : kind.label}</button>)}</nav>{openStory ? <StoryDocument key={openStory.id} story={openStory} pages={state.pages} categories={scopedCategories} eras={eras} bestiary={bestiary} onChangeStory={(values) => changeStory(openStory.id, values)} onDeleteStory={() => removeStory(openStory.id)} onSaveEvent={(event) => saveStoryEvent(openStory.id, event)} onDeleteEvent={(id) => deleteStoryEvent(openStory.id, id)} onMoveEvent={(id, offset) => moveStoryEvent(openStory.id, id, offset)} onBack={() => setOpenStoryId(null)} /> : wikiSection === "chronology" && selectedTagName ? <ChronologyEraPage page={selectedEraPage} legacyEra={selectedLegacyEra} eras={eras} pages={state.pages} onBack={() => navigateRoute({ campaignId: "chronology" })} onEdit={setEditing} onChangeLegacy={(nextEra) => mutate((current) => ({ ...current, eras: eras.map((era) => era.id === nextEra.id ? nextEra : era) }))} onOpen={openPage} /> : wikiSection === "story" ? <TagPage pages={state.pages} section="story" tag="" onOpen={openPage} onCreate={() => createStory()} /> : wikiSection && selectedTagName ? <TagPage pages={state.pages} section={wikiSection} tag={selectedTagName} onBack={() => navigateRoute({ campaignId: wikiSection })} onOpen={openPage} onCreate={() => { const created = createKnowledgePage("wiki", wikiSection as KnowledgePageKind, null); setEditing({ ...created, tags: [selectedTagName] }) }} /> : wikiSection ? <WikiPortal state={state} section={wikiSection} onOpenTag={(tag) => navigateRoute({ campaignId: wikiSection, tag: tag.name })} onCreateTag={() => openTag(wikiSection)} onEditTag={(tag) => openTag(wikiSection, tag)} onRemoveTag={(tag) => removeTag(tag, wikiSection)} onOpenPage={(page) => navigateRoute({ campaignId: "chronology", tag: page.id })} onCreateEra={addPage} onSaveEra={savePage} onDeleteEra={removePage} /> : <KnowledgeGraph pages={state.pages} scope="wiki" onOpen={openPage} />}</section></div>}
    {notice && <button className="knowledge-toast" onClick={() => setNotice("")}><Check size={15} /> {notice}<X size={14} /></button>}
    {editing && <KnowledgeEditor eras={eras} page={editing} pages={editing.scope === "wiki" ? state.pages.filter((page) => page.scope === "wiki") : scopedPages} categories={editing.scope === "wiki" ? state.categories.filter((category) => category.scope === "wiki") : scopedCategories} tags={tagsForSection(state, editing.scope === "campaign" && editing.kind === "gm-note" ? `campaign-notes:${editing.campaignId}` : editing.kind)} onCreateTag={() => openTag(editing.scope === "campaign" && editing.kind === "gm-note" ? `campaign-notes:${editing.campaignId}` : editing.kind)} bestiary={bestiary} backlinks={(editing.scope === "wiki" ? state.pages.filter((page) => page.scope === "wiki") : scopedPages).filter((page) => effectivePageLinks(page, editing.scope === "wiki" ? state.pages.filter((candidate) => candidate.scope === "wiki") : scopedPages).includes(editing.id) || [...wikiLinkTitles(plainTextFromHtml(page.contentHtml)), ...wikiTitlesFromRichText(page.contentHtml)].some((title) => title.toLocaleLowerCase("pt-BR") === editing.title.toLocaleLowerCase("pt-BR")))} onSave={savePage} onDelete={removePage} onClose={() => setEditing(null)} onLaunchEncounter={(page) => void launchEncounter(page)} />}
    {tagEditor && <div className="knowledge-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setTagEditor(null) }}><section className="knowledge-modal"><header><h2>{tagEditor.tag ? "Editar tag" : "Nova tag"}</h2><button className="icon-button" onClick={() => setTagEditor(null)} aria-label="Fechar"><X size={18} /></button></header><TagEditor tag={tagEditor.tag} onSave={saveTag} /></section></div>}
    {obsidianOpen && <ObsidianDialog state={state} onClose={() => setObsidianOpen(false)} onPreferencesChange={setObsidianPreferences} onStateChange={(next) => {
      // Mesmo problema do sincronismo automático: sem mesclar pelo estado
      // mais recente, o botão "Importar e sincronizar" também sobrescrevia
      // cegamente qualquer edição feita durante a leitura do vault.
      const merged = mergeKnowledgeWorkspaces(stateRef.current, next)
      stateRef.current = merged
      setState(merged)
      void saveKnowledgeWorkspace(merged)
    }} />}
    {pendingCloudAction && <BackupTokenDialog onClose={() => setPendingCloudAction(null)} onSubmit={submitBackupToken} />}
    {cloudImportOpen && <CloudImportDialog onClose={() => setCloudImportOpen(false)} onSelect={(mode) => void importFromCloud(mode)} />}
  </main>
}

function KnowledgeHeader({ area, syncState, onObsidian, onCloudBackup, onCloudImport }: { area: PortalArea; syncState: SyncState; onObsidian: () => void; onCloudBackup: () => void; onCloudImport: () => void }) {
  const sync = syncState === "synced"
    ? { tone: "good" as const, label: "Sincronizado" }
    : syncState === "syncing" || syncState === "loading" ? { tone: "busy" as const, label: "Sincronizando" }
      : syncState === "error" ? { tone: "bad" as const, label: "Falha ao salvar" } : { tone: "idle" as const, label: "Salvo localmente" }
  return <header className="topbar knowledge-appbar">
    <a className="brand" href="/"><span className="brand-rune">R</span><span className="brand-copy"><strong>Runas DM</strong><small>Arquivo do mestre</small></span><b className="topbar-badge">DM</b></a>
    <KnowledgeNavigation area={area} />
    <div className="top-actions knowledge-header-actions">
      <TopbarMenu status={sync}>
        {(close) => <>
          <ThemeToggle variant="menu" />
          <button className="topbar-menu-item" onClick={() => { close(); onCloudBackup() }}><CloudUpload size={18} /><span>Backup na nuvem</span></button>
          <button className="topbar-menu-item" onClick={() => { close(); onCloudImport() }}><CloudDownload size={18} /><span>Importar da nuvem</span></button>
          <button className="topbar-menu-item" onClick={() => { close(); onObsidian() }}><Settings2 size={18} /><span>Obsidian</span></button>
          <a className="topbar-menu-item" href="https://runas-book.pages.dev/dm" onClick={close}><BookOpen size={18} /><span>Runas Book DM</span></a>
        </>}
      </TopbarMenu>
    </div>
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
  return <div className={`campaign-heading ${campaign.backgroundImageDataUrl ? "has-cover" : ""}`}>
    {campaign.backgroundImageDataUrl && <img className="campaign-cover-image" src={campaign.backgroundImageDataUrl} alt="" style={{ filter: `blur(${campaign.imageBlur ?? 8}px)` }} />}
    <div className="campaign-heading-content"><p className="eyebrow">Campanha ativa</p><input className="campaign-title-input" value={campaign.title} onChange={(event) => onChange({ title: event.target.value })} aria-label="Nome da campanha" /><ExpandableTextarea resizeKey={campaign.id} value={campaign.description} onChange={(event) => onChange({ description: event.target.value })} placeholder="Resumo da campanha, tom e objetivo central…" /></div>
    <button className="icon-button danger-icon" title="Excluir campanha" onClick={onDelete}><Trash2 size={17} /></button>
  </div>
}

function PageGrid({ pages, allPages, categories, eras, onOpen, onCreate }: { pages: KnowledgePage[]; allPages: KnowledgePage[]; categories: KnowledgeCategory[]; eras: UniverseEra[]; onOpen: (page: KnowledgePage) => void; onCreate: () => void }) {
  if (pages.length === 0) return <div className="knowledge-empty"><BookMarked size={32} /><strong>Nenhum registro encontrado.</strong><p>Crie o primeiro registro ou ajuste os filtros desta seção.</p><button className="primary-button" onClick={onCreate}><Plus size={16} /> Criar</button></div>
  return <div className="knowledge-grid">{pages.map((page) => {
    const creatureCount = page.encounterCreatures.reduce((sum, item) => sum + item.quantity, 0)
    const links = effectivePageLinks(page, allPages)
    const hasStatus = page.scope === "campaign" && ["mission", "event"].includes(page.kind)
    const color = page.status.includes("Concluída") ? "var(--green)" : page.status.includes("Fracassada") ? "var(--red)" : page.status === "Em Progresso" ? "var(--cyan)" : "var(--line)"
    // Legacy per-page colors must not override campaign-wide appearance or status.
    return <button key={page.id} className="knowledge-card" style={{ "--status-border": hasStatus ? color : "var(--line)" } as CSSProperties} onClick={() => onOpen(page)}>
      <header><span>{page.order ? `${page.order} · ` : ""}{pageKindLabel(page.kind, page.scope)}</span>{hasStatus && <b className={statusClass(page.status)}>{page.status}</b>}</header>
      <div className="knowledge-card-body"><KnowledgeCardImage page={page} /><div className="knowledge-card-copy"><h2>{page.title || (page.kind === "encounter" ? "Encontro sem nome" : "Página sem nome")}</h2><p>{page.summary || (page.kind === "encounter" ? "Sem notas do mestre." : plainTextFromHtml(page.contentHtml).slice(0, 180) || "Sem resumo.")}</p>
        <div className="knowledge-card-meta">{page.kind === "story"
          ? storyYearRange(page, allPages, eras) && <span><CalendarDays size={13} /> {storyYearRange(page, allPages, eras)}</span>
          : page.date && <span><CalendarDays size={13} /> {page.date.match(/^\d{4}-\d{2}-\d{2}$/) ? new Date(`${page.date}T12:00:00`).toLocaleDateString("pt-BR") : page.date}</span>}{page.kind === "story"
          ? page.storyEventIds.length > 0 && <span><Network size={13} /> {countLabel(page.storyEventIds.length, "acontecimento", "acontecimentos")}</span>
          : page.kind !== "encounter" && links.length > 0 && <span><Network size={13} /> {countLabel(links.length, "vínculo", "vínculos")}</span>}{creatureCount > 0 && <span><Swords size={13} /> {countLabel(creatureCount, "inimigo", "inimigos")}</span>}</div>
        <footer>{categories.filter((category) => page.categoryIds.includes(category.id)).slice(0, 2).map((category) => <span key={category.id}>{category.name}</span>)}{page.tags.slice(0, 3).map((tag) => <i key={tag}>#{tag}</i>)}</footer>
      </div></div>
    </button>
  })}</div>
}

function OutsidePagesNotice({ pages, onRemove }: { pages: KnowledgePage[]; onRemove: (id: string) => void }) {
  return <aside className="knowledge-warning outside-pages-notice"><header><strong>Páginas fora das categorias da Wiki ({pages.length})</strong><p>Esses registros foram importados antes da lista de permissão. O arquivo Markdown continua no vault até você remover o registro do site.</p></header><ul>{pages.map((page) => <li key={page.id}><span><strong>{page.title || "Página sem nome"}</strong><small>{page.obsidianPath}</small></span><button onClick={() => onRemove(page.id)}>Remover do site</button></li>)}</ul></aside>
}

