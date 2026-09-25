"use client"

import { FolderOpen, X } from "lucide-react"
import { describeStats } from "../lib/snapshot-policy"
import type { VaultDataHeader, VaultDataKind } from "../lib/vault-data"
import { useEscapeToClose } from "../lib/use-escape-to-close"

export interface VaultRestoreItem {
  kind: VaultDataKind
  header: VaultDataHeader
}

const LABELS: Record<VaultDataKind, string> = { knowledge: "Wiki e campanhas", bestiary: "Bestiário" }

/**
 * Oferece os dados do Runas DM encontrados no vault (ou num arquivo JSON) quando
 * este dispositivo já tem dados próprios. Nada é aplicado sem escolha: mesclar
 * preserva o que só existe aqui; substituir descarta; e "manter" grava os dados
 * deste dispositivo por cima do arquivo (a versão anterior fica em `versoes/`).
 */
export function VaultRestoreDialog({ items, source, onRestore, onKeep, onClose }: { items: VaultRestoreItem[]; source: "vault" | "arquivo"; onRestore: (mode: "merge" | "replace") => void; onKeep?: () => void; onClose: () => void }) {
  useEscapeToClose(onClose)

  function confirmReplace() {
    if (window.confirm("Substituir tudo pelos dados do " + (source === "vault" ? "vault" : "arquivo") + "? Campanhas, páginas e fichas que só existem neste dispositivo serão apagadas.")) onRestore("replace")
  }

  function confirmKeep() {
    if (onKeep && window.confirm("Gravar os dados deste dispositivo por cima do arquivo do vault? A versão atual do arquivo fica guardada em Runas DM/versoes.")) onKeep()
  }

  return (
    <div className="modal-backdrop backup-token-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div className="backup-token-modal" role="dialog" aria-modal="true" aria-labelledby="vault-restore-title">
        <header>
          <span className="backup-token-icon"><FolderOpen size={20} /></span>
          <div><p className="eyebrow">{source === "vault" ? "Vault do Obsidian" : "Arquivo JSON"}</p><h2 id="vault-restore-title">Restaurar dados do Runas DM</h2></div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Fechar"><X size={17} /></button>
        </header>
        <div className="backup-token-body">
          <p>{source === "vault" ? "O vault tem dados do Runas DM que este dispositivo ainda não recebeu:" : "O arquivo tem dados do Runas DM:"}</p>
          <ul className="vault-data-files">{items.map((item) => <li key={item.kind}><b>{LABELS[item.kind]}:</b> {new Date(item.header.savedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })} · {describeStats(item.header.counts)}</li>)}</ul>
          <div className="local-vault-panel">
            <div><span><strong>Mesclar</strong><small>Traz o que o {source === "vault" ? "vault" : "arquivo"} tem e mantém o que só existe neste dispositivo.</small></span></div>
            <div><button className="primary-button" type="button" onClick={() => onRestore("merge")}>Mesclar</button></div>
          </div>
          <div className="local-vault-panel">
            <div><span><strong>Substituir tudo</strong><small>Descarta os dados deste dispositivo e adota os {source === "vault" ? "do vault" : "do arquivo"} por inteiro.</small></span></div>
            <div><button className="secondary-button" type="button" onClick={confirmReplace}>Substituir tudo</button></div>
          </div>
          {onKeep && <div className="local-vault-panel">
            <div><span><strong>Manter os dados deste dispositivo</strong><small>Grava o que há aqui por cima do arquivo do vault. A versão atual do arquivo fica guardada em Runas DM/versoes.</small></span></div>
            <div><button className="secondary-button" type="button" onClick={confirmKeep}>Sobrescrever o arquivo</button></div>
          </div>}
        </div>
        <footer><button className="secondary-button" type="button" onClick={onClose}>Decidir depois</button></footer>
      </div>
    </div>
  )
}
