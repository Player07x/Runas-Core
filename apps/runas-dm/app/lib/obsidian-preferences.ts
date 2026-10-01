export interface ObsidianPreferences {
  enabled: boolean
  automatic: boolean
}

export const OBSIDIAN_PREFERENCES_KEY = "runas-dm.obsidian-preferences"

const defaults: ObsidianPreferences = { enabled: true, automatic: true }

// `useSyncExternalStore` exige que o mesmo valor devolva sempre o mesmo
// objeto (compara por `Object.is`); sem o cache, cada chamada criaria um
// objeto novo e o React entraria num laço infinito de re-render.
let cachedRaw: string | null | undefined
let cachedValue: ObsidianPreferences = defaults

export function readObsidianPreferences(): ObsidianPreferences {
  if (typeof window === "undefined") return defaults
  let raw: string | null
  try { raw = localStorage.getItem(OBSIDIAN_PREFERENCES_KEY) } catch { raw = null }
  if (raw === cachedRaw) return cachedValue
  cachedRaw = raw
  try {
    const value = JSON.parse(raw ?? "null") as Partial<ObsidianPreferences> | null
    cachedValue = {
      enabled: value?.enabled !== false,
      // A sincronização bidirecional é o comportamento padrão; o usuário
      // ainda pode desligá-la explicitamente nas preferências.
      automatic: value?.automatic !== false,
    }
  } catch { cachedValue = defaults }
  return cachedValue
}

const listeners = new Set<() => void>()

/** Quem grava a preferência (hoje só `ObsidianDialog`) avisa aqui depois do `localStorage.setItem`. */
export function notifyObsidianPreferencesChanged(): void {
  listeners.forEach((listener) => listener())
}

/**
 * Para ler com `useSyncExternalStore` (igual a `theme-toggle.tsx` e
 * `sync-preferences.ts`): o servidor não tem `localStorage`, então o
 * instantâneo dele é sempre os padrões — ler o valor real já no primeiro
 * render do cliente, como um `useState(() => ...)` faria, causaria erro de
 * hidratação sempre que a preferência salva divergisse dos padrões.
 */
export function subscribeObsidianPreferences(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function getObsidianPreferencesServerSnapshot(): ObsidianPreferences {
  return defaults
}
