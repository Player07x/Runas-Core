import type { VaultDataAccess } from "./local-vault"
import type { VaultSaveOutcome } from "./vault-data"

/** Resumo do último resultado de gravação no vault, em texto para o menu e para o painel do Obsidian. */
export interface VaultStatus {
  phase: "off" | "no-vault" | "permission" | "saved" | "empty" | "conflict" | "error"
  message: string
  /** Pede uma ação do usuário (aparece em destaque). */
  attention: boolean
}

const time = (moment: number) => new Date(moment).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })

export function describeSaveOutcome(outcome: VaultSaveOutcome | VaultDataAccess): VaultStatus {
  switch (outcome.status) {
    case "no-vault": return { phase: "no-vault", message: "", attention: false }
    case "permission": return { phase: "permission", message: "Vault: permissão de escrita pendente. Use Obsidian › Salvar agora.", attention: true }
    case "saved":
    case "unchanged": return { phase: "saved", message: `Vault: dados salvos (${time(outcome.header.savedAt)}).`, attention: false }
    case "skipped-pristine": return { phase: "empty", message: "Vault: nada para salvar ainda.", attention: false }
    case "unsupported": return { phase: "conflict", message: "Vault: o arquivo de dados é de uma versão mais nova do Runas DM; nada foi sobrescrito.", attention: true }
    case "conflict":
      if (outcome.reason === "shrink") return { phase: "conflict", message: "Vault: este dispositivo tem bem menos dados que o arquivo do vault; nada foi sobrescrito. Use Obsidian › Restaurar.", attention: true }
      if (outcome.reason === "unreadable") return { phase: "conflict", message: "Vault: o arquivo de dados está ilegível; nada foi sobrescrito.", attention: true }
      return { phase: "conflict", message: "Vault: o arquivo de dados é de outro computador; nada foi sobrescrito. Use Obsidian › Restaurar.", attention: true }
  }
}
