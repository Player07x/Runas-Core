export interface ObsidianPreferences {
  enabled: boolean
  automatic: boolean
}

export const OBSIDIAN_PREFERENCES_KEY = "runas-dm.obsidian-preferences"

const defaults: ObsidianPreferences = { enabled: true, automatic: true }

export function readObsidianPreferences(): ObsidianPreferences {
  if (typeof window === "undefined") return defaults
  try {
    const value = JSON.parse(localStorage.getItem(OBSIDIAN_PREFERENCES_KEY) ?? "null") as Partial<ObsidianPreferences> | null
    return {
      enabled: value?.enabled !== false,
      // A sincronização bidirecional é o comportamento padrão; o usuário
      // ainda pode desligá-la explicitamente nas preferências.
      automatic: value?.automatic !== false,
    }
  } catch { return defaults }
}
