"use client"

import { Database, Download, RotateCcw, Save, Upload } from "lucide-react"
import { describeStats } from "../lib/snapshot-policy"
import type { VaultStatus } from "../lib/vault-status"
import type { VaultDataHeader } from "../lib/vault-data"

export interface VaultDataPanelProps {
  connected: boolean
  status: VaultStatus
  knowledge: VaultDataHeader | null
  bestiary: VaultDataHeader | null
  busy: boolean
  onSave: () => void
  onRestore: () => void
  onExport: () => void
  onImport: (files: File[]) => void
}

function fileSummary(header: VaultDataHeader | null): string {
  if (!header) return "ainda não salvo"
  return `${new Date(header.savedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })} · ${describeStats(header.counts)}`
}

/**
 * Tudo o que não cabe numa nota Markdown (campanhas com estilo e organizador,
 * tags, eras, exclusões, preferências e o bestiário) é gravado em `Runas DM/`
 * dentro do vault. Restaurar o vault num computador novo traz tudo de volta.
 */
export function VaultDataPanel({ connected, status, knowledge, bestiary, busy, onSave, onRestore, onExport, onImport }: VaultDataPanelProps) {
  return <div className="local-vault-panel vault-data-panel wide">
    <div><Database size={20} /><span>
      <strong>Dados do Runas DM no vault</strong>
      <small>Campanhas (estilo, organizador), tags, eras, exclusões, preferências e o bestiário ficam num arquivo JSON em <b>Runas DM/</b>, no próprio vault. Ao conectá-lo em outro computador, tudo volta.</small>
      <ul className="vault-data-files"><li><b>Wiki e campanhas:</b> {fileSummary(knowledge)}</li><li><b>Bestiário:</b> {fileSummary(bestiary)}</li></ul>
    </span></div>
    <div>
      <button className="secondary-button" disabled={busy || !connected} onClick={onSave}><Save size={16} /> Salvar agora</button>
      <button className="secondary-button" disabled={busy || !connected} onClick={onRestore}><RotateCcw size={16} /> Restaurar…</button>
      <button className="secondary-button" disabled={busy} onClick={onExport}><Download size={16} /> Exportar JSON</button>
      <label className="secondary-button vault-data-import"><Upload size={16} /> Importar JSON<input type="file" accept="application/json,.json" multiple disabled={busy} onChange={(event) => { onImport(Array.from(event.target.files ?? [])); event.currentTarget.value = "" }} /></label>
    </div>
    {status.message && <p className={`vault-data-message ${status.attention ? "attention" : ""}`}>{status.message}</p>}
  </div>
}
