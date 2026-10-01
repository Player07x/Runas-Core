/**
 * Interruptor persistente de "modo local": desativa toda sincronização
 * automática e manual com a nuvem (Bestiário, Campanhas e Wiki), nas duas
 * direções. Fica só no `localStorage` deste navegador — nunca viaja pelo
 * vault nem pela própria nuvem, porque o objetivo é justamente parar de
 * falar com a rede, não sincronizar essa preferência entre dispositivos.
 * Sobrevive a reiniciar o computador ou fechar o Chrome, ao contrário do
 * token de backup (esse fica em `sessionStorage`, só durante a aba).
 */

export const LOCAL_ONLY_MODE_KEY = "runas-dm.local-only-mode"

export function readLocalOnlyMode(): boolean {
  try { return globalThis.localStorage?.getItem(LOCAL_ONLY_MODE_KEY) === "1" } catch { return false }
}

const listeners = new Set<() => void>()

export function writeLocalOnlyMode(value: boolean): void {
  try {
    if (value) globalThis.localStorage?.setItem(LOCAL_ONLY_MODE_KEY, "1")
    else globalThis.localStorage?.removeItem(LOCAL_ONLY_MODE_KEY)
  } catch { /* a preferência volta a perguntar na próxima sessão */ }
  listeners.forEach((listener) => listener())
}

/**
 * Para ler com `useSyncExternalStore` (igual a `theme-toggle.tsx`): o
 * servidor nunca tem `localStorage`, então o instantâneo dele é sempre
 * `false` — ler o valor real já no primeiro render do cliente, como um
 * `useState(() => ...)` faria, causaria erro de hidratação sempre que o
 * modo local estivesse ligado neste navegador.
 */
export function subscribeLocalOnlyMode(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function getLocalOnlyModeServerSnapshot(): boolean {
  return false
}

export const LOCAL_ONLY_MESSAGE = "Modo local ativo: a sincronização com a nuvem está desativada neste dispositivo."
