"use client"

import { useEffect, useState } from "react"
import { Check, Download, FolderOpen, FolderPlus, Power, RefreshCw, Settings2, X } from "lucide-react"
import type { KnowledgeWorkspaceState } from "../lib/knowledge-model"
import { exportKnowledgeZip, type VaultSyncResult } from "../lib/obsidian-sync"
import { localVaultName, selectLocalVault, supportsLocalVault, syncWorkspaceToLocalVault } from "../lib/local-vault"

export interface ObsidianPreferences {
  enabled: boolean
  automatic: boolean
}

const defaults: ObsidianPreferences = { enabled: true, automatic: true }

export function readObsidianPreferences(): ObsidianPreferences {
  if (typeof window === "undefined") return defaults
  try {
    const value = JSON.parse(localStorage.getItem("runas-dm.obsidian-preferences") ?? "null") as Partial<ObsidianPreferences> | null
    return {
      enabled: value?.enabled !== false,
      // A sincronização bidirecional é o comportamento padrão; o usuário
      // ainda pode desligá-la explicitamente nas preferências.
      automatic: value?.automatic !== false,
    }
  } catch { return defaults }
}

function resultMessage(result: VaultSyncResult): string {
  const parts = [`${result.imported} importada${result.imported === 1 ? "" : "s"}`, `${result.exported} atualizada${result.exported === 1 ? "" : "s"}`]
  if (result.backups) parts.push(`${result.backups} backup${result.backups === 1 ? "" : "s"} preservado${result.backups === 1 ? "" : "s"}`)
  return `Sincronização concluída: ${parts.join(", ")}.`
}

export function ObsidianDialog({ state, onClose, onPreferencesChange, onStateChange }: { state: KnowledgeWorkspaceState; onClose: () => void; onPreferencesChange: (value: ObsidianPreferences) => void; onStateChange: (value: KnowledgeWorkspaceState) => void }) {
  const [preferences, setPreferences] = useState<ObsidianPreferences>(() => readObsidianPreferences())
  const [message, setMessage] = useState("")
  const [working, setWorking] = useState(false)
  const [folderName, setFolderName] = useState("")
  const localFolderSupported = supportsLocalVault()

  useEffect(() => { void localVaultName().then(setFolderName) }, [])

  useEffect(() => {
    localStorage.setItem("runas-dm.obsidian-preferences", JSON.stringify(preferences))
    onPreferencesChange(preferences)
  }, [onPreferencesChange, preferences])

  async function synchronize() {
    setWorking(true); setMessage("Lendo documentos antes de gravar…")
    try {
      const result = await syncWorkspaceToLocalVault(state, true, (done, total) => setMessage(`Sincronizando ${done} de ${total} páginas…`))
      onStateChange(result.state)
      setMessage(resultMessage(result))
    } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível sincronizar com o vault.") }
    finally { setWorking(false) }
  }

  async function chooseFolder(kind: "new" | "existing") {
    setWorking(true)
    setMessage(kind === "new" ? "No seletor, crie uma nova pasta e escolha-a como vault…" : "Escolha a pasta raiz do vault existente…")
    try {
      const handle = await selectLocalVault()
      setFolderName(handle.name)
      setPreferences((current) => ({ ...current, enabled: true }))
      setMessage(`Vault “${handle.name}” conectado. Assets e as preferências ausentes foram configurados sem substituir arquivos existentes.`)
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") setMessage("Seleção cancelada; nenhuma pasta foi alterada.")
      else setMessage(error instanceof Error ? error.message : "Não foi possível acessar a pasta.")
    } finally { setWorking(false) }
  }

  return <div className="knowledge-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose() }}><section className="obsidian-dialog" role="dialog" aria-modal="true" aria-labelledby="obsidian-title">
    <header><div><p className="eyebrow"><Settings2 size={15} /> Integração local</p><h2 id="obsidian-title">Obsidian e vault local</h2><p>Leia e grave Markdown nos dois sentidos, respeitando a organização do vault e os anexos em Assets.</p></div><button className="icon-button" onClick={onClose} aria-label="Fechar"><X size={19} /></button></header>
    <div className="obsidian-setup-note"><strong>Proteção de documentos</strong><span>Antes de substituir conteúdo divergente ou excluir uma nota pelo site, o Runas DM sempre salva a versão anterior em <b>Assets/Runas DM Backups</b>. Notas já organizadas em subpastas são importadas e permanecem no caminho original.</span></div>
    <div className="obsidian-fields">
      <label className="obsidian-auto obsidian-enabled"><input type="checkbox" checked={preferences.enabled} onChange={(event) => setPreferences((current) => ({ ...current, enabled: event.target.checked }))} /><span><strong><Power size={14} /> Integração com Obsidian ativa</strong><small>Desative para impedir completamente leitura, gravação e sincronização automática.</small></span></label>
      {preferences.enabled && <>
        <div className="local-vault-panel wide"><div><FolderOpen size={20} /><span><strong>{folderName ? `Vault selecionado: ${folderName}` : "Nenhum vault selecionado"}</strong><small>{localFolderSupported ? "Funciona diretamente no Chrome/Edge, mesmo com o Obsidian fechado." : "Acesso direto a pastas não está disponível neste navegador."}</small></span></div><div><button className="secondary-button" disabled={working || !localFolderSupported} onClick={() => void chooseFolder("existing")}><FolderOpen size={16} /> Selecionar existente</button><button className="secondary-button" disabled={working || !localFolderSupported} onClick={() => void chooseFolder("new")}><FolderPlus size={16} /> Criar novo vault</button></div></div>
        <label className="obsidian-auto"><input type="checkbox" checked={preferences.automatic} onChange={(event) => setPreferences((current) => ({ ...current, automatic: event.target.checked }))} /><span><strong>Sincronizar automaticamente</strong><small>Ao entrar e ao salvar, importa alterações do vault antes de atualizar os arquivos.</small></span></label>
      </>}
    </div>
    {message && <p className="obsidian-message"><Check size={15} /> {message}</p>}
    <footer><button className="secondary-button" onClick={() => exportKnowledgeZip(state)}><Download size={16} /> Exportar ZIP</button><span /><button className="primary-button" disabled={working || !preferences.enabled || !folderName} onClick={() => void synchronize()}><RefreshCw className={working ? "spin" : ""} size={16} /> Importar e sincronizar</button></footer>
  </section></div>
}
